import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

// Git's inherited Windows checkout policy converts TS/JSON/etc. to CRLF, while
// the pinned formatter and generated contracts use LF. Preserve every other byte,
// including local edits; never format, restore from HEAD, or touch prototype/docs.
export function normalizeSourceNewlines(root, trackedPaths, protectedPaths) {
  const base = resolve(root);
  let changed = 0;
  for (const path of trackedPaths) {
    if (
      protectedPaths.has(path) ||
      path.startsWith('apps/admin/') ||
      path.startsWith('docs/') ||
      path.includes('/docs/') ||
      !/\.(?:[cm]?[jt]sx?|json|ya?ml|less|css|toml|sql|prisma)$/.test(path)
    )
      continue;
    const target = resolve(base, path);
    if (!target.startsWith(base + sep))
      throw new Error('Source path escaped workspace');
    // Do not follow a repository symlink into another location.
    let metadata;
    try {
      metadata = lstatSync(target);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!metadata.isFile()) continue;
    const bytes = readFileSync(target);
    const text = bytes.toString('utf8');
    if (text.includes('\0') || !bytes.equals(Buffer.from(text, 'utf8')))
      continue;
    const normalized = text.replace(/\r\n/g, '\n');
    if (normalized !== text) {
      writeFileSync(target, normalized, 'utf8');
      changed++;
    }
  }
  return changed;
}
