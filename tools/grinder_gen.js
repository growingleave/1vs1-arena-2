// 분쇄자 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
// 모두 "빛나는 이펙트" 그림: 검은 배경에 흰 빛으로 그려 번지게 굽고, 게임에서 주황색을 입혀 'lighter'로 그린다
//   grinder_saw.png        64x64 : 빠르게 도는 톱날 (톱니 자국이 흐르듯 번진 고리, 가운데 = 그림 가운데, 바깥 반지름 30)
//   grinder_claw_open.png  64x64 : 펼친 집게 빛 윤곽 (줄 거는 곳 (32,4), 발이 아래로)
//   grinder_claw_shut.png  64x64 : 오므린 집게 빛 윤곽 (같은 좌표계)
//   grinder_press.png      120x150: 내려찍는 유압 프레스 빛 윤곽 + 위로 흐르는 속도선 (찍는 면 가운데 (60,146), 판 너비 104)
//   grinder_impact.png     128x128: 네모 충격파 (가운데, 바깥 네모 한 변 ≈ 112)
//   grinder_scrap_0~3.png  24x24 : 달궈진 고철 조각 빛 실루엣 — 0 너트, 1 볼트, 2 톱니 조각, 3 휜 쇳조각
//   preview_grinder.png (확인용)
// 실행: node tools/grinder_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
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
    const W = '#fff';

    // ---------- 도는 톱날: 톱니 자국을 조금씩 돌려 여러 번 겹쳐 그려 흐르듯 번지게 ----------
    const sw = mk(128, 128), s = sw.getContext('2d'); const C = 64;
    s.strokeStyle = W; s.fillStyle = W; s.lineCap = 'round';
    for (let k = 0; k < 10; k++) {                       // 회전 잔상
      s.globalAlpha = 0.12 + 0.08 * (k / 9);
      const rot = k * 0.035;
      for (let i = 0; i < 16; i++) { const a = rot + i / 16 * Math.PI * 2;
        s.beginPath(); s.moveTo(C + Math.cos(a) * 46, C + Math.sin(a) * 46); s.lineTo(C + Math.cos(a + 0.12) * 60, C + Math.sin(a + 0.12) * 60); s.lineTo(C + Math.cos(a + 0.33) * 48, C + Math.sin(a + 0.33) * 48); s.closePath(); s.fill(); }
    }
    s.globalAlpha = 1; s.lineWidth = 3; s.beginPath(); s.arc(C, C, 47, 0, Math.PI * 2); s.stroke();
    s.globalAlpha = 0.55; s.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; s.beginPath(); s.arc(C, C, 30, a, a + 1.4); s.stroke(); } // 안쪽 흐르는 호
    s.globalAlpha = 1; s.beginPath(); s.arc(C, C, 8, 0, Math.PI * 2); s.fill();
    const saw = bakeGlow(sw, [[5, 0.7], [2, 0.5]]);

    // ---------- 집게 빛 윤곽 ----------
    const claw = (spread) => {
      const c = mk(128, 128), g = c.getContext('2d');
      g.strokeStyle = W; g.lineCap = 'round'; g.lineJoin = 'round';
      const tine = (side, inner) => {
        const sx = 64 + side * (inner ? 6 : 14), sy = 42;
        const ox = 64 + side * ((inner ? 22 : 46) * spread + (inner ? 4 : 8) * (1 - spread));
        const ex = 64 + side * ((inner ? 14 : 30) * spread + 2 * (1 - spread));
        g.lineWidth = inner ? 4 : 5;
        g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(ox, 66 + 10 * spread, ex, 108 + 8 * (1 - spread)); g.stroke();
        g.fillStyle = W; g.beginPath(); g.arc(ex, 108 + 8 * (1 - spread), inner ? 3 : 4, 0, Math.PI * 2); g.fill(); // 발끝 빛
      };
      tine(-1, false); tine(1, false); tine(-1, true); tine(1, true);
      g.lineWidth = 4; g.beginPath(); g.roundRect(48, 14, 32, 24, 4); g.stroke();
      g.beginPath(); g.moveTo(42, 42); g.lineTo(86, 42); g.stroke();
      g.beginPath(); g.moveTo(64, 2); g.lineTo(64, 14); g.stroke();
      return bakeGlow(c, [[5, 0.7], [2, 0.5]]);
    };
    const clawOpen = claw(1), clawShut = claw(0);

    // ---------- 프레스 빛 윤곽 + 위로 흐르는 속도선 ----------
    const pr = mk(240, 300), q = pr.getContext('2d');
    q.strokeStyle = W; q.fillStyle = W; q.lineCap = 'round'; q.lineJoin = 'round';
    for (const [x, len, a] of [[30, 120, 0.5], [60, 170, 0.7], [180, 170, 0.7], [210, 120, 0.5], [95, 90, 0.4], [145, 90, 0.4]]) {  // 속도선
      const g = q.createLinearGradient(0, 186 - len, 0, 186); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,255,255,${a})`);
      q.strokeStyle = g; q.lineWidth = 3; q.beginPath(); q.moveTo(x, 186 - len); q.lineTo(x, 180); q.stroke();
    }
    q.strokeStyle = W; q.lineWidth = 5;
    q.beginPath(); q.moveTo(104, 0); q.lineTo(104, 162); q.moveTo(136, 0); q.lineTo(136, 162); q.stroke();   // 피스톤
    q.strokeRect(80, 162, 80, 26);                                                                         // 연결부
    q.lineWidth = 6; q.beginPath(); q.roundRect(16, 188, 208, 104, 8); q.stroke();                         // 누르는 판
    q.globalAlpha = 0.25; q.fillRect(16, 188, 208, 104); q.globalAlpha = 1;
    q.lineWidth = 3; for (let x = 26; x < 220; x += 26) { q.beginPath(); q.moveTo(x, 290); q.lineTo(x + 18, 266); q.stroke(); } // 경고 빗금
    q.beginPath(); q.moveTo(16, 264); q.lineTo(224, 264); q.stroke();
    q.lineWidth = 8; q.beginPath(); q.moveTo(20, 292); q.lineTo(220, 292); q.stroke();                     // 찍는 면 (가장 밝게)
    const press = bakeGlow(pr, [[6, 0.7], [2, 0.5]]);

    // ---------- 네모 충격파 ----------
    const im = mk(256, 256), m = im.getContext('2d');
    m.strokeStyle = W; m.lineJoin = 'round';
    m.lineWidth = 8; m.beginPath(); m.roundRect(16, 16, 224, 224, 18); m.stroke();
    m.globalAlpha = 0.4; m.lineWidth = 22; m.beginPath(); m.roundRect(34, 34, 188, 188, 14); m.stroke();
    m.globalAlpha = 0.8; m.lineWidth = 3;                                                                   // 모서리에서 튀는 금
    for (const [x, y, dx, dy] of [[16, 16, -1, -1], [240, 16, 1, -1], [16, 240, -1, 1], [240, 240, 1, 1]]) { m.beginPath(); m.moveTo(x, y); m.lineTo(x + dx * 12, y + dy * 4); m.moveTo(x, y); m.lineTo(x + dx * 4, y + dy * 12); m.stroke(); }
    const impact = bakeGlow(im, [[6, 0.7], [2, 0.5]]);

    // ---------- 달궈진 고철 조각 (빛 실루엣) ----------
    const scrap = (fn) => { const c = mk(48, 48), x = c.getContext('2d'); x.fillStyle = W; x.strokeStyle = W; x.lineJoin = 'round'; fn(x); return bakeGlow(c, [[3, 0.6]]); };
    const hex = (x, cx, cy, r) => { x.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.closePath(); };
    const hole = (x, cx, cy, r) => { x.save(); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); x.restore(); };
    const scraps = [
      scrap((x) => { hex(x, 24, 24, 17); x.fill(); hole(x, 24, 24, 7); }),
      scrap((x) => { x.fillRect(18, 20, 24, 8); hex(x, 12, 24, 9); x.fill(); x.save(); x.globalCompositeOperation = 'destination-out'; x.lineWidth = 1.5; for (let i = 22; i < 42; i += 5) { x.beginPath(); x.moveTo(i, 20); x.lineTo(i + 2, 28); x.stroke(); } x.restore(); }),
      scrap((x) => { x.beginPath(); for (let i = 0; i <= 8; i++) { const a = -0.2 + i / 8 * 2.4, r = i % 2 ? 22 : 16; x.lineTo(10 + Math.cos(a) * r, 10 + Math.sin(a) * r); } x.lineTo(10, 10); x.closePath(); x.fill(); hole(x, 10, 10, 4); }),
      scrap((x) => { x.beginPath(); x.moveTo(6, 30); x.lineTo(20, 12); x.lineTo(30, 18); x.lineTo(42, 8); x.lineTo(44, 18); x.lineTo(30, 30); x.lineTo(20, 26); x.lineTo(10, 40); x.closePath(); x.fill(); }),
    ];

    const tint = (img, col) => { const c = mk(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); return c; };
    const show = (x, img, dx, dy, w, h) => { x.drawImage(tint(img, '#ff9a30'), dx, dy, w, h); x.globalAlpha = 0.5; x.drawImage(img, dx, dy, w, h); x.globalAlpha = 1; };
    const pv = mk(700, 200), pc = pv.getContext('2d');
    pc.fillStyle = '#1e1e24'; pc.fillRect(0, 0, 700, 200); pc.globalCompositeOperation = 'lighter';
    show(pc, saw, 10, 10, 64, 64); show(pc, clawOpen, 90, 10, 64, 64); show(pc, clawShut, 160, 10, 64, 64);
    show(pc, press, 240, 10, 120, 150); show(pc, impact, 380, 10, 128, 128);
    scraps.forEach((sc, i) => show(pc, sc, 530 + (i % 2) * 70, 20 + Math.floor(i / 2) * 70, 48, 48));
    const u = (c) => c.toDataURL();
    return { saw: u(saw), open: u(clawOpen), shut: u(clawShut), press: u(press), impact: u(impact), scraps: scraps.map(u), pv: u(pv) };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('grinder_saw.png', res.saw); save('grinder_claw_open.png', res.open); save('grinder_claw_shut.png', res.shut);
  save('grinder_press.png', res.press); save('grinder_impact.png', res.impact);
  res.scraps.forEach((s, i) => save(`grinder_scrap_${i}.png`, s));
  save('preview_grinder.png', res.pv);
  await b.close();
})();
