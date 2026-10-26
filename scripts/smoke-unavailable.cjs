// Exercises actual compiled processes with deliberately unavailable dependencies.
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const env = {
  ...process.env,
  DATABASE_URL: 'postgresql://smoke:smoke@127.0.0.1:1/unavailable',
  REDIS_URL: 'redis://127.0.0.1:1',
  APP_BASE_URL: 'http://127.0.0.1:3000',
  API_INTERNAL_URL: 'http://127.0.0.1:3001',
  HOSTNAME: '127.0.0.1',
  PORT: '3001',
  API_HOST: '127.0.0.1',
};
const processes = [
  ['apps/api/dist/src/main.js', env],
  ['apps/api/dist/src/worker.js', env],
  ['frontend/.next/standalone/frontend/server.js', { ...env, PORT: '3000' }],
].map(([file, processEnv]) =>
  spawn(process.execPath, [file], { env: processEnv, stdio: 'inherit' }),
);
(async () => {
  try {
    for (const port of [3000, 3001, 3002]) {
      let live = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        if (processes.some((p) => p.exitCode !== null))
          throw new Error('Service exited during startup');
        try {
          live = (await fetch(`http://127.0.0.1:${port}/health`)).ok;
        } catch {
          /* Retry bounded startup. */
        }
        if (live) break;
        await delay(100);
      }
      if (!live) throw new Error(`${port}: liveness failed`);
      const r = await fetch(`http://127.0.0.1:${port}/ready`, {
        signal: AbortSignal.timeout(6000),
      });
      if (r.status !== 503)
        throw new Error(
          `${port}: expected readiness 503, received ${r.status}`,
        );
      console.log(`${port}: health=200 ready=503 (dependencies unavailable)`);
    }
    const page = await fetch('http://127.0.0.1:3000/');
    if (!page.ok || !(await page.text()).includes('Checking access'))
      throw new Error('Landing page failed');
    console.log('Landing page: HTTP 200 and identity check rendered');
    const authStatus = await fetch('http://127.0.0.1:3000/api/auth/status');
    if (!authStatus.ok || (await authStatus.json()).configured !== false)
      throw new Error('Closed authentication status failed');
    const protectedRoute = await fetch('http://127.0.0.1:3000/api/clients');
    if (protectedRoute.status !== 401)
      throw new Error('Anonymous core route was not rejected');
    console.log('Identity proxy: unconfigured status=200 protected route=401');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    for (const p of processes) p.kill('SIGTERM');
  }
})();
