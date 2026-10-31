// 무투가 스킬 2(돌진 + 돌려차기) 그림 생성 (미리 구워두는 용도라 무거워도 됨)
// 모두 흰색 + 투명 배경 (게임에서 연주황을 입힘)
// 결과 (게임용 1/2 크기) → web/assets/에 복사
//   fighter_kick_ring.png 256x256: 한 바퀴 원형 참격 띠 (가운데가 무투가, 띠 반지름 ≈ 크기의 0.38)
//   fighter_kick_shock.png 256x256: 차고 난 뒤 퍼지는 충격파 고리 + 바깥 바람줄 + 먼지 (고리 반지름 ≈ 크기의 0.3)
//   fighter_dash.png 300x100: 돌진 바람 꼬리 (진행 방향 오른쪽, 꼬리 x 10 ~ 머리 x 290, 가운데 y 50)
//   preview_kick.png (확인용)
// 실행: node tools/fighter_kick_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    let seed = 2468;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const R = (a, b) => a + (b - a) * rnd();
    const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(); return (s - 2) / 0.58; };
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const noise1 = () => { const k = []; for (let i = 0; i < 6; i++) k.push([R(2, 14), R(0, 6.28), R(0.2, 1)]); return (u) => { let s = 0, n = 0; for (const [f, ph, a] of k) { s += Math.sin(u * f + ph) * a; n += a; } return 0.5 + 0.5 * s / n; }; };

    // 흰 그림 → 빛 번짐 → 1/2 크기, 밝기 = 불투명도 (흰색)
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
        const m = Math.min(255, Math.max(px[i], px[i + 1], px[i + 2]) * 0.9);
        px[i] = px[i + 1] = px[i + 2] = 255; px[i + 3] = m;
      }
      sx.putImageData(d, 0, 0);
      return { small, preview: o };
    };

    // ---------- 1) 원형 참격 띠 ----------
    const S = 512, C = S / 2, RR = S * 0.38;
    const ring = mk(S, S), r = ring.getContext('2d');
    r.globalCompositeOperation = 'lighter'; r.lineCap = 'round';
    // 띠 바탕: 바깥(발끝 쪽)이 밝고 안쪽으로 옅어지는 여러 겹
    for (let i = 0; i < 40; i++) {
      const s = i / 40; // 0 = 바깥 날, 1 = 안쪽
      r.strokeStyle = `rgba(255,255,255,${0.05 * Math.exp(-2.4 * s)})`; r.lineWidth = 3;
      r.beginPath(); r.arc(C, C, RR + 10 - s * 70, 0, Math.PI * 2); r.stroke();
    }
    // 붓결: 원을 따라 도는 가는 호 수백 개 (길이·굵기·밝기 제각각)
    for (let i = 0; i < 420; i++) {
      const s = Math.pow(rnd(), 1.4), rad = RR + 8 - s * 72;
      const a0 = R(0, Math.PI * 2), len = R(0.2, 1.6);
      const nz = noise1(), steps = 24, w0 = R(0.6, 3) * (1.2 - s), al = R(0.08, 0.4) * Math.exp(-1.8 * s);
      for (let k = 0; k < steps; k++) {
        const u0 = k / steps, u1 = (k + 1) / steps;
        r.strokeStyle = `rgba(255,255,255,${al * Math.sin(Math.PI * (u0 + u1) / 2) * (0.3 + 0.7 * nz(u0))})`;
        r.lineWidth = w0;
        r.beginPath(); r.arc(C, C, rad, a0 + len * u0, a0 + len * u1); r.stroke();
      }
    }
    // 바깥 날: 가장 밝은 가는 원 두 줄 + 굵기 얼룩
    const edgeN = noise1();
    for (let k = 0; k < 180; k++) {
      const a0 = k / 180 * Math.PI * 2, a1 = (k + 1) / 180 * Math.PI * 2;
      r.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * edgeN(k / 180)})`; r.lineWidth = 2 + 4 * edgeN(k / 180 + 0.3);
      r.beginPath(); r.arc(C, C, RR + 10, a0, a1); r.stroke();
    }
    r.strokeStyle = 'rgba(255,255,255,0.35)'; r.lineWidth = 1.5;
    r.beginPath(); r.arc(C, C, RR + 20, 0, Math.PI * 2); r.stroke();
    // 바깥으로 튀어나온 바람 꼬리 (접선 방향 짧은 선)
    for (let i = 0; i < 36; i++) {
      const a = R(0, Math.PI * 2), d = RR + R(12, 30), len = R(0.08, 0.25);
      r.strokeStyle = `rgba(255,255,255,${R(0.2, 0.6)})`; r.lineWidth = R(1, 2.5);
      r.beginPath(); r.arc(C, C, d, a, a + len); r.stroke();
    }
    const ringBaked = bake(ring, [[18, 0.6], [6, 0.6]]);

    // ---------- 2) 충격파 고리 + 바람줄 + 먼지 ----------
    const shock = mk(S, S), sh = shock.getContext('2d');
    sh.globalCompositeOperation = 'lighter'; sh.lineCap = 'round';
    const SR = S * 0.3;
    const shN = noise1();
    for (let k = 0; k < 160; k++) {
      const a0 = k / 160 * Math.PI * 2, a1 = (k + 1) / 160 * Math.PI * 2;
      sh.strokeStyle = `rgba(255,255,255,${0.4 + 0.6 * shN(k / 160)})`; sh.lineWidth = 3 + 7 * shN(k / 160 + 0.5);
      sh.beginPath(); sh.arc(C, C, SR, a0, a1); sh.stroke();
    }
    sh.strokeStyle = 'rgba(255,255,255,0.35)'; sh.lineWidth = 2;
    sh.beginPath(); sh.arc(C, C, SR * 0.82, 0, Math.PI * 2); sh.stroke();
    for (let i = 0; i < 28; i++) { // 바깥으로 뻗는 바람줄
      const a = i / 28 * Math.PI * 2 + R(-0.08, 0.08), d0 = SR + R(10, 30), d1 = d0 + R(30, 80);
      const g = sh.createLinearGradient(C + Math.cos(a) * d0, C + Math.sin(a) * d0, C + Math.cos(a) * d1, C + Math.sin(a) * d1);
      g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      sh.strokeStyle = g; sh.lineWidth = R(1.5, 3.5);
      sh.beginPath(); sh.moveTo(C + Math.cos(a) * d0, C + Math.sin(a) * d0); sh.lineTo(C + Math.cos(a) * d1, C + Math.sin(a) * d1); sh.stroke();
    }
    for (let i = 0; i < 160; i++) { // 먼지 알갱이 (고리 바깥쪽)
      const a = R(0, Math.PI * 2), d = SR + Math.abs(gauss()) * 40 + 8;
      sh.fillStyle = `rgba(255,255,255,${R(0.1, 0.45)})`;
      sh.beginPath(); sh.arc(C + Math.cos(a) * d, C + Math.sin(a) * d, R(1, 4), 0, Math.PI * 2); sh.fill();
    }
    const shockBaked = bake(shock, [[14, 0.6], [5, 0.5]]);

    // ---------- 3) 돌진 바람 꼬리 ----------
    const DW = 600, DH = 200, DY = DH / 2, X0 = 20, X1 = 580;
    const dash = mk(DW, DH), dc = dash.getContext('2d');
    dc.globalCompositeOperation = 'lighter'; dc.lineCap = 'round';
    for (let i = 0; i < 220; i++) { // 가로 바람줄 (머리 쪽이 밝고, 바깥일수록 옅게)
      const y = DY + gauss() * 26, dist = Math.abs(y - DY);
      const x1 = R(X0 + 200, X1 - 10), len = R(80, 420);
      const steps = 20, w0 = R(0.8, 3.2) * Math.exp(-dist / 60), al = R(0.06, 0.35) * Math.exp(-dist / 35);
      for (let k = 0; k < steps; k++) {
        const u0 = k / steps, u1 = (k + 1) / steps;
        dc.strokeStyle = `rgba(255,255,255,${al * u1 * u1})`; dc.lineWidth = w0 * (0.3 + 0.7 * u1);
        dc.beginPath(); dc.moveTo(x1 - len * (1 - u0), y); dc.lineTo(x1 - len * (1 - u1), y); dc.stroke();
      }
    }
    for (const side of [-1, 1]) for (let j = 0; j < 4; j++) { // 앞에서 갈라지는 공기 결
      const spread = R(14, 40);
      dc.strokeStyle = `rgba(255,255,255,${R(0.2, 0.45)})`; dc.lineWidth = R(1.2, 2.4);
      dc.beginPath(); dc.moveTo(X1 - 10, DY);
      dc.quadraticCurveTo(X1 - 120, DY + side * spread * 0.4, X1 - R(260, 420), DY + side * spread); dc.stroke();
    }
    const hg = dc.createRadialGradient(X1 - 20, DY, 0, X1 - 20, DY, 50);
    hg.addColorStop(0, 'rgba(255,255,255,0.7)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    dc.fillStyle = hg; dc.beginPath(); dc.arc(X1 - 20, DY, 50, 0, Math.PI * 2); dc.fill();
    const dashBaked = bake(dash, [[10, 0.6], [3, 0.5]]);

    // 확인용: 연주황으로 칠해 한 장에
    const tint = (c) => { const t = mk(c.width, c.height), x = t.getContext('2d'); x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffb070'; x.fillRect(0, 0, t.width, t.height); x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.5; x.drawImage(c, 0, 0); return t; };
    const pv = mk(256 * 2 + 300 + 40, 260), pc = pv.getContext('2d');
    pc.fillStyle = '#1e1e24'; pc.fillRect(0, 0, pv.width, pv.height);
    pc.drawImage(tint(ringBaked.small), 0, 2); pc.drawImage(tint(shockBaked.small), 266, 2); pc.drawImage(tint(dashBaked.small), 532, 80);
    return { ring: ringBaked.small.toDataURL('image/png'), shock: shockBaked.small.toDataURL('image/png'), dash: dashBaked.small.toDataURL('image/png'), preview: pv.toDataURL('image/png') };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('fighter_kick_ring.png', res.ring); save('fighter_kick_shock.png', res.shock); save('fighter_dash.png', res.dash); save('preview_kick.png', res.preview);
  await b.close();
})();
