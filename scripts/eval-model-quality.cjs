/**
 * Runs the fixed Vexium starter-model evaluation against a real llama.cpp
 * runtime and writes the raw answers, token counts and timings as JSON.
 *
 * The prompt set is deliberately small and fixed. It covers English chat,
 * rewriting, grounded summary, uncertainty, a two-turn conversation, the four
 * shipped languages, arithmetic, an app-specific question without retrieval,
 * an app-specific question with retrieval text, and output formatting. It is a
 * quality smoke test, not a benchmark: the answers are reviewed by hand and the
 * scores live in docs/VEXIUM_MODELS.md.
 *
 * Usage:
 *   node scripts/eval-model-quality.cjs --model <file.gguf> \
 *     --runtime <llama-server.exe> --out <result.json>
 *
 * Defaults: runtime/bin/llama-server.exe, port 8099, 4096 context. The runtime
 * and model paths can also be supplied as KRYVEX_RUNTIME and KRYVEX_MODEL.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const { buildServerArgs } = require(path.join(
  __dirname,
  '..',
  'dist-electron',
  'local-model-rules.js',
));

const PROMPTS = [
  {
    id: 'en-chat',
    area: 'English chat',
    language: 'en',
    maxTokens: 180,
    turns: [
      'In two sentences, explain what a local language model is and give one benefit of running one on your own computer.',
    ],
  },
  {
    id: 'en-rewrite',
    area: 'Rewriting',
    language: 'en',
    maxTokens: 120,
    turns: [
      'Rewrite the following sentence so it is clearer, without changing its meaning. Reply with the rewritten sentence only: The update, which was released on Tuesday, fixes a bug where the app would sometimes fail to save settings when the network dropped.',
    ],
  },
  {
    id: 'en-summary',
    area: 'Grounded summary',
    language: 'en',
    maxTokens: 220,
    turns: [
      'Summarize the following in exactly three bullet points, each under 15 words. Do not add facts that are not in the text.\n\nKryvex can run a GGUF model on the user\'s own machine. The installer includes a CPU runtime, but the weights are a separate download. The model server binds to 127.0.0.1, so requests do not leave the computer. Users can stop the server at any time, and the app never starts it automatically.',
    ],
  },
  {
    id: 'en-uncertainty',
    area: 'Uncertainty',
    language: 'en',
    maxTokens: 200,
    turns: [
      'I have 8 GB of RAM and a four-year-old laptop CPU. Can I run a 1.5B Q4 model comfortably? Answer in three sentences and state what you cannot know.',
    ],
  },
  {
    id: 'en-conversation',
    area: 'Conversation memory',
    language: 'en',
    maxTokens: 240,
    turns: [
      'I am planning a trip to Berlin in March. Remember that I prefer museums to nightlife.',
      'What should I prioritize on my first afternoon? Answer in two sentences.',
    ],
  },
  {
    id: 'es-chat',
    area: 'Spanish reply',
    language: 'es',
    maxTokens: 220,
    turns: [
      'Responde en español. ¿Qué ventaja tiene ejecutar un modelo de lenguaje en tu propio ordenador? Usa exactamente dos frases.',
    ],
  },
  {
    id: 'de-chat',
    area: 'German reply',
    language: 'de',
    maxTokens: 220,
    turns: [
      'Antworte auf Deutsch. Welchen Vorteil hat es, ein Sprachmodell auf dem eigenen Computer auszuführen? Verwende genau zwei Sätze.',
    ],
  },
  {
    id: 'fr-chat',
    area: 'French reply',
    language: 'fr',
    maxTokens: 220,
    turns: [
      "Réponds en français. Quel est l'avantage d'exécuter un modèle de langage sur son propre ordinateur ? Utilise exactement deux phrases.",
    ],
  },
  {
    id: 'arithmetic',
    area: 'Arithmetic',
    language: 'en',
    maxTokens: 20,
    turns: [
      'A user has 3 apples, buys 5 more, gives away 2, then buys 12. How many apples does the user have now? Reply with the number only.',
    ],
  },
  {
    id: 'app-no-context',
    area: 'App help without retrieval',
    language: 'en',
    maxTokens: 180,
    turns: [
      'In Kryvex, which exact button opens the local model server? If you do not have Kryvex documentation in this conversation, say that you cannot verify it instead of guessing.',
    ],
  },
  {
    id: 'app-grounded',
    area: 'App help with retrieval text',
    language: 'en',
    maxTokens: 120,
    turns: [
      'Using only this text, answer in one sentence: "Settings > Vexium > Start server starts the local model on 127.0.0.1." Which button starts the local model, and where is it?',
    ],
  },
  {
    id: 'current-facts',
    area: 'Current facts',
    language: 'en',
    maxTokens: 100,
    turns: [
      'Who won the 2026 FIFA World Cup? If you do not have that information, say so in one sentence instead of guessing.',
    ],
  },
  {
    id: 'format',
    area: 'Formatting',
    language: 'en',
    maxTokens: 120,
    turns: [
      'List exactly three bullet points, each no longer than 12 words, naming one benefit of local inference. No introduction and no conclusion.',
    ],
  },
];

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

const runtime = path.resolve(
  argument('--runtime', process.env.KRYVEX_RUNTIME || path.join(__dirname, '..', 'runtime', 'bin', 'llama-server.exe')),
);
const model = path.resolve(argument('--model', process.env.KRYVEX_MODEL || ''));
const output = path.resolve(
  argument('--out', path.join(__dirname, '..', 'docs', 'media', 'evals', 'qwen-quality.json')),
);
const logPath = `${output.replace(/\.json$/i, '')}.server.log`;
const port = Number(argument('--port', '8099'));
const context = Number(argument('--ctx', '4096'));

if (!fs.existsSync(runtime)) {
  console.error(`eval: runtime not found: ${runtime}`);
  process.exit(1);
}
if (!model || !fs.existsSync(model) || !/\.gguf$/i.test(model)) {
  console.error('eval: pass a real .gguf file with --model (or KRYVEX_MODEL)');
  process.exit(1);
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function runtimeInfo() {
  const result = spawnSync(runtime, ['--version'], { encoding: 'utf8', windowsHide: true });
  const text = `${result.stdout || ''}${result.stderr || ''}`.trim();
  let sidecar = {};
  try {
    sidecar = JSON.parse(fs.readFileSync(path.join(path.dirname(runtime), 'runtime.json'), 'utf8'));
  } catch {
    /* a user-supplied runtime has no sidecar */
  }
  return {
    binary: runtime,
    version: text.split(/\r?\n/).slice(0, 3).join('\n'),
    release: typeof sidecar.release === 'string' ? sidecar.release : '',
    commit: typeof sidecar.commit === 'string' ? sidecar.commit : '',
  };
}

