// 어쌔신 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
//   assassin_thrust.png 120x30 : 찌르기 — 퍼져 있던 가는 선들이 칼끝 한 점으로 모임 (가운데 선 시작 x 6, 칼끝 x 117, 가운데 y 15) — 흰 빛, 색 입혀 'lighter'
//   assassin_spin.png   150x150: 회전 베기 (가운데 = 그림 가운데, 오른쪽(0도)에서 시작해 시계 방향 한 바퀴,
//                                  검사 평타처럼 붓질 호가 모인 원, 바깥 테 반지름 70 = 그림 크기의 0.467) — 흰 빛, 색 입혀 'lighter'
//   assassin_wind.png   160x60 : 대쉬 바람 줄 (앞쪽 끝 x 150, 가운데 y 30, 뒤로 흩어짐) — 흰 빛, 색 입혀 'lighter'
//   assassin_hook.png   40x40  : 갈고리 머리 (오른쪽을 향함, 줄 거는 고리 x 7, 촉 끝 x 38, 가운데 y 20) — 보통
//   assassin_gas.png    64x64  : 대쉬 가스 뭉치 (흰 반투명, 가운데) — 보통
//   assassin_xslash.png 600x60 : 궁극기 참격 한 획 (왼쪽 끝 x 10 → 오른쪽 끝 x 590, 가운데 y 30, 판정 길이 520 + 양끝 30) — 흰 빛, 색 입혀 'lighter'
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

    // ---------- 찌르기: 몸 앞에서 뻗는 가운데 선 + 뒤에서 퍼져 있다가 칼끝 한 점으로 모이는 가는 선들 ----------
    const th = mk(240, 60), t = th.getContext('2d'); const TY = 30, TX = 234;
    t.strokeStyle = '#fff'; t.lineCap = 'round';
    // 선 하나: (x0,y0)에서 시작해 살짝 휘며 칼끝으로, 중간에 잔가지 하나
    const line = (x0, y0, w, a) => {
      const mx = x0 + (TX - x0) * 0.45, my = y0 + (TY - y0) * 0.2 + R(-2, 2);
      const g = t.createLinearGradient(x0, 0, TX, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.12, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,1)');
      t.strokeStyle = g; t.lineWidth = w;
      t.beginPath(); t.moveTo(x0, y0); t.quadraticCurveTo(mx, my, TX, TY); t.stroke();
      if (rnd() < 0.6) { // 잔가지
        const u = R(0.3, 0.6), bx = x0 + (TX - x0) * u, by = y0 + (TY - y0) * u * 0.8;
        t.lineWidth = w * 0.6; t.beginPath(); t.moveTo(bx, by); t.lineTo(bx - R(14, 26), by + (by - TY) * R(0.15, 0.35)); t.stroke();
      }
    };
    t.lineWidth = 3.2; const cg = t.createLinearGradient(12, 0, TX, 0); cg.addColorStop(0, 'rgba(255,255,255,0.5)'); cg.addColorStop(1, '#fff');
    t.strokeStyle = cg; t.beginPath(); t.moveTo(12, TY); t.lineTo(TX, TY); t.stroke();          // 가운데 선
    for (const [x0, dy, w, a] of [[60, -20, 3.2, 1], [90, -13, 2.8, 1], [120, -7, 2.4, 1], [40, 22, 3.2, 1], [80, 15, 2.8, 1], [130, 8, 2.2, 1], [105, -24, 2, 0.85], [110, 25, 2, 0.85]]) line(x0, TY + dy, w, a);
    t.fillStyle = '#fff'; t.beginPath(); t.moveTo(TX - 34, TY - 3.5); t.lineTo(TX + 4, TY); t.lineTo(TX - 34, TY + 3.5); t.closePath(); t.fill(); // 칼끝
    const thrust = bakeGlow(th, [[2, 0.3]]);

    // ---------- 회전 베기: 검사 평타 부채꼴을 360도로 (붓질 같은 호 여러 줄, 바깥 테가 진함) ----------
    const sp = mk(300, 300), s = sp.getContext('2d'); const C = 150, RR = 140;
    const END = Math.PI * 2 - 0.2;
    s.save(); s.beginPath(); s.moveTo(C, C); s.arc(C, C, RR + 4, 0, END); s.closePath(); s.clip();   // 끝(칼이 지나간 앞쪽)은 반지름 방향으로 또렷하게 잘림
    // 붓질 호 하나: 반지름 r, 각도 a0~a1, 두께 w (양끝이 가늘어짐)
    const streak = (r, a0, a1, w, alpha) => {
      const n = 60; s.globalAlpha = alpha; s.fillStyle = '#fff'; s.beginPath();
      for (let i = 0; i <= n; i++) { const u = i / n, a = a0 + (a1 - a0) * u, ww = w * Math.pow(Math.sin(Math.PI * u), 0.6) * (0.4 + 0.6 * u); (i ? s.lineTo : s.moveTo).call(s, C + Math.cos(a) * (r + ww / 2), C + Math.sin(a) * (r + ww / 2)); }
      for (let i = n; i >= 0; i--) { const u = i / n, a = a0 + (a1 - a0) * u, ww = w * Math.pow(Math.sin(Math.PI * u), 0.6) * (0.4 + 0.6 * u); s.lineTo(C + Math.cos(a) * (r - ww / 2), C + Math.sin(a) * (r - ww / 2)); }
      s.closePath(); s.fill();
    };
    // 바깥 테: 끝으로 갈수록 두꺼운 진한 띠
    // (끝을 잘린 선 너머로 늘려서 앞쪽이 가장 두껍게 잘리게)
    for (let i = 0; i < 4; i++) streak(RR - 2 - i * 2, R(0.2, 1.2), END + 1.2, 4 + i * 3.5, 0.5);
    // 안쪽 붓질: 바깥쪽에 많이, 끝(앞쪽)으로 갈수록 길고 진하게
    for (let k = 0; k < 70; k++) {
      const a1 = END * Math.pow(rnd(), 0.45) + R(0, 0.8), len = R(0.5, 2.2) * (0.4 + a1 / END), a0 = Math.max(-0.2, a1 - len);
      const r = RR * (1 - 0.5 * Math.pow(rnd(), 1.6));
      streak(r, a0, a1, R(2, 9) * (0.4 + 0.8 * (r / RR)) * (0.5 + 0.6 * a1 / END), R(0.35, 0.9));
    }
    s.restore();
    const spin = bakeGlow(sp, [[2, 0.3]]);

    // ---------- 대쉬 바람: 앞(오른쪽)에서 뒤로 흩어지는 휘어진 바람 줄 (흰 빛) ----------
    const wd = mk(320, 120), w = wd.getContext('2d'); const WY = 60;
    w.lineCap = 'round';
    for (const [dy, x0, x1, bend, lw, a] of [[0, 20, 300, 0, 4, 1], [-16, 50, 270, -10, 3, 0.9], [16, 40, 280, 10, 3, 0.9], [-30, 90, 240, -14, 2, 0.75], [30, 80, 250, 14, 2, 0.75], [-42, 140, 220, -10, 1.5, 0.55], [42, 130, 210, 10, 1.5, 0.55]]) {
      const g = w.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, `rgba(255,255,255,${a})`); g.addColorStop(1, `rgba(255,255,255,${a * 0.3})`);
      w.strokeStyle = g; w.lineWidth = lw;
      w.beginPath(); w.moveTo(x0, WY + dy + bend); w.quadraticCurveTo((x0 + x1) / 2, WY + dy - bend * 0.3, x1, WY + dy * 0.4); w.stroke();
    }
    const wind = bakeGlow(wd, [[3, 0.5]]);

    // ---------- 갈고리 머리: 오른쪽을 향한 세 갈래 갈고리 (물체 그림) ----------
    const hk = mk(80, 80), h = hk.getContext('2d'); const HX = 40, HY = 40;
    const metal = h.createLinearGradient(0, 24, 0, 56); metal.addColorStop(0, '#e8ecf2'); metal.addColorStop(0.5, '#8a909c'); metal.addColorStop(1, '#3a3e48');
    h.strokeStyle = metal; h.lineCap = 'round'; h.lineWidth = 7;
    h.beginPath(); h.moveTo(14, HY); h.lineTo(58, HY); h.stroke();                        // 몸통
    h.lineWidth = 5;
    for (const s of [-1, 1]) { h.beginPath(); h.moveTo(52, HY); h.quadraticCurveTo(72, HY + s * 4, 66, HY + s * 22); h.lineTo(58, HY + s * 16); h.stroke(); } // 양쪽 갈고리
    h.fillStyle = '#f4f7fb'; h.beginPath(); h.moveTo(56, HY - 5); h.lineTo(76, HY); h.lineTo(56, HY + 5); h.closePath(); h.fill();          // 가운데 촉
    h.fillStyle = '#2a2d35'; h.beginPath(); h.arc(14, HY, 6, 0, Math.PI * 2); h.fill(); h.strokeStyle = '#c9ced8'; h.lineWidth = 2; h.stroke(); // 줄 거는 고리
    const hook = (() => { const o = mk(40, 40), x = o.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(hk, 0, 0, 40, 40); return o; })();

    // ---------- 대쉬 가스: 부드러운 흰 가스 뭉치 (물체처럼 보통으로, 반투명) ----------
    const gs = mk(128, 128), gx = gs.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const a = R(0, Math.PI * 2), d = R(0, 22), rr = R(16, 30), px = 64 + Math.cos(a) * d, py = 64 + Math.sin(a) * d;
      const rg = gx.createRadialGradient(px, py, 0, px, py, rr); rg.addColorStop(0, 'rgba(240,240,248,0.55)'); rg.addColorStop(1, 'rgba(240,240,248,0)');
      gx.fillStyle = rg; gx.beginPath(); gx.arc(px, py, rr, 0, Math.PI * 2); gx.fill();
    }
    const gas = (() => { const o = mk(64, 64), x = o.getContext('2d'); x.filter = 'blur(2px)'; x.drawImage(gs, 0, 0, 64, 64); return o; })();

    // ---------- 궁극기 참격 한 획: 길고 날카로운 직선 칼자국 (양끝 뾰족, 가운데 밝은 날, 붓질 결) ----------
    const xs = mk(1200, 120), q = xs.getContext('2d'); const QY = 60, QL = 20, QR = 1180;
    const band = (y, x0, x1, w, a) => {   // 양끝이 뾰족한 띠
      q.globalAlpha = a; q.fillStyle = '#fff'; q.beginPath();
      const n = 40;
      for (let i = 0; i <= n; i++) { const u = i / n, x = x0 + (x1 - x0) * u, ww = w * Math.pow(Math.sin(Math.PI * u), 0.55); (i ? q.lineTo : q.moveTo).call(q, x, y - ww / 2); }
      for (let i = n; i >= 0; i--) { const u = i / n, x = x0 + (x1 - x0) * u, ww = w * Math.pow(Math.sin(Math.PI * u), 0.55); q.lineTo(x, y + ww / 2); }
      q.closePath(); q.fill(); q.globalAlpha = 1;
    };
    band(QY, QL, QR, 26, 0.55);                                  // 넓은 칼바람
    band(QY, QL + 60, QR - 40, 12, 1);                           // 날
    for (let k = 0; k < 18; k++) {                               // 결 (위아래로 어긋난 가는 붓질)
      const x0 = R(QL, QR - 300), len = R(150, 500), dy = R(-22, 22);
      band(QY + dy, x0, Math.min(QR, x0 + len), R(1.5, 4) * (1 - Math.abs(dy) / 30), R(0.35, 0.8));
    }
    q.fillStyle = '#fff';                                        // 튀는 파편
    for (let k = 0; k < 22; k++) {
      const x = R(QL + 80, QR - 80), y = QY + (rnd() < 0.5 ? -1 : 1) * R(20, 50), len = R(8, 18);
      q.save(); q.translate(x, y); q.rotate(R(-0.25, 0.25)); q.beginPath(); q.moveTo(-len, 0); q.lineTo(0, -1.2); q.lineTo(len, 0); q.lineTo(0, 1.2); q.closePath(); q.fill(); q.restore();
    }
    const xslash = bakeGlow(xs, [[4, 0.6], [1.5, 0.4]]);

    const tint = (img, col) => { const c = mk(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); return c; };
    const pv = mk(480, 200), pc = pv.getContext('2d');
    pc.fillStyle = '#1e1e24'; pc.fillRect(0, 0, 480, 200); pc.globalCompositeOperation = 'lighter';
    pc.drawImage(tint(thrust, '#c080ff'), 10, 80, 240, 60); pc.drawImage(thrust, 10, 80, 240, 60);
    pc.globalAlpha = 1; pc.drawImage(tint(spin, '#c080ff'), 270, 0, 200, 200); pc.globalAlpha = 0.5; pc.drawImage(spin, 270, 0, 200, 200);
    pc.globalCompositeOperation = 'lighter'; pc.drawImage(tint(wind, '#c080ff'), 10, 140, 160, 60); pc.globalCompositeOperation = 'source-over'; pc.drawImage(hook, 200, 150, 40, 40);
    return { thrust: thrust.toDataURL(), spin: spin.toDataURL(), wind: wind.toDataURL(), hook: hook.toDataURL(), gas: gas.toDataURL(), xslash: xslash.toDataURL(), pv: pv.toDataURL() };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('assassin_thrust.png', res.thrust); save('assassin_wind.png', res.wind); save('assassin_hook.png', res.hook); save('assassin_gas.png', res.gas); save('assassin_xslash.png', res.xslash); save('assassin_spin.png', res.spin); save('preview_assassin.png', res.pv);
  await b.close();
})();
