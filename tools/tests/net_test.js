// 온라인 재현 테스트: 방장(1P)·상대(2P) 두 창, CPU 느리게 + 가짜 와이파이(지연·흔들림·손실)
// 실행: 서버를 먼저 켜고(PORT=3123 npm start, 서버 경유만 보려면 RELAY_ONLY=1) → PORT=3123 CPU=4 node tools/tests/net_test.js
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const PROFILES = {
  '좋은 와이파이': { base: 3, jitter: 3, spikeP: 0, spikeMs: 0, loss: 0 },
  '보통 와이파이': { base: 15, jitter: 15, spikeP: 0.01, spikeMs: 120, loss: 0.02 },
  '나쁜 와이파이': { base: 40, jitter: 40, spikeP: 0.03, spikeMs: 250, loss: 0.08 },
};
const CPU = Number(process.env.CPU || 4);
const sim = (prof) => {
  window.__NET = prof;
  const orig = RTCDataChannel.prototype.send;
  RTCDataChannel.prototype.send = function (data) {
    const n = window.__NET; const fast = this.label === 'fast';
    if (fast && Math.random() < n.loss) return;               // 빠른 통로는 사라질 수 있음
    let d = n.base + Math.random() * n.jitter + (Math.random() < n.spikeP ? n.spikeMs : 0);
    const now = performance.now();
    if (!fast) { this.__t = Math.max(this.__t || 0, now + d); d = this.__t - now; } // 확실한 통로는 순서 유지
    setTimeout(() => { try { if (this.readyState === 'open') orig.call(this, data); } catch (e) {} }, d);
  };
  // 서버 경유(WebSocket)도 와이파이를 지나므로 보내기·받기 모두 늦춘다 (순서 유지, 손실 없음 = TCP)
  const delayOf = () => { const n = window.__NET; return n.base + Math.random() * n.jitter + (Math.random() < n.spikeP ? n.spikeMs : 0); };
  const wsSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (data) {
    const now = performance.now(); this.__ts = Math.max(this.__ts || 0, now + delayOf());
    setTimeout(() => { try { if (this.readyState === 1) wsSend.call(this, data); } catch (e) {} }, this.__ts - now);
  };
  Object.defineProperty(WebSocket.prototype, 'onmessage', { configurable: true, set(fn) {
    this.addEventListener('message', (e) => { const now = performance.now(); this.__tr = Math.max(this.__tr || 0, now + delayOf()); setTimeout(() => fn(e), this.__tr - now); });
  } });
};
const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
const measure = async (page, label) => page.evaluate(async () => {
  const k = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
  const me = () => (Net.slot === 0 ? game.player1 : game.player2);
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const lat = []; let frozen = 0, total = 0, lastFc = Net.frameCount, maxBacklog = 0;
  for (let i = 0; i < 10; i++) {
    const code = i % 2 ? 'ArrowLeft' : 'ArrowRight';
    const x0 = me().rect.x, t0 = performance.now();
    k('keydown', code);
    while (me().rect.x === x0 && performance.now() - t0 < 2000) { await raf(); }
    lat.push(performance.now() - t0);
    const tEnd = performance.now() + 300;
    while (performance.now() < tEnd) { await raf(); total++; const fc = Net.frameCount; if (fc === lastFc) frozen++; lastFc = fc; maxBacklog = Math.max(maxBacklog, Net.frames.length); }
    k('keyup', code);
    for (let j = 0; j < 12; j++) await raf();
  }
  lat.sort((a, b) => a - b);
  return { 입력지연_중간: Math.round(lat[5]), 입력지연_최악: Math.round(lat[9]), 멈춘화면비율: Math.round(frozen / total * 100) + '%', 최대밀린틱: maxBacklog, 핑: Net.pingMs, 연결: Net.mode, 여유분: Net.bufferTarget() };
});
(async () => {
  const b = await chromium.launch();
  for (const [name, prof] of Object.entries(PROFILES)) {
    const pages = [];
    for (let i = 0; i < 2; i++) {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
      const p = await ctx.newPage(); await p.addInitScript(sim, prof);
      const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
      await p.goto(`http://localhost:${process.env.PORT || 3000}/`); pages.push(p);
    }
    const [host, guest] = pages;
    await host.waitForTimeout(800);
    await host.click('#btn-create'); await host.click('#btn-create-ok');
    await host.waitForFunction(() => Net.code && Net.code.length === 4, null, { timeout: 15000 });
    const code = await host.evaluate(() => Net.code);
    await guest.fill('#room-code', code); await guest.click('#btn-join');
    await host.waitForFunction(() => Net.isOnline(), null, { timeout: 20000 });
    await guest.waitForFunction(() => Net.isOnline(), null, { timeout: 20000 });
    for (const p of pages) { await p.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' })); }); }
    await host.waitForTimeout(3000); // 핑·여유분 안정
    const [rh, rg] = await Promise.all([measure(host), measure(guest)]);
    console.log(`\n[${name}] CPU ${CPU}배 느리게`);
    console.log(' 1P(방장):', JSON.stringify(rh));
    console.log(' 2P(상대):', JSON.stringify(rg));
    for (const p of pages) await p.context().close();
  }
  await b.close();
})();
