// End-to-end verification suite for AI Office 3D Javis Read-Only Viewer & UX requirements
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const launcherPath = path.join(__dirname, 'launcher-bg.cjs');
const baselineHashesPath = 'C:\\Users\\linh.ht\\JAVIS OS\\brains\\Kyan\\reports\\ai-office-3d\\baseline-hashes-2026-10-24.json';
const PORT = 4801;

function request(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: urlPath,
      method,
      headers: {
        Host: `127.0.0.1:${PORT}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, text: data, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function runLauncher(args) {
  const out = execFileSync(process.execPath, [launcherPath, ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    windowsHide: true,
  });
  return JSON.parse(out.trim().split(/\r?\n/).pop());
}

async function main() {
  const results = {};

  // Ensure clean state before starting
  try { runLauncher(['stop']); } catch {}

  // 1. Occupied port check against original running replica on 4800
  let occupiedPortCode = 0;
  try {
    execFileSync(process.execPath, [launcherPath, 'start', '--port=4800', '--no-browser'], {
      cwd: rootDir,
      encoding: 'utf8',
      windowsHide: true,
      stdio: 'pipe',
    });
  } catch (err) {
    occupiedPortCode = err.status || 0;
  }
  assert.equal(occupiedPortCode, 3, 'Expected exit code 3 when port 4800 is already occupied');
  results.occupiedPortGuard = 'PASS (exit code 3 on occupied port 4800)';

  // 2. Start hidden background launcher on port 4801
  const startRes = runLauncher(['start', `--port=${PORT}`, '--no-browser', '--viewer-readonly=1', '--mock=0']);
  assert.equal(startRes.started, true, 'Expected background server to start');
  assert.equal(startRes.viewerReadOnly, true);

  const statusRes = runLauncher(['status', `--port=${PORT}`]);
  assert.equal(statusRes.running, true);
  assert.equal(statusRes.httpReady, true);
  results.launcherStartStatus = `PASS (PID ${statusRes.pid} listening on 127.0.0.1:${PORT})`;

  try {
    // 3. Fetch index HTML & extract CSRF token
    const indexRes = await request('GET', '/');
    assert.equal(indexRes.status, 200);
    assert.match(indexRes.text, /id="hud-clock"/);
    assert.match(indexRes.text, /id="btn-labels"/);
    assert.match(indexRes.text, /id="viewer-banner"/);
    const tokenMatch = indexRes.text.match(/meta name="office-token" content="([a-f0-9]+)"/);
    assert.ok(tokenMatch, 'Expected office-token meta tag');
    const token = tokenMatch[1];
    const authHeaders = { 'x-office-token': token };

    // 4. Verify initial DISCONNECTED state & English departments
    const state1 = await request('GET', '/api/state', authHeaders);
    assert.equal(state1.status, 200);
    const depts = state1.json.departments;
    const expectedDepts = {
      'thiet-ke': 'Visual Design',
      'chien-luoc': 'Strategy & Content',
      'ky-thuat': 'Engineering & Web',
      'san-xuat-noi-dung': 'Content Production',
      'dieu-phoi': 'Coordination',
      'khach-hang': 'Client Services',
      'san-xuat-phim': 'Film Production',
      'ca-phe': 'Cafe',
      'giai-tri': 'Recreation',
    };
    for (const [id, name] of Object.entries(expectedDepts)) {
      const found = depts.find(d => d.id === id);
      assert.ok(found, `Missing department ${id}`);
      assert.equal(found.name, name, `Department ${id} expected English name ${name}, got ${found.name}`);
    }
    results.englishDepartments = 'PASS (all 9 departments mapped to English names with internal IDs preserved)';

    assert.equal(state1.json.javisViewer.enabled, true);
    assert.equal(state1.json.javisViewer.readOnly, true);
    assert.equal(state1.json.javisViewer.liveConnection, 'DISCONNECTED');
    assert.equal(state1.json.javisViewer.mode, 'DISCONNECTED');
    assert.equal(state1.json.agents.length, 6);
    assert.ok(state1.json.agents.every(a => a.status === 'idle' && a.actorKind === 'persistent'));
    results.initialDisconnectedState = 'PASS (liveConnection=DISCONNECTED, 6 persistent Kyan agents idle)';

    // 5. Verify read-only mutation rejection
    const mut1 = await request('POST', '/api/agents', authHeaders, { name: 'Test' });
    const mut2 = await request('POST', '/api/agents/javis-core/tasks', authHeaders, { prompt: 'Test' });
    const mut3 = await request('POST', '/api/departments', authHeaders, { id: 'x', name: 'X' });
    assert.equal(mut1.status, 403);
    assert.equal(mut2.status, 403);
    assert.equal(mut3.status, 403);
    results.readOnlyEnforcement = 'PASS (POST /api/agents, /tasks, /departments rejected with HTTP 403)';

    // 6. Verify deterministic mock scenario: active-subagent
    const scActive = await request('POST', '/api/javis-viewer/mock/scenario', authHeaders, { scenario: 'active-subagent' });
    assert.equal(scActive.status, 200);
    assert.equal(scActive.json.mode, 'MOCK_DETERMINISTIC');
    assert.equal(scActive.json.liveConnection, 'DISCONNECTED');

    const stateActive = await request('GET', '/api/state', authHeaders);
    const activeAgents = new Map(stateActive.json.agents.map(a => [a.id, a]));
    assert.equal(activeAgents.get('javis-core')?.status, 'working');
    assert.equal(activeAgents.get('leon')?.status, 'working');
    assert.equal(activeAgents.get('dao-dien-hinh-anh')?.status, 'waiting');
    const subagent = activeAgents.get('subagent-scene-verifier');
    assert.ok(subagent, 'Expected temporary subagent to be spawned');
    assert.equal(subagent.actorKind, 'subagent');
    assert.equal(subagent.parentId, 'javis-core');
    assert.equal(subagent.status, 'working');
    results.mockActiveSubagent = 'PASS (persistent working/waiting + temporary subagent spawned under javis-core)';

    // 7. Verify deterministic mock completion & subagent despawn: default-all
    const scAll = await request('POST', '/api/javis-viewer/mock/scenario', authHeaders, { scenario: 'default-all' });
    assert.equal(scAll.status, 200);
    const stateAll = await request('GET', '/api/state', authHeaders);
    const allAgents = new Map(stateAll.json.agents.map(a => [a.id, a]));
    assert.equal(allAgents.has('subagent-scene-verifier'), false, 'Expected completed subagent to despawn');
    assert.equal(allAgents.get('leon')?.status, 'idle', 'Expected leon to return to idle after task.completed');
    results.mockCompletionDespawn = 'PASS (subagent despawned cleanly on subagent.completed; leon returned to idle)';

    // 8. Verify reset back to DISCONNECTED
    const scReset = await request('POST', '/api/javis-viewer/mock/reset', authHeaders);
    assert.equal(scReset.status, 200);
    assert.equal(scReset.json.mode, 'DISCONNECTED');
    results.mockReset = 'PASS (reset to DISCONNECTED idle baseline)';

    // 9. Verify baseline file hashes of original repository
    const baseline = JSON.parse(fs.readFileSync(baselineHashesPath, 'utf8').replace(/^\uFEFF/, ''));
    let mismatches = 0;
    for (const item of baseline) {
      const buf = fs.readFileSync(item.Path);
      const hash = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
      if (hash !== item.Hash) mismatches++;
    }
    assert.equal(mismatches, 0, `Expected 0 baseline hash mismatches, got ${mismatches}`);
    results.baselinePreservation = `PASS (${baseline.length}/${baseline.length} original repo & Mixamo GLB SHA-256 hashes match)`;
  } finally {
    // Stop server at end of test
    const stopRes = runLauncher(['stop', `--port=${PORT}`]);
    results.launcherStop = `PASS (stopped=${stopRes.stopped})`;
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch(err => {
  console.error(err);
  try { runLauncher(['stop', `--port=${PORT}`]); } catch {}
  process.exit(1);
});
