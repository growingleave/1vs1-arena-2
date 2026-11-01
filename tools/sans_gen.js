// 샌즈 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
//   sans_bone.png       48x14  : 평타 뼈다귀 (가운데 = 그림 가운데, 가로로 김) — 보통
//   sans_skull_top.png  240x160: 옆을 보는 짐승 해골 윗부분 (오른쪽을 봄, 입 앞끝 (212,98), 턱 경첩 (62,98)) — 보통
//   sans_skull_jaw.png  240x160: 아래턱 (같은 좌표계, 경첩 (62,98)에서 아래로 돌려 입을 벌림) — 보통
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

    // ---------- 해골 윗부분 (오른쪽을 봄) ----------
    const tp = mk(480, 320), t = tp.getContext('2d');
    t.lineJoin = 'round'; t.lineCap = 'round';
    // 뿔: 뒤통수 위에서 뒤로 휘어 올라감
    t.fillStyle = boneFill(t, 10, 120); t.strokeStyle = OUTLINE; t.lineWidth = 5;
    t.beginPath(); t.moveTo(120, 112); t.quadraticCurveTo(70, 70, 40, 18); t.quadraticCurveTo(100, 46, 150, 96); t.closePath(); t.fill(); t.stroke();
    // 머리통 + 위턱 (주둥이가 길게)
    t.fillStyle = boneFill(t, 60, 200);
    t.beginPath();
    t.moveTo(100, 196);                                   // 턱 경첩 뒤
    t.quadraticCurveTo(70, 150, 96, 110);                  // 뒤통수
    t.quadraticCurveTo(150, 62, 240, 74);                  // 정수리
    t.quadraticCurveTo(330, 86, 392, 122);                 // 콧등
    t.quadraticCurveTo(436, 140, 432, 176);                // 코끝
    t.lineTo(424, 196);                                    // 입 앞끝
    t.lineTo(100, 196);
    t.closePath(); t.fill(); t.stroke();
    // 윗니 (아래로 뾰족)
    t.fillStyle = '#f4f5f8';
    for (let x = 250; x <= 410; x += 20) { const big = x === 270 || x === 390; t.beginPath(); t.moveTo(x - 7, 194); t.lineTo(x, 194 + (big ? 30 : 16)); t.lineTo(x + 7, 194); t.closePath(); t.fill(); t.stroke(); }
    // 광대뼈 선
    t.lineWidth = 3; t.beginPath(); t.moveTo(150, 180); t.quadraticCurveTo(210, 168, 262, 184); t.stroke();
    // 눈구멍 (크고 어둡게) + 작은 빛나는 눈동자
    t.fillStyle = '#0b0b12'; t.lineWidth = 4;
    t.beginPath(); t.ellipse(208, 128, 44, 36, -0.15, 0, Math.PI * 2); t.fill(); t.stroke();
    const eg = t.createRadialGradient(214, 130, 0, 214, 130, 14); eg.addColorStop(0, '#ffffff'); eg.addColorStop(0.4, '#bff0ff'); eg.addColorStop(1, 'rgba(120,220,255,0)');
    t.fillStyle = eg; t.beginPath(); t.arc(214, 130, 14, 0, Math.PI * 2); t.fill();
    t.fillStyle = '#ffffff'; t.beginPath(); t.arc(214, 130, 5, 0, Math.PI * 2); t.fill();
    // 콧구멍 + 이마 금
    t.fillStyle = '#0b0b12'; t.beginPath(); t.ellipse(402, 140, 10, 5, 0.4, 0, Math.PI * 2); t.fill();
    t.strokeStyle = '#3a3c46'; t.lineWidth = 3; t.beginPath(); t.moveTo(250, 78); t.lineTo(262, 96); t.lineTo(256, 110); t.stroke();
    const skullTop = half(tp);

    // ---------- 아래턱 (경첩 (124,196) 기준으로 그림) ----------
    const jw = mk(480, 320), j = jw.getContext('2d');
    j.lineJoin = 'round'; j.lineCap = 'round'; j.strokeStyle = OUTLINE; j.lineWidth = 5;
    j.fillStyle = boneFill(j, 190, 250);
    j.beginPath();
    j.moveTo(108, 190); j.lineTo(126, 186);               // 경첩
    j.lineTo(416, 200);                                   // 윗선 (입 안쪽)
    j.quadraticCurveTo(420, 222, 380, 232);               // 턱 끝
    j.quadraticCurveTo(250, 250, 150, 236);               // 아랫선
    j.quadraticCurveTo(110, 228, 108, 190);
    j.closePath(); j.fill(); j.stroke();
    // 아랫니 (위로 뾰족)
    j.fillStyle = '#f4f5f8';
    for (let x = 262; x <= 402; x += 20) { const big = x === 282 || x === 382; j.beginPath(); j.moveTo(x - 7, 202); j.lineTo(x, 202 - (big ? 26 : 14)); j.lineTo(x + 7, 202); j.closePath(); j.fill(); j.stroke(); }
    const skullJaw = half(jw);

    // ---------- 빔 몸통 ----------
    const bm = mk(256, 128), m = bm.getContext('2d');
    const vg = m.createLinearGradient(0, 0, 0, 128);
    vg.addColorStop(0, 'rgba(255,255,255,0)'); vg.addColorStop(0.18, 'rgba(255,255,255,0.35)'); vg.addColorStop(0.32, 'rgba(255,255,255,0.85)');
    vg.addColorStop(0.5, 'rgba(255,255,255,1)'); vg.addColorStop(0.68, 'rgba(255,255,255,0.85)'); vg.addColorStop(0.82, 'rgba(255,255,255,0.35)'); vg.addColorStop(1, 'rgba(255,255,255,0)');
    m.fillStyle = vg; m.fillRect(0, 0, 256, 128);
    m.strokeStyle = 'rgba(255,255,255,0.5)'; m.lineWidth = 2;   // 결 (가로 줄무늬)
    for (const y of [30, 44, 84, 98]) { m.beginPath(); m.moveTo(0, y); m.lineTo(256, y); m.stroke(); }
    const beam = bakeGlow(bm, [[4, 0.5]]);

    const pv = mk(560, 200), pc = pv.getContext('2d');
    pc.fillStyle = '#1e2240'; pc.fillRect(0, 0, 560, 200);
    pc.drawImage(bone, 10, 20, 96, 28);
    pc.save(); pc.translate(130 + 62, 20 + 98); pc.rotate(0.45); pc.drawImage(skullJaw, -62, -98); pc.restore();
    pc.drawImage(skullTop, 130, 20);
    pc.globalCompositeOperation = 'lighter'; pc.drawImage(beam, 342, 86, 210, 24);
    return { bone: bone.toDataURL(), top: skullTop.toDataURL(), jaw: skullJaw.toDataURL(), beam: beam.toDataURL(), pv: pv.toDataURL() };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('sans_bone.png', res.bone); save('sans_skull_top.png', res.top); save('sans_skull_jaw.png', res.jaw); save('sans_beam.png', res.beam); save('preview_sans.png', res.pv);
  await b.close();
})();
