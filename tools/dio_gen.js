// DIO 이펙트 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
//   dio_fist.png  64x40 : 앞으로 뻗는 주먹 빛 (오른쪽을 향함, 주먹 끝 x 60, 가운데 y 20, 뒤로 속도선) — 흰 빛, 금색 입혀 'lighter'
//   dio_knife.png 48x16 : 던지는 칼 (오른쪽을 향함, 칼끝 x 47, 가운데 y 8, 은빛 날 + 금색 손잡이) — 보통
//   preview_dio.png (확인용)
// 시간 정지 시계·경고 고리·폭발은 가속자·폭파광 그림을 함께 쓴다
// 실행: node tools/dio_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const half = (src) => { const s = mk(src.width / 2, src.height / 2), x = s.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, s.width, s.height); return s; };
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

    // ---------- 주먹 빛: 둥근 주먹 덩어리 + 손가락 마디 홈 + 뒤로 흐르는 속도선 ----------
    const f = mk(128, 80), g = f.getContext('2d'); const Y = 40;
    g.lineCap = 'round';
    for (const [dy, x0, a, w] of [[-14, 6, 0.5, 3], [0, 0, 0.8, 4], [14, 10, 0.5, 3], [-24, 30, 0.3, 2], [24, 26, 0.3, 2]]) {
      const lg = g.createLinearGradient(x0, 0, 84, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, `rgba(255,255,255,${a})`);
      g.strokeStyle = lg; g.lineWidth = w; g.beginPath(); g.moveTo(x0, Y + dy); g.lineTo(84, Y + dy * 0.7); g.stroke();
    }
    g.fillStyle = W; g.beginPath(); g.roundRect(72, Y - 22, 48, 44, 16); g.fill();                      // 주먹
    g.fillStyle = 'rgba(0,0,0,1)'; g.globalCompositeOperation = 'destination-out'; g.lineWidth = 3; g.strokeStyle = '#000';
    for (const y of [Y - 11, Y, Y + 11]) { g.beginPath(); g.moveTo(104, y); g.lineTo(118, y); g.stroke(); } // 손가락 마디 홈
    g.globalCompositeOperation = 'source-over';
    const fist = bakeGlow(f, [[5, 0.7], [2, 0.5]]);

    // ---------- 칼 ----------
    const k = mk(96, 32), n = k.getContext('2d'); const KY = 16;
    n.lineJoin = 'round';
    const blade = n.createLinearGradient(0, KY - 6, 0, KY + 6); blade.addColorStop(0, '#ffffff'); blade.addColorStop(0.5, '#b9c0cc'); blade.addColorStop(1, '#6f7682');
    n.fillStyle = blade; n.strokeStyle = '#1c1e24'; n.lineWidth = 2.5;
    n.beginPath(); n.moveTo(40, KY - 6); n.lineTo(78, KY - 6); n.lineTo(94, KY); n.lineTo(78, KY + 6); n.lineTo(40, KY + 6); n.closePath(); n.fill(); n.stroke();
    n.strokeStyle = 'rgba(255,255,255,0.9)'; n.lineWidth = 1.5; n.beginPath(); n.moveTo(44, KY - 2); n.lineTo(88, KY); n.stroke();
    n.fillStyle = '#e8b830'; n.strokeStyle = '#1c1e24'; n.lineWidth = 2.5; n.beginPath(); n.roundRect(34, KY - 11, 7, 22, 2); n.fill(); n.stroke(); // 날밑
    const hg = n.createLinearGradient(0, KY - 5, 0, KY + 5); hg.addColorStop(0, '#ffe07a'); hg.addColorStop(1, '#9a6a10');
    n.fillStyle = hg; n.beginPath(); n.roundRect(8, KY - 5, 27, 10, 4); n.fill(); n.stroke();
    n.fillStyle = '#e0283a'; n.beginPath(); n.arc(8, KY, 4, 0, Math.PI * 2); n.fill(); n.stroke();
    const knife = half(k);

    const pv = mk(300, 100), pc = pv.getContext('2d'); pc.fillStyle = '#141419'; pc.fillRect(0, 0, 300, 100);
    const t = mk(fist.width, fist.height), tx = t.getContext('2d'); tx.drawImage(fist, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = '#ffd84a'; tx.fillRect(0, 0, t.width, t.height);
    pc.globalCompositeOperation = 'lighter'; pc.drawImage(t, 10, 10, 128, 80); pc.globalAlpha = 0.5; pc.drawImage(fist, 10, 10, 128, 80);
    pc.globalCompositeOperation = 'source-over'; pc.globalAlpha = 1; pc.drawImage(knife, 160, 34, 120, 40);
    return { fist: fist.toDataURL(), knife: knife.toDataURL(), pv: pv.toDataURL() };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('dio_fist.png', res.fist); save('dio_knife.png', res.knife); save('preview_dio.png', res.pv);
  await b.close();
})();
