const STATUS_PRIORITY = new Map([
  ['working', 0],
  ['input', 1],
  ['waiting', 2],
  ['queued', 3],
  ['error', 4],
]);

function isKyan(agent) {
  return agent.id === 'slug:kyan' ||
    (agent.slug === 'kyan' && String(agent.visualIdentityKey ?? '').startsWith('kyan|'));
}

/** Select scene instances only; the caller's full roster remains untouched for UI/chat. */
export function selectSceneAgents(agents, { limit = 32, selectedId = null } = {}) {
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  if (agents.length <= cap) return [...agents];
  const score = (agent) => isKyan(agent) ? -3 : (STATUS_PRIORITY.get(agent.status) ?? 5);
  const byId = (a, b) => String(a.id).localeCompare(String(b.id), 'en');
  const director = agents.filter(isKyan).sort(byId);
  const statusPriority = agents.filter(agent => !isKyan(agent) && score(agent) < 5)
    .sort((a, b) => score(a) - score(b) || byId(a, b));
  const ambientByDepartment = new Map();
  for (const agent of agents.filter(agent => !isKyan(agent) && score(agent) === 5).sort((a, b) =>
    String(a.departmentId ?? '').localeCompare(String(b.departmentId ?? ''), 'en') || byId(a, b))) {
    const departmentId = agent.departmentId ?? '';
    if (!ambientByDepartment.has(departmentId)) ambientByDepartment.set(departmentId, []);
    ambientByDepartment.get(departmentId).push(agent);
  }
  const departmentIds = [...ambientByDepartment.keys()].sort((a, b) => String(a).localeCompare(String(b), 'en'));
  const distributedAmbient = [];
  for (let round = 0; ; round++) {
    let added = false;
    for (const departmentId of departmentIds) {
      const agent = ambientByDepartment.get(departmentId)[round];
      if (agent) { distributedAmbient.push(agent); added = true; }
    }
    if (!added) break;
  }
  const prioritized = [...director, ...statusPriority, ...distributedAmbient];
  const visible = prioritized.slice(0, cap);
  const selected = selectedId && agents.find(agent => agent.id === selectedId);
  if (selected && !visible.some(agent => agent.id === selectedId) && visible.length) {
    let replaceAt = -1;
    for (let i = visible.length - 1; i >= 0; i--) {
      if (!isKyan(visible[i]) && score(visible[i]) === 5) { replaceAt = i; break; }
    }
    if (replaceAt < 0) for (let i = visible.length - 1; i >= 0; i--) if (!isKyan(visible[i])) { replaceAt = i; break; }
    if (replaceAt >= 0) visible[replaceAt] = selected;
  }
  return visible;
}
