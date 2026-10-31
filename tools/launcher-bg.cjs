// Hidden/background Windows launcher for AI Office 3D (dev worktree)
// Supports: start (default), stop, status, restart
// Options: --port=4801, --no-browser, --viewer-readonly=0|1, --mock=0|1
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');

const logFile = path.join(dataDir, 'launcher-bg.log');

const args = process.argv.slice(2);
const cmd = (args.find(a => !a.startsWith('--')) || 'start').toLowerCase();
const getOpt = (name, def) => {
  const found = args.find(a => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : def;
};
const hasFlag = (name) => args.includes(`--${name}`);

const PORT = Number(getOpt('port', process.env.PORT || '4801'));
const pidFile = path.join(dataDir, PORT === 4801 ? 'launcher-bg.pid.json' : 'launcher-bg-' + PORT + '.pid.json');
const HOST = getOpt('host', process.env.HOST || '127.0.0.1');
const VIEWER_READONLY = getOpt('viewer-readonly', process.env.JAVIS_VIEWER_READONLY || '1');
const VIEWER_MOCK = getOpt('mock', process.env.JAVIS_VIEWER_MOCK || '0');
const NO_BROWSER = hasFlag('no-browser') || process.env.NO_BROWSER === '1';

function log(msg) {
  fs.mkdirSync(dataDir, { recursive: true });
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
}

function readPidRecord() {
  try {
    if (!fs.existsSync(pidFile)) return null;
    return JSON.parse(fs.readFileSync(pidFile, 'utf8'));
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function checkHttpReady(port, timeoutMs = 1500) {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${port}/`, { timeout: timeoutMs }, res => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function waitUntilReady(port, maxWaitMs = 25000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await checkHttpReady(port, 1200)) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

async function doStatus() {
  const rec = readPidRecord();
  const alive = rec ? isProcessAlive(rec.pid) : false;
  const targetPort = rec?.port || PORT;
  const httpOk = await checkHttpReady(targetPort, 1200);
  const statusObj = {
    running: alive && httpOk,
    pid: alive ? rec.pid : null,
    port: targetPort,
    httpReady: httpOk,
    viewerReadOnly: rec?.viewerReadOnly ?? (VIEWER_READONLY === '1'),
    startedAt: rec?.startedAt ?? null,
  };
  console.log(JSON.stringify(statusObj));
  return statusObj;
}

async function doStop() {
  const rec = readPidRecord();
  if (!rec || !rec.pid) {
    log('Stop requested: no PID file found.');
    console.log(JSON.stringify({ stopped: true, reason: 'no_pid_file' }));
    return;
  }
  const pid = rec.pid;
  if (!isProcessAlive(pid)) {
    try { fs.unlinkSync(pidFile); } catch {}
    log(`Stop requested: PID ${pid} already exited.`);
    console.log(JSON.stringify({ stopped: true, pid, reason: 'already_exited' }));
    return;
  }
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    try { process.kill(pid); } catch {}
  }
  try { fs.unlinkSync(pidFile); } catch {}
  log(`Stopped background AI Office process PID ${pid} on port ${rec.port}.`);
  console.log(JSON.stringify({ stopped: true, pid, port: rec.port }));
}

async function doStart() {
  const rec = readPidRecord();
  if (rec && isProcessAlive(rec.pid) && await checkHttpReady(rec.port || PORT, 1000)) {
    log(`Start requested: already running on PID ${rec.pid}, port ${rec.port || PORT}.`);
    console.log(JSON.stringify({ started: false, alreadyRunning: true, pid: rec.pid, port: rec.port || PORT }));
    return;
  }
  if (await checkHttpReady(PORT, 1000)) {
    log(`Start aborted: port ${PORT} is already occupied by another listener.`);
    console.error(JSON.stringify({ started: false, error: `Port ${PORT} is already in use.` }));
    process.exitCode = 3;
    return;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const serverEntry = path.join(rootDir, 'src', 'server.ts');

  const env = {
    ...process.env,
    PORT: String(PORT),
    HOST,
    DB_PATH: path.join(dataDir, `office-${PORT}.db`),
    JAVIS_VIEWER_READONLY: String(VIEWER_READONLY),
    JAVIS_VIEWER_MOCK: String(VIEWER_MOCK),
    OFFICE_EXECUTION_ENABLED: getOpt('studio-execution', '0'),
  };

  const child = spawn(process.execPath, [tsxCli, serverEntry], {
    cwd: rootDir,
    env,
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  });
  child.unref();

  const newRec = {
    pid: child.pid,
    port: PORT,
    host: HOST,
    viewerReadOnly: VIEWER_READONLY === '1' || VIEWER_READONLY === 'true',
    startedAt: new Date().toISOString(),
  };
  fs.writeFileSync(pidFile, JSON.stringify(newRec, null, 2));
  log(`Spawned hidden AI Office server PID ${child.pid} on http://${HOST}:${PORT}`);

  const ready = await waitUntilReady(PORT, 25000);
  if (!ready) {
    log(`Timeout waiting for http://${HOST}:${PORT} to respond 200.`);
    console.error(JSON.stringify({ started: false, pid: child.pid, port: PORT, error: 'Readiness check timed out' }));
    process.exitCode = 1;
    return;
  }

  log(`Server ready at http://localhost:${PORT}`);
  if (!NO_BROWSER) {
    const browser = spawn('explorer.exe', [`http://localhost:${PORT}`], {
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
    });
    browser.unref();
  }
  console.log(JSON.stringify({ started: true, pid: child.pid, port: PORT, url: `http://localhost:${PORT}`, viewerReadOnly: newRec.viewerReadOnly }));
}

(async () => {
  if (cmd === 'stop') await doStop();
  else if (cmd === 'status') await doStatus();
  else if (cmd === 'restart') { await doStop(); await doStart(); }
  else await doStart();
})();
