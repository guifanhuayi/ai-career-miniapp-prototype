import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../infra/runtime/', import.meta.url));
mkdirSync(directory, { recursive: true });
const file = `${directory}local.env`;
if (!existsSync(file)) {
  const password = randomBytes(24).toString('hex');
  const rootPassword = randomBytes(24).toString('hex');
  writeFileSync(
    file,
    `DATABASE_URL=mysql://career:${password}@127.0.0.1:3307/career_local\nMYSQL_PASSWORD=${password}\nMYSQL_ROOT_PASSWORD=${rootPassword}\nAPI_HOST=127.0.0.1\nAPI_PORT=3100\nAPP_ENV=local\n`,
    { mode: 0o600 },
  );
  console.log('Created private local environment (credentials not printed).');
} else console.log('Existing local environment preserved.');
