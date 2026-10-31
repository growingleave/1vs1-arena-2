// 무투가 기(氣) 주먹·발 그림 생성: 반투명 연주황, 앞(주먹 마디 / 발바닥)이 오른쪽
// 결과 (게임용 1/2 크기, 'lighter'로 그림) → web/assets/에 복사
//   fighter_fist.png 110x100 (손등 쪽에서 본 주먹), 내용 영역 x 3~101 y 10~84
//   fighter_kick.png 110x100, 내용 영역 x 6~100 y 10~90 (다리가 왼쪽, 발바닥이 오른쪽) — 지금 게임에선 안 씀
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

    // 주먹을 손등 쪽에서 본 모양 (손목이 왼쪽, 주먹 마디가 오른쪽)
    // 손목 → 넓은 손등 → 앞쪽에 세로로 늘어선 주먹 마디 4개 → 그 앞에 접힌 손가락 마디, 위쪽에 엄지
    const shapes = [];
    shapes.push(() => rr(10, 70, 64, 60, 16));                   // 손목
    shapes.push(() => { c.beginPath(); c.moveTo(62, 62); c.lineTo(160, 36); c.quadraticCurveTo(178, 100, 160, 164); c.lineTo(62, 138); c.closePath(); }); // 손등 (앞으로 넓어짐)
    for (let i = 0; i < 4; i++) shapes.push(() => rr(164, 40 + i * 30, 34, 28, 12)); // 접힌 손가락 마디 4개
    shapes.push(() => rr(84, 24, 64, 24, 12));                    // 엄지 (위쪽)
    c.fillStyle = 'rgba(255,255,255,0.28)';
    for (const sh of shapes) { sh(); c.fill(); }
    c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 4;
    for (const sh of shapes) { sh(); c.stroke(); }
    // 주먹 마디 (뼈 튀어나온 곳) 반짝임
    for (let i = 0; i < 4; i++) {
      const y = 54 + i * 30;
      const g = c.createRadialGradient(162, y, 0, 162, y, 15);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(162, y, 15, 0, Math.PI * 2); c.fill();
    }
    // 손등 힘줄: 손목에서 각 마디로 퍼지는 선
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 2;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(72, 92 + i * 6); c.quadraticCurveTo(110, 90 + i * 8, 150, 54 + i * 30); c.stroke(); }

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
