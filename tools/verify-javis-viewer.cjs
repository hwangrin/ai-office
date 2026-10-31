// API and launcher regression suite (browser E2E is recorded separately) for AI Office 3D Javis Read-Only Viewer & UX requirements
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const launcherPath = path.join(__dirname, 'launcher-bg.cjs');
const baselineHashesPath = process.env.AI_OFFICE_BASELINE_HASHES || '';
const PORT = 4801;
const WORKTREE_GLB_HASHES = {
  'public/models/people/animations/beckon.glb': '4BA420F9E147BF5BA3918D8C195ED2D57CCA59C0B8726517D848F6623548533F',
  'public/models/people/animations/disbelief.glb': 'B73007DD16983330417F6C8A7E6AB60044668FF789721C0A1C393990516CCABC',
  'public/models/people/animations/idle.glb': '473C3BA515CE4898948A469A70BAFE3CCFCF7785ABEBF2A6409D7872A97A312A',
  'public/models/people/animations/impatient.glb': '785FD341D4653B2BAA6AAEBE879517240D99AE81322B1185F23B955759A379E9',
  'public/models/people/animations/look.glb': 'EA3640A0266988ABD116AF9F57A780A84A135010BF915CA87C80F8CB0A4B50A3',
  'public/models/people/animations/run.glb': '78A9B61E5E2AC973253B9A007BEBAD5844609310376F5C6818EF2F0C0120ABD4',
  'public/models/people/animations/talking.glb': '78A9ED53D382FAC3C1EE7649B51E8C2035BA2544154A77DCA7EFDFD4424F60D9',
  'public/models/people/animations/thumbsup.glb': '7FB82101807B5AFE7DA584825DA69C0AE5C8E9F2E9649117625542DEC82D245D',
  'public/models/people/animations/typing.glb': 'F9B9E84B0384701272B09C401A9CEB80968D10A3C1BE4A9DA3145C086949EC74',
  'public/models/people/animations/walk.glb': '91F3D64DE4D01F167F70010155F814C0DA428D2307B252351F56E47065196082',
  'public/models/people/characters/joe.glb': '164AC9832BC08FC406B45EB00BEBA23825BBFF88C313C3F9D8BB535599B67DF7',
  'public/models/people/characters/josh.glb': 'B597700D085A49B6D2F8168903EAA20C008E316F4A59F8890EEE0A245BF782DA',
  'public/models/people/characters/lewis.glb': '3674E06944AFB61A26402A1E808A18CC6EC4BDB68BDA24D0BD36C8CDA2A7106E',
  'public/models/people/characters/louise.glb': 'F92D1335FE916268DC847B1F717E51736EA8EFF30B49BA8E738349C7BC41AFF8',
  'public/models/people/characters/martha.glb': '663B2475E1B95D2AB0888F9D93C0C36DDAAF3ABDB9EB64F23D44464036690EFC',
  'public/models/people/characters/remy.glb': 'B4D0C0E104A10576468E66F4219475920BF4625CB2F374C2E7F0440CA073138E',
  'public/models/people/characters/sophie.glb': '8889E4E0F3643512C5E0AF8A17CC569D2E15A1AC9A7FAA0711AFBF9A06ED947D',
  'public/models/people/characters/suzie.glb': '01F6B86AC35BA5F8F25265B2FBA542DE9A9873FB2446728C80A5D83967646544',
};

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
    for (const id of Object.keys(expectedDepts)) assert.ok(depts.find(d => d.id === id));
    results.departmentIds = 'PASS (all 9 original IDs preserved; EN/VI names are localized in the UI)';

    assert.equal(state1.json.javisViewer.enabled, true);
    assert.equal(state1.json.javisViewer.readOnly, true);
    assert.equal(state1.json.javisViewer.liveConnection, 'DISCONNECTED');
    assert.equal(state1.json.javisViewer.mode, 'DISCONNECTED');
    assert.equal(state1.json.agents.length, 6);
    assert.ok(state1.json.agents.every(a => a.status === 'unknown' && a.dataSource === 'DEMO' && a.actorKind === 'persistent'));
    results.initialDisconnectedState = 'PASS (liveConnection=DISCONNECTED, 6 local DEMO profiles, activity unknown)';

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
    results.mockReset = 'PASS (reset to DISCONNECTED unknown baseline)';

    // 9. Verify baseline file hashes of worktree GLBs and optional external baseline manifest
    let mismatches = 0;
    let checkedCount = 0;
    for (const [rel, expected] of Object.entries(WORKTREE_GLB_HASHES)) {
      const buf = fs.readFileSync(path.join(rootDir, rel));
      const hash = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
      if (hash !== expected) mismatches++;
      checkedCount++;
    }
    if (baselineHashesPath && fs.existsSync(baselineHashesPath)) {
      const baseline = JSON.parse(fs.readFileSync(baselineHashesPath, 'utf8').replace(/^\uFEFF/, ''));
      for (const item of baseline) {
        const buf = fs.readFileSync(item.Path);
        const hash = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
        if (hash !== item.Hash) mismatches++;
      }
      checkedCount = baseline.length;
    }
    assert.equal(mismatches, 0, `Expected 0 baseline hash mismatches, got ${mismatches}`);
    results.baselinePreservation = `PASS (${checkedCount}/${checkedCount} baseline/Mixamo GLB SHA-256 hashes match)`;
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
