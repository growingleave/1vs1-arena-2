// 폭파광 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
//   dmx_grenade.png      32x32  : 평타 유탄 (가운데 = 그림 가운데) — 보통
//   dmx_bigbomb.png      40x64  : 변신 스킬2 떨어지는 폭탄 (코 끝 = 아래 가운데 x20,y62) — 보통
//   dmx_fireball.png     160x160: 폭발 불덩이 (주황 멀티컬러, 가운데, 불꽃 끝 반지름 ≈ 72) — 'lighter' 그대로
//   dmx_fireball_red.png 160x160: 변신용 불덩이 (붉은 멀티컬러, 더 뾰족) — 'lighter' 그대로
//   dmx_ring.png         160x160: 충격파 고리 (흰 빛, 고리 반지름 70) — 색 입혀 'lighter'
//   dmx_cone.png         200x140: 스킬1 앞으로 뿜는 폭발 (뒤쪽 기준점 x10,y70, 오른쪽으로 길이 ≈ 185) — 'lighter' 그대로
//   dmx_cone_red.png     200x140: 변신 스킬1 (붉은) — 'lighter' 그대로
//   dmx_smoke.png        128x128: 검은 연기 뭉치 (가운데) — 보통
//   dmx_dust.png         128x128: 옅은 흙먼지 (가운데) — 보통
//   dmx_scorch.png       160x160: 바닥 그을림 (가운데, 반지름 ≈ 70) — 보통
//   dmx_warn.png         200x200: 궁극기 경고 고리 (흰 빛, 고리 반지름 92) — 색 입혀 'lighter'
//   preview_dmx.png, preview_dmx2.png (확인용)
// 실행: node tools/demolitionist_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    let seed = 8086;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const R = (a, b) => a + (b - a) * rnd();
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
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
    const half = (src) => { const s = mk(src.width / 2, src.height / 2), x = s.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, s.width, s.height); return s; };
    const blurred = (src, bl) => { const o = mk(src.width, src.height), x = o.getContext('2d'); x.filter = `blur(${bl}px)`; x.drawImage(src, 0, 0); return o; };

    // ---------- 유탄 ----------
    const gr = mk(64, 64), g = gr.getContext('2d');
    const gg = g.createRadialGradient(26, 26, 2, 32, 32, 22); gg.addColorStop(0, '#8a8f99'); gg.addColorStop(0.6, '#3b3f47'); gg.addColorStop(1, '#16181d');
    g.fillStyle = gg; g.beginPath(); g.arc(32, 34, 20, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff6a1f'; g.fillRect(12, 31, 40, 6);
    g.fillStyle = '#ffd08a'; g.fillRect(12, 31, 40, 2);
    g.fillStyle = '#5a5f69'; g.fillRect(26, 8, 12, 9);
    g.strokeStyle = '#c9cdd4'; g.lineWidth = 2; g.beginPath(); g.moveTo(38, 10); g.quadraticCurveTo(48, 4, 50, 12); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(25, 26, 6, 4, -0.6, 0, Math.PI * 2); g.fill();
    const grenade = half(gr);

    // ---------- 떨어지는 폭탄 (코가 아래) ----------
    const bb = mk(80, 128), q = bb.getContext('2d');
    const bg = q.createLinearGradient(16, 0, 64, 0); bg.addColorStop(0, '#1b1d22'); bg.addColorStop(0.35, '#6c717c'); bg.addColorStop(0.6, '#3a3e46'); bg.addColorStop(1, '#121318');
    q.fillStyle = '#2a2d33';
    q.beginPath(); q.moveTo(22, 6); q.lineTo(58, 6); q.lineTo(50, 34); q.lineTo(30, 34); q.closePath(); q.fill();
    q.fillStyle = bg; q.beginPath(); q.moveTo(28, 28); q.lineTo(52, 28); q.quadraticCurveTo(66, 70, 52, 104); q.quadraticCurveTo(40, 128, 28, 104); q.quadraticCurveTo(14, 70, 28, 28); q.fill();
    q.fillStyle = '#e8322a'; q.fillRect(21, 54, 38, 8); q.fillStyle = '#ff9b6a'; q.fillRect(21, 54, 38, 2);
    q.fillStyle = '#ffd23c'; q.fillRect(23, 72, 34, 4);
    const bigbomb = half(bb);

    // ---------- 불덩이 ----------
    const fire = (cols, spikes, spikeLen) => {
      const c = mk(320, 320), x = c.getContext('2d'); const C = 160;
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < spikes; i++) {
        const a = i / spikes * Math.PI * 2 + R(-0.15, 0.15), len = R(spikeLen * 0.7, spikeLen), w = R(0.18, 0.32);
        const rg = x.createRadialGradient(C, C, 10, C, C, len); rg.addColorStop(0, cols[1]); rg.addColorStop(0.55, cols[2]); rg.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = rg; x.beginPath(); x.moveTo(C + Math.cos(a - w) * 40, C + Math.sin(a - w) * 40);
        x.quadraticCurveTo(C + Math.cos(a) * len * 0.8, C + Math.sin(a) * len * 0.8, C + Math.cos(a) * len, C + Math.sin(a) * len);
        x.quadraticCurveTo(C + Math.cos(a) * len * 0.8, C + Math.sin(a) * len * 0.8, C + Math.cos(a + w) * 40, C + Math.sin(a + w) * 40); x.closePath(); x.fill();
      }
      for (let i = 0; i < 14; i++) {
        const a = R(0, Math.PI * 2), d = R(10, 60), r = R(28, 48), px = C + Math.cos(a) * d, py = C + Math.sin(a) * d;
        const rg = x.createRadialGradient(px, py, 0, px, py, r); rg.addColorStop(0, cols[1]); rg.addColorStop(0.6, cols[2]); rg.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = rg; x.globalAlpha = 0.55; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
      }
      x.globalAlpha = 1;
      const core = x.createRadialGradient(C, C, 0, C, C, 60); core.addColorStop(0, '#ffffff'); core.addColorStop(0.35, cols[0]); core.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = core; x.beginPath(); x.arc(C, C, 60, 0, Math.PI * 2); x.fill();
      return bakeGlow(c, [[8, 0.6]]);
    };
    const fireball = fire(['rgb(255,240,170)', 'rgb(255,170,50)', 'rgb(220,70,20)'], 11, 150);
    const fireballRed = fire(['rgb(255,200,120)', 'rgb(255,60,25)', 'rgb(170,10,0)'], 15, 158);

    // ---------- 충격파 고리 ----------
    const rgc = mk(320, 320), r = rgc.getContext('2d');
    r.strokeStyle = '#fff'; r.lineWidth = 7; r.beginPath(); r.arc(160, 160, 140, 0, Math.PI * 2); r.stroke();
    r.globalAlpha = 0.45; r.lineWidth = 18; r.beginPath(); r.arc(160, 160, 128, 0, Math.PI * 2); r.stroke();
    const ring = bakeGlow(rgc, [[8, 0.8], [3, 0.6]]);

    // ---------- 스킬1 원뿔 폭발 ----------
    const cone = (cols) => {
      const c = mk(400, 280), x = c.getContext('2d'); const OX = 20, OY = 140;
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const a = R(-0.42, 0.42), len = R(220, 370), w = R(0.04, 0.09);
        const lg = x.createLinearGradient(OX, OY, OX + Math.cos(a) * len, OY + Math.sin(a) * len); lg.addColorStop(0, cols[0]); lg.addColorStop(0.4, cols[1]); lg.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = lg; x.globalAlpha = R(0.25, 0.55); x.beginPath(); x.moveTo(OX, OY - 8); x.lineTo(OX + Math.cos(a - w) * len, OY + Math.sin(a - w) * len); x.lineTo(OX + Math.cos(a + w) * len, OY + Math.sin(a + w) * len); x.lineTo(OX, OY + 8); x.closePath(); x.fill();
      }
      for (let i = 0; i < 12; i++) {
        const t = R(0.2, 0.85), a = R(-0.32, 0.32), d = 40 + t * 280, rr = 18 + t * 40;
        const px = OX + Math.cos(a) * d, py = OY + Math.sin(a) * d;
        const rg = x.createRadialGradient(px, py, 0, px, py, rr); rg.addColorStop(0, cols[1]); rg.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = rg; x.globalAlpha = 0.5 * (1 - t * 0.5); x.beginPath(); x.arc(px, py, rr, 0, Math.PI * 2); x.fill();
      }
      x.globalAlpha = 1;
      const core = x.createRadialGradient(OX + 30, OY, 0, OX + 30, OY, 50); core.addColorStop(0, '#fff'); core.addColorStop(0.5, cols[0]); core.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = core; x.beginPath(); x.arc(OX + 30, OY, 50, 0, Math.PI * 2); x.fill();
      return bakeGlow(c, [[7, 0.6]]);
    };
    const coneImg = cone(['rgb(255,220,140)', 'rgb(255,130,40)']);
    const coneRed = cone(['rgb(255,170,110)', 'rgb(255,45,20)']);

    // ---------- 연기 / 먼지 (보통 그림: 부드러운 뭉치) ----------
    const puff = (col, n, alpha) => {
      const c = mk(256, 256), x = c.getContext('2d');
      for (let i = 0; i < n; i++) {
        const a = R(0, Math.PI * 2), d = R(0, 50), rr = R(30, 55), px = 128 + Math.cos(a) * d, py = 128 + Math.sin(a) * d;
        const rg = x.createRadialGradient(px, py, 0, px, py, rr); rg.addColorStop(0, `rgba(${col},${alpha})`); rg.addColorStop(1, `rgba(${col},0)`);
        x.fillStyle = rg; x.beginPath(); x.arc(px, py, rr, 0, Math.PI * 2); x.fill();
      }
      return half(blurred(c, 6));
    };
    const smoke = puff('105,98,100', 12, 0.55);
    const dust = puff('170,150,125', 10, 0.4);

    // ---------- 바닥 그을림 ----------
    const sc = mk(320, 320), s = sc.getContext('2d');
    const sg = s.createRadialGradient(160, 160, 0, 160, 160, 140); sg.addColorStop(0, 'rgba(15,10,8,0.85)'); sg.addColorStop(0.55, 'rgba(30,20,15,0.55)'); sg.addColorStop(1, 'rgba(30,20,15,0)');
    s.fillStyle = sg; s.beginPath(); s.arc(160, 160, 140, 0, Math.PI * 2); s.fill();
    s.strokeStyle = 'rgba(10,6,4,0.45)'; s.lineCap = 'round';
    for (let i = 0; i < 9; i++) { let a = R(0, Math.PI * 2), rr = 20; s.lineWidth = R(1.5, 3); s.beginPath(); s.moveTo(160 + Math.cos(a) * rr, 160 + Math.sin(a) * rr); while (rr < 95) { rr += R(12, 22); a += R(-0.3, 0.3); s.lineTo(160 + Math.cos(a) * rr, 160 + Math.sin(a) * rr); } s.stroke(); }
    s.fillStyle = 'rgba(255,120,40,0.35)';
    s.beginPath(); s.arc(160, 160, 22, 0, Math.PI * 2); s.fill();
    const scorch = half(sc);

    // ---------- 궁극기 경고 고리 ----------
    const wn = mk(400, 400), w = wn.getContext('2d'); const W = 200;
    w.strokeStyle = '#fff'; w.fillStyle = '#fff';
    w.lineWidth = 6; w.beginPath(); w.arc(W, W, 184, 0, Math.PI * 2); w.stroke();
    w.lineWidth = 2; w.globalAlpha = 0.6; w.beginPath(); w.arc(W, W, 166, 0, Math.PI * 2); w.stroke();
    w.globalAlpha = 1;
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2; w.save(); w.translate(W + Math.cos(a) * 175, W + Math.sin(a) * 175); w.rotate(a);
      w.beginPath(); w.moveTo(4, -9); w.lineTo(-8, 0); w.lineTo(4, 9); w.lineTo(0, 0); w.closePath(); w.fill(); w.restore();
    }
    w.globalAlpha = 0.5; w.lineWidth = 3;
    for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; w.beginPath(); w.arc(W, W, 150, a, a + 0.09); w.stroke(); }
    const warn = bakeGlow(wn, [[8, 0.8], [3, 0.5]]);

    const tint = (img, col) => { const t = mk(img.width, img.height), x = t.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, t.width, t.height); return t; };
    const pv = mk(820, 200), pc = pv.getContext('2d');
    pc.fillStyle = '#3a3a40'; pc.fillRect(0, 0, 820, 200);
    pc.drawImage(scorch, 0, 20); pc.drawImage(smoke, 170, 0); pc.drawImage(dust, 170, 90);
    pc.drawImage(grenade, 300, 20); pc.drawImage(bigbomb, 300, 70);
    pc.globalCompositeOperation = 'lighter';
    pc.drawImage(fireball, 340, 20); pc.drawImage(fireballRed, 500, 20);
    pc.drawImage(tint(ring, '#ffa040'), 660, 0, 80, 80); pc.drawImage(tint(warn, '#ff3030'), 660, 40, 160, 160);
    const pv2 = mk(420, 150), p2 = pv2.getContext('2d'); p2.fillStyle = '#3a3a40'; p2.fillRect(0, 0, 420, 150); p2.globalCompositeOperation = 'lighter'; p2.drawImage(coneImg, 0, 5); p2.drawImage(coneRed, 210, 5);
    const u = (c) => c.toDataURL();
    return { grenade: u(grenade), bigbomb: u(bigbomb), fireball: u(fireball), fireballRed: u(fireballRed), ring: u(ring), cone: u(coneImg), coneRed: u(coneRed),
      smoke: u(smoke), dust: u(dust), scorch: u(scorch), warn: u(warn), pv: u(pv), pv2: u(pv2) };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('dmx_grenade.png', res.grenade); save('dmx_bigbomb.png', res.bigbomb); save('dmx_fireball.png', res.fireball); save('dmx_fireball_red.png', res.fireballRed);
  save('dmx_ring.png', res.ring); save('dmx_cone.png', res.cone); save('dmx_cone_red.png', res.coneRed); save('dmx_smoke.png', res.smoke);
  save('dmx_dust.png', res.dust); save('dmx_scorch.png', res.scorch); save('dmx_warn.png', res.warn);
  save('preview_dmx.png', res.pv); save('preview_dmx2.png', res.pv2);
  await b.close();
})();
