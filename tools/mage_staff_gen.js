// 마법사 지팡이(방향 표시) 그림 생성
// 오른쪽을 바라보는 기준, 보석(머리)이 오른쪽. 게임에선 보석 가운데가 방향 표시 위치에 온다.
// 결과: mage_staff.png (게임용 1/2 크기 210x80, 보석 가운데 x 172.5, y 40) → web/assets/에 복사
//       preview_staff_*.png (확인용)
// 실행: node tools/mage_staff_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || __dirname;
const SPRITE = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '../web/assets/mage.png')).toString('base64');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(async (spriteSrc) => {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const W = 420, H = 160, CY = 80, GX = 345; // 보석 가운데
    const staff = mk(W, H), c = staff.getContext('2d');

    // 1) 손잡이: 짙은 나무, 뒤로 갈수록 살짝 가늘게 + 위쪽 밝은 결
    const S0 = 180; // 손잡이 뒤끝 (게임에서 얼굴을 가리지 않게 짧게)
    const shaftTop = (x) => CY - (6 + 2 * (x - S0) / (300 - S0));
    const shaftBot = (x) => CY + (6 + 2 * (x - S0) / (300 - S0));
    c.beginPath();
    c.moveTo(S0, shaftTop(S0)); c.lineTo(300, shaftTop(300)); c.lineTo(300, shaftBot(300)); c.lineTo(S0, shaftBot(S0));
    c.arc(S0, CY, 6, Math.PI / 2, Math.PI * 1.5);
    c.closePath();
    const wood = c.createLinearGradient(0, CY - 8, 0, CY + 8);
    wood.addColorStop(0, '#8a5a34'); wood.addColorStop(0.35, '#5a3620'); wood.addColorStop(1, '#2a170c');
    c.fillStyle = wood; c.fill();
    c.strokeStyle = 'rgba(255,220,180,0.35)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(S0 + 6, CY - 3.5); c.lineTo(296, CY - 5.5); c.stroke();

    // 2) 금 고리 2개 + 고리 사이 보라 룬 점
    const ring = (x, w) => {
      const g = c.createLinearGradient(0, CY - 10, 0, CY + 10);
      g.addColorStop(0, '#fff0a8'); g.addColorStop(0.5, '#d4a52a'); g.addColorStop(1, '#7a5410');
      c.fillStyle = g; c.fillRect(x - w / 2, CY - 9, w, 18);
      c.strokeStyle = 'rgba(60,35,5,0.6)'; c.lineWidth = 1; c.strokeRect(x - w / 2, CY - 9, w, 18);
    };
    ring(205, 10); ring(292, 16);
    for (const x of [235, 255, 275]) {
      const g = c.createRadialGradient(x, CY, 0, x, CY, 6);
      g.addColorStop(0, 'rgba(230,190,255,1)'); g.addColorStop(1, 'rgba(180,120,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, CY, 6, 0, Math.PI * 2); c.fill();
    }

    // 3) 보석을 감싸는 금 갈고리 두 개 (위·아래에서 앞으로 휘어 감싼다)
    for (const s of [-1, 1]) {
      const g = c.createLinearGradient(290, CY, 380, CY + s * 40);
      g.addColorStop(0, '#d4a52a'); g.addColorStop(0.5, '#fff0a8'); g.addColorStop(1, '#a87818');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(296, CY + s * 4);
      c.bezierCurveTo(305, CY + s * 46, 360, CY + s * 52, 382, CY + s * 18);
      c.bezierCurveTo(362, CY + s * 38, 318, CY + s * 34, 306, CY + s * 4);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(80,50,5,0.55)'; c.lineWidth = 1.2; c.stroke();
    }

    // 4) 보석 빛 번짐 (뒤에 깔기)
    const glow = mk(W, H), gc = glow.getContext('2d');
    const gg = gc.createRadialGradient(GX, CY, 0, GX, CY, 70);
    gg.addColorStop(0, 'rgba(160,230,255,0.9)'); gg.addColorStop(0.4, 'rgba(180,120,255,0.45)'); gg.addColorStop(1, 'rgba(180,120,255,0)');
    gc.fillStyle = gg; gc.fillRect(0, 0, W, H);

    // 5) 보석: 가로로 긴 마름모, 하늘색→보라 + 면 나눔 + 흰 반짝임
    const gem = [[GX + 30, CY], [GX, CY - 22], [GX - 26, CY], [GX, CY + 22]];
    const gemGrad = c.createLinearGradient(GX - 26, CY - 22, GX + 30, CY + 22);
    gemGrad.addColorStop(0, '#d9f6ff'); gemGrad.addColorStop(0.4, '#64dcff'); gemGrad.addColorStop(1, '#8a4dff');
    c.fillStyle = gemGrad; c.beginPath(); gem.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)'; // 위쪽 면
    c.beginPath(); c.moveTo(GX - 26, CY); c.lineTo(GX, CY - 22); c.lineTo(GX + 8, CY); c.closePath(); c.fill();
    c.fillStyle = 'rgba(60,20,140,0.35)';   // 아래쪽 면
    c.beginPath(); c.moveTo(GX - 26, CY); c.lineTo(GX + 8, CY); c.lineTo(GX, CY + 22); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.5;
    c.beginPath(); gem.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.stroke();
    // 반짝임 (네 꼭지 별)
    const star = (x, y, r, a) => {
      c.fillStyle = `rgba(255,255,255,${a})`; c.beginPath();
      for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4, rr = k % 2 === 0 ? r : r * 0.22; c.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); }
      c.closePath(); c.fill();
    };
    star(GX - 6, CY - 9, 9, 1);
    for (const [x, y, r] of [[GX + 44, CY - 34, 6], [GX + 18, CY + 40, 4], [GX - 30, CY - 42, 5], [GX + 52, CY + 20, 3]]) star(x, y, r, 0.85);

    // 합치기: 빛 번짐 위에 지팡이
    const out = mk(W, H), o = out.getContext('2d');
    o.drawImage(glow, 0, 0); o.drawImage(staff, 0, 0);

    // ---------- 미리보기 ----------
    const sprite = new Image(); sprite.src = spriteSrc; await sprite.decode();
    const oldStaff = (ctx) => {
      ctx.strokeStyle = '#784623'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-26, 0); ctx.stroke();
      ctx.fillStyle = '#784623'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#aa2dbe'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    };
    const K = 0.17; // 원본 → 게임 배율 (보석 폭 ~10px, 손잡이 ~28px)
    const newStaff = (ctx) => ctx.drawImage(out, -GX * K, -CY * K, W * K, H * K);
    // 게임 크기 장면: 마법사(44px)와 방향 3개, 위 줄 지금 / 아래 줄 새 그림
    const game = mk(330, 170), g = game.getContext('2d');
    g.fillStyle = '#1e1e24'; g.fillRect(0, 0, 330, 170);
    const dirs = [[1, 0], [0, -1], [0.7071, 0.7071]];
    [[oldStaff, 45], [newStaff, 125]].forEach(([fn, cy]) => {
      dirs.forEach(([fx, fy], i) => {
        const cx = 55 + i * 110;
        g.drawImage(sprite, cx - 22, cy - 22, 44, 44);
        const maxComp = Math.max(Math.abs(fx), Math.abs(fy)), dist = 20 / maxComp + 8;
        g.save(); g.translate(cx + fx * dist, cy + fy * dist); g.rotate(Math.atan2(fy, fx)); fn(g); g.restore();
      });
    });
    g.fillStyle = '#ffe14d'; g.font = '10px sans-serif'; g.fillText('지금', 4, 12); g.fillText('새 그림', 4, 92);
    const game4 = mk(1320, 680), g4 = game4.getContext('2d');
    g4.imageSmoothingEnabled = false; g4.drawImage(game, 0, 0, 1320, 680);
    // 원본 크게
    const big = mk(W * 2, H * 2), bg = big.getContext('2d');
    bg.fillStyle = '#1e1e24'; bg.fillRect(0, 0, W * 2, H * 2); bg.drawImage(out, 0, 0, W * 2, H * 2);
    const half = mk(W / 2, H / 2), hc = half.getContext('2d');
    hc.imageSmoothingQuality = 'high'; hc.drawImage(out, 0, 0, W / 2, H / 2);
    return { staff: half.toDataURL('image/png'), big: big.toDataURL('image/png'), game: game4.toDataURL('image/png') };
  }, SPRITE);
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('mage_staff.png', res.staff); save('preview_staff_big.png', res.big); save('preview_staff_game.png', res.game);
  await b.close();
})();