function processMemory(pid) {
  if (!pid) return null;
  const script =
    '$p=Get-Process -Id ' +
    Number(pid) +
    ' -ErrorAction SilentlyContinue; if ($p) { [pscustomobject]@{workingSetBytes=$p.WorkingSet64;peakWorkingSetBytes=$p.PeakWorkingSet64} | ConvertTo-Json -Compress }';
  const result = spawnSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0 || !result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sentenceCount(text) {
  return (text.match(/[^.!?]+[.!?]+/g) || []).length;
}

function bulletLines(text) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^([-*]|\d+[.)])\s+/.test(line));
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function contentOf(body) {
  return typeof body?.choices?.[0]?.message?.content === 'string'
    ? body.choices[0].message.content.trim()
    : '';
}

async function requestChat(baseUrl, messages, maxTokens) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: path.basename(model, path.extname(model)),
      messages,
      max_tokens: maxTokens,
      temperature: 0,
      seed: 42,
      stream: false,
      cache_prompt: false,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  const body = JSON.parse(text);
  return {
    content: contentOf(body),
    finishReason: body?.choices?.[0]?.finish_reason ?? '',
    wallMs: Date.now() - started,
    usage: body.usage ?? null,
    timings: body.timings ?? null,
  };
}

async function main() {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const info = runtimeInfo();
  const modelStat = fs.statSync(model);
  console.log(`eval: runtime ${info.release || 'unknown'} (${info.version.split('\n')[0]})`);
  console.log(`eval: model ${model} (${modelStat.size} bytes), hashing...`);
  const modelSha256 = await sha256(model);
  console.log(`eval: sha256 ${modelSha256}`);

  const serverArgs = buildServerArgs({ modelPath: model, port, ctxSize: context, gpuLayers: 999 });
  const logStream = fs.createWriteStream(logPath, { flags: 'w' });
  const child = spawn(runtime, serverArgs, {
    cwd: path.dirname(runtime),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);
  let exit = null;
  child.on('exit', (code, signal) => {
    exit = { code, signal };
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const started = Date.now();
  let ready = false;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (exit) break;
    try {
      const response = await fetch(`${baseUrl}/v1/models`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* still loading */
    }
    await sleep(500);
  }
  if (!ready) {
    child.kill('SIGKILL');
    console.error(`eval: runtime did not answer. See ${logPath}`);
    console.error(fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').split('\n').slice(-20).join('\n') : '');
    process.exitCode = 1;
    return;
  }
  const loadMs = Date.now() - started;
  console.log(`eval: ready in ${loadMs} ms at ${baseUrl}`);
  const memoryAfterLoad = processMemory(child.pid);
  let memoryAfterPrompts = null;

  const results = [];
  try {
    for (const spec of PROMPTS) {
      const messages = [];
      const turns = [];
      console.log(`eval: ${spec.id}`);
      for (const user of spec.turns) {
        messages.push({ role: 'user', content: user });
        const reply = await requestChat(baseUrl, messages, spec.maxTokens);
        messages.push({ role: 'assistant', content: reply.content });
        turns.push({
          user,
          reply: reply.content,
          finishReason: reply.finishReason,
          wallMs: reply.wallMs,
          usage: reply.usage,
          timings: reply.timings,
          structure: {
            sentences: sentenceCount(reply.content),
            bullets: bulletLines(reply.content).length,
            words: wordCount(reply.content),
          },
        });
      }
      const final = turns[turns.length - 1];
      results.push({
        id: spec.id,
        area: spec.area,
        language: spec.language,
        maxTokens: spec.maxTokens,
        turns,
        structure: final.structure,
      });
    }
  } finally {
    memoryAfterPrompts = processMemory(child.pid);
    try {
      child.kill();
    } catch {
      /* already gone */
    }
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      sleep(5_000),
    ]);
    if (child.exitCode === null) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    }
    logStream.end();
  }

  const report = {
    kind: 'vexium-starter-quality',
    version: '0.8.8',
    recordedAt: new Date().toISOString(),
    host: {
      platform: process.platform,
      release: os.release(),
      version: os.version(),
      arch: os.arch(),
      cpu: os.cpus()[0]?.model ?? '',
      cores: os.cpus().length,
      memoryBytes: os.totalmem(),
      node: process.version,
    },
    runtime: { ...info, context, port, loadMs },
    model: {
      path: model,
      bytes: modelStat.size,
      sha256: modelSha256,
      name: path.basename(model, path.extname(model)),
    },
    sampling: { temperature: 0, seed: 42, stream: false, cachePrompt: false },
    memory: { afterLoad: memoryAfterLoad, afterPrompts: memoryAfterPrompts },
    prompts: results,
  };

  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const totalTokens = results.reduce(
    (sum, result) =>
      sum + result.turns.reduce((inner, turn) => inner + (turn.usage?.completion_tokens ?? 0), 0),
    0,
  );
  console.log(`eval: wrote ${output}`);
  console.log(`eval: ${results.length} prompts, ${totalTokens} generated tokens`);
}

main().catch(error => {
  console.error(`eval: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
});
