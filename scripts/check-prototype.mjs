import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const prototypeBaseline = '910b4ae0704531691dbed100e62fff98cd0687a2';
export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The original repository consists only of UTF-8 text. Preserve content while
// tolerating Git's LF/CRLF checkout conversion on Windows.
export function textDigest(bytes) {
  const text = bytes.toString('utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function baselineFiles() {
  const git = (args) => execFileSync('git', args, { cwd: repositoryRoot });
  const paths = git(['ls-tree', '-r', '--name-only', prototypeBaseline])
    .toString('utf8').trim().split('\n');
  return paths.map((path) => ({
    path,
    digest: textDigest(git(['show', `${prototypeBaseline}:${path}`])),
  }));
}

export function auditPrototype(files, readFile) {
  const problems = [];
  for (const file of files) {
    try {
      if (textDigest(readFile(file.path)) !== file.digest) {
        problems.push({ path: file.path, reason: 'content-changed' });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      problems.push({ path: file.path, reason: 'missing' });
    }
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = baselineFiles();
  const problems = auditPrototype(files, (path) => readFileSync(resolve(repositoryRoot, path)));
  if (problems.length > 0) {
    console.error(JSON.stringify({ baseline: prototypeBaseline, problems }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`PASS: all ${files.length} original prototype files match ${prototypeBaseline}.`);
  }
}
