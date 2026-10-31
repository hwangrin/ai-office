import assert from 'node:assert/strict';
import { resolveOfficeMountPath } from '../src/office-path.ts';

assert.equal(resolveOfficeMountPath(undefined), '/office');
assert.equal(resolveOfficeMountPath('/office'), '/office');
assert.throws(() => resolveOfficeMountPath('/'), /invalid_office_mount_path/);
assert.throws(() => resolveOfficeMountPath('/office/../api'), /invalid_office_mount_path/);
assert.throws(() => resolveOfficeMountPath('https://hwangrin.cloud/office'), /invalid_office_mount_path/);

console.log('production office mount path assertions passed');
