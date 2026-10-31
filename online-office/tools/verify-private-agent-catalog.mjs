import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = path.join(root, 'public/js/agent-display-catalog.json');
let catalog;
try {
  catalog = JSON.parse(await readFile(filename, 'utf8'));
} catch {
  console.error('Owner-provided agent display catalog is missing. Install private runtime inputs before building the release.');
  process.exit(1);
}

const entries = catalog.entries;
if (!Array.isArray(entries) || entries.length < 24) {
  console.error('The private agent display catalog must include the 24 verified Kyan Brain entries.');
  process.exit(1);
}

const identities = new Set();
for (const entry of entries) {
  const key = `${entry.brainId ?? ''}|${entry.id ?? ''}`;
  if (!entry.brainId || !entry.id || identities.has(key)) {
    console.error('The private agent display catalog has an invalid or duplicate Brain + agent identity.');
    process.exit(1);
  }
  identities.add(key);
  if (!/^[a-f0-9]{64}$/i.test(entry.sourceHash ?? '')) {
    console.error('The private agent display catalog has an invalid source metadata hash.');
    process.exit(1);
  }
  for (const language of ['en', 'vi']) {
    const label = entry[language];
    if (!label || typeof label.name !== 'string' || !label.name.trim() ||
        typeof label.role !== 'string' || typeof label.description !== 'string') {
      console.error('The private agent display catalog has incomplete English or Vietnamese display copy.');
      process.exit(1);
    }
  }
}

console.log(`Verified ${entries.length} private bilingual agent display entries across ${new Set(entries.map(e => e.brainId)).size} Brains.`);
