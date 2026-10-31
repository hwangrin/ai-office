import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'asset-manifest.json'), 'utf8'));
const expectedPaths = new Set();
const failures = [];

if (!Array.isArray(manifest.assets) || manifest.assets.length !== 19 || manifest.assetCount !== 19) {
  failures.push('The approved V1 asset manifest must contain exactly 19 entries.');
}

for (const asset of manifest.assets ?? []) {
  const rel = String(asset.path ?? '').replaceAll('\\', '/');
  if (!rel.startsWith('public/models/') || rel.split('/').includes('..')) {
    failures.push(`Invalid asset path: ${rel || '(empty)'}`);
    continue;
  }
  if (expectedPaths.has(rel)) failures.push(`Duplicate asset path: ${rel}`);
  expectedPaths.add(rel);
  const filename = path.resolve(root, rel);
  if (!filename.startsWith(root + path.sep)) {
    failures.push(`Asset escapes the package: ${rel}`);
    continue;
  }
  try {
    const bytes = await readFile(filename);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (bytes.byteLength !== asset.bytes) failures.push(`Unexpected file size: ${rel}`);
    if (hash !== asset.sha256) failures.push(`SHA-256 mismatch: ${rel}`);
  } catch {
    failures.push(`Required owner-provided asset is missing: ${rel}`);
  }
}

for (const file of manifest.runtimeFiles ?? []) {
  const rel = String(file.path ?? '').replaceAll('\\', '/');
  if (!rel.startsWith('public/') || rel.split('/').includes('..')) {
    failures.push(`Invalid runtime-data path: ${rel || '(empty)'}`);
    continue;
  }
  const filename = path.resolve(root, rel);
  if (!filename.startsWith(root + path.sep)) {
    failures.push(`Runtime-data path escapes the package: ${rel}`);
    continue;
  }
  try {
    const bytes = await readFile(filename);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (bytes.byteLength !== file.bytes) failures.push(`Unexpected runtime-data size: ${rel}`);
    if (hash !== file.sha256) failures.push(`Runtime-data SHA-256 mismatch: ${rel}`);
  } catch {
    failures.push(`Required runtime data is missing: ${rel}`);
  }
}

try {
  const people = JSON.parse(await readFile(path.join(root, 'public/models/people/people.json'), 'utf8'));
  const chars = people.characters ?? [];
  const animations = Object.values(people.animations ?? {});
  if (chars.length !== 8) failures.push(`Expected 8 retained employee models; found ${chars.length}.`);
  if (animations.length !== 10) failures.push(`Expected 10 shared animation models; found ${animations.length}.`);
  for (const item of [...chars, ...animations]) {
    const rel = `public/models/people/${item.file}`;
    if (!expectedPaths.has(rel)) failures.push(`people.json references an unmanifested asset: ${rel}`);
  }
  if (!expectedPaths.has('public/models/kyan-v1/hazel-hair-original.glb')) {
    failures.push('The exclusive Kyan Hazel hair mesh is absent from the manifest.');
  }
} catch {
  failures.push('The local people.json asset catalog is missing or invalid.');
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log('Verified 19 owner-provided GLBs, their runtime catalog, and the private bilingual identity catalog.');
}
