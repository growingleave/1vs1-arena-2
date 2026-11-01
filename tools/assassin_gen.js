// 어쌔신 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
//   assassin_thrust.png 120x30 : 찌르기 예각삼각형 (뒤쪽 밑변 x 7, 칼끝 x 117, 가운데 y 15, 오른쪽으로 찌름) — 흰 빛, 색 입혀 'lighter'
//   assassin_spin.png   150x150: 회전 베기 (가운데 = 그림 가운데, 오른쪽(0도)에서 시작해 시계 방향 한 바퀴,
//                                  검사 평타처럼 붓질 호가 모인 원, 바깥 테 반지름 70 = 그림 크기의 0.467) — 흰 빛, 색 입혀 'lighter'
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

    // ---------- 찌르기: 앞이 뾰족한 넓은 예각삼각형 (뒤쪽 밑변이 판정 두께만큼 넓음) ----------
    const th = mk(240, 60), t = th.getContext('2d'); const TY = 30;
    const lg = t.createLinearGradient(14, 0, 234, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.2, 'rgba(255,255,255,0.08)'); lg.addColorStop(0.55, 'rgba(255,255,255,0.7)'); lg.addColorStop(1, 'rgba(255,255,255,1)');
    t.fillStyle = lg; t.beginPath(); t.moveTo(14, TY - 21); t.lineTo(234, TY); t.lineTo(14, TY + 21); t.closePath(); t.fill();
    t.strokeStyle = '#fff'; t.lineWidth = 1.5;                                                                    // 위·아래 날 선
    t.beginPath(); t.moveTo(60, TY - 16.6); t.lineTo(234, TY); t.lineTo(60, TY + 16.6); t.stroke();
    t.lineWidth = 1.2; t.beginPath(); t.moveTo(90, TY); t.lineTo(234, TY); t.stroke();                         // 가운데 선
    const thrust = bakeGlow(th, [[2, 0.35]]);

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
