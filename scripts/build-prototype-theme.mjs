import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prototypeBaseline,
  repositoryRoot,
  textDigest,
  themeApproval,
} from './check-prototype.mjs';

export const originalText = (path) =>
  execFileSync('git', ['show', `${prototypeBaseline}:${path}`], {
    cwd: repositoryRoot,
  })
    .toString('utf8')
    .replace(/\r\n/g, '\n');
export const recolor = (text) =>
  text.replace(
    /#[\da-f]{3,8}\b/gi,
    (color) => themeApproval.mapping[color] ?? color,
  );

// Reproduce the user's approved color change from immutable original sources.
// No script execution, archive writing, or automatic approval-hash changes.
export function themedContents() {
  const css = recolor(originalText('style.css'));
  const overview = originalText('overview.html').replace(
    /<style>([\s\S]*?)<\/style>/,
    (_, style) => `<style>${recolor(style)}</style>`,
  );
  const prototype = originalText('prototype-source.html')
    .replace(
      '<link rel="stylesheet" href="style.css">',
      `<style>\n${css.replace(/^\ufeff/, '')}\n</style>`,
    )
    .replace(
      '<script src="app.js"></script>',
      `<script>\n${originalText('app.js')}\n</script>`,
    );
  return {
    'style.css': css,
    'overview.html': overview,
    'index.html': overview,
    'prototype.html': prototype,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const contents = themedContents();
  for (const [path, content] of Object.entries(contents)) {
    const approved = themeApproval.approvedFiles[path];
    if (textDigest(Buffer.from(content)) !== approved)
      throw new Error(`Unapproved theme generation: ${path}`);
    const current = textDigest(readFileSync(resolve(repositoryRoot, path)));
    if (
      ![approved, textDigest(Buffer.from(originalText(path)))].includes(current)
    )
      throw new Error(`Preserve unexpected edits: ${path}`);
  }
  for (const [path, content] of Object.entries(contents))
    writeFileSync(resolve(repositoryRoot, path), content);
  console.log('Rebuilt only the four authorized prototype color files.');
}
