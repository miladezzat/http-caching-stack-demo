import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';
import { createApp } from './bootstrap';
import { loadConfig } from './config';

dotenv({ path: resolve(__dirname, '../../../.env'), quiet: true });
async function bootstrap() {
  const config = loadConfig();
  const app = await createApp(config);
  app.enableShutdownHooks();
  await app.listen(config.port, config.host);
  console.log(`Origin on ${await app.getUrl()} | CDN: ${config.cdnMode} | database: ${config.databaseUrl ? 'external' : 'embedded'} PostgreSQL`);
}
bootstrap().catch(error => { console.error(error instanceof Error ? error.message : 'Startup failed'); process.exitCode = 1; });
