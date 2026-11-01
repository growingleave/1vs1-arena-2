// 궁수 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
//   archer_bow.png 132x322 : 활 + 적붉은 빛 테두리 (세로로 섬, 쏘는 방향 = 오른쪽, 손잡이 가운데 (87,161), 줄 거는 고리 위 (31,12)·아래 (31,310), 줄은 게임에서 그림) — 보통
//   archer_bow_glow.png 132x322 : 다 당겼을 때 활 전체가 빛나는 그림 (활과 같은 크기·좌표, 'lighter')
//   archer_arrow_impact.png / _explosive / _frost / _homing  120x24 : 화살 (오른쪽을 향함, 오늬 x 1, 촉 끝 x 118, 가운데 y 12) — 보통
//     충격(평타, 맞으면 밀쳐냄)·폭발·감속·유도(궁극기). 몸통·깃 모양은 같고 촉과 색만 다름
//   preview_archer.png (확인용)
// 실행: node tools/archer_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const half = (src) => { const s = mk(src.width / 2, src.height / 2), x = s.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, s.width, s.height); return s; };
    const OUTL = '#07070a';
    const bow = mk(240, 620), g = bow.getContext('2d'); const CY = 310;
    g.lineJoin = 'round'; g.lineCap = 'round';
    const black = (x0, x1) => { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, '#3a3a44'); gr.addColorStop(0.45, '#1a1a20'); gr.addColorStop(1, '#0b0b0f'); return gr; };
    const crimson = (x0, x1) => { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, '#e0333f'); gr.addColorStop(0.5, '#9e1220'); gr.addColorStop(1, '#5a0710'); return gr; };

    // 위·아래 날개(림): 손잡이에서 줄 쪽(왼쪽)으로 휘어 가다가 끝이 다시 앞으로 살짝 젖혀짐. sy = 1 위, -1 아래
    const limb = (sy) => {
      const y = (v) => CY - sy * v;
      // 검은 몸통
      g.fillStyle = black(60, 200); g.strokeStyle = OUTL; g.lineWidth = 4;
      g.beginPath();
      g.moveTo(170, y(95)); g.bezierCurveTo(175, y(170), 140, y(235), 92, y(268));
      g.lineTo(70, y(282)); g.lineTo(62, y(266));
      g.bezierCurveTo(112, y(232), 140, y(170), 140, y(95));
      g.closePath(); g.fill(); g.stroke();
      // 끝부분 적붉은 판 (뾰족하게 젖혀짐)
      g.fillStyle = crimson(40, 120);
      g.beginPath(); g.moveTo(118, y(222)); g.bezierCurveTo(104, y(245), 84, y(262), 62, y(280)); g.lineTo(40, y(302)); g.lineTo(62, y(306)); g.lineTo(58, y(296)); g.bezierCurveTo(92, y(276), 118, y(254), 134, y(226)); g.closePath(); g.fill(); g.stroke();
      // 날개 옆 적붉은 줄무늬
      g.strokeStyle = '#c41e2a'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(160, y(110)); g.bezierCurveTo(162, y(165), 136, y(215), 104, y(242)); g.stroke();
      g.strokeStyle = 'rgba(255,120,130,0.6)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(158, y(112)); g.bezierCurveTo(160, y(165), 134, y(213), 102, y(240)); g.stroke();
      // 이음새 원판 (은색 + 적붉은 고리)
      const cx = 150, cy = y(168);
      g.fillStyle = '#b8bcc6'; g.strokeStyle = OUTL; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 15, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#9e1220'; g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#ff5a66'; g.beginPath(); g.arc(cx - 2, cy - 2, 3, 0, Math.PI * 2); g.fill();
      // 줄 거는 고리
      g.fillStyle = '#b8bcc6'; g.beginPath(); g.arc(50, y(298), 4, 0, Math.PI * 2); g.fill(); g.stroke();
    };
    // 줄은 게임에서 코드로 그린다 (당기면 휘게)
    limb(1); limb(-1);
    // 손잡이 몸체 (가운데, 두툼)
    g.fillStyle = black(120, 210); g.strokeStyle = OUTL; g.lineWidth = 4;
    g.beginPath(); g.moveTo(140, CY - 105); g.lineTo(178, CY - 100); g.quadraticCurveTo(196, CY, 178, CY + 100); g.lineTo(140, CY + 105); g.quadraticCurveTo(128, CY, 140, CY - 105); g.closePath(); g.fill(); g.stroke();
    // 손잡이 감싸개 (적붉은 결)
    g.fillStyle = crimson(140, 190); g.beginPath(); g.roundRect(142, CY - 34, 40, 68, 8); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2; for (let i = -26; i <= 26; i += 8) { g.beginPath(); g.moveTo(146, CY + i); g.lineTo(178, CY + i + 4); g.stroke(); }
    // 화살 받침 + 빛나는 붉은 보석
    g.fillStyle = '#c9ccd4'; g.strokeStyle = OUTL; g.lineWidth = 3; g.beginPath(); g.roundRect(126, CY - 52, 26, 14, 4); g.fill(); g.stroke();
    const gem = g.createRadialGradient(164, CY - 70, 0, 164, CY - 70, 14); gem.addColorStop(0, '#ffd0d4'); gem.addColorStop(0.35, '#ff2a3a'); gem.addColorStop(1, '#5a0710');
    g.fillStyle = gem; g.beginPath(); g.moveTo(164, CY - 84); g.lineTo(174, CY - 70); g.lineTo(164, CY - 56); g.lineTo(154, CY - 70); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,60,70,0.35)'; g.beginPath(); g.arc(164, CY - 70, 20, 0, Math.PI * 2); g.fill();
    // 몸체 은색 테두리 선
    g.strokeStyle = 'rgba(200,205,215,0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(176, CY - 92); g.quadraticCurveTo(190, CY, 176, CY + 92); g.stroke();
    // 어두운 배경에서도 윤곽이 보이게: 활 실루엣을 적붉게 칠해 번지게 한 빛 테두리를 뒤에 깐다 (가장자리 여백 12px)
    const PAD = 12, rim = mk(bow.width + PAD * 2, bow.height + PAD * 2), rx = rim.getContext('2d');
    const sil = mk(bow.width, bow.height), sx = sil.getContext('2d');
    sx.drawImage(bow, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = '#ff3a48'; sx.fillRect(0, 0, sil.width, sil.height);
    for (const [bl, a] of [[7, 0.9], [3, 0.9]]) { rx.filter = `blur(${bl}px)`; rx.globalAlpha = a; rx.drawImage(sil, PAD, PAD); }
    rx.filter = 'none'; rx.globalAlpha = 1; rx.drawImage(bow, PAD, PAD);
    const bowH = half(rim);
    // 다 당겼을 때 활 전체가 빛나는 그림: 실루엣을 밝은 적붉은 빛으로 번지게 ('lighter'로 겹쳐 그림, 활 그림과 같은 크기·좌표)
    const gl = mk(rim.width, rim.height), gx = gl.getContext('2d');
    const silB = mk(bow.width, bow.height), sb = silB.getContext('2d');
    sb.drawImage(bow, 0, 0); sb.globalCompositeOperation = 'source-in'; sb.fillStyle = '#ff6070'; sb.fillRect(0, 0, silB.width, silB.height);
    for (const [bl, a] of [[10, 1], [4, 0.8], [0, 0.45]]) { gx.filter = bl ? `blur(${bl}px)` : 'none'; gx.globalAlpha = a; gx.drawImage(silB, PAD, PAD); }
    const bowGlow = half(gl);

    // ---------- 화살: 몸통·깃은 같고, 촉과 색만 종류마다 다르게 (오른쪽을 향함, 꼬리 x 4, 촉 끝 x 116, 가운데 y 12) ----------
    const arrow = (col, head) => {
      const c = mk(240, 48), a = c.getContext('2d'); const Y = 24;
      a.lineJoin = 'round'; a.lineCap = 'round';
      // 깃 (꼬리, 종류 색)
      a.fillStyle = col.feather; a.strokeStyle = OUTL; a.lineWidth = 2.5;
      for (const sy of [-1, 1]) { a.beginPath(); a.moveTo(16, Y + sy * 2); a.lineTo(6, Y + sy * 16); a.quadraticCurveTo(30, Y + sy * 15, 44, Y + sy * 9); a.lineTo(62, Y + sy * 2); a.closePath(); a.fill(); a.stroke(); } // 뒤로 젖혀진 깃
      a.strokeStyle = 'rgba(255,255,255,0.4)'; a.lineWidth = 1; for (const sy of [-1, 1]) { a.beginPath(); a.moveTo(14, Y + sy * 11); a.quadraticCurveTo(34, Y + sy * 9, 54, Y + sy * 4); a.stroke(); }
      // 몸통 (검정 + 적붉은 띠)
      const sg = a.createLinearGradient(0, Y - 3, 0, Y + 3); sg.addColorStop(0, '#4a4a54'); sg.addColorStop(0.5, '#1a1a20'); sg.addColorStop(1, '#0b0b0f');
      a.fillStyle = sg; a.strokeStyle = OUTL; a.lineWidth = 2; a.beginPath(); a.roundRect(6, Y - 3.5, 176, 7, 3); a.fill(); a.stroke();
      a.fillStyle = '#b3141f'; a.fillRect(62, Y - 3.5, 8, 7); a.fillRect(150, Y - 3.5, 6, 7);
      a.fillStyle = col.band; a.fillRect(76, Y - 3.5, 4, 7);
      a.fillStyle = '#c0c3cb'; a.beginPath(); a.roundRect(2, Y - 5, 8, 10, 2); a.fill(); a.stroke();   // 오늬
      head(a, Y);
      return half(c);
    };
    const glowDot = (a, x, y, r, rgb) => { const gr = a.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rgb},0.9)`); gr.addColorStop(1, `rgba(${rgb},0)`); a.fillStyle = gr; a.beginPath(); a.arc(x, y, r, 0, Math.PI * 2); a.fill(); };
    // 1) 충격 화살 (평타): 뭉툭하고 넓은 쇠망치 촉 + 파란 충격 고리 — 맞으면 밀쳐냄
    const impact = arrow({ feather: '#3d7bd9', band: '#6fb4ff' }, (a, Y) => {
      const hg = a.createLinearGradient(0, Y - 16, 0, Y + 16); hg.addColorStop(0, '#f1f3f7'); hg.addColorStop(0.5, '#8d939f'); hg.addColorStop(1, '#4b505a');
      a.fillStyle = hg; a.strokeStyle = OUTL; a.lineWidth = 2.5;
      a.beginPath(); a.moveTo(180, Y - 6); a.lineTo(196, Y - 15); a.lineTo(226, Y - 15); a.quadraticCurveTo(236, Y, 226, Y + 15); a.lineTo(196, Y + 15); a.lineTo(180, Y + 6); a.closePath(); a.fill(); a.stroke();
      a.strokeStyle = '#6fb4ff'; a.lineWidth = 3; a.beginPath(); a.moveTo(204, Y - 14); a.lineTo(204, Y + 14); a.stroke();
      a.strokeStyle = 'rgba(111,180,255,0.9)'; a.lineWidth = 2.5;
      for (const [r, al] of [[10, 0.9], [16, 0.55]]) { a.globalAlpha = al; a.beginPath(); a.arc(222, Y, r, -1.0, 1.0); a.stroke(); }
      a.globalAlpha = 1;
    });
    // 2) 폭발 화살: 짧은 촉 뒤에 붉은 폭탄 통 + 불붙은 심지
    const explosive = arrow({ feather: '#e0602a', band: '#ffb040' }, (a, Y) => {
      const bg = a.createLinearGradient(0, Y - 11, 0, Y + 11); bg.addColorStop(0, '#ff6a4a'); bg.addColorStop(0.5, '#b3141f'); bg.addColorStop(1, '#5a0710');
      a.fillStyle = bg; a.strokeStyle = OUTL; a.lineWidth = 2.5; a.beginPath(); a.roundRect(172, Y - 11, 38, 22, 8); a.fill(); a.stroke();
      a.fillStyle = '#2a2a30'; a.fillRect(184, Y - 11, 5, 22); a.fillRect(196, Y - 11, 5, 22);
      a.fillStyle = '#c0c3cb'; a.beginPath(); a.moveTo(208, Y - 7); a.lineTo(232, Y); a.lineTo(208, Y + 7); a.closePath(); a.fill(); a.stroke();
      a.strokeStyle = '#3a2a1a'; a.lineWidth = 2; a.beginPath(); a.moveTo(190, Y - 11); a.quadraticCurveTo(186, Y - 18, 180, Y - 19); a.stroke();
      glowDot(a, 179, Y - 19, 7, '255,190,60');
    });
    // 3) 감속 화살: 푸른 얼음 결정 촉 + 서리 조각
    const frost = arrow({ feather: '#7fe0ff', band: '#bff4ff' }, (a, Y) => {
      const ig = a.createLinearGradient(180, Y - 12, 230, Y + 12); ig.addColorStop(0, '#e9fdff'); ig.addColorStop(0.5, '#72d6ff'); ig.addColorStop(1, '#2a7fb8');
      a.fillStyle = ig; a.strokeStyle = '#123a55'; a.lineWidth = 2.5;
      a.beginPath(); a.moveTo(180, Y); a.lineTo(198, Y - 13); a.lineTo(236, Y); a.lineTo(198, Y + 13); a.closePath(); a.fill(); a.stroke();
      a.strokeStyle = 'rgba(255,255,255,0.8)'; a.lineWidth = 1.5; a.beginPath(); a.moveTo(186, Y); a.lineTo(230, Y); a.moveTo(198, Y - 11); a.lineTo(206, Y); a.lineTo(198, Y + 11); a.stroke();
      a.fillStyle = '#bff4ff'; for (const [x, y] of [[172, Y - 10], [170, Y + 9], [164, Y - 4]]) { a.beginPath(); a.moveTo(x, y - 3); a.lineTo(x + 3, y); a.lineTo(x, y + 3); a.lineTo(x - 3, y); a.closePath(); a.fill(); }
    });
    // 4) 유도 화살 (궁극기): 보라색 초능력 — 빛나는 보라 에너지 촉 + 촉을 감싸는 소용돌이 기운 + 보라 깃
    const homing = arrow({ feather: '#8a3cff', band: '#d6a8ff' }, (a, Y) => {
      // 촉 주위 보라 기운 (번지는 빛)
      a.save(); a.globalCompositeOperation = 'lighter';
      glowDot(a, 214, Y, 22, '160,80,255'); glowDot(a, 196, Y, 14, '200,140,255');
      a.restore();
      // 소용돌이 기운 (몸통을 감고 촉으로 흘러감)
      a.strokeStyle = 'rgba(214,168,255,0.9)'; a.lineWidth = 2;
      for (const ph of [0, Math.PI]) { a.beginPath(); for (let x = 150; x <= 214; x += 2) { const y = Y + Math.sin((x - 150) * 0.2 + ph) * (4 + (x - 150) * 0.08); x === 150 ? a.moveTo(x, y) : a.lineTo(x, y); } a.stroke(); }
      // 촉: 보라 수정 같은 에너지 날
      const pg = a.createLinearGradient(186, Y - 11, 238, Y + 11); pg.addColorStop(0, '#f3e6ff'); pg.addColorStop(0.45, '#a55cff'); pg.addColorStop(1, '#4a1890');
      a.fillStyle = pg; a.strokeStyle = '#1e0838'; a.lineWidth = 2.5;
      a.beginPath(); a.moveTo(186, Y); a.lineTo(204, Y - 11); a.lineTo(238, Y); a.lineTo(204, Y + 11); a.closePath(); a.fill(); a.stroke();
      a.strokeStyle = 'rgba(255,255,255,0.85)'; a.lineWidth = 1.5; a.beginPath(); a.moveTo(194, Y); a.lineTo(232, Y); a.stroke();
      // 촉 뒤 눈 모양 빛 (초능력 느낌)
      glowDot(a, 202, Y, 6, '255,220,255'); a.fillStyle = '#ffffff'; a.beginPath(); a.arc(202, Y, 2, 0, Math.PI * 2); a.fill();
      // 흩날리는 보라 빛 알갱이
      a.fillStyle = '#e2c4ff'; for (const [x, y, r] of [[176, Y - 12, 2], [168, Y + 11, 1.6], [160, Y - 7, 1.3], [224, Y - 13, 1.5], [228, Y + 12, 1.3]]) { a.beginPath(); a.arc(x, y, r, 0, Math.PI * 2); a.fill(); }
    });
    const arrows = [impact, explosive, frost, homing];

    const pv = mk(560, 240), pc = pv.getContext('2d');
    pc.fillStyle = '#d8d8dc'; pc.fillRect(0, 0, 280, 240); pc.fillStyle = '#1e1e24'; pc.fillRect(280, 0, 280, 240);
    arrows.forEach((ar, i) => { pc.drawImage(ar, 20, 20 + i * 55, 240, 48); pc.drawImage(ar, 300, 20 + i * 55, 240, 48); });
    return { bow: bowH.toDataURL(), bowGlow: bowGlow.toDataURL(), arrows: arrows.map((ar) => ar.toDataURL()), pv: pv.toDataURL() };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('archer_bow.png', res.bow); save('archer_bow_glow.png', res.bowGlow); ['impact', 'explosive', 'frost', 'homing'].forEach((n, i) => save(`archer_arrow_${n}.png`, res.arrows[i])); save('preview_archer.png', res.pv);
  await b.close();
})();
