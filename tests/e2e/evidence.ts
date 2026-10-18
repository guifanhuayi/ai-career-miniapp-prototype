import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export function evidencePath(name: string) {
  const directory = resolve(
    process.env.CAREER_EVIDENCE_DIR ?? 'infra/runtime/browser-evidence',
  );
  mkdirSync(directory, { recursive: true });
  return resolve(directory, name);
}
