// 보급 상자 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
//   supply_crate.png 96x96 : 나무 상자 (금속 모서리 + 가운데 십자 띠 + 별 표시) — 보통
//   supply_chute.png 120x84 : 낙하산 (아래 가운데 (60,84)에 줄이 모임) — 보통
// 실행: node tools/supply_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const half = (src) => { const s = mk(src.width / 2, src.height / 2), x = s.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, s.width, s.height); return s; };
    const OUTL = '#120a04';

    // ---------- 상자 ----------
    const c = mk(192, 192), g = c.getContext('2d'); g.lineJoin = 'round';
    const S = 20, E = 172; // 상자 범위
    // 몸통 나무
    const wood = g.createLinearGradient(0, S, 0, E); wood.addColorStop(0, '#d79a52'); wood.addColorStop(1, '#8a5424');
    g.fillStyle = wood; g.strokeStyle = OUTL; g.lineWidth = 8;
    g.beginPath(); g.roundRect(S, S, E - S, E - S, 14); g.fill(); g.stroke();
    // 나뭇결 판자
    g.strokeStyle = 'rgba(70,36,10,0.55)'; g.lineWidth = 3;
    for (const y of [58, 96, 134]) { g.beginPath(); g.moveTo(S + 6, y); g.lineTo(E - 6, y); g.stroke(); }
    g.strokeStyle = 'rgba(255,220,160,0.35)'; g.lineWidth = 2;
    for (const y of [61, 99, 137]) { g.beginPath(); g.moveTo(S + 8, y); g.lineTo(E - 8, y); g.stroke(); }
    // 대각선 버팀목
    g.strokeStyle = OUTL; g.lineWidth = 6; g.fillStyle = '#b07038';
    const brace = (x0, y0, x1, y1) => { g.save(); g.lineCap = 'round'; g.lineWidth = 22; g.strokeStyle = OUTL; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.lineWidth = 14; g.strokeStyle = '#c4843f'; g.stroke(); g.restore(); };
    brace(S + 22, S + 22, E - 22, E - 22);
    // 금속 모서리
    g.fillStyle = '#9aa3ad'; g.strokeStyle = OUTL; g.lineWidth = 5;
    for (const [x, y] of [[S, S], [E - 34, S], [S, E - 34], [E - 34, E - 34]]) { g.beginPath(); g.roundRect(x, y, 34, 34, 7); g.fill(); g.stroke(); g.fillStyle = '#e6ebf0'; g.beginPath(); g.arc(x + 17, y + 17, 4, 0, Math.PI * 2); g.fill(); g.fillStyle = '#9aa3ad'; }
    // 가운데 별 표시 판
    g.fillStyle = '#f2e6c8'; g.strokeStyle = OUTL; g.lineWidth = 5; g.beginPath(); g.arc(96, 96, 30, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#e8b020'; g.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 22, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(96 + Math.cos(a) * r, 96 + Math.sin(a) * r); }
    g.closePath(); g.fill(); g.lineWidth = 3; g.stroke();

    // ---------- 낙하산 ----------
    const ch = mk(240, 168), q = ch.getContext('2d'); q.lineJoin = 'round';
    // 줄
    q.strokeStyle = '#eeeeee'; q.lineWidth = 3;
    for (const x of [22, 70, 170, 218]) { q.beginPath(); q.moveTo(x, 70); q.lineTo(120, 166); q.stroke(); }
    // 천 (빨강·흰 줄무늬 돔)
    q.save(); q.beginPath(); q.moveTo(12, 74); q.bezierCurveTo(12, -8, 228, -8, 228, 74);
    for (let i = 4; i >= 0; i--) { const x0 = 12 + i * 43.2; q.quadraticCurveTo(x0 + 21.6, 58, x0, 74); }
    q.closePath(); q.clip();
    for (let i = 0; i < 5; i++) { q.fillStyle = i % 2 ? '#f4f4f4' : '#e0412f'; q.fillRect(12 + i * 43.2, 0, 43.2, 90); }
    q.fillStyle = 'rgba(0,0,0,0.18)'; q.fillRect(0, 50, 240, 40);
    q.restore();
    q.strokeStyle = OUTL; q.lineWidth = 6; q.beginPath(); q.moveTo(12, 74); q.bezierCurveTo(12, -8, 228, -8, 228, 74);
    for (let i = 4; i >= 0; i--) { const x0 = 12 + i * 43.2; q.quadraticCurveTo(x0 + 21.6, 58, x0, 74); }
    q.closePath(); q.stroke();

    const pv = mk(260, 120), px = pv.getContext('2d'); px.fillStyle = '#2a2a35'; px.fillRect(0, 0, 260, 120);
    const ch2 = half(ch), c2 = half(c);
    px.drawImage(ch2, 10, 4); px.drawImage(c2, 150, 10);
    return { crate: c2.toDataURL(), chute: ch2.toDataURL(), pv: pv.toDataURL() };
  });
  const save = (n, u) => fs.writeFileSync(path.join(OUT, n), Buffer.from(u.split(',')[1], 'base64'));
  save('supply_crate.png', res.crate); save('supply_chute.png', res.chute); save('preview_supply.png', res.pv);
  await b.close();
})();
