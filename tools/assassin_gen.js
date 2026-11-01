// 어쌔신 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
//   assassin_thrust.png 120x30 : 찌르기 (꼬리 x 5, 칼끝 x 114, 가운데 y 15, 오른쪽으로 찌름) — 흰 빛, 색 입혀 'lighter'
//   assassin_spin.png   150x150: 회전 베기 (가운데 = 그림 가운데, 오른쪽(0도)에서 시작해 시계 방향 한 바퀴,
//                                  칼자국 반지름 ≈ 56 ± 거친 가장자리, 끝으로 갈수록 두꺼움) — 흰 빛, 색 입혀 'lighter'
//   preview_assassin.png (확인용)
// 실행: node tools/assassin_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    let seed = 1337;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const R = (a, b) => a + (b - a) * rnd();
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const bakeGlow = (src, blurs) => {
      const W = src.width, H = src.height;
      const o = mk(W, H), x = o.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'lighter';
      for (const [bl, a] of blurs) { x.filter = `blur(${bl}px)`; x.globalAlpha = a; x.drawImage(src, 0, 0); }
      x.filter = 'none'; x.globalAlpha = 1; x.drawImage(src, 0, 0);
      const s = mk(W / 2, H / 2), sx = s.getContext('2d'); sx.imageSmoothingQuality = 'high'; sx.drawImage(o, 0, 0, W / 2, H / 2);
      const d = sx.getImageData(0, 0, s.width, s.height), px = d.data;
      for (let i = 0; i < px.length; i += 4) { const m = Math.max(px[i], px[i + 1], px[i + 2]); if (!m) { px[i + 3] = 0; continue; } px[i] *= 255 / m; px[i + 1] *= 255 / m; px[i + 2] *= 255 / m; px[i + 3] = m; }
      sx.putImageData(d, 0, 0); return s;
    };

    // ---------- 찌르기: 뒤에서 앞으로 가늘어지는 날카로운 쐐기 + 속도선 ----------
    const th = mk(240, 60), t = th.getContext('2d'); const TY = 30;
    const lg = t.createLinearGradient(10, 0, 228, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.35, 'rgba(255,255,255,0.75)'); lg.addColorStop(1, 'rgba(255,255,255,1)');
    t.fillStyle = lg; t.beginPath(); t.moveTo(10, TY - 3); t.lineTo(150, TY - 8); t.lineTo(228, TY); t.lineTo(150, TY + 8); t.lineTo(10, TY + 3); t.closePath(); t.fill();
    t.fillStyle = '#fff'; t.beginPath(); t.moveTo(90, TY - 2); t.lineTo(228, TY); t.lineTo(90, TY + 2); t.closePath(); t.fill(); // 가운데 날 선
    t.strokeStyle = 'rgba(255,255,255,0.6)'; t.lineWidth = 2; t.lineCap = 'round';
    for (const [y, x0, x1] of [[TY - 16, 40, 150], [TY + 15, 60, 160], [TY - 22, 90, 140], [TY + 21, 30, 100]]) { t.globalAlpha = 0.55; t.beginPath(); t.moveTo(x0, y); t.lineTo(x1, y + (TY - y) * 0.15); t.stroke(); }
    t.globalAlpha = 1;
    const tip = t.createRadialGradient(200, TY, 0, 200, TY, 9); tip.addColorStop(0, 'rgba(255,255,255,1)'); tip.addColorStop(1, 'rgba(255,255,255,0)');
    t.fillStyle = tip; t.beginPath(); t.ellipse(200, TY, 22, 5, 0, 0, Math.PI * 2); t.fill();
    const thrust = bakeGlow(th, [[5, 0.7], [2, 0.5]]);

    // ---------- 회전 베기: 거친 칼자국 고리 ----------
    const sp = mk(300, 300), s = sp.getContext('2d'); const C = 150, BASE = 112;
    // 각도별 거친 반지름 (부드러운 물결 + 들쭉날쭉)
    const N = 180;
    const noise = []; for (let i = 0; i <= N; i++) noise.push(R(-1, 1));
    const smooth = (i) => (noise[Math.max(0, i - 1)] + 2 * noise[i] + noise[Math.min(N, i + 1)]) / 4;
    const END = Math.PI * 2 - 0.25;
    const outer = [], inner = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = u * END;
      const thick = 3 + 24 * Math.pow(u, 0.8);                      // 시작은 가늘고 끝으로 갈수록 두껍게
      const wob = Math.sin(a * 3 + 0.7) * 5 + smooth(i) * 6;          // 원이 아닌 일그러진 모양
      const spike = (i % 7 === 3) ? R(4, 11) * u : 0;                  // 바깥쪽 톱니
      outer.push([a, BASE + wob + thick / 2 + spike]);
      inner.push([a, BASE + wob - thick / 2 + R(-2, 2)]);
    }
    s.fillStyle = '#fff'; s.beginPath();
    outer.forEach(([a, r], i) => (i ? s.lineTo : s.moveTo).call(s, C + Math.cos(a) * r, C + Math.sin(a) * r));
    // 끝: 뾰족한 칼끝
    const [ea, er] = outer[N]; s.lineTo(C + Math.cos(ea + 0.18) * (er - 10), C + Math.sin(ea + 0.18) * (er - 10));
    for (let i = N; i >= 0; i--) { const [a, r] = inner[i]; s.lineTo(C + Math.cos(a) * r, C + Math.sin(a) * r); }
    s.closePath(); s.fill();
    // 몸통 속 빈틈(긁힌 결): 어두운 가는 결을 지워서 거칠게
    s.globalCompositeOperation = 'destination-out'; s.lineCap = 'round';
    for (let k = 0; k < 7; k++) {
      const a0 = R(0.6, END - 0.6), len = R(0.3, 0.9), rr = BASE + R(-6, 6);
      s.lineWidth = R(1.2, 2.5); s.beginPath(); s.arc(C, C, rr, a0, a0 + len); s.stroke();
    }
    s.globalCompositeOperation = 'source-over';
    // 바깥·안쪽으로 따라오는 끊긴 긁힘 선
    s.strokeStyle = 'rgba(255,255,255,0.85)'; s.lineCap = 'round';
    for (let k = 0; k < 9; k++) {
      const a0 = R(0.4, END - 0.3), len = R(0.25, 0.8), off = (rnd() < 0.5 ? -1 : 1) * R(18, 30) * (0.4 + a0 / END);
      s.lineWidth = R(1.2, 3); s.beginPath(); s.arc(C, C, BASE + off, a0, Math.min(END, a0 + len)); s.stroke();
    }
    // 튀는 조각
    s.fillStyle = '#fff';
    for (let k = 0; k < 16; k++) {
      const a = R(0.8, END), r = BASE + R(20, 34), sz = R(2, 5);
      s.save(); s.translate(C + Math.cos(a) * r, C + Math.sin(a) * r); s.rotate(a + Math.PI / 2 + R(-0.5, 0.5));
      s.beginPath(); s.moveTo(-sz * 2, 0); s.lineTo(0, -sz * 0.6); s.lineTo(sz * 2, 0); s.lineTo(0, sz * 0.6); s.closePath(); s.fill(); s.restore();
    }
    const spin = bakeGlow(sp, [[6, 0.7], [2, 0.5]]);

    const tint = (img, col) => { const c = mk(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); return c; };
    const pv = mk(480, 200), pc = pv.getContext('2d');
    pc.fillStyle = '#1e1e24'; pc.fillRect(0, 0, 480, 200); pc.globalCompositeOperation = 'lighter';
    pc.drawImage(tint(thrust, '#c080ff'), 10, 80, 240, 60); pc.drawImage(thrust, 10, 80, 240, 60);
    pc.globalAlpha = 1; pc.drawImage(tint(spin, '#c080ff'), 270, 0, 200, 200); pc.globalAlpha = 0.5; pc.drawImage(spin, 270, 0, 200, 200);
    return { thrust: thrust.toDataURL(), spin: spin.toDataURL(), pv: pv.toDataURL() };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('assassin_thrust.png', res.thrust); save('assassin_spin.png', res.spin); save('preview_assassin.png', res.pv);
  await b.close();
})();
