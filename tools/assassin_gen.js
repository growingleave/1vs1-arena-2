// 어쌔신 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
//   assassin_thrust.png 120x30 : 찌르기 (꼬리 x 5, 칼끝 x 114, 가운데 y 15, 오른쪽으로 찌름) — 흰 빛, 색 입혀 'lighter'
//   assassin_spin.png   150x150: 회전 베기 (가운데 = 그림 가운데, 오른쪽(0도)에서 시작해 시계 방향 한 바퀴,
//                                  면도날 칼자국 여러 겹, 주 칼자국 반지름 ≈ 56, 끝으로 갈수록 두꺼움) — 흰 빛, 색 입혀 'lighter'
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

    // ---------- 찌르기: 길고 가는 바늘 + 가는 날 선 + 칼끝 십자 반짝임 (번짐은 아주 조금만) ----------
    const th = mk(240, 60), t = th.getContext('2d'); const TY = 30;
    const lg = t.createLinearGradient(20, 0, 232, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.45, 'rgba(255,255,255,0.7)'); lg.addColorStop(1, 'rgba(255,255,255,1)');
    t.fillStyle = lg; t.beginPath(); t.moveTo(20, TY - 1); t.lineTo(160, TY - 4.5); t.lineTo(232, TY); t.lineTo(160, TY + 4.5); t.lineTo(20, TY + 1); t.closePath(); t.fill();
    t.strokeStyle = '#fff'; t.lineWidth = 1.2; t.beginPath(); t.moveTo(70, TY); t.lineTo(232, TY); t.stroke();         // 가운데 날 선
    t.lineWidth = 1;                                                                                              // 바늘을 따라가는 가는 선
    for (const [dy, x0, x1, a] of [[-9, 50, 190, 0.7], [8, 80, 200, 0.6], [-15, 100, 175, 0.45], [14, 40, 130, 0.4]]) {
      t.globalAlpha = a; t.beginPath(); t.moveTo(x0, TY + dy); t.lineTo(x1, TY + dy * 0.35); t.stroke();
    }
    t.globalAlpha = 1; t.fillStyle = '#fff';                                                                     // 칼끝 십자 반짝임
    t.beginPath(); t.moveTo(196, TY); t.lineTo(214, TY - 1.2); t.lineTo(236, TY); t.lineTo(214, TY + 1.2); t.closePath(); t.fill();
    t.beginPath(); t.moveTo(214, TY - 11); t.lineTo(215.2, TY); t.lineTo(214, TY + 11); t.lineTo(212.8, TY); t.closePath(); t.fill();
    const thrust = bakeGlow(th, [[3, 0.45]]);

    // ---------- 회전 베기: 양끝이 뾰족한 면도날 칼자국 여러 겹 (원이 아닌 일그러진 모양) ----------
    const sp = mk(300, 300), s = sp.getContext('2d'); const C = 150, BASE = 112;
    const END = Math.PI * 2 - 0.25;
    const ph = R(0, 6);
    const radAt = (a, r0) => r0 + Math.sin(a * 3 + ph) * 5 + Math.sin(a * 7 + ph * 2) * 2;     // 살짝 일그러진 원
    // a0~a1을 도는 칼자국 띠: 양끝은 뾰족, 뒤쪽(끝)으로 갈수록 두꺼움
    const slash = (r0, a0, a1, maxW, alpha = 1) => {
      const n = 120, out = [], inn = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, a = a0 + (a1 - a0) * u;
        const w = maxW * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.7) * (0.25 + 0.75 * u);
        const r = radAt(a, r0);
        out.push([a, r + w * 0.65]); inn.push([a, r - w * 0.35]);                     // 바깥쪽으로 더 두꺼운 칼날
      }
      s.globalAlpha = alpha; s.fillStyle = '#fff'; s.beginPath();
      out.forEach(([a, r], i) => (i ? s.lineTo : s.moveTo).call(s, C + Math.cos(a) * r, C + Math.sin(a) * r));
      for (let i = n; i >= 0; i--) { const [a, r] = inn[i]; s.lineTo(C + Math.cos(a) * r, C + Math.sin(a) * r); }
      s.closePath(); s.fill(); s.globalAlpha = 1;
    };
    slash(BASE, 0, END, 16);                 // 주 칼자국
    slash(BASE + 11, 0.7, END - 0.15, 6, 0.9); // 바깥 겹
    slash(BASE - 13, 2.2, END + 0.12, 5, 0.85); // 안쪽 겹
    slash(BASE + 25, 4.3, 5.9, 4, 0.8);      // 바깥으로 튀는 짧은 칼자국
    slash(BASE - 24, 0.9, 2.1, 3, 0.7);
    // 주 칼자국 안쪽에 가는 틈 → 칼날 두 겹처럼 날카롭게
    s.globalCompositeOperation = 'destination-out'; s.strokeStyle = '#000'; s.lineWidth = 1.6;
    s.beginPath();
    for (let i = 0; i <= 100; i++) { const a = 1.2 + (END - 1.5) * i / 100, r = radAt(a, BASE) + 2.5; (i ? s.lineTo : s.moveTo).call(s, C + Math.cos(a) * r, C + Math.sin(a) * r); }
    s.stroke(); s.globalCompositeOperation = 'source-over';
    // 바깥으로 튀는 바늘 같은 파편 (칼자국 방향으로 길게)
    s.fillStyle = '#fff';
    for (let k = 0; k < 14; k++) {
      const a = R(1.0, END), r = radAt(a, BASE) + R(18, 32), len = R(7, 14);
      s.save(); s.translate(C + Math.cos(a) * r, C + Math.sin(a) * r); s.rotate(a + Math.PI / 2 + R(-0.25, 0.25));
      s.beginPath(); s.moveTo(-len, 0); s.lineTo(0, -1); s.lineTo(len, 0); s.lineTo(0, 1); s.closePath(); s.fill(); s.restore();
    }
    const spin = bakeGlow(sp, [[3, 0.45]]);

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
