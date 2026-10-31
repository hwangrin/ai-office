import assert from 'node:assert/strict';
import { applySceneStatus, sceneBehaviorForStatus } from '../public/js/scene/work-policy.js';
import { resolveLoopClip } from '../public/js/scene/animation-state.js';

const running = sceneBehaviorForStatus('working');
assert.equal(running.returnToWorkstation, true);
assert.equal(running.activeWorkPose, true);
assert.equal(running.allowLeisure, false);

for (const status of ['waiting', 'input', 'queued', 'needs_you', 'approval_pending']) {
  const state = sceneBehaviorForStatus(status);
  assert.equal(state.returnToWorkstation, true, `${status} returns to the assigned station`);
  assert.equal(state.activeWorkPose, false, `${status} is not rendered as active work`);
  assert.equal(state.allowLeisure, false, `${status} stops leisure scheduling`);
}

const available = sceneBehaviorForStatus('idle');
assert.equal(available.allowLeisure, true, 'confirmed available retains the existing ambient behavior');
assert.equal(available.activeWorkPose, false);
assert.equal(available.neutral, false);

const unknown = sceneBehaviorForStatus('unknown');
assert.equal(unknown.neutral, true);
assert.equal(unknown.activeWorkPose, false);
assert.equal(unknown.allowLeisure, true, 'unknown agents retain neutral ambient movement');
assert.equal(unknown.neutral, true, 'ambient movement does not change unknown into confirmed available');

const completedToUnknown = sceneBehaviorForStatus('unknown');
assert.equal(completedToUnknown.allowLeisure, true, 'after a controlled completion, partial Jobs coverage resumes ambient movement');
assert.equal(completedToUnknown.neutral, true, 'completion does not claim total activity is confirmed available');

const visual = {
  id: 'agent-a', status: 'idle', observer: false, where: 'leisure', theme: 'docs',
  person: { setStatus(status) { this.status = status; } },
};
let route;
const activeBehavior = applySceneStatus(visual, 'working', (agent, urgent) => { route = { agent, urgent }; });
assert.equal(visual.person.status, 'working');
assert.equal(activeBehavior.activeWorkPose, true);
assert.equal(route.agent, visual, 'verified work invokes the existing workstation route');
assert.equal(route.urgent, false, 'work transition uses the existing walk path at normal speed');

route = null;
visual.where = 'home';
applySceneStatus(visual, 'waiting', (agent, urgent) => { route = { agent, urgent }; });
assert.equal(route, null, 'an agent already at its assigned station does not duplicate travel');

route = null;
visual.where = 'leisure';
applySceneStatus(visual, 'idle', (agent, urgent) => { route = { agent, urgent }; });
assert.equal(route, null, 'confirmed availability does not force a return trip');

route = null;
const loungeAgent = {
  id: 'lounge-agent', status: 'unknown', where: 'home',
  home: { x: 2, z: 3, variant: 'lounge' },
  currentSeat: { x: 2, z: 3, variant: 'lounge' },
  workstation: { x: -4, z: 6, variant: 'desk' },
  person: { setStatus(status) { this.status = status; } },
};
applySceneStatus(loungeAgent, 'working', (agent, urgent) => { route = { agent, urgent }; });
assert.equal(route?.agent, loungeAgent,
  'a lounge agent at its ambient home must still navigate to its distinct workstation');
assert.equal(route?.urgent, false, 'the work transition keeps the existing normal walking speed');

const states = { idle: ['idle'], working: 'typing', workingLounge: 'talking', gaming: 'typing' };
const clips = { idle: {}, talking: {} };
assert.equal(resolveLoopClip(states, clips, 'desk', 'working', ['idle']), 'idle',
  'a missing work clip falls back to the existing safe idle pose');
assert.equal(resolveLoopClip(states, clips, 'lounge', 'working', ['idle']), 'talking',
  'a present compatible variant clip is retained');
assert.equal(resolveLoopClip(states, { idle: {}, typing: {} }, 'lounge', 'working', ['idle']), 'typing',
  'a missing lounge-specific clip may use the existing general work pose');
assert.equal(resolveLoopClip(states, clips, 'game', 'working', ['idle']), 'idle',
  'a missing game/work clip does not leave the character stuck walking');

console.log('scene work policy assertions passed');
