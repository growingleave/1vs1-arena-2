// 샌즈 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
//   sans_bone.png       48x14  : 평타 뼈다귀 (가운데 = 그림 가운데, 가로로 김) — 보통
//   (해골 블래스터 그림 sans_blaster_idle/fire.png는 사용자가 준 그림을 누끼 딴 것이라 여기서 만들지 않음)
//   sans_beam.png       128x64 : 빔 몸통 (가로로 늘려 씀, 가운데 y 32, 위아래로 번짐) — 흰 빛, 색 입혀 'lighter'
//   preview_sans.png (확인용)
// 실행: node tools/sans_gen.js <저장할 폴더>  (Playwright 필요)
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
    const boneFill = (c, y0, y1) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#e4e6ec'); g.addColorStop(1, '#a9adb8'); return g; };
    const OUTLINE = '#23242c';

    // ---------- 뼈다귀 ----------
    const bn = mk(96, 28), n = bn.getContext('2d');
    n.fillStyle = boneFill(n, 2, 26); n.strokeStyle = OUTLINE; n.lineWidth = 2.5;
    n.beginPath();
    n.arc(12, 8, 7, Math.PI * 0.5, Math.PI * 1.9); n.arc(12, 20, 7, Math.PI * 0.1, Math.PI * 1.5);   // 왼쪽 끝 혹 두 개 (외곽선 하나로)
    n.closePath(); n.fill(); n.stroke();
    n.beginPath(); n.arc(84, 8, 7, Math.PI * 1.1, Math.PI * 0.5); n.arc(84, 20, 7, Math.PI * 1.5, Math.PI * 0.9); n.closePath(); n.fill(); n.stroke();
    n.beginPath(); n.rect(14, 9, 68, 10); n.fill(); n.beginPath(); n.moveTo(14, 9); n.lineTo(82, 9); n.moveTo(14, 19); n.lineTo(82, 19); n.stroke();
    const bone = half(bn);

    // ---------- 빔 몸통 ----------
    const bm = mk(256, 128), m = bm.getContext('2d');
    const vg = m.createLinearGradient(0, 0, 0, 128);
    vg.addColorStop(0, 'rgba(255,255,255,0)'); vg.addColorStop(0.18, 'rgba(255,255,255,0.35)'); vg.addColorStop(0.32, 'rgba(255,255,255,0.85)');
    vg.addColorStop(0.5, 'rgba(255,255,255,1)'); vg.addColorStop(0.68, 'rgba(255,255,255,0.85)'); vg.addColorStop(0.82, 'rgba(255,255,255,0.35)'); vg.addColorStop(1, 'rgba(255,255,255,0)');
    m.fillStyle = vg; m.fillRect(0, 0, 256, 128);
    m.strokeStyle = 'rgba(255,255,255,0.5)'; m.lineWidth = 2;   // 결 (가로 줄무늬)
    for (const y of [30, 44, 84, 98]) { m.beginPath(); m.moveTo(0, y); m.lineTo(256, y); m.stroke(); }
    const beam = bakeGlow(bm, [[4, 0.5]]);

    const pv = mk(560, 220), pc = pv.getContext('2d');
    pc.fillStyle = '#1e2240'; pc.fillRect(0, 0, 560, 220);
    pc.drawImage(bone, 10, 20, 96, 28);
    
    return { bone: bone.toDataURL(), beam: beam.toDataURL(), pv: pv.toDataURL() };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('sans_bone.png', res.bone); save('sans_beam.png', res.beam); save('preview_sans.png', res.pv);
  await b.close();
})();
