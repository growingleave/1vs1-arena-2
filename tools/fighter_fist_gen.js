// 무투가 기(氣) 주먹 그림 생성: 반투명 연주황 주먹, 주먹 마디(앞)가 오른쪽
// 결과: fighter_fist.png (게임용 1/2 크기 110x100, 주먹 가운데 x 60 y 50, 'lighter'로 그림) → web/assets/에 복사
//       preview_fist.png (확인용)
// 실행: node tools/fighter_fist_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const W = 220, H = 200;
    const white = mk(W, H), c = white.getContext('2d');
    const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };

    // 주먹 모양 (흰색 선 + 반투명 면). 면은 옅게, 윤곽은 밝게 → 기로 만든 주먹
    const shapes = [];
    shapes.push(() => rr(18, 68, 60, 64, 18));      // 손목
    shapes.push(() => rr(58, 46, 92, 108, 26));     // 손등
    for (let i = 0; i < 4; i++) shapes.push(() => rr(128, 48 + i * 26, 58, 26, 12)); // 접은 손가락 4개
    shapes.push(() => rr(92, 128, 76, 30, 14));     // 엄지
    c.fillStyle = 'rgba(255,255,255,0.28)';
    for (const s of shapes) { s(); c.fill(); }
    c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 4;
    for (const s of shapes) { s(); c.stroke(); }
    // 주먹 마디 반짝임
    for (let i = 0; i < 4; i++) {
      const g = c.createRadialGradient(182, 61 + i * 26, 0, 182, 61 + i * 26, 14);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(182, 61 + i * 26, 14, 0, Math.PI * 2); c.fill();
    }
    // 손등 힘줄 선
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 2;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(78, 78 + i * 22); c.quadraticCurveTo(105, 74 + i * 24, 128, 74 + i * 26); c.stroke(); }

    // 색 입히기 + 빛 번짐 → 1/2 크기, 검은 배경 → 투명
    const t = mk(W, H), tx = t.getContext('2d');
    tx.drawImage(white, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = '#ffb070'; tx.fillRect(0, 0, W, H);
    const o = mk(W, H), x = o.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'lighter';
    for (const [blur, a] of [[14, 0.9], [5, 0.8]]) { x.filter = `blur(${blur}px)`; x.globalAlpha = a; x.drawImage(t, 0, 0); }
    x.filter = 'none'; x.globalAlpha = 1; x.drawImage(t, 0, 0);
    x.globalAlpha = 0.5; x.drawImage(white, 0, 0);
    const preview = mk(W, H); preview.getContext('2d').drawImage(o, 0, 0);
    const small = mk(W / 2, H / 2), sx = small.getContext('2d');
    sx.imageSmoothingQuality = 'high'; sx.drawImage(o, 0, 0, W / 2, H / 2);
    const d = sx.getImageData(0, 0, small.width, small.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const m = Math.max(px[i], px[i + 1], px[i + 2]);
      if (m === 0) { px[i + 3] = 0; continue; }
      px[i] = px[i] * 255 / m; px[i + 1] = px[i + 1] * 255 / m; px[i + 2] = px[i + 2] * 255 / m; px[i + 3] = m;
    }
    sx.putImageData(d, 0, 0);
    return { game: small.toDataURL('image/png'), preview: preview.toDataURL('image/png') };
  });
  fs.writeFileSync(`${OUT}/fighter_fist.png`, Buffer.from(res.game.split(',')[1], 'base64'));
  fs.writeFileSync(`${OUT}/preview_fist.png`, Buffer.from(res.preview.split(',')[1], 'base64'));
  await b.close();
})();
