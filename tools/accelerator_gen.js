// 가속자 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
//   acc_bullet.png  80x20 : 탄환 (머리 x 72, 가운데 y 10, 꼬리는 왼쪽) — 하늘색, 'lighter'
//   acc_muzzle.png  80x60 : 총구 불꽃 (총구 x 4, 가운데 y 30, 오른쪽으로 뿜어짐) — 하늘색, 'lighter'
//   acc_syringe.png 200x50: 주사기 몸통 (유리통 속은 비어 있음: x 52~148, y 18~32 / 바늘 끝 x 195, 가운데 y 25) — 보통으로 그림
//   acc_plunger.png 110x50: 밀대 (고무 마개 앞면 x 108, 가운데 y 25) — 보통으로 그림
//   acc_heal.png    150x150: 초록 치료 빛 (고리 반지름 = 크기의 0.36) — 'lighter'
//   preview_acc.png (확인용)
// 실행: node tools/accelerator_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    let seed = 4711;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const R = (a, b) => a + (b - a) * rnd();
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const CY_ = [100, 220, 255], GR = [70, 255, 130];
    const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;

    // 빛나는 그림: 검은 배경 + 빛 번짐 → 1/2, 밝기 = 불투명도 (색 유지)
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
    // 물체 그림: 그대로 1/2
    const half = (src) => { const s = mk(src.width / 2, src.height / 2), x = s.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, s.width, s.height); return s; };

    // ---------- 탄환 ----------
    const bu = mk(160, 40), bc = bu.getContext('2d'); bc.globalCompositeOperation = 'lighter'; bc.lineCap = 'round';
    for (let i = 0; i < 12; i++) { const s = i / 12; bc.strokeStyle = rgba(CY_, 0.08 + 0.1 * s); bc.lineWidth = 14 * (1 - s) + 2; bc.beginPath(); bc.moveTo(20 + 60 * s, 20); bc.lineTo(144, 20); bc.stroke(); }
    const tg = bc.createLinearGradient(10, 0, 150, 0); tg.addColorStop(0, 'rgba(255,255,255,0)'); tg.addColorStop(1, 'rgba(255,255,255,1)');
    bc.strokeStyle = tg; bc.lineWidth = 4; bc.beginPath(); bc.moveTo(10, 20); bc.lineTo(146, 20); bc.stroke();
    const hg = bc.createRadialGradient(144, 20, 0, 144, 20, 14); hg.addColorStop(0, 'rgba(255,255,255,1)'); hg.addColorStop(1, rgba(CY_, 0));
    bc.fillStyle = hg; bc.beginPath(); bc.arc(144, 20, 14, 0, Math.PI * 2); bc.fill();
    const bullet = bakeGlow(bu, [[6, 0.7], [2, 0.5]]);

    // ---------- 총구 불꽃 ----------
    const mu = mk(160, 120), mc = mu.getContext('2d'); mc.globalCompositeOperation = 'lighter';
    const spike = (ang, len, w, a) => { mc.save(); mc.translate(8, 60); mc.rotate(ang); const g = mc.createLinearGradient(0, 0, len, 0); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.4, rgba(CY_, a * 0.8)); g.addColorStop(1, rgba(CY_, 0)); mc.fillStyle = g; mc.beginPath(); mc.moveTo(0, -w); mc.lineTo(len, 0); mc.lineTo(0, w); mc.closePath(); mc.fill(); mc.restore(); };
    spike(0, 150, 18, 1); spike(-0.45, 80, 9, 0.8); spike(0.45, 80, 9, 0.8); spike(-0.95, 45, 6, 0.6); spike(0.95, 45, 6, 0.6);
    const fg = mc.createRadialGradient(14, 60, 0, 14, 60, 36); fg.addColorStop(0, 'rgba(255,255,255,1)'); fg.addColorStop(1, rgba(CY_, 0));
    mc.fillStyle = fg; mc.beginPath(); mc.arc(14, 60, 36, 0, Math.PI * 2); mc.fill();
    for (let i = 0; i < 10; i++) { const a = R(-0.6, 0.6), d = R(30, 120); mc.fillStyle = `rgba(255,255,255,${R(0.4, 0.9)})`; mc.beginPath(); mc.arc(8 + Math.cos(a) * d, 60 + Math.sin(a) * d, R(1, 2.5), 0, Math.PI * 2); mc.fill(); }
    const muzzle = bakeGlow(mu, [[5, 0.7]]);

    // ---------- 주사기 몸통 (유리통 속은 비워 둠) ----------
    const sy = mk(400, 100), s = sy.getContext('2d');
    const metal = (y0, y1) => { const g = s.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#f2f5f9'); g.addColorStop(0.5, '#a7b0bd'); g.addColorStop(1, '#dde2ea'); return g; };
    // 손가락 걸이 (세로로 긴 판)
    s.fillStyle = 'rgba(225,235,245,0.95)'; s.beginPath(); s.roundRect(92, 10, 14, 80, 5); s.fill();
    s.strokeStyle = '#7d8796'; s.lineWidth = 2; s.stroke();
    // 유리통: 속은 아주 옅게, 테두리·빛 반사·눈금
    s.fillStyle = 'rgba(220,240,255,0.10)'; s.fillRect(104, 34, 192, 32);
    s.strokeStyle = 'rgba(235,245,255,0.95)'; s.lineWidth = 3; s.strokeRect(104, 34, 192, 32);
    s.strokeStyle = 'rgba(255,255,255,0.75)'; s.lineWidth = 2; s.beginPath(); s.moveTo(110, 39); s.lineTo(290, 39); s.stroke();
    s.strokeStyle = 'rgba(200,215,230,0.8)'; s.lineWidth = 1.5;
    for (let x = 120; x <= 284; x += 16) { s.beginPath(); s.moveTo(x, 66); s.lineTo(x, (x / 16) % 2 ? 58 : 54); s.stroke(); }
    // 바늘 뿌리(허브) + 바늘
    s.fillStyle = metal(40, 60); s.beginPath(); s.moveTo(296, 38); s.lineTo(322, 44); s.lineTo(322, 56); s.lineTo(296, 62); s.closePath(); s.fill();
    s.strokeStyle = '#7d8796'; s.lineWidth = 1.5; s.stroke();
    s.fillStyle = metal(47, 53); s.beginPath(); s.moveTo(322, 47.5); s.lineTo(392, 49.5); s.lineTo(392, 50.5); s.lineTo(322, 52.5); s.closePath(); s.fill();
    s.strokeStyle = 'rgba(255,255,255,0.9)'; s.lineWidth = 1; s.beginPath(); s.moveTo(324, 48.5); s.lineTo(390, 49.8); s.stroke();
    const syringe = half(sy);

    // ---------- 밀대 (엄지 받침 + 막대 + 고무 마개) ----------
    const pl = mk(220, 100), q = pl.getContext('2d');
    q.fillStyle = 'rgba(230,238,246,0.95)'; q.beginPath(); q.roundRect(4, 16, 12, 68, 5); q.fill(); q.strokeStyle = '#7d8796'; q.lineWidth = 2; q.stroke(); // 엄지 받침
    q.fillStyle = 'rgba(215,225,236,0.95)'; q.fillRect(16, 44, 180, 12); q.strokeRect(16, 44, 180, 12); // 막대 (십자 단면처럼 가운데 선)
    q.strokeStyle = 'rgba(255,255,255,0.8)'; q.beginPath(); q.moveTo(18, 50); q.lineTo(194, 50); q.stroke();
    q.fillStyle = '#2b2f3a'; q.beginPath(); q.roundRect(194, 35, 22, 30, 4); q.fill(); // 고무 마개
    q.fillStyle = '#4a5060'; q.fillRect(198, 35, 3, 30); q.fillRect(206, 35, 3, 30);
    const plunger = half(pl);

    // ---------- 초록 치료 빛 ----------
    const he = mk(300, 300), h = he.getContext('2d'); h.globalCompositeOperation = 'lighter';
    const HC = 150, HR = 300 * 0.36;
    const g0 = h.createRadialGradient(HC, HC, 0, HC, HC, HR); g0.addColorStop(0, rgba(GR, 0.55)); g0.addColorStop(1, rgba(GR, 0));
    h.fillStyle = g0; h.beginPath(); h.arc(HC, HC, HR, 0, Math.PI * 2); h.fill();
    h.strokeStyle = rgba(GR, 0.95); h.lineWidth = 6; h.beginPath(); h.arc(HC, HC, HR, 0, Math.PI * 2); h.stroke();
    h.strokeStyle = 'rgba(220,255,230,0.7)'; h.lineWidth = 2; h.beginPath(); h.arc(HC, HC, HR * 0.78, 0, Math.PI * 2); h.stroke();
    const cross = (x, y, sz, a) => { h.fillStyle = `rgba(230,255,235,${a})`; h.fillRect(x - sz / 2, y - sz / 6, sz, sz / 3); h.fillRect(x - sz / 6, y - sz / 2, sz / 3, sz); };
    cross(HC, HC, 46, 0.95);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.2, d = HR + R(8, 26); cross(HC + Math.cos(a) * d, HC + Math.sin(a) * d, R(10, 18), R(0.6, 0.95)); }
    for (let k = 0; k < 24; k++) { const a = R(0, Math.PI * 2), d = R(HR * 0.4, HR * 1.25); h.fillStyle = rgba(GR, R(0.5, 1)); h.beginPath(); h.arc(HC + Math.cos(a) * d, HC + Math.sin(a) * d, R(1.5, 3.5), 0, Math.PI * 2); h.fill(); }
    const heal = bakeGlow(he, [[10, 0.7], [3, 0.5]]);

    const pv = mk(560, 170), pc = pv.getContext('2d'); pc.fillStyle = '#1e1e24'; pc.fillRect(0, 0, 560, 170);
    pc.drawImage(bullet, 10, 10); pc.drawImage(muzzle, 10, 40); pc.drawImage(plunger, 100, 30); pc.drawImage(syringe, 150, 30);
    pc.fillStyle = '#46ff82'; pc.fillRect(150 + 52 + 30, 30 + 18, 96 - 30, 14); // 액체 예시 (코드로 그릴 부분)
    pc.drawImage(syringe, 150, 30); pc.drawImage(heal, 400, 10);
    return { bullet: bullet.toDataURL(), muzzle: muzzle.toDataURL(), syringe: syringe.toDataURL(), plunger: plunger.toDataURL(), heal: heal.toDataURL(), preview: pv.toDataURL() };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('acc_bullet.png', res.bullet); save('acc_muzzle.png', res.muzzle); save('acc_syringe.png', res.syringe); save('acc_plunger.png', res.plunger); save('acc_heal.png', res.heal); save('preview_acc.png', res.preview);
  await b.close();
})();
