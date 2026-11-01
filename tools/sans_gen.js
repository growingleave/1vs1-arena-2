// 샌즈 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
//   sans_bone.png       48x14  : 평타 뼈다귀 (가운데 = 그림 가운데, 가로로 김) — 보통
//   sans_skull_top.png  41x34  : 도트 해골 윗부분 (앞을 봄, 1칸 = 1픽셀, 아래쪽이 입, 입 가운데 (20.5, 34)) — 픽셀 그대로 키워서 보통으로
//   sans_skull_jaw.png  41x11  : 도트 아래턱 (윗부분 바로 아래에 붙음, 아래로 내려 입을 벌림) — 픽셀 그대로 키워서 보통으로
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

    // ---------- 해골 (도트, 앞을 봄) ----------
    // 매끈한 모양으로 크게 그린 뒤 41칸 격자로 깎아 도트로 만든다 (칸 가운데 색: 흰 뼈 / 검은 구멍 / 투명)
    const G = 41, Z = 12;                         // 격자 칸 수(가로), 칸당 그리기 배율
    const pixelate = (drawFn, rows) => {
      const hi = mk(G * Z, rows * Z), h = hi.getContext('2d');
      h.save(); h.scale(Z, Z); drawFn(h); h.restore();
      const data = h.getImageData(0, 0, hi.width, hi.height).data;
      const out = mk(G, rows), o = out.getContext('2d');
      for (let y = 0; y < rows; y++) for (let x = 0; x < G; x++) {
        const k = ((y * Z + Z / 2) * hi.width + (x * Z + Z / 2)) * 4;
        if (data[k + 3] < 128) continue;
        o.fillStyle = data[k] > 128 ? '#ffffff' : '#000000'; o.fillRect(x, y, 1, 1);
      }
      return out;
    };
    const C = 20.5;
    const mirror = (h, fn) => { fn(h, 1); h.save(); h.translate(C * 2, 0); h.scale(-1, 1); fn(h, 1); h.restore(); };
    const poly = (h, pts) => { h.beginPath(); pts.forEach(([x, y], i) => (i ? h.lineTo(x, y) : h.moveTo(x, y))); h.closePath(); h.fill(); };
    const skullTop = pixelate((h) => {
      h.fillStyle = '#fff';
      // 머리 (길쭉, 위는 뾰족한 볏, 아래로 갈수록 주둥이가 좁아짐)
      h.beginPath();
      h.moveTo(C, 0.2);
      h.lineTo(C + 3.2, 4); h.quadraticCurveTo(C + 11, 6, C + 14, 12); h.quadraticCurveTo(C + 15.5, 18, C + 12.5, 24);
      h.lineTo(C + 10, 30); h.lineTo(C + 9, 34);
      h.lineTo(C - 9, 34); h.lineTo(C - 10, 30); h.lineTo(C - 12.5, 24);
      h.quadraticCurveTo(C - 15.5, 18, C - 14, 12); h.quadraticCurveTo(C - 11, 6, C - 3.2, 4);
      h.closePath(); h.fill();
      mirror(h, (h) => {
        // 뿔: 관자놀이에서 바깥 위로 휘어 올라감
        h.beginPath(); h.moveTo(C - 12, 9.5); h.quadraticCurveTo(C - 16, 6, C - 16.5, 0.5); h.quadraticCurveTo(C - 13.5, 5, C - 9.5, 7.5); h.closePath(); h.fill();
        // 볼 옆 가시
        h.beginPath(); h.moveTo(C - 13, 21); h.lineTo(C - 19.5, 27.5); h.lineTo(C - 12, 25.5); h.closePath(); h.fill();
        h.beginPath(); h.moveTo(C - 11, 26); h.lineTo(C - 16, 33); h.lineTo(C - 10, 30); h.closePath(); h.fill();
      });
      h.fillStyle = '#000';
      // 가운데 금 → 마름모 코
      h.fillRect(C - 0.6, 3, 1.2, 16);
      poly(h, [[C, 17.5], [C + 2.2, 21], [C, 24], [C - 2.2, 21]]);
      mirror(h, (h) => {
        // 눈구멍: 바깥 아래로 기운 둥근 구멍 + 흰 고리 눈동자
        h.fillStyle = '#000';   // 안쪽 위가 뾰족하게 올라간 각진 눈구멍
        h.beginPath(); h.moveTo(C - 2.5, 11.5); h.quadraticCurveTo(C - 9, 10.5, C - 12, 14.5); h.quadraticCurveTo(C - 12.5, 19.5, C - 7.5, 20.5); h.quadraticCurveTo(C - 3, 20, C - 2.5, 15.5); h.closePath(); h.fill();
        h.fillStyle = '#fff'; h.beginPath(); h.arc(C - 7.5, 15.8, 2, 0, Math.PI * 2); h.fill();
        h.fillStyle = '#000'; h.beginPath(); h.arc(C - 7.5, 15.8, 1, 0, Math.PI * 2); h.fill();
        // 볼 아래 어두운 홈
        h.fillRect(C - 9.5, 22, 1.2, 5);
      });
      // 입 안 (어둡게) + 윗니 송곳니
      h.fillStyle = '#000'; h.fillRect(C - 8, 28, 16, 6);
      h.fillStyle = '#fff';
      for (const [x, len, w] of [[-6.8, 6, 1.5], [-4, 3.5, 1.3], [-1.4, 4.5, 1.3], [1.4, 4.5, 1.3], [4, 3.5, 1.3], [6.8, 6, 1.5]]) poly(h, [[C + x - w, 27.9], [C + x + w, 27.9], [C + x, 27.9 + len]]);
    }, 34);
    const skullJaw = pixelate((h) => {
      h.fillStyle = '#fff';
      h.beginPath(); h.moveTo(C - 9, 0); h.lineTo(C + 9, 0); h.lineTo(C + 7.5, 5); h.quadraticCurveTo(C + 4, 10, C, 10.5); h.quadraticCurveTo(C - 4, 10, C - 7.5, 5); h.closePath(); h.fill();
      h.fillStyle = '#000'; h.fillRect(C - 7.5, 0, 15, 3);
      h.fillStyle = '#fff';
      for (const [x, len] of [[-5.8, 4], [-2.8, 2.6], [0, 3.4], [2.8, 2.6], [5.8, 4]]) poly(h, [[C + x - 1.3, 3], [C + x + 1.3, 3], [C + x, 3 - len]]);
      h.fillStyle = '#000'; h.fillRect(C - 0.6, 4, 1.2, 4);
    }, 11);

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
    pc.imageSmoothingEnabled = false;
    pc.drawImage(skullTop, 140, 5, 41 * 4, 34 * 4); pc.drawImage(skullJaw, 140, 5 + 34 * 4, 41 * 4, 11 * 4);         // 닫힘
    pc.drawImage(skullTop, 340, 5, 41 * 4, 34 * 4); pc.drawImage(skullJaw, 340, 5 + 39 * 4, 41 * 4, 11 * 4);         // 벌림
    
    return { bone: bone.toDataURL(), top: skullTop.toDataURL(), jaw: skullJaw.toDataURL(), beam: beam.toDataURL(), pv: pv.toDataURL() };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('sans_bone.png', res.bone); save('sans_skull_top.png', res.top); save('sans_skull_jaw.png', res.jaw); save('sans_beam.png', res.beam); save('preview_sans.png', res.pv);
  await b.close();
})();
