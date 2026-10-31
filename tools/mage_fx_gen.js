// 마법사 스킬 2·궁극기 그림 생성 (미리 구워두는 용도라 무거워도 됨). 하늘색·보라가 들어 있고 'lighter'로 그림
// 결과 (게임용 1/2 크기) → web/assets/에 복사
//   mage_wings.png  200x200: 빛 깃털 날개 한 쌍 (오른쪽을 바라볼 때, 가운데 = 몸 가운데, 날개는 위·아래로 펼쳐 뒤로 젖힘)
//   mage_circle.png 300x300: 마법진 (바깥 두 겹 고리 + 룬 + 육망성 + 안쪽 고리), 고리 반지름 = 크기의 0.46
//   mage_blast.png  128x128: 폭발 (섬광 + 고리 + 빛살 + 반짝이), 고리 반지름 = 크기의 0.36
//   mage_pillar.png 60x360: 하늘에서 내려오는 빛기둥 (아래쪽이 밝음, 가운데 x 30)
//   preview_mage_fx.png (확인용)
// 실행: node tools/mage_fx_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    let seed = 1357;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const R = (a, b) => a + (b - a) * rnd();
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const CY_ = [100, 220, 255], PU = [180, 120, 255];
    const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
    const star = (c, x, y, r, a, col = [255, 255, 255]) => {
      c.fillStyle = rgba(col, a); c.beginPath();
      for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4, rr = k % 2 === 0 ? r : r * 0.25; c.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); }
      c.closePath(); c.fill();
    };

    // 색 있는 그림 → 빛 번짐 → 1/2 크기, 검은 배경 → 투명 (밝기 = 불투명도, 색은 그대로)
    const bake = (src, blurs) => {
      const W = src.width, H = src.height;
      const o = mk(W, H), x = o.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'lighter';
      for (const [blur, a] of blurs) { x.filter = `blur(${blur}px)`; x.globalAlpha = a; x.drawImage(src, 0, 0); }
      x.filter = 'none'; x.globalAlpha = 1; x.drawImage(src, 0, 0);
      const small = mk(W / 2, H / 2), sx = small.getContext('2d');
      sx.imageSmoothingQuality = 'high'; sx.drawImage(o, 0, 0, W / 2, H / 2);
      const d = sx.getImageData(0, 0, small.width, small.height), px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        const m = Math.max(px[i], px[i + 1], px[i + 2]);
        if (m === 0) { px[i + 3] = 0; continue; }
        px[i] = px[i] * 255 / m; px[i + 1] = px[i + 1] * 255 / m; px[i + 2] = px[i + 2] * 255 / m; px[i + 3] = m;
      }
      sx.putImageData(d, 0, 0);
      return small;
    };

    // ---------- 1) 날개 ----------
    const WS = 400, WC = WS / 2;
    const wings = mk(WS, WS), w = wings.getContext('2d');
    w.globalCompositeOperation = 'lighter'; w.lineCap = 'round';
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const len = 116 - i * 20, ang = Math.PI + side * (Math.PI / 2 - 0.55 - i * 0.3);
      w.save(); w.translate(WC, WC); w.rotate(ang);
      // 깃털 몸통 (하늘색 → 보라 → 투명)
      const g = w.createLinearGradient(0, 0, len + 28, 0);
      g.addColorStop(0, rgba(CY_, 0.9)); g.addColorStop(0.6, rgba(PU, 0.55)); g.addColorStop(1, rgba(PU, 0));
      w.fillStyle = g; w.beginPath(); w.ellipse(len / 2 + 28, 0, len / 2, 16 - i * 3, 0, 0, Math.PI * 2); w.fill();
      // 깃대 + 깃가지 (결)
      w.strokeStyle = 'rgba(255,255,255,0.75)'; w.lineWidth = 2;
      w.beginPath(); w.moveTo(28, 0); w.lineTo(len + 20, 0); w.stroke();
      for (let k = 0; k < 14; k++) {
        const x0 = 34 + k * (len / 15), hw = (16 - i * 3) * Math.sin(Math.PI * (k + 1) / 16) * 0.9;
        w.strokeStyle = rgba([220, 240, 255], 0.35); w.lineWidth = 1.2;
        w.beginPath(); w.moveTo(x0, 0); w.lineTo(x0 + 9, -hw); w.moveTo(x0, 0); w.lineTo(x0 + 9, hw); w.stroke();
      }
      w.restore();
    }
    for (let k = 0; k < 16; k++) { const a = Math.PI + R(-1.3, 1.3), d = R(40, 130); star(w, WC + Math.cos(a) * d, WC + Math.sin(a) * d, R(2, 5), R(0.4, 0.9), rnd() < 0.5 ? CY_ : PU); }
    const wingsB = bake(wings, [[10, 0.6], [3, 0.5]]);

    // ---------- 2) 마법진 ----------
    const CS = 600, CC = CS / 2, CR = CS * 0.46;
    const circ = mk(CS, CS), c = circ.getContext('2d');
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    c.strokeStyle = rgba(CY_, 0.95); c.lineWidth = 4; c.beginPath(); c.arc(CC, CC, CR, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = rgba(CY_, 0.6); c.lineWidth = 2; c.beginPath(); c.arc(CC, CC, CR - 14, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = rgba(PU, 0.85); c.lineWidth = 3; c.beginPath(); c.arc(CC, CC, CR - 34, 0, Math.PI * 2); c.stroke();
    // 고리 사이 룬 (작은 글자 같은 획 + 별)
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2, rr = CR - 24;
      c.save(); c.translate(CC + Math.cos(a) * rr, CC + Math.sin(a) * rr); c.rotate(a + Math.PI / 2);
      c.strokeStyle = rgba(k % 2 ? PU : CY_, 0.9); c.lineWidth = 2;
      c.beginPath();
      const t = k % 4;
      if (t === 0) { c.moveTo(-5, -6); c.lineTo(5, -6); c.moveTo(0, -6); c.lineTo(0, 6); }
      else if (t === 1) { c.moveTo(-5, 6); c.lineTo(0, -6); c.lineTo(5, 6); }
      else if (t === 2) { c.arc(0, 0, 5, 0.5, Math.PI * 2 - 0.5); }
      else { c.moveTo(-5, -5); c.lineTo(5, 5); c.moveTo(5, -5); c.lineTo(-5, 5); }
      c.stroke(); c.restore();
    }
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2 + 0.13; star(c, CC + Math.cos(a) * (CR + 8), CC + Math.sin(a) * (CR + 8), 7, 0.95, k % 2 ? CY_ : PU); }
    // 육망성 + 안쪽 원 두 개
    c.strokeStyle = rgba(PU, 0.75); c.lineWidth = 2.5;
    for (const off of [0, Math.PI / 3]) {
      c.beginPath();
      for (let k = 0; k <= 3; k++) { const a = off - Math.PI / 2 + k / 3 * Math.PI * 2; c.lineTo(CC + Math.cos(a) * (CR - 40), CC + Math.sin(a) * (CR - 40)); }
      c.stroke();
    }
    c.strokeStyle = rgba(CY_, 0.7); c.lineWidth = 2; c.beginPath(); c.arc(CC, CC, (CR - 40) * 0.5, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = rgba(PU, 0.6); c.beginPath(); c.arc(CC, CC, (CR - 40) * 0.25, 0, Math.PI * 2); c.stroke();
    const circB = bake(circ, [[12, 0.6], [4, 0.5]]);

    // ---------- 3) 폭발 ----------
    const BS = 256, BC = BS / 2, BR = BS * 0.36;
    const blast = mk(BS, BS), bl = blast.getContext('2d');
    bl.globalCompositeOperation = 'lighter'; bl.lineCap = 'round';
    const fg = bl.createRadialGradient(BC, BC, 0, BC, BC, BR);
    fg.addColorStop(0, 'rgba(255,255,255,1)'); fg.addColorStop(0.35, rgba(PU, 0.75)); fg.addColorStop(1, rgba(PU, 0));
    bl.fillStyle = fg; bl.beginPath(); bl.arc(BC, BC, BR, 0, Math.PI * 2); bl.fill();
    bl.strokeStyle = rgba(PU, 0.9); bl.lineWidth = 5; bl.beginPath(); bl.arc(BC, BC, BR, 0, Math.PI * 2); bl.stroke();
    bl.strokeStyle = rgba(CY_, 0.8); bl.lineWidth = 3; bl.beginPath(); bl.arc(BC, BC, BR * 0.7, 0, Math.PI * 2); bl.stroke();
    for (let k = 0; k < 14; k++) { // 빛살
      const a = k / 14 * Math.PI * 2 + R(-0.1, 0.1), l0 = BR * 0.3, l1 = BR * R(1.1, 1.5);
      const g = bl.createLinearGradient(BC + Math.cos(a) * l0, BC + Math.sin(a) * l0, BC + Math.cos(a) * l1, BC + Math.sin(a) * l1);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, rgba(CY_, 0));
      bl.strokeStyle = g; bl.lineWidth = R(2, 4);
      bl.beginPath(); bl.moveTo(BC + Math.cos(a) * l0, BC + Math.sin(a) * l0); bl.lineTo(BC + Math.cos(a) * l1, BC + Math.sin(a) * l1); bl.stroke();
    }
    for (let k = 0; k < 18; k++) { const a = R(0, Math.PI * 2), d = R(BR * 0.5, BR * 1.3); star(bl, BC + Math.cos(a) * d, BC + Math.sin(a) * d, R(2, 5), R(0.5, 1), rnd() < 0.5 ? CY_ : PU); }
    const blastB = bake(blast, [[8, 0.6], [3, 0.5]]);

    // ---------- 4) 빛기둥 ----------
    const PW = 120, PH = 720;
    const pil = mk(PW, PH), pc = pil.getContext('2d');
    pc.globalCompositeOperation = 'lighter';
    const pg = pc.createLinearGradient(0, 0, 0, PH);
    pg.addColorStop(0, rgba(PU, 0)); pg.addColorStop(0.6, rgba(CY_, 0.35)); pg.addColorStop(1, rgba(CY_, 0.8));
    pc.fillStyle = pg; pc.fillRect(PW * 0.2, 0, PW * 0.6, PH);
    const cg = pc.createLinearGradient(0, 0, 0, PH);
    cg.addColorStop(0, 'rgba(255,255,255,0)'); cg.addColorStop(1, 'rgba(255,255,255,0.95)');
    pc.fillStyle = cg; pc.fillRect(PW * 0.42, 0, PW * 0.16, PH);
    for (let k = 0; k < 40; k++) { // 세로 결 + 반짝이
      const x = PW / 2 + R(-1, 1) * PW * 0.28, y0 = R(0, PH), l = R(40, 200);
      pc.strokeStyle = rgba(rnd() < 0.5 ? CY_ : PU, R(0.1, 0.4) * (y0 / PH)); pc.lineWidth = R(1, 2.5);
      pc.beginPath(); pc.moveTo(x, y0); pc.lineTo(x, Math.min(PH, y0 + l)); pc.stroke();
    }
    for (let k = 0; k < 20; k++) star(pc, PW / 2 + R(-1, 1) * PW * 0.4, R(PH * 0.3, PH), R(2, 5), R(0.4, 0.9), rnd() < 0.5 ? CY_ : PU);
    const pilB = bake(pil, [[8, 0.6], [3, 0.4]]);

    // 확인용
    const pv = mk(200 + 300 + 128 + 60 + 50, 360), pv2 = pv.getContext('2d');
    pv2.fillStyle = '#1e1e24'; pv2.fillRect(0, 0, pv.width, pv.height);
    pv2.drawImage(wingsB, 0, 80); pv2.drawImage(circB, 210, 30); pv2.drawImage(blastB, 520, 116); pv2.drawImage(pilB, 660, 0);
    return { wings: wingsB.toDataURL('image/png'), circle: circB.toDataURL('image/png'), blast: blastB.toDataURL('image/png'), pillar: pilB.toDataURL('image/png'), preview: pv.toDataURL('image/png') };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('mage_wings.png', res.wings); save('mage_circle.png', res.circle); save('mage_blast.png', res.blast); save('mage_pillar.png', res.pillar); save('preview_mage_fx.png', res.preview);
  await b.close();
})();
