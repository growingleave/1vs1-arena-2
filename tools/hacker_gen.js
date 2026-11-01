// 해커 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
// 모두 흰 빛 그림: 게임에서 초록(해커 색)을 입혀 'lighter'로 그린다
//   hk_scan.png   256x80 : 스캔 빔 (왼쪽 가운데 (0,40)이 해커 쪽, 오른쪽으로 갈수록 넓어지는 좁은 부채꼴, 끝 폭 = 높이)
//   hk_cube.png   64x64  : 홀로그램 데이터 큐브 (가운데, 바깥 네모 한 변 ≈ 56)
//   hk_portal.png 64x64  : 텔레포트 포털 (모서리 괄호 + 주사선, 가운데)
//   hk_ring.png   256x256: 궁극기 해킹 파동 고리 (회로 무늬, 바깥 반지름 ≈ 124)
//   (hk_skull.png는 사용자가 준 해골 그림을 누끼 따고 초록으로 바꾼 것이라 여기서 만들지 않음)
//   preview_hacker.png (확인용)
// 실행: node tools/hacker_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    let seed = 1001;
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
    const W = '#fff';

    // ---------- 스캔 빔: 부채꼴 안에 주사선 + 0/1 글자 줄 (끝으로 갈수록 옅게) ----------
    const sc = mk(512, 160), s = sc.getContext('2d'); const CY = 80;
    s.save(); s.beginPath(); s.moveTo(0, CY - 4); s.lineTo(512, 0); s.lineTo(512, 160); s.lineTo(0, CY + 4); s.closePath(); s.clip();
    const fade = s.createLinearGradient(0, 0, 512, 0); fade.addColorStop(0, 'rgba(255,255,255,0.35)'); fade.addColorStop(1, 'rgba(255,255,255,0.06)');
    s.fillStyle = fade; s.fillRect(0, 0, 512, 160);
    s.globalAlpha = 0.5; s.strokeStyle = W; s.lineWidth = 1.5;
    for (let x = 30; x < 512; x += 26) { const h = 4 + x * 0.3; s.beginPath(); s.moveTo(x, CY - h); s.lineTo(x, CY + h); s.stroke(); } // 세로 주사선
    s.font = 'bold 14px monospace'; s.textAlign = 'center'; s.textBaseline = 'middle'; s.fillStyle = W;
    for (let i = 0; i < 70; i++) { const x = R(40, 500), h = 4 + x * 0.3, y = CY + R(-h, h); s.globalAlpha = R(0.3, 0.9) * (1 - x / 640); s.fillText(rnd() < 0.5 ? '0' : '1', x, y); }
    s.restore();
    s.globalAlpha = 1; s.strokeStyle = W; s.lineWidth = 2.5;                                        // 부채꼴 테두리
    s.beginPath(); s.moveTo(0, CY - 4); s.lineTo(512, 2); s.moveTo(0, CY + 4); s.lineTo(512, 158); s.stroke();
    s.lineWidth = 2; s.globalAlpha = 0.8; s.beginPath(); s.moveTo(0, CY); s.lineTo(512, CY); s.stroke(); // 가운데 조준선
    const scan = bakeGlow(sc, [[4, 0.6]]);

    // ---------- 데이터 큐브: 바깥 네모 + 기울어진 안쪽 네모 + 회로 선 + 마디 ----------
    const cb = mk(128, 128), c = cb.getContext('2d'); const C = 64;
    c.strokeStyle = W; c.fillStyle = W; c.lineJoin = 'round';
    c.lineWidth = 4; c.strokeRect(10, 10, 108, 108);
    c.lineWidth = 2.5; c.save(); c.translate(C, C); c.rotate(Math.PI / 4); c.strokeRect(-34, -34, 68, 68); c.restore();
    c.lineWidth = 2; c.globalAlpha = 0.8;
    for (const [x0, y0, x1, y1, x2, y2] of [[10, 40, 34, 40, 44, 50], [118, 88, 94, 88, 84, 78], [40, 10, 40, 30, 52, 42], [88, 118, 88, 98, 76, 86]]) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.beginPath(); c.arc(x2, y2, 3, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1; c.fillRect(C - 9, C - 9, 18, 18);                                            // 가운데 핵
    for (const [x, y] of [[10, 10], [118, 10], [10, 118], [118, 118]]) c.fillRect(x - 5, y - 5, 10, 10); // 모서리 마디
    const cube = bakeGlow(cb, [[5, 0.7], [2, 0.5]]);

    // ---------- 텔레포트 포털: 모서리 괄호 + 가로 주사선 ----------
    const pt = mk(128, 128), q = pt.getContext('2d');
    q.strokeStyle = W; q.lineCap = 'square'; q.lineWidth = 6;
    for (const [x, y, dx, dy] of [[12, 12, 1, 1], [116, 12, -1, 1], [12, 116, 1, -1], [116, 116, -1, -1]]) { q.beginPath(); q.moveTo(x + dx * 30, y); q.lineTo(x, y); q.lineTo(x, y + dy * 30); q.stroke(); }
    q.lineWidth = 2;
    for (let y = 28; y <= 100; y += 8) { q.globalAlpha = 0.25 + 0.5 * rnd(); const x0 = R(24, 50), x1 = R(78, 104); q.beginPath(); q.moveTo(x0, y); q.lineTo(x1, y); q.stroke(); }
    const portal = bakeGlow(pt, [[5, 0.7], [2, 0.5]]);

    // ---------- 궁극기 파동 고리: 두꺼운 고리 + 회로 가지 + 마디 ----------
    const rg = mk(512, 512), r = rg.getContext('2d'); const RC = 256;
    r.strokeStyle = W; r.fillStyle = W; r.lineCap = 'round';
    r.lineWidth = 6; r.beginPath(); r.arc(RC, RC, 244, 0, Math.PI * 2); r.stroke();
    r.lineWidth = 2; r.globalAlpha = 0.6; r.beginPath(); r.arc(RC, RC, 226, 0, Math.PI * 2); r.stroke();
    r.globalAlpha = 0.85; r.lineWidth = 2.5;
    for (let i = 0; i < 24; i++) {                                                                     // 안쪽으로 꺾여 들어가는 회로
      const a = i / 24 * Math.PI * 2 + R(-0.05, 0.05), d1 = R(196, 214), turn = (rnd() < 0.5 ? -1 : 1) * R(0.04, 0.09);
      const p0 = [RC + Math.cos(a) * 226, RC + Math.sin(a) * 226], p1 = [RC + Math.cos(a) * d1, RC + Math.sin(a) * d1], p2 = [RC + Math.cos(a + turn) * (d1 - 16), RC + Math.sin(a + turn) * (d1 - 16)];
      r.beginPath(); r.moveTo(...p0); r.lineTo(...p1); r.lineTo(...p2); r.stroke();
      r.beginPath(); r.arc(p2[0], p2[1], 3.5, 0, Math.PI * 2); r.fill();
    }
    r.globalAlpha = 1;
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; r.fillRect(RC + Math.cos(a) * 244 - 3, RC + Math.sin(a) * 244 - 3, 6, 6); } // 고리 위 마디
    const ring = bakeGlow(rg, [[8, 0.7], [3, 0.5]]);

    const tint = (img, col) => { const t = mk(img.width, img.height), x = t.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, t.width, t.height); return t; };
    const show = (x, img, dx, dy, w, h) => { x.drawImage(tint(img, '#5cff8a'), dx, dy, w, h); x.globalAlpha = 0.5; x.drawImage(img, dx, dy, w, h); x.globalAlpha = 1; };
    const pv = mk(700, 270), pc = pv.getContext('2d');
    pc.fillStyle = '#141419'; pc.fillRect(0, 0, 700, 270); pc.globalCompositeOperation = 'lighter';
    show(pc, scan, 10, 20, 256, 80); show(pc, cube, 290, 20, 64, 64); show(pc, portal, 370, 20, 64, 64); show(pc, ring, 450, 10, 240, 240);
    return { scan: scan.toDataURL(), cube: cube.toDataURL(), portal: portal.toDataURL(), ring: ring.toDataURL(), pv: pv.toDataURL() };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('hk_scan.png', res.scan); save('hk_cube.png', res.cube); save('hk_portal.png', res.portal); save('hk_ring.png', res.ring); save('preview_hacker.png', res.pv);
  await b.close();
})();
