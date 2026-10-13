// usage: node cdp.mjs <url> <outprefix> <script.json>
// script: [{"wait":ms}|{"shot":"name"}|{"eval":"js"}|{"key":"ArrowLeft","down":true}]
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
const [url, out, scriptPath] = process.argv.slice(2);
const steps = JSON.parse(readFileSync(scriptPath, 'utf8'));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, '--autoplay-policy=no-user-gesture-required',
  '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,720', '--mute-audio',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  `--user-data-dir=/tmp/cdp-prof-${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 50; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = list.find((p) => p.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl); break;
  } catch { await sleep(200); }
}
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') console.log('[console.' + m.params.type + ']', m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 500));
  if (m.method === 'Runtime.exceptionThrown') console.log('[EXCEPTION]', JSON.stringify(m.params.exceptionDetails).slice(0, 1500));
  if (m.method === 'Log.entryAdded') console.log('[log]', m.params.entry.level, m.params.entry.text.slice(0, 300), m.params.entry.url || '');
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
for (const s of steps) {
  if (s.wait) await sleep(s.wait);
  if (s.shot) { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }); writeFileSync(`${out}-${s.shot}.jpg`, Buffer.from(r.result.data, 'base64')); console.log('shot', s.shot); }
  if (s.eval) { const r = await send('Runtime.evaluate', { expression: s.eval, returnByValue: true, awaitPromise: true }); console.log('[eval]', JSON.stringify(r.result?.result?.value ?? r.result).slice(0, 2000)); }
  if (s.key) { const code = s.key; const key = s.keyName || s.key; await send('Input.dispatchKeyEvent', { type: s.down === false ? 'keyUp' : 'keyDown', code, key, windowsVirtualKeyCode: s.vk || 0 }); }
  if (s.click) { const [x, y] = s.click; await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); }
}
ws.close(); chrome.kill('SIGKILL');
process.exit(0);
