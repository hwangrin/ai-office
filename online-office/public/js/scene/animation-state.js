/** Select a compatible existing state clip, falling back to a valid idle clip. */
export function resolveLoopClip(states, clips, variant, status, idleNames = []) {
  const hasClip = (name) => typeof name === 'string' && !!clips?.[name];
  let requested;
  if (variant === 'game' || variant === 'arcade') requested = [states?.gaming, states?.working];
  else if (status === 'working') requested = variant === 'lounge'
    ? [states?.workingLounge, states?.working]
    : [states?.working];
  else if (status === 'idle' || !status || variant === 'cafe') requested = [].concat(idleNames ?? []);
  else requested = [states?.[status]];

  for (const candidate of requested) {
    for (const name of [].concat(candidate ?? [])) if (hasClip(name)) return name;
  }
  return [].concat(idleNames ?? [], states?.idle ?? []).find(hasClip) ?? null;
}
