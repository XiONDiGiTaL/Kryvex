import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { createServer } from 'vite';

const server = await createServer({
  server: { port: 5173, strictPort: true },
});

await server.listen();
server.printUrls();

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    KRYVEX_DEV_URL: 'http://127.0.0.1:5173/',
  },
});

let closing = false;
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  try {
    await server.close();
  } finally {
    process.exit(code);
  }
}

child.on('exit', code => {
  void shutdown(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill();
    void shutdown(0);
  });
}
