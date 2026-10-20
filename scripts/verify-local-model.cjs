/**
 * Verifies the local model runner end to end without a real model.
 *
 * It boots Electron, points the real `localModel` manager at a fake
 * `llama-server` script and a placeholder `.gguf`, then checks:
 *   - the file and script are accepted and stored,
 *   - the runtime launches on loopback and `/v1/models` answers,
 *   - Vexium's chat shape streams back through the same API,
 *   - stop kills the child and leaves the manager idle.
 *
 * Run with: node scripts/verify-local-model.cjs  (after `pnpm build`)
 */
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OUTPUT = path.join(process.cwd(), '.tmp-local-model-verify.log');
const lines = [];
function log(message) {
  lines.push(message);
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  log(`FAIL ${message}`);
  finish(1);
}

function finish(code) {
  try {
    fs.writeFileSync(OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  } catch {
    /* the log is a convenience */
  }
  app.exit(code);
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'kryvex-local-model-'));
  app.setPath('userData', userData);

  const modelDir = path.join(userData, 'models');
  fs.mkdirSync(modelDir, { recursive: true });
  const modelFile = path.join(modelDir, 'Demo-3B.Q4_K_M.gguf');
  fs.writeFileSync(modelFile, Buffer.from('GGUF fake placeholder'));
  const runtime = path.join(process.cwd(), 'scripts', 'fake-llama-server.mjs');

  const { localModel } = require(path.join(process.cwd(), 'dist-electron', 'local-model.js'));
  localModel.init();

  const configured = localModel.configure({ path: modelFile, binary: runtime, ctxSize: 2048 });
  if (configured.path !== modelFile) return fail('the model path was not stored');
  if (configured.binary !== runtime) return fail('the runtime path was not stored');
  if (configured.name !== 'Demo-3B.Q4_K_M') return fail(`unexpected name "${configured.name}"`);
  if (!configured.binaryFound) return fail('the runtime was reported missing');
  log(`configured ${configured.name} with ${path.basename(runtime)}`);

  const bad = localModel.configure({ path: path.join(modelDir, 'model.bin') });
  if (bad.path !== modelFile) return fail('a non-GGUF path was accepted');
  log('non-GGUF path rejected, previous model kept');

  const started = await localModel.start();
  if (started.phase !== 'running') {
    return fail(`start failed: ${started.phase} ${started.error ?? ''} ${started.log}`);
  }
  if (!started.baseUrl.startsWith('http://127.0.0.1:')) {
    return fail(`runtime is not on loopback: ${started.baseUrl}`);
  }
  log(`runtime running at ${started.baseUrl} (pid ${started.pid})`);

  const models = await fetch(`${started.baseUrl}/v1/models`).then(response => response.json());
  const id = models?.data?.[0]?.id;
  if (id !== 'Demo-3B.Q4_K_M') return fail(`unexpected model id ${String(id)}`);
  log(`/v1/models reports ${id}`);

  const chat = await fetch(`${started.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({
      model: id,
      stream: true,
      messages: [{ role: 'user', content: 'Say hello' }],
    }),
  });
  if (!chat.ok) return fail(`chat returned HTTP ${chat.status}`);
  const body = await chat.text();
  const text = body
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim())
    .filter(payload => payload && payload !== '[DONE]')
    .map(payload => JSON.parse(payload))
    .map(payload => payload.choices?.[0]?.delta?.content ?? '')
    .join('');
  if (text !== 'Hello from the local model.') return fail(`unexpected reply "${text}"`);
  log(`streamed reply: ${text}`);

  const pid = started.pid;
  const stopped = await localModel.stop();
  if (stopped.phase !== 'stopped') return fail(`stop left phase ${stopped.phase}`);
  if (stopped.pid !== null) return fail('stop left a pid behind');
  await new Promise(resolve => setTimeout(resolve, 600));
  let alive = true;
  try {
    process.kill(pid, 0);
  } catch {
    alive = false;
  }
  if (alive) return fail(`runtime pid ${pid} is still alive after stop`);
  log('runtime process exited');

  if (started.log && !started.log.includes('fake llama-server')) {
    return fail('runtime output was not captured');
  }
  log('PASS local model start, health, chat and stop');

  await localModel.dispose();
  fs.rmSync(userData, { recursive: true, force: true });
  finish(0);
}

app.whenReady().then(main).catch(error => fail(String(error)));
