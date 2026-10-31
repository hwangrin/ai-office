import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
const modelsRoot = option('--models') ? path.resolve(option('--models')) : undefined;
const catalogFile = option('--catalog') ? path.resolve(option('--catalog')) : undefined;
const layoutFile = option('--layout') ? path.resolve(option('--layout')) : undefined;
if (!modelsRoot || !catalogFile || !layoutFile) {
  console.error('Usage: node tools/install-private-runtime-inputs.mjs --models <authorized public/models> --catalog <private catalog.json> --layout <private javis-layout.json>');
  process.exit(2);
}

const manifest = JSON.parse(await readFile(path.join(root, 'asset-manifest.json'), 'utf8'));
const copies = [];
for (const asset of manifest.assets) {
  const prefix = 'public/models/';
  if (!asset.path.startsWith(prefix)) throw new Error('Invalid asset manifest path.');
  const source = path.resolve(modelsRoot, asset.path.slice(prefix.length));
  if (!source.startsWith(modelsRoot + path.sep)) throw new Error('Asset path escapes the selected source folder.');
  const bytes = await readFile(source);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (bytes.byteLength !== asset.bytes || hash !== asset.sha256) {
    throw new Error(`Private asset integrity check failed: ${asset.path}`);
  }
  copies.push({ source, destination: path.join(root, asset.path) });
}

const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
if (!Array.isArray(catalog.entries) || catalog.entries.length < 24) throw new Error('The private catalog does not contain the verified 24-agent baseline.');
const identityKeys = catalog.entries.map(e => `${e.brainId ?? ''}|${e.id ?? ''}`);
if (identityKeys.some(key => key.startsWith('|') || key.endsWith('|')) || new Set(identityKeys).size !== identityKeys.length) {
  throw new Error('The private catalog has a missing or duplicate Brain + agent identity.');
}
for (const entry of catalog.entries) {
  if (!/^[a-f0-9]{64}$/i.test(entry.sourceHash ?? '') ||
      ['en', 'vi'].some(lang => !entry[lang] || typeof entry[lang].name !== 'string' ||
        typeof entry[lang].role !== 'string' || typeof entry[lang].description !== 'string')) {
    throw new Error('The private catalog has invalid hashes or incomplete bilingual labels.');
  }
}

const layout = JSON.parse(await readFile(layoutFile, 'utf8'));
if (typeof layout.default !== 'string' || !layout.byId || typeof layout.byId !== 'object' || Array.isArray(layout.byId)) {
  throw new Error('The owner-provided layout has an invalid schema.');
}

for (const { source, destination } of copies) {
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}
await copyFile(catalogFile, path.join(root, 'public/js/agent-display-catalog.json'));
await copyFile(layoutFile, path.join(root, 'javis-layout.json'));
console.log(`Installed ${copies.length} private GLBs and verified owner-provided catalog/layout inputs. Nothing was uploaded.`);
