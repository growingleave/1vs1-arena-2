// 데몰리셔니스트(폭파광) 이펙트 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
// "폭파" 느낌을 위해 불꽃(flame) 모양 위주에서 → 암석 파편 + 검은 연기 뭉치 + 번쩍임/충격파 링 위주로 설계.
// 색은 흰→노랑→주황→빨강(평소) / 흰→주황→빨강→진적색(변신·궁극기)을 실제로 섞어서 그린다 (단색 tint 아님).
//
//   dmx_blast.png      280x280  평소 폭발 번쩍임 (멀티컬러, 가운데=그림 가운데) — 'lighter'로 원본 그대로 그림(추가 tint 없음)
//   dmx_blast_red.png  280x280  변신/궁극기 폭발 번쩍임 (더 붉은 멀티컬러) — 'lighter'
//   dmx_rocks.png      280x280  날아가는 암석 파편 (짙은 회갈색 + 불빛 테두리, 가운데=그림 가운데) — 보통(source-over)
//   dmx_smoke2.png     280x350  위로 치솟는 검은 연기 뭉치 (바닥 기준점: 그림 가운데 아래쪽, x=140,y=325) — 보통
//   dmx_crater.png     280x280  바닥 크레이터/균열 (가운데=그림 가운데) — 보통
//   dmx_shock.png      280x150  평소 충격파 글로우 (흰 빛, 뒤쪽 기준점 x=20,y=75) — 색 입혀 'lighter'
//   dmx_pillar.png     100x200  변신 스킬2 착탄 불기둥 (바닥 기준점: 그림 가운데 아래쪽, x=50,y=195) — 'lighter'
//   변신 스킬1은 전용 그림 없이 dmx_blast_red/dmx_rocks/dmx_smoke2를 연쇄 폭발처럼 겹쳐 그린다 (demolitionist.js)
//   dmx_dust.png       150x150  먼지바람 (옅은 회갈색, 가운데=그림 가운데, 밀림/후딜 궤적용) — 보통
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
    const PICK = arr => arr[Math.floor(rnd() * arr.length)];
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

    // 빛나는 그림(색 보존): 검은 배경 + 블러 → 1/2. 밝기는 투명도가 되지만 r,g,b 비율은 유지되므로 색이 그대로 살아있다
    const bakeGlowColor = (src, blurs) => {
      const W = src.width, H = src.height;
      const o = mk(W, H), x = o.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'lighter';
      for (const [bl, a] of blurs) { x.filter = `blur(${bl}px)`; x.globalAlpha = a; x.drawImage(src, 0, 0); }
      x.filter = 'none'; x.globalAlpha = 1; x.drawImage(src, 0, 0);
      const s = mk(W / 2, H / 2), sx = s.getContext('2d'); sx.imageSmoothingQuality = 'high'; sx.drawImage(o, 0, 0, W / 2, H / 2);
      const d = sx.getImageData(0, 0, s.width, s.height), px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        const m = Math.max(px[i], px[i + 1], px[i + 2]);
        if (!m) { px[i + 3] = 0; continue; }
        px[i] = Math.min(255, px[i] * 255 / m); px[i + 1] = Math.min(255, px[i + 1] * 255 / m); px[i + 2] = Math.min(255, px[i + 2] * 255 / m);
        px[i + 3] = m;
      }
      sx.putImageData(d, 0, 0); return s;
    };
    // 부드러운 반투명 그림(톤 있는 그림용): 블러만 먹여서 1/2로. 이미 그려둔 알파를 그대로 쓴다
    const bakeSoft = (src, blur) => {
      const o = mk(src.width, src.height), ox = o.getContext('2d');
      if (blur > 0) { ox.filter = `blur(${blur}px)`; ox.drawImage(src, 0, 0); ox.filter = 'none'; }
      else ox.drawImage(src, 0, 0);
      const s = mk(src.width / 2, src.height / 2), sx = s.getContext('2d'); sx.imageSmoothingQuality = 'high'; sx.drawImage(o, 0, 0, s.width, s.height);
      return s;
    };
    const tint = (img, col) => { const t = mk(img.width, img.height), x = t.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, t.width, t.height); return t; };

    // 폭발 번쩍임(암석 파편형 폭발의 핵심): 흰 코어 + 짧고 거친 화염 혓바닥 + 2단 충격파 링 + 불티. palette로 색 계열을 바꾼다.
    const buildFlash = (palette) => {
      const [WHITE, A, B, C] = palette; // A=안쪽(밝은 쪽), B=중간, C=바깥(어두운 쪽)
      const cv = mk(560, 560), fx = cv.getContext('2d'); const CX = 280;
      fx.globalCompositeOperation = 'lighter';
      const gCore = fx.createRadialGradient(CX, CX, 0, CX, CX, 150);
      gCore.addColorStop(0, `rgba(${WHITE},1)`); gCore.addColorStop(0.25, `rgba(${WHITE},0.95)`); gCore.addColorStop(0.55, `rgba(${A},0.75)`); gCore.addColorStop(1, `rgba(${B},0)`);
      fx.fillStyle = gCore; fx.beginPath(); fx.arc(CX, CX, 150, 0, Math.PI * 2); fx.fill();
      for (let i = 0; i < 18; i++) {
        const a = R(0, Math.PI * 2), len = R(70, 160), w = R(10, 22);
        fx.save(); fx.translate(CX, CX); fx.rotate(a);
        const g = fx.createLinearGradient(0, 0, len, 0);
        const col = PICK([WHITE, A, B]);
        g.addColorStop(0, `rgba(${col},1)`); g.addColorStop(1, `rgba(${C},0)`);
        fx.fillStyle = g;
        fx.beginPath(); fx.moveTo(-w / 2, 0); fx.lineTo(w / 2, 0); fx.lineTo(w * 0.1, len); fx.lineTo(-w * 0.1, len); fx.closePath(); fx.fill();
        fx.restore();
      }
      // 충격파 링: 두껍고 진하게 — 블러로 번져도 핵심 테두리가 또렷하게 보이도록
      fx.globalAlpha = 1; fx.lineWidth = 9; fx.strokeStyle = `rgba(${WHITE},1)`;
      fx.beginPath(); fx.arc(CX, CX, 195, 0, Math.PI * 2); fx.stroke();
      fx.lineWidth = 6; fx.strokeStyle = `rgba(${C},0.85)`;
      fx.beginPath(); fx.arc(CX, CX, 250, 0, Math.PI * 2); fx.stroke();
      fx.globalAlpha = 1;
      for (let i = 0; i < 50; i++) {
        const a = R(0, Math.PI * 2), d = R(40, 230);
        fx.fillStyle = `rgba(${PICK([WHITE, A, B, C])},${R(0.5, 1)})`;
        fx.beginPath(); fx.arc(CX + Math.cos(a) * d, CX + Math.sin(a) * d, R(1.5, 4), 0, Math.PI * 2); fx.fill();
      }
      return bakeGlowColor(cv, [[16, 0.6], [6, 0.45], [2, 0.3]]);
    };
    const WHITE = '255,255,255';
    // 평소: 흰-노랑-주황-빨강 (fxColor 주황 계열이 주가 되게)
    const blast = buildFlash([WHITE, '255,224,130', '255,138,60', '214,60,30']);
    // 변신/궁극기: 흰-주황-빨강-진적색 (노랑 비중을 줄이고 훨씬 붉게)
    const blastRed = buildFlash([WHITE, '255,110,50', '220,40,25', '150,20,15']);

    // 날아가는 암석 파편 (불규칙 다각형, 짙은 회갈색 + 불빛 테두리) — 보통(source-over)
    const rocksCv = mk(560, 560), dx = rocksCv.getContext('2d'); const RC = 280;
    for (let i = 0; i < 22; i++) {
      const ang = R(0, Math.PI * 2), dist = R(60, 340), size = R(8, 26);
      const cx2 = RC + Math.cos(ang) * dist, cy2 = RC + Math.sin(ang) * dist;
      const shade = R(35, 70);
      dx.save(); dx.translate(cx2, cy2); dx.rotate(R(0, Math.PI * 2));
      dx.fillStyle = `rgba(${shade},${shade - 8},${shade - 12},${R(0.8, 1)})`;
      const pts = 5 + Math.floor(R(0, 3));
      dx.beginPath();
      for (let k = 0; k < pts; k++) {
        const a2 = (k / pts) * Math.PI * 2, r2 = size * R(0.6, 1.1);
        k === 0 ? dx.moveTo(Math.cos(a2) * r2, Math.sin(a2) * r2) : dx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
      }
      dx.closePath(); dx.fill();
      dx.strokeStyle = `rgba(${PICK(['255,138,60', '214,60,30'])},0.85)`; dx.lineWidth = 1.5; dx.stroke();
      dx.restore();
      dx.strokeStyle = `rgba(70,58,50,${R(0.25, 0.5)})`; dx.lineWidth = R(1.5, 3);
      dx.beginPath(); dx.moveTo(RC + Math.cos(ang) * dist * 0.3, RC + Math.sin(ang) * dist * 0.3); dx.lineTo(cx2, cy2); dx.stroke();
    }
    const rocks = bakeSoft(rocksCv, 1);

    // 바닥 크레이터/균열 (어두운 그림자 + 갈라지는 균열) — 보통
    const craterCv = mk(560, 560), gx = craterCv.getContext('2d'); const GC = 280;
    const gcr = gx.createRadialGradient(GC, GC, 0, GC, GC, 230);
    gcr.addColorStop(0, 'rgba(15,10,9,0.95)'); gcr.addColorStop(0.5, 'rgba(25,18,15,0.68)'); gcr.addColorStop(1, 'rgba(25,18,15,0)');
    gx.fillStyle = gcr; gx.beginPath(); gx.arc(GC, GC, 230, 0, Math.PI * 2); gx.fill();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + R(-0.2, 0.2), len = R(120, 320);
      gx.strokeStyle = `rgba(20,14,12,${R(0.45, 0.72)})`; gx.lineWidth = R(2, 5);
      gx.beginPath(); gx.moveTo(GC, GC);
      let x = GC, y = GC;
      for (let s = 1; s <= 5; s++) { x += Math.cos(a) * (len / 5) + R(-14, 14); y += Math.sin(a) * (len / 5) + R(-14, 14); gx.lineTo(x, y); }
      gx.stroke();
    }
    const crater = bakeSoft(craterCv, 6);

    // 위로 치솟는 검은 연기 뭉치 — 바닥 기준점(그림 가운데 아래쪽)에서 위로 번진다. 보통
    const smokeCv = mk(560, 700), sx = smokeCv.getContext('2d'); const SMX = 280, SMY = 650;
    const puff = (cx2, cy2, r, alpha) => { sx.fillStyle = `rgba(18,15,14,${alpha})`; sx.beginPath(); sx.arc(cx2, cy2, r, 0, Math.PI * 2); sx.fill(); };
    for (let i = 0; i < 16; i++) {
      const t = R(0, 1);
      const cx2 = SMX + R(-120, 120) * (1 - t * 0.3);
      const cy2 = SMY - t * 460 + R(-20, 20);
      const r = R(45, 100) * (0.6 + t * 0.6);
      puff(cx2, cy2, r, R(0.5, 0.78));
    }
    sx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 10; i++) {
      const t = R(0, 0.5);
      const cx2 = SMX + R(-150, 150) * (1 - t * 0.3), cy2 = SMY - t * 400 + R(-10, 10);
      sx.fillStyle = `rgba(${PICK(['255,138,60', '214,60,30'])},${R(0.12, 0.25)})`;
      sx.beginPath(); sx.arc(cx2, cy2, R(50, 90), 0, Math.PI * 2); sx.fill();
    }
    sx.globalCompositeOperation = 'source-over';
    const smoke2 = bakeSoft(smokeCv, 10);

    // ---------- 충격파 글로우 (평소, 흰색 — 색은 vfxTinted로 입힌다) — 기존 그대로 ----------
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
    sx2.globalAlpha = 0.68;
    const g3 = sx2.createLinearGradient(40, SY, 480, SY); g3.addColorStop(0, 'rgba(255,255,255,0.75)'); g3.addColorStop(1, 'rgba(255,255,255,0)');
    sx2.fillStyle = g3; sx2.beginPath(); sx2.moveTo(40, SY - 110); sx2.lineTo(480, SY - 170); sx2.lineTo(480, SY + 170); sx2.lineTo(40, SY + 110); sx2.closePath(); sx2.fill();
    sx2.globalAlpha = 1;
    const shock = bakeGlowColor(sk, [[14, 0.6], [4, 0.4]]);
    const T_WHITE = WHITE, T_ORANGE = '255,110,50', T_RED = '230,40,25', T_DEEPRED = '170,20,15', T_EMBER = '110,15,10';

    // ---------- 변신 스킬2 착탄 불기둥 (바닥 기준점: 가운데 아래) ----------
    const pil = mk(200, 400), px2 = pil.getContext('2d'); const PX = 100, PY = 390;
    px2.globalCompositeOperation = 'lighter';
    px2.save(); px2.translate(PX, PY);
    for (let i = 0; i < 6; i++) {
      const ang = R(-0.3, 0.3), h = R(180, 340), w = R(20, 44);
      const col = PICK([T_WHITE, T_RED, T_ORANGE]);
      px2.save(); px2.rotate(ang);
      const g = px2.createLinearGradient(0, 0, 0, -h);
      g.addColorStop(0, `rgba(${col},1)`); g.addColorStop(0.3, `rgba(${T_RED},0.88)`); g.addColorStop(1, `rgba(${T_DEEPRED},0)`);
      px2.fillStyle = g;
      px2.beginPath(); px2.moveTo(-w / 2, 0); px2.lineTo(w / 2, 0); px2.lineTo(w * 0.15, -h); px2.lineTo(-w * 0.15, -h); px2.closePath(); px2.fill();
      px2.restore();
    }
    px2.restore();
    const gp = px2.createRadialGradient(PX, PY, 0, PX, PY, 90);
    gp.addColorStop(0, `rgba(${T_WHITE},1)`); gp.addColorStop(0.4, `rgba(${T_RED},0.88)`); gp.addColorStop(1, `rgba(${T_EMBER},0)`);
    px2.fillStyle = gp; px2.beginPath(); px2.arc(PX, PY, 90, 0, Math.PI * 2); px2.fill();
    const pillar = bakeGlowColor(pil, [[12, 0.6], [4, 0.4]]);

    // ---------- 먼지바람 (옅은 회갈색, 보통으로) — 기존 그대로, 밀림/후딜 궤적용 ----------
    const du = mk(300, 300), dc = du.getContext('2d'); const DC = 150;
    for (let i = 0; i < 6; i++) { const r = R(70, 115), a = R(0.08, 0.16); dc.fillStyle = `rgba(168,146,120,${a})`; dc.beginPath(); dc.arc(DC + R(-24, 24), DC + R(-24, 24), r, 0, Math.PI * 2); dc.fill(); }
    const g5 = dc.createRadialGradient(DC, DC, 0, DC, DC, 135); g5.addColorStop(0, 'rgba(190,170,145,0.35)'); g5.addColorStop(1, 'rgba(190,170,145,0)');
    dc.fillStyle = g5; dc.beginPath(); dc.arc(DC, DC, 135, 0, Math.PI * 2); dc.fill();
    const dust = bakeSoft(du, 10);

    // ---------- 미리보기 ----------
    const pv = mk(900, 700), pc = pv.getContext('2d'); pc.fillStyle = '#17171b'; pc.fillRect(0, 0, 900, 700);
    pc.font = '13px sans-serif'; pc.fillStyle = '#aaa';
    const stamp = (img, x, y, label, lighter) => {
      pc.globalCompositeOperation = lighter ? 'lighter' : 'source-over';
      pc.drawImage(img, x, y);
      pc.globalCompositeOperation = 'source-over';
      pc.fillText(label, x, y + img.height + 14);
    };
    stamp(crater, 10, 10, 'crater', false);
    stamp(rocks, 150, 10, 'rocks', false);
    stamp(smoke2, 300, 10, 'smoke2', false);
    stamp(blast, 460, 10, 'blast', true);
    stamp(blastRed, 620, 10, 'blast_red', true);
    stamp(tint(shock, '#ff8a3c'), 10, 310, 'shock (tinted)', true);
    stamp(pillar, 310, 310, 'pillar', true);
    stamp(dust, 10, 500, 'dust', false);
    // 레이어 합성 샘플 (크레이터→연기→파편→번쩍임)
    pc.fillStyle = '#2a2a30'; pc.fillRect(200, 500, 280, 180);
    const sampleX = 200 + 140 - crater.width / 2, sampleY = 500 + 90 - crater.height / 2;
    pc.drawImage(crater, sampleX, sampleY);
    pc.drawImage(smoke2, 200 + 140 - smoke2.width / 2, 500 + 90 - smoke2.height + 40);
    pc.drawImage(rocks, sampleX, sampleY);
    pc.globalCompositeOperation = 'lighter';
    pc.drawImage(blast, sampleX, sampleY);
    pc.globalCompositeOperation = 'source-over';
    pc.fillText('layered sample (normal)', 200, 690);

    return {
      blast: blast.toDataURL(), blastRed: blastRed.toDataURL(), rocks: rocks.toDataURL(), smoke2: smoke2.toDataURL(),
      crater: crater.toDataURL(), shock: shock.toDataURL(), pillar: pillar.toDataURL(),
      dust: dust.toDataURL(), preview: pv.toDataURL(),
    };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('dmx_blast.png', res.blast);
  save('dmx_blast_red.png', res.blastRed);
  save('dmx_rocks.png', res.rocks);
  save('dmx_smoke2.png', res.smoke2);
  save('dmx_crater.png', res.crater);
  save('dmx_shock.png', res.shock);
  save('dmx_pillar.png', res.pillar);
  save('dmx_dust.png', res.dust);
  save('preview_dmx.png', res.preview);
  await b.close();
})();
