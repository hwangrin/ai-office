import assert from 'node:assert/strict';
import { selectSceneAgents } from '../public/js/scene/scene-roster.js';

const roster = Array.from({ length: 343 }, (_, i) => ({
  id: `agent-${String(i).padStart(2, '0')}`,
  status: 'unknown',
}));
roster[0] = { id: 'slug:kyan', slug: 'kyan', visualIdentityKey: 'kyan|director', status: 'unknown' };
roster[1].status = 'input';
roster[2].status = 'input';
roster[3].status = 'working';

const originalIds = roster.map(agent => agent.id);
const first = selectSceneAgents(roster, { limit: 32, selectedId: 'agent-342' });
const second = selectSceneAgents([...roster].reverse(), { limit: 32, selectedId: 'agent-342' });

assert.equal(first.length, 32, '343-agent scene selection must respect its cap');
assert.equal(new Set(first.map(agent => agent.id)).size, 32, 'scene selection must not duplicate identities');
assert.ok(first.some(agent => agent.id === 'slug:kyan'), 'Kyan must remain visible');
assert.ok(first.some(agent => agent.id === 'agent-342'), 'selected off-scene agents must be brought into the scene');
assert.deepEqual(first.map(agent => agent.id), second.map(agent => agent.id), 'scene selection must not depend on roster order');
assert.deepEqual(roster.map(agent => agent.id), originalIds, 'scene filtering must not mutate the full Javis roster');
assert.deepEqual(first.slice(0, 4).map(agent => agent.id), ['slug:kyan', 'agent-03', 'agent-01', 'agent-02'], 'Kyan and verified work states must be prioritized');
