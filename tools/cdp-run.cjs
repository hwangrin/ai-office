// Minimal headless-Chrome driver over the DevTools protocol (no extra dependency: uses `ws`).
// node tools/cdp-run.cjs steps.json   -> prints one JSON line per step; screenshots go where the step says.
// Steps: {goto,url} {wait,ms} {eval,js,as?} {shot,out} {move,x,y} {click,x,y} {tap,x,y} {viewport,w,h,mobile?} {logs}
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const steps = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const port = 9300 + Math.floor(Math.random() * 400);
const profile = path.join(process.env.TEMP || '.', 'cdp-prof-' + Date.now());
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const getJson = (url) => new Promise((res, rej) => http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej));

(async () => {
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1440,900', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 60; i++) { try { targets = await getJson(`http://127.0.0.1:${port}/json`); if (targets.find(t => t.type === 'page')) break; } catch { /* retry */ } await sleep(250); }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  let id = 0; const pending = new Map(); const logs = [];
  ws.on('message', m => {
    const d = JSON.parse(m);
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result); }
    else if (d.method === 'Runtime.consoleAPICalled') logs.push({ t: d.params.type, m: d.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300) });
    else if (d.method === 'Runtime.exceptionThrown') logs.push({ t: 'exception', m: (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 400) });
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  let touch = false;
  const agentXY = async (aid) => {
    const r = await send('Runtime.evaluate', { returnByValue: true, expression: `(()=>{const o=window.__office,v=o.agents.get(${JSON.stringify(aid)});const p=v.hit.position.clone().project(o.camera);const b=o.renderer.domElement.getBoundingClientRect();return [Math.round(b.left+(p.x+1)/2*b.width),Math.round(b.top+(1-p.y)/2*b.height)]})()` });
    return r.result.value;
  };
  for (const s of steps) {
    try {
      if (s.goto) { await send('Page.navigate', { url: s.goto }); await sleep(s.ms ?? 1500); console.log(JSON.stringify({ goto: s.goto })); }
      else if (s.wait) { await sleep(s.wait); }
      else if (s.viewport) {
        touch = !!s.mobile;
        await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.dpr ?? 1, mobile: !!s.mobile });
        await send('Emulation.setTouchEmulationEnabled', { enabled: !!s.mobile, maxTouchPoints: s.mobile ? 5 : 0 });
        await sleep(500);
      }
      else if (s.eval) {
        const r = await send('Runtime.evaluate', { expression: s.eval, awaitPromise: true, returnByValue: true });
        console.log(JSON.stringify({ as: s.as || 'eval', value: r.result?.value ?? r.exceptionDetails?.exception?.description }));
      }
      else if (s.shot) {
        const r = await send('Page.captureScreenshot', { format: s.out.endsWith('.png') ? 'png' : 'jpeg', quality: 82 });
        fs.mkdirSync(path.dirname(s.out), { recursive: true });
        fs.writeFileSync(s.out, Buffer.from(r.data, 'base64')); console.log(JSON.stringify({ shot: s.out }));
      }
      else if (s.move) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: s.x, y: s.y }); await sleep(s.ms ?? 250); }
      else if (s.click) { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: s.x, y: s.y, button: 'left', clickCount: 1 }); await sleep(s.ms ?? 400); }
      else if (s.tap) {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: s.x, y: s.y }] });
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(s.ms ?? 400);
      }
      else if (s.moveAgent) { const [x, y] = await agentXY(s.moveAgent); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(s.ms ?? 300); }
      else if (s.clickAgent) { const [x, y] = await agentXY(s.clickAgent); for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); await sleep(s.ms ?? 600); }
      else if (s.tapAgent) { const [x, y] = await agentXY(s.tapAgent); await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(s.ms ?? 600); }
      else if (s.logs) { console.log(JSON.stringify({ logs: logs.splice(0) })); }
    } catch (e) { console.log(JSON.stringify({ error: String(e.message).slice(0, 300), step: s })); }
  }
  ws.close(); proc.kill();
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(0);
})();
