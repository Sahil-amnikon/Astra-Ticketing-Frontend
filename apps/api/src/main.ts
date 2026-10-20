import { createApp } from './app';
import { readConfig } from './config';
async function main() {
  const config = readConfig();
  const app = await createApp();
  await app.listen(config.PORT, config.API_HOST);
  console.log(JSON.stringify({ event: 'api.started', port: config.PORT }));
}
main().catch(() => {
  console.error(
    JSON.stringify({
      event: 'api.start.failed',
      message: 'Check environment configuration and port availability',
    }),
  );
  process.exitCode = 1;
});
