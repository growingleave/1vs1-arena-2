// 무투가 기(氣) 주먹·발 그림 생성: 반투명 연주황, 앞(주먹 마디 / 발바닥)이 오른쪽
// 결과 (게임용 1/2 크기, 'lighter'로 그림) → web/assets/에 복사
//   fighter_fist.png 110x100, 주먹 가운데 x 60 y 50, 내용 영역 x 9~95 y 23~79
//   fighter_kick.png 110x100, 내용 영역 x 6~100 y 10~90 (다리가 왼쪽, 발바닥이 오른쪽)
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

    // 발차기: 다리(정강이) + 발등 + 발바닥(앞) + 발가락 (위에서 본 앞차기)
    const kickW = mk(W, H), k = kickW.getContext('2d');
    const kr = (x, y, w, h, r) => { k.beginPath(); k.roundRect(x, y, w, h, r); };
    const kshapes = [
      () => { k.beginPath(); k.moveTo(12, 72); k.lineTo(120, 58); k.lineTo(120, 142); k.lineTo(12, 128); k.closePath(); }, // 정강이 (앞으로 굵어짐)
      () => kr(110, 40, 64, 120, 30),   // 발등
      () => kr(160, 24, 40, 152, 20),   // 발바닥 (앞)
    ];
    k.fillStyle = 'rgba(255,255,255,0.28)';
    for (const sh of kshapes) { sh(); k.fill(); }
    k.strokeStyle = 'rgba(255,255,255,0.95)'; k.lineWidth = 4;
    for (const sh of kshapes) { sh(); k.stroke(); }
    for (let i = 0; i < 5; i++) { // 발가락 (발바닥 위쪽 끝)
      k.beginPath(); k.arc(196, 34 + i * 12, 6 - i * 0.5, 0, Math.PI * 2); k.fillStyle = 'rgba(255,255,255,0.5)'; k.fill();
    }
    const kg = k.createRadialGradient(185, 100, 0, 185, 100, 60);
    kg.addColorStop(0, 'rgba(255,255,255,0.8)'); kg.addColorStop(1, 'rgba(255,255,255,0)');
    k.fillStyle = kg; k.beginPath(); k.arc(185, 100, 60, 0, Math.PI * 2); k.fill();

    const bake = (src) => {
      // 색 입히기 + 빛 번짐 → 1/2 크기, 검은 배경 → 투명
      const t = mk(W, H), tx = t.getContext('2d');
      tx.drawImage(src, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = '#ffb070'; tx.fillRect(0, 0, W, H);
      const o = mk(W, H), x = o.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'lighter';
      for (const [blur, a] of [[14, 0.9], [5, 0.8]]) { x.filter = `blur(${blur}px)`; x.globalAlpha = a; x.drawImage(t, 0, 0); }
      x.filter = 'none'; x.globalAlpha = 1; x.drawImage(t, 0, 0);
      x.globalAlpha = 0.5; x.drawImage(src, 0, 0);
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
    };
    const fist = bake(white), kick = bake(kickW);
    return { game: fist.game, preview: fist.preview, kick: kick.game, kickPreview: kick.preview };
  });
  fs.writeFileSync(`${OUT}/fighter_fist.png`, Buffer.from(res.game.split(',')[1], 'base64'));
  fs.writeFileSync(`${OUT}/preview_fist.png`, Buffer.from(res.preview.split(',')[1], 'base64'));
  fs.writeFileSync(`${OUT}/fighter_kick.png`, Buffer.from(res.kick.split(',')[1], 'base64'));
  fs.writeFileSync(`${OUT}/preview_kick.png`, Buffer.from(res.kickPreview.split(',')[1], 'base64'));
  await b.close();
})();
