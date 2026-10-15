import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? files(join(directory, entry.name)) : [join(directory, entry.name)]));
  return nested.flat();
}
const errors = [];
for (const path of [...await files('src'), ...await files('api')]) {
  const text = await readFile(path, 'utf8');
  if (text.split('\n').length > 160) errors.push(`${path} exceeds 160 lines`);
  if (/__tests__|test-utils/.test(path)) continue;
  if (/\.collection(?:<[^>]+>)?\(['"](?:users|professionals|native_sessions|messages)['"]/.test(text))
    errors.push(`${path} accesses a main-owned collection`);
  if (/VITE_(?!API_URL)[A-Z_]*(?:SECRET|KEY|TOKEN)/.test(text)) errors.push(`${path} exposes a server secret setting`);
  if (/\.\.\/.*Vetify|JWT_SECRET_ACCESS|realtime\.service/.test(text)) errors.push(`${path} imports main internals`);
}
if (errors.length) { errors.forEach((error) => console.error(error)); process.exitCode = 1; }
else console.log('Books ownership boundaries and source file sizes passed.');
