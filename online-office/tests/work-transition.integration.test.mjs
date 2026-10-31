// CPU-only transition integration check: actual GLB rigs, Mixamo clips, Office3D navigation and world positions.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const originalLoadAsync = GLTFLoader.prototype.loadAsync;
const originalFetch = globalThis.fetch;
const manifestUrl = new URL('../public/models/people/people.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
GLTFLoader.prototype.loadAsync = async function loadLocalGlb(url) {
  const relative = String(url).replace(/^\/office\/models\/people\//u, '');
  const fileUrl = new URL(`../public/models/people/${relative}`, import.meta.url);
  const bytes = await readFile(fileUrl);
  this.register(parser => ({
    name: 'CPU_TEST_SKIP_TEXTURE_DECODING',
    beforeRoot() {
      const getDependency = parser.getDependency.bind(parser);
      parser.getDependency = (type, index) => type === 'texture' ? Promise.resolve(null) : getDependency(type, index);
    },
  }));
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
};
globalThis.fetch = async url => {
  const path = String(url);
  if (path.endsWith('/people.json')) return new Response(JSON.stringify(manifest), { headers: { 'content-type': 'application/json' } });
  if (path.endsWith('/locales.json')) return new Response('[]', { headers: { 'content-type': 'application/json' } });
  if (path.endsWith('/messages.json')) return new Response('{}', { headers: { 'content-type': 'application/json' } });
  return new Response('', { status: 404 });
};
globalThis.document = {
  body: {}, documentElement: {},
  createElement() {
    const gradient = { addColorStop() {} };
    const context = new Proxy({
      measureText(text) { return { width: String(text).length * 8 }; },
      createLinearGradient() { return gradient; },
      createRadialGradient() { return gradient; },
    }, { get(target, key) { return key in target ? target[key] : () => {}; }, set(target, key, value) { target[key] = value; return true; } });
    return { width: 1, height: 1, getContext() { return context; } };
  },
  createTreeWalker() { return { nextNode() { return null; } }; },
  querySelectorAll() { return []; },
};
globalThis.NodeFilter = { SHOW_TEXT: 4 };
globalThis.MutationObserver = class { observe() {} };
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
const { Office3D } = await import('../public/js/scene/office3d.js');
const { MixamoLibrary } = await import('../public/js/scene/mixamo.js');
const { NavGrid } = await import('../public/js/scene/nav.js');

function makeSeat(id, x, z, variant = 'desk') {
  const facing = 0;
  return { id, x, z, facing, seatH: 0.5, exit: { x: x + 0.9, z }, variant, prop: null, occupantId: null };
}

function makeVisual(id, person, home, workstation, { where = 'home', currentSeat = home, spot = null } = {}) {
  person.place(currentSeat.x, currentSeat.seatH, currentSeat.z, currentSeat.facing);
  person.setStatus('unknown');
  person.variant = currentSeat.variant;
  return {
    id, person, home, workstation, where, currentSeat, spot, status: 'unknown',
    workstationUnavailable: !workstation,
    screen: { material: null },
    theme: 'docs', actorKind: 'persistent',
    ring: { material: { color: { set() {} } }, userData: {} },
    alert: {}, inputBadge: {}, glow: {}, beam: {}, label: {},
  };
}

function makeOffice(visuals) {
  const office = Object.create(Office3D.prototype);
  office.agents = new Map(visuals.map(v => [v.id, v]));
  office.workstations = [];
  office.nav = new NavGrid(36, 28);
  office.screens = { material: () => ({}) };
  office.spots = [{}];
  office.refreshLights = () => {};
  office.updateLabel = () => {};
  return office;
}

function advanceUntilStopped(person, limitSeconds = 45) {
  const dt = 1 / 60;
  let sawStand = false;
  let sawWalk = false;
  for (let i = 0; i < limitSeconds * 60 && person.trip; i++) {
    if (person.trip?.phase === 'stand' && person.standing < 1) sawStand = true;
    if (person.trip?.phase === 'move' && person.current?.getClip().name === 'walk') sawWalk = true;
    person.update(i * dt, dt);
  }
  assert.equal(person.trip, null, 'existing travel controller must reach the destination');
  return { sawStand, sawWalk };
}

try {
  const library = new MixamoLibrary();
  assert.equal(await library.load(), true, 'actual local humanoid and animation GLBs load');
  assert.ok(library.clips.walk && library.clips.typing, 'existing walk and working clips are available');

  const loungeHome = makeSeat('lounge-home', 2, 3, 'lounge');
  const loungeDesk = makeSeat('lounge-workstation', -4, 5, 'desk');
  loungeDesk.assignedAgentId = 'sofa-agent';
  const sofaPerson = library.create({ id: 'sofa-agent', visualIdentityKey: 'test|sofa-agent' });
  const sofaVisual = makeVisual('sofa-agent', sofaPerson, loungeHome, loungeDesk);
  const office = makeOffice([sofaVisual]);
  const beforeSofa = sofaPerson.anchor.clone();
  office.setStatus('sofa-agent', 'working');
  assert.ok(sofaPerson.trip, 'working from a lounge home must begin a workstation trip');
  assert.equal(sofaPerson.current.getClip().name, 'walk', 'work pose must wait until the walk finishes');
  const sofaMovement = advanceUntilStopped(sofaPerson);
  assert.ok(sofaMovement.sawStand, 'the seated sofa character completes the existing stand-up phase');
  assert.ok(sofaMovement.sawWalk, 'sofa-to-workstation transition uses the existing walk clip');
  assert.equal(sofaVisual.where, 'atWorkstation');
  assert.equal(sofaVisual.currentSeat, loungeDesk);
  assert.equal(loungeDesk.occupantId, 'sofa-agent', 'the workstation is claimed on arrival');
  assert.equal(sofaPerson.anchor.distanceTo(beforeSofa) > 1, true, 'the actual world position leaves the sofa');
  assert.ok(sofaPerson.anchor.distanceTo(new THREE.Vector3(loungeDesk.x, 0, loungeDesk.z)) < 0.01,
    'the character arrives at the assigned desk position');
  assert.equal(sofaPerson.current.getClip().name, 'typing', 'working animation starts only after desk arrival');
  const deskArrival = sofaPerson.anchor.clone();

  office.setStatus('sofa-agent', 'unknown');
  assert.ok(sofaPerson.trip, 'restoring LIVE unknown status returns the lounge agent to its ambient seat');
  advanceUntilStopped(sofaPerson);
  assert.ok(sofaPerson.anchor.distanceTo(beforeSofa) < 0.01, 'Restore returns the character to its actual sofa position');
  assert.equal(loungeDesk.occupantId, null, 'Restore releases the temporary workstation occupation');
  assert.notEqual(sofaPerson.current.getClip().name, 'typing', 'Restore stops the working clip');

  for (const [id, kind, start] of [
    ['cafe-agent', 'cafe', makeSeat('cafe-seat', -8, 10, 'cafe')],
    ['game-agent', 'arcade', makeSeat('game-seat', 8, 10, 'arcade')],
  ]) {
    const home = makeSeat(`${id}-home`, id === 'cafe-agent' ? -5 : 5, 0);
    const desk = makeSeat(`${id}-desk`, id === 'cafe-agent' ? -4 : 4, 1);
    desk.assignedAgentId = id;
    const screen = { players: 1 };
    const cluster = { occupants: new Set([id]) };
    const spot = { ...start, kind, screen, cluster, occupant: id };
    const person = library.create({ id, visualIdentityKey: `test|${id}` });
    const visual = makeVisual(id, person, home, desk, { where: 'leisure', currentSeat: spot, spot });
    office.agents.set(id, visual);
    const before = person.anchor.clone();
    office.setStatus(id, 'working');
    assert.ok(person.trip, `${kind} activity must transition to the workstation`);
    const movement = advanceUntilStopped(person);
    assert.ok(movement.sawStand && movement.sawWalk, `${kind}-to-workstation stands and walks with the existing clips`);
    assert.equal(visual.currentSeat, desk);
    assert.ok(person.anchor.distanceTo(before) > 1, `${kind} character changes its actual world position`);
    assert.ok(person.anchor.distanceTo(new THREE.Vector3(desk.x, 0, desk.z)) < 0.01);
    assert.equal(visual.spot, null, `${kind} activity is released`);
    assert.equal(screen.players, 0);
    assert.equal(person.current.getClip().name, 'typing');
  }

  const desk = makeSeat('already-at-desk', 0, -4);
  desk.assignedAgentId = 'desk-agent';
  const deskPerson = library.create({ id: 'desk-agent', visualIdentityKey: 'test|desk-agent' });
  const deskVisual = makeVisual('desk-agent', deskPerson, desk, desk, { where: 'home', currentSeat: desk });
  office.agents.set('desk-agent', deskVisual);
  office.setStatus('desk-agent', 'working');
  assert.equal(deskPerson.trip ?? null, null, 'an agent already at its assigned workstation does not travel again');
  assert.equal(deskPerson.current.getClip().name, 'typing', 'an agent already at its desk may start the working clip');

  const builtOffice = Object.create(Office3D.prototype);
  builtOffice.nav = new NavGrid(36, 28);
  builtOffice.workstations = [];
  builtOffice.agents = new Map();
  builtOffice.clusters = [];
  builtOffice.dense = false;
  builtOffice.screens = { material: () => new THREE.MeshBasicMaterial() };
  builtOffice.addRug = () => {};
  builtOffice.addLabel = () => {};
  builtOffice.addPendant = () => {};
  builtOffice.make = (_key, fallback) => fallback();
  builtOffice.addAgent = (agent, options) => {
    const home = options.workstation ?? { x: options.x, z: options.z, facing: options.facing, seatH: options.y, variant: options.variant, exit: options.exit };
    builtOffice.agents.set(agent.id, {
      id: agent.id, home, currentSeat: home, workstation: options.workstation ?? null,
      workstationUnavailable: !options.workstation, sourceStatus: agent.status ?? 'unknown', theme: options.theme,
    });
  };
  const build = new THREE.Group();
  const deskAgent = { id: 'desk-owner', name: 'Desk Owner', provider: 'mixamo', status: 'unknown' };
  const loungeAgent = { id: 'sofa-owner', name: 'Sofa Owner', provider: 'mixamo', status: 'unknown' };
  Office3D.prototype.buildZone.call(builtOffice,
    { id: 'design', name: 'Design', x: -8, z: -5, w: 8, d: 6, color: '#4d6189' },
    { seed: 3, screenTheme: 'design' }, [deskAgent], build);
  Office3D.prototype.buildLounge.call(builtOffice,
    { id: 'coordination', name: 'Coordination', x: 0, z: 0, w: 8.4, d: 8.4, color: '#2f3033' },
    { seed: 7, screenTheme: 'docs' }, [loungeAgent], build);
  builtOffice.assignWorkstations();
  assert.equal(builtOffice.workstations.filter(station => station.assignedAgentId === 'desk-owner').length, 1,
    'the physical desk remains assigned to its original employee');
  assert.equal(builtOffice.agents.get('sofa-owner').home.variant, 'lounge', 'the ambient home remains the sofa');
  assert.equal(builtOffice.agents.get('sofa-owner').workstation?.variant, 'desk',
    'the lounge employee receives a real desk seat from the existing workstation builder');
  assert.notEqual(builtOffice.agents.get('sofa-owner').workstation, builtOffice.agents.get('desk-owner').workstation,
    'the lounge employee cannot share an occupied workstation');
  assert.ok(build.children.length > 0, 'the destination is backed by actual generated desk/chair geometry');

  const geometryAgent = builtOffice.agents.get('sofa-owner');
  const geometryPerson = library.create({ id: 'sofa-owner', visualIdentityKey: 'test|sofa-owner' });
  const geometryVisual = makeVisual('sofa-owner', geometryPerson, geometryAgent.home, geometryAgent.workstation);
  const geometryOffice = makeOffice([geometryVisual]);
  geometryOffice.nav = builtOffice.nav;
  const geometryStart = geometryPerson.anchor.clone();
  geometryOffice.setStatus('sofa-owner', 'working');
  const geometryPath = geometryPerson.trip.path.length;
  const geometryMovement = advanceUntilStopped(geometryPerson);
  assert.ok(geometryMovement.sawStand && geometryMovement.sawWalk,
    'the actual generated sofa-to-desk scene follows stand, walk and sit phases');
  assert.ok(geometryPerson.anchor.distanceTo(geometryStart) > 1, 'the actual built-scene position leaves the sofa');
  assert.ok(geometryPerson.anchor.distanceTo(new THREE.Vector3(geometryAgent.workstation.x, 0, geometryAgent.workstation.z)) < 0.01,
    'the actual built-scene character arrives at the generated desk/chair seat');
  assert.ok(geometryPath >= 2, 'existing NavGrid produced a route to the workstation');

  const priorityOffice = Object.create(Office3D.prototype);
  const priorityStation = makeSeat('priority-station', -1, -1);
  const regularStation = makeSeat('regular-station', 1, -1);
  priorityStation.screen = {}; regularStation.screen = {};
  priorityOffice.workstations = [regularStation, priorityStation];
  const priorityVisual = { id: 'priority-agent', workstation: null, workstationUnavailable: true, sourceStatus: 'working', theme: 'docs' };
  const regularVisual = { id: 'regular-agent', workstation: null, workstationUnavailable: true, sourceStatus: 'unknown', theme: 'docs' };
  priorityOffice.agents = new Map([[priorityVisual.id, priorityVisual], [regularVisual.id, regularVisual]]);
  priorityOffice.screens = { material: (theme, status) => ({ theme, status }) };
  priorityOffice.assignWorkstations();
  assert.equal(priorityVisual.workstation, priorityStation, 'verified working agents get first choice of spare desks');
  assert.equal(regularVisual.workstation, regularStation, 'every spare desk has at most one deterministic assignee');
  assert.notEqual(priorityVisual.workstation, regularVisual.workstation);

  const fallbackPerson = library.create({ id: 'no-desk-agent', visualIdentityKey: 'test|no-desk-agent' });
  const fallbackHome = makeSeat('no-desk-sofa', 7, -3, 'lounge');
  const fallbackVisual = makeVisual('no-desk-agent', fallbackPerson, fallbackHome, null);
  office.agents.set(fallbackVisual.id, fallbackVisual);
  office.setStatus(fallbackVisual.id, 'working');
  assert.equal(fallbackVisual.status, 'working', 'the scene status remains the verified source state');
  assert.equal(fallbackPerson.current.getClip().name, 'idle', 'no available workstation uses a neutral pose, never typing on a sofa');
  assert.equal(fallbackPerson.trip ?? null, null, 'the safe fallback does not claim a nonexistent desk');

  console.log(JSON.stringify({
    result: 'work transition integration passed',
    walkClip: 'walk', workClip: 'typing',
    sofa: { from: beforeSofa.toArray(), to: deskArrival.toArray(), destination: loungeDesk.id },
    leisureTransitions: ['cafe', 'arcade'],
    stationAllocation: 'unique; verified work prioritized',
    generatedFurnitureTransition: {
      from: geometryStart.toArray(), to: geometryPerson.anchor.toArray(),
      workstation: geometryAgent.workstation.id, navPathPoints: geometryPath,
    },
    noStationFallback: 'neutral idle; no typing on ambient seat',
    stationOccupancyReleased: loungeDesk.occupantId === null,
  }));
} finally {
  GLTFLoader.prototype.loadAsync = originalLoadAsync;
  globalThis.fetch = originalFetch;
}
