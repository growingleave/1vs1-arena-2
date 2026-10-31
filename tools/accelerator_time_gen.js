// 가속자 스킬 1·궁극기 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
//   acc_clock.png       200x200: 시계 문양 (흰색 빛, 가운데 = 그림 가운데, 바깥 고리 반지름 85) — 색을 입혀 'lighter'
//   acc_clock_break.png 160x160: 깨진 시계 + 파편 (흰색 빛) — 색을 입혀 'lighter'
//   acc_clock_icon.png  24x24  : 상대 머리 위 시계 아이콘 (바늘 없음, 가운데 = 그림 가운데) — 보통으로 그림
//   preview_acc_time.png (확인용)
// 실행: node tools/accelerator_time_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    let seed = 2024;
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
    const half = (src) => { const s = mk(src.width / 2, src.height / 2), x = s.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, s.width, s.height); return s; };
    const W = '#ffffff';

    // ---------- 시계 문양 ----------
    const ck = mk(400, 400), c = ck.getContext('2d'); const C = 200;
    c.strokeStyle = W; c.fillStyle = W; c.lineCap = 'round';
    c.lineWidth = 6; c.beginPath(); c.arc(C, C, 170, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 2; c.globalAlpha = 0.7; c.beginPath(); c.arc(C, C, 150, 0, Math.PI * 2); c.stroke();
    // 바깥 톱니 (끊긴 호)
    c.globalAlpha = 0.6; c.lineWidth = 4;
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; c.beginPath(); c.arc(C, C, 184, a + 0.04, a + 0.17); c.stroke(); }
    // 분 눈금 / 시 눈금
    c.globalAlpha = 0.55; c.lineWidth = 1.5;
    for (let i = 0; i < 60; i++) { if (i % 5 === 0) continue; const a = i / 60 * Math.PI * 2; c.beginPath(); c.moveTo(C + Math.cos(a) * 158, C + Math.sin(a) * 158); c.lineTo(C + Math.cos(a) * 166, C + Math.sin(a) * 166); c.stroke(); }
    c.globalAlpha = 1; c.lineWidth = 5;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      if (i % 3 === 0) { // 12·3·6·9: 마름모
        c.save(); c.translate(C + Math.cos(a) * 135, C + Math.sin(a) * 135); c.rotate(a);
        c.beginPath(); c.moveTo(-14, 0); c.lineTo(0, -7); c.lineTo(14, 0); c.lineTo(0, 7); c.closePath(); c.fill(); c.restore();
      } else { c.beginPath(); c.moveTo(C + Math.cos(a) * 128, C + Math.sin(a) * 128); c.lineTo(C + Math.cos(a) * 146, C + Math.sin(a) * 146); c.stroke(); }
    }
    // 바늘 (시침 2시 방향, 분침 10시 방향) + 가운데
    const hand = (ang, len, w) => { c.save(); c.translate(C, C); c.rotate(ang); c.beginPath(); c.moveTo(-14, -w * 0.6); c.lineTo(len, 0); c.lineTo(-14, w * 0.6); c.closePath(); c.fill(); c.restore(); };
    hand(-Math.PI / 6, 80, 10); hand(-Math.PI * 5 / 6, 118, 7);
    c.beginPath(); c.arc(C, C, 10, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.35; c.lineWidth = 2; c.beginPath(); c.arc(C, C, 60, 0, Math.PI * 2); c.stroke();
    const clock = bakeGlow(ck, [[10, 0.8], [3, 0.6]]);

    // ---------- 깨진 시계 ----------
    const br = mk(320, 320), d = br.getContext('2d'); const B = 160;
    d.strokeStyle = W; d.fillStyle = W; d.lineCap = 'round';
    // 고리가 6조각으로 갈라져 바깥으로 벌어짐
    for (let i = 0; i < 6; i++) {
      const a0 = i / 6 * Math.PI * 2 + R(0.05, 0.15), a1 = a0 + Math.PI * 2 / 6 - R(0.2, 0.35), mid = (a0 + a1) / 2, off = R(8, 20);
      d.save(); d.translate(Math.cos(mid) * off, Math.sin(mid) * off);
      d.lineWidth = 6; d.beginPath(); d.arc(B, B, 110, a0, a1); d.stroke();
      d.lineWidth = 2; d.globalAlpha = 0.6; d.beginPath(); d.arc(B, B, 96, a0 + 0.05, a1 - 0.05); d.stroke(); d.restore();
    }
    // 금 (가운데에서 뻗는 지그재그)
    d.globalAlpha = 0.9; d.lineWidth = 2.5;
    for (let i = 0; i < 7; i++) { let a = R(0, Math.PI * 2), r = 8; d.beginPath(); d.moveTo(B + Math.cos(a) * r, B + Math.sin(a) * r); while (r < 100) { r += R(14, 24); a += R(-0.25, 0.25); d.lineTo(B + Math.cos(a) * r, B + Math.sin(a) * r); } d.stroke(); }
    // 파편 (작은 삼각형)
    d.globalAlpha = 1;
    for (let i = 0; i < 16; i++) { const a = R(0, Math.PI * 2), r = R(115, 150), s = R(4, 9); d.save(); d.translate(B + Math.cos(a) * r, B + Math.sin(a) * r); d.rotate(R(0, 6)); d.beginPath(); d.moveTo(-s, -s * 0.5); d.lineTo(s, 0); d.lineTo(-s * 0.4, s); d.closePath(); d.fill(); d.restore(); }
    const brk = bakeGlow(br, [[8, 0.8], [3, 0.5]]);

    // ---------- 시계 아이콘 (물체) ----------
    const ic = mk(48, 48), e = ic.getContext('2d');
    e.fillStyle = '#9fefff'; e.fillRect(20, 1, 8, 5); // 위 꼭지
    e.beginPath(); e.arc(24, 26, 20, 0, Math.PI * 2); e.fillStyle = '#64dcff'; e.fill();
    e.beginPath(); e.arc(24, 26, 16, 0, Math.PI * 2); e.fillStyle = '#10223a'; e.fill();
    e.strokeStyle = '#d8f8ff'; e.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, l = i % 3 === 0 ? 5 : 3; e.beginPath(); e.moveTo(24 + Math.cos(a) * (15 - l), 26 + Math.sin(a) * (15 - l)); e.lineTo(24 + Math.cos(a) * 15, 26 + Math.sin(a) * 15); e.stroke(); }
    const icon = half(ic);

    const pv = mk(600, 220), pc = pv.getContext('2d');
    pc.fillStyle = '#1e1e24'; pc.fillRect(0, 0, 600, 220);
    const tint = (img, col) => { const t = mk(img.width, img.height), x = t.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, t.width, t.height); return t; };
    pc.globalCompositeOperation = 'lighter';
    pc.drawImage(tint(clock, '#64dcff'), 10, 10); pc.drawImage(clock, 10, 10, 200, 200);
    pc.drawImage(tint(brk, '#ff8040'), 230, 30);
    pc.globalCompositeOperation = 'source-over'; pc.drawImage(icon, 420, 90, 48, 48);
    return { clock: clock.toDataURL(), brk: brk.toDataURL(), icon: icon.toDataURL(), pv: pv.toDataURL() };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('acc_clock.png', res.clock); save('acc_clock_break.png', res.brk); save('acc_clock_icon.png', res.icon); save('preview_acc_time.png', res.pv);
  await b.close();
})();
