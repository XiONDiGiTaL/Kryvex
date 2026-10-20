#!/usr/bin/env node
/**
 * Stand-in for llama.cpp's `llama-server`, used only by the local-model
 * verification script. It accepts the same flags Kryvex passes, answers
 * `/v1/models` after a short "load", and streams one OpenAI-shaped reply.
 *
 * It exists so the app's real start → health → chat → stop path can be tested
 * without a multi-gigabyte GGUF or a GPU.
 */
import http from 'node:http';

const argv = process.argv.slice(2);
const flag = name => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

const port = Number(flag('--port') ?? 8899);
const host = flag('--host') ?? '127.0.0.1';
const modelPath = flag('--model') ?? '/tmp/demo.gguf';
const model = `${modelPath.split(/[\\/]/).pop() ?? 'demo'}`.replace(/\.gguf$/i, '');
const loadMs = Number(process.env.FAKE_LOAD_MS ?? 400);
const startedAt = Date.now();

const server = http.createServer((request, response) => {
  const url = request.url ?? '/';
  if (url === '/health') {
    const ready = Date.now() - startedAt >= loadMs;
    response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: ready ? 'ok' : 'loading model' }));
    return;
  }
  if (url.startsWith('/v1/models')) {
    if (Date.now() - startedAt < loadMs) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'loading model' }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({ object: 'list', data: [{ id: model, object: 'model', owned_by: 'llama.cpp' }] }),
    );
    return;
  }
  if (url.startsWith('/v1/chat/completions') && request.method === 'POST') {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      let prompt = '';
      try {
        const parsed = JSON.parse(body);
        prompt = String(parsed.messages?.at(-1)?.content ?? '');
      } catch {
        /* a bad body still gets a reply */
      }
      process.stdout.write(`fake llama-server: chat "${prompt.slice(0, 60)}"\n`);
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      for (const piece of ['Hello', ' from', ' the', ' local', ' model', '.']) {
        response.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: piece }, index: 0 }] })}\n\n`,
        );
      }
      response.write('data: [DONE]\n\n');
      response.end();
    });
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not found' }));
});

server.listen(port, host, () => {
  process.stdout.write(`fake llama-server: listening on http://${host}:${port}\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
