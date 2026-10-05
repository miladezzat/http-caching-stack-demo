import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (!existsSync('.env')) {
  writeFileSync('.env', readFileSync('.env.example', 'utf8').replace('local-demo-admin-token-change-me', randomBytes(24).toString('hex')), { mode: 0o600 });
  console.log('Created .env with a random admin token. Copy ADMIN_TOKEN into the laboratory admin form.');
}
