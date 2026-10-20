import 'reflect-metadata';
import { createServer } from 'node:http';
import { Dependencies } from './dependencies';
import { processNotificationJobs } from './notifications';
import { processMailOutbox } from './mail-worker';
import { processMailInbox } from './mail-inbox';

const deps = new Dependencies();
let running = false;
async function runJobs() {
  if (running) return;
  running = true;
  try {
    for (const [name, job] of [
      ['notifications', () => processNotificationJobs(deps)],
      ['mail.outbox', () => processMailOutbox(deps)],
      ['mail.inbox', () => processMailInbox(deps)],
    ] as const) {
      try {
        const count = await job();
        if (count)
          console.log(JSON.stringify({ event: `${name}.processed`, count }));
      } catch (error) {
        const failure = error as { code?: string; name?: string };
        console.error(
          JSON.stringify({
            event: `${name}.failed`,
            errorName: failure.name,
            errorCode: failure.code,
          }),
        );
      }
    }
  } catch (error) {
    const failure = error as { code?: unknown; name?: unknown };
    console.error(
      JSON.stringify({
        event: 'notification.job.failed',
        errorName: typeof failure.name === 'string' ? failure.name : undefined,
        errorCode: typeof failure.code === 'string' ? failure.code : undefined,
      }),
    );
  } finally {
    running = false;
  }
}
const timer = setInterval(() => void runJobs(), 30_000);
timer.unref();
void runJobs();
const server = createServer((req, res) => {
  if (req.url === '/health') {
    res
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end('{"status":"ok"}');
    return;
  }
  if (req.url !== '/ready') {
    res.writeHead(404).end();
    return;
  }
  void deps
    .check()
    .then((ready) => {
      res
        .writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ status: ready ? 'ready' : 'unavailable' }));
    })
    .catch(() => res.writeHead(503).end());
});
server.listen(3002, '0.0.0.0', () =>
  console.log(JSON.stringify({ event: 'worker.started' })),
);
async function stop() {
  clearInterval(timer);
  server.close();
  await deps.onModuleDestroy();
}
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
