// 데몰리셔니스트(폭파광) 이펙트 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
//   dmx_blast.png 250x250: 폭발 글로우 (흰 빛, 가운데 = 그림 가운데) — 색을 입혀 'lighter'로 그림
//   dmx_shock.png 280x150: 충격파 글로우 (흰 빛, 뒤쪽 기준점 x=20, 가운데 y=75, 오른쪽으로 뻗음) — 색을 입혀 'lighter'로 그림
//   dmx_dust.png  150x150: 먼지바람 (옅은 회갈색, 가운데 = 그림 가운데) — 보통(source-over)으로 그림
//   preview_dmx.png (확인용)
// 실행: node tools/demolitionist_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    let seed = 9001;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const R = (a, b) => a + (b - a) * rnd();
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

    // 빛나는 그림: 검은 배경 + 빛 번짐 → 1/2, 밝기 = 불투명도 (색 유지, 흰색으로 그리면 나중에 색 입히기 좋음)
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
    // 부드러운 반투명 그림 (밝기=불투명도 변환 없이, 블러만 먹여서 1/2로): 먼지처럼 톤이 있는 그림용
    const bakeSoft = (src, blur) => {
      const o = mk(src.width, src.height), ox = o.getContext('2d');
      ox.filter = `blur(${blur}px)`; ox.drawImage(src, 0, 0); ox.filter = 'none';
      const s = mk(src.width / 2, src.height / 2), sx = s.getContext('2d'); sx.imageSmoothingQuality = 'high'; sx.drawImage(o, 0, 0, s.width, s.height);
      return s;
    };

    // ---------- 폭발 글로우 (흰색 — 색은 vfxTinted로 입힌다) ----------
    const bl = mk(500, 500), bx = bl.getContext('2d'); const BC = 250;
    bx.globalCompositeOperation = 'lighter';
    const g0 = bx.createRadialGradient(BC, BC, 0, BC, BC, 95);
    g0.addColorStop(0, 'rgba(255,255,255,1)'); g0.addColorStop(0.5, 'rgba(255,255,255,0.6)'); g0.addColorStop(1, 'rgba(255,255,255,0)');
    bx.fillStyle = g0; bx.beginPath(); bx.arc(BC, BC, 95, 0, Math.PI * 2); bx.fill();
    const spike = (ang, len, w, a) => { bx.save(); bx.translate(BC, BC); bx.rotate(ang); const g = bx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.5, `rgba(255,255,255,${a * 0.5})`); g.addColorStop(1, 'rgba(255,255,255,0)'); bx.fillStyle = g; bx.beginPath(); bx.moveTo(0, -w); bx.lineTo(len, 0); bx.lineTo(0, w); bx.closePath(); bx.fill(); bx.restore(); };
    const N = 14;
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2 + R(-0.12, 0.12); spike(a, R(170, 220), R(14, 26), R(0.7, 1)); }
    bx.globalAlpha = 0.8; bx.lineWidth = 4; bx.strokeStyle = '#fff'; bx.beginPath(); bx.arc(BC, BC, 150, 0, Math.PI * 2); bx.stroke();
    bx.globalAlpha = 1;
    for (let i = 0; i < 40; i++) { const a = R(0, Math.PI * 2), d = R(60, 220); bx.fillStyle = `rgba(255,255,255,${R(0.4, 1)})`; bx.beginPath(); bx.arc(BC + Math.cos(a) * d, BC + Math.sin(a) * d, R(1.5, 4), 0, Math.PI * 2); bx.fill(); }
    const blast = bakeGlow(bl, [[16, 0.7], [5, 0.5]]);

    // ---------- 충격파 글로우 (흰색, 오른쪽으로 뻗음, 뒤쪽 기준점 x=40,y=150) ----------
    const sk = mk(560, 300), sx2 = sk.getContext('2d'); const SY = 150;
    sx2.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 10; i++) {
      const t = i / 9, ang = (t - 0.5) * 0.9;
      sx2.save(); sx2.translate(40, SY); sx2.rotate(ang);
      const len = R(380, 460); const g = sx2.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(0.6, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      sx2.strokeStyle = g; sx2.lineWidth = R(6, 14); sx2.beginPath(); sx2.moveTo(0, 0); sx2.lineTo(len, 0); sx2.stroke(); sx2.restore();
    }
    const g2 = sx2.createRadialGradient(60, SY, 0, 60, SY, 110); g2.addColorStop(0, 'rgba(255,255,255,1)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
    sx2.fillStyle = g2; sx2.beginPath(); sx2.arc(60, SY, 110, 0, Math.PI * 2); sx2.fill();
    sx2.globalAlpha = 0.5;
    const g3 = sx2.createLinearGradient(40, SY, 480, SY); g3.addColorStop(0, 'rgba(255,255,255,0.6)'); g3.addColorStop(1, 'rgba(255,255,255,0)');
    sx2.fillStyle = g3; sx2.beginPath(); sx2.moveTo(40, SY - 110); sx2.lineTo(480, SY - 170); sx2.lineTo(480, SY + 170); sx2.lineTo(40, SY + 110); sx2.closePath(); sx2.fill();
    sx2.globalAlpha = 1;
    const shock = bakeGlow(sk, [[14, 0.7], [4, 0.5]]);

    // ---------- 먼지바람 (옅은 회갈색, 보통으로) ----------
    const du = mk(300, 300), dc = du.getContext('2d'); const DC = 150;
    for (let i = 0; i < 6; i++) { const r = R(70, 115), a = R(0.08, 0.16); dc.fillStyle = `rgba(168,146,120,${a})`; dc.beginPath(); dc.arc(DC + R(-24, 24), DC + R(-24, 24), r, 0, Math.PI * 2); dc.fill(); }
    const g4 = dc.createRadialGradient(DC, DC, 0, DC, DC, 135); g4.addColorStop(0, 'rgba(190,170,145,0.35)'); g4.addColorStop(1, 'rgba(190,170,145,0)');
    dc.fillStyle = g4; dc.beginPath(); dc.arc(DC, DC, 135, 0, Math.PI * 2); dc.fill();
    const dust = bakeSoft(du, 10);

    const pv = mk(560, 300), pc = pv.getContext('2d'); pc.fillStyle = '#1e1e24'; pc.fillRect(0, 0, 560, 300);
    const tint = (img, col) => { const t = mk(img.width, img.height), x = t.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, t.width, t.height); return t; };
    pc.globalCompositeOperation = 'lighter';
    pc.drawImage(tint(blast, '#ff8a3c'), 10, 10);
    pc.drawImage(tint(shock, '#ff8a3c'), 270, 50);
    pc.globalCompositeOperation = 'source-over';
    pc.drawImage(dust, 20, 140);
    return { blast: blast.toDataURL(), shock: shock.toDataURL(), dust: dust.toDataURL(), preview: pv.toDataURL() };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('dmx_blast.png', res.blast); save('dmx_shock.png', res.shock); save('dmx_dust.png', res.dust); save('preview_dmx.png', res.preview);
  await b.close();
})();
