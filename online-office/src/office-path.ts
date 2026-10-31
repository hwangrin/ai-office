/** Restrict the app mount to /office or a safe child path for an isolated preview. */
export function resolveOfficeMountPath(raw: string | undefined | null): string {
  if (raw === undefined || raw === null || raw === '') return '/office';
  const mount = raw.trim().replace(/\/+$/u, '');
  if (!/^\/office(?:\/[a-z0-9_-]+)*$/iu.test(mount)) throw new Error('invalid_office_mount_path');
  return mount;
}
