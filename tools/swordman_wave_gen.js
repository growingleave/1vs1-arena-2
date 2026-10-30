// 검사 스킬 2 검기 이미지 생성 (미리 구워두는 용도라 무거워도 됨)
// 진행 방향 = 오른쪽(+x). 흰색 그림 + 투명 배경으로 저장 (게임에서 색을 입힘)
// 결과: wave_white.png (원본 800x1024), preview_*.png (확인용)
// swordman_wave.png (1/4 축소본)를 web/assets/에 복사해서 쓴다. 크기·앞날 위치를 바꾸면 swordman.js의 SWORDMAN_WAVE_* 도 맞출 것 (그림 크기는 판정 크기를 따라감)
// 실행: node tools/swordman_wave_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname; // 저장할 폴더 (기본: 이 파일 옆)

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    // ---------- 도구 ----------
    let seed = 20261106;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const R = (a, b) => a + (b - a) * rnd();
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    // 1차원 부드러운 노이즈 (줄무늬의 밝기 얼룩용)
    const noise1 = () => { const k = []; for (let i = 0; i < 6; i++) k.push([R(2, 14), R(0, 6.28), R(0.2, 1)]); return (u) => { let s = 0, n = 0; for (const [f, ph, a] of k) { s += Math.sin(u * f + ph) * a; n += a; } return 0.5 + 0.5 * s / n; }; };

    // ---------- 모양 ----------
    // 그림 크기: 세로(진행 방향과 수직) 1024, 가로 800. 판정 60x15 → 1px당 약 1/15
    const W = 900, H = 1024, CY = H / 2;
    const SPAN = 470;       // 위아래 끝까지 거리
    const TIP_X = 280;      // 양 끝(뒤로 휘어진 끝) x
    const DEPTH = 500;      // 앞으로 볼록한 정도 → 가운데 앞날 x = 780
    const THICK = 300;      // 가운데 두께
    // t: -1(위 끝) ~ 1(아래 끝)
    const frontX = (t) => TIP_X + DEPTH * Math.pow(1 - t * t, 0.75);
    const thick = (t) => THICK * Math.pow(Math.max(0, 1 - t * t), 1.3);
    const yAt = (t) => CY + t * SPAN;
    // 앞날 기준 s(0=앞날, 1=뒷면) 위치의 점
    const pt = (t, s) => [frontX(t) - s * thick(t), yAt(t)];

    const body = mk(W, H), bx = body.getContext('2d');
    bx.globalCompositeOperation = 'lighter';
    bx.lineCap = 'round';

    // 1) 몸통 바탕: 앞날에서 뒤로 갈수록 어두워지는 띠 (얇은 층을 여러 겹)
    for (let i = 0; i < 90; i++) {
      const s = i / 90;
      bx.beginPath();
      for (let k = 0; k <= 200; k++) { const t = -1 + 2 * k / 200; const [x, y] = pt(t, s); k ? bx.lineTo(x, y) : bx.moveTo(x, y); }
      bx.strokeStyle = `rgba(255,255,255,${0.05 * Math.exp(-1.6 * s)})`;
      bx.lineWidth = 3;
      bx.stroke();
    }

    // 2) 붓결 줄무늬: 앞날과 나란한 가는 선 수백 개 (길이·굵기·밝기 제각각)
    const strokeCurve = (s, t0, t1, width, alpha, wobbleAmp) => {
      const nz = noise1(), wob = noise1();
      const steps = Math.max(8, Math.round(Math.abs(t1 - t0) * 160));
      for (let k = 0; k < steps; k++) {
        const u0 = k / steps, u1 = (k + 1) / steps;
        const ta = t0 + (t1 - t0) * u0, tb = t0 + (t1 - t0) * u1;
        const sa = s + (wob(u0) - 0.5) * wobbleAmp, sb = s + (wob(u1) - 0.5) * wobbleAmp;
        const [xa, ya] = pt(ta, sa), [xb, yb] = pt(tb, sb);
        const taper = Math.sin(Math.PI * (u0 + u1) / 2);           // 선 양끝은 가늘고 흐리게
        const edgeFade = Math.pow(1 - Math.abs((ta + tb) / 2), 0.35); // 칼 끝으로 갈수록 흐리게
        bx.strokeStyle = `rgba(255,255,255,${alpha * taper * edgeFade * (0.35 + 0.65 * nz(u0))})`;
        bx.lineWidth = Math.max(0.4, width * (0.4 + 0.6 * taper));
        bx.beginPath(); bx.moveTo(xa, ya); bx.lineTo(xb, yb); bx.stroke();
      }
    };
    for (let i = 0; i < 700; i++) {
      const s = Math.pow(rnd(), 1.15);                    // 앞날 쪽에 살짝 몰리게
      const len = R(0.25, 1.4) * (1 - 0.5 * s);
      const mid = R(-0.85, 0.85);
      const t0 = clamp(mid - len / 2, -0.98, 0.98), t1 = clamp(mid + len / 2, -0.98, 0.98);
      const bright = Math.exp(-1.3 * s);
      strokeCurve(s, t0, t1, R(0.6, 3.2) * (1.2 - s), R(0.1, 0.38) * bright, 0.05);
    }
    // 굵고 진한 결 몇 개 (그림에 힘을 줌)
    for (let i = 0; i < 26; i++) {
      const s = R(0.02, 0.45);
      const mid = R(-0.5, 0.5), len = R(0.6, 1.3);
      strokeCurve(s, clamp(mid - len / 2, -0.95, 0.95), clamp(mid + len / 2, -0.95, 0.95), R(4, 9), R(0.18, 0.35) * Math.exp(-1.8 * s), 0.03);
    }

    // 3) 뒤로 흩날리는 꼬리: 뒷면에서 진행 반대쪽(왼쪽)으로 뻗는 가는 선
    for (let i = 0; i < 420; i++) {
      const t = R(-0.92, 0.92) * Math.pow(rnd(), 0.15);
      const s = R(0.55, 1.0);
      const [x0, y0] = pt(t, s);
      const len = R(80, 380) * Math.pow(1 - t * t, 0.6) + R(20, 60);
      const bend = t * R(10, 60);                          // 끝 쪽 꼬리는 바깥으로 살짝 휨
      const a0 = (rnd() < 0.2 ? R(0.25, 0.5) : R(0.06, 0.2)) * Math.pow(1 - Math.abs(t), 0.5);
      const segs = 24;
      for (let k = 0; k < segs; k++) {
        const u0 = k / segs, u1 = (k + 1) / segs;
        const xa = x0 - len * u0, ya = y0 + bend * u0 * u0;
        const xb = x0 - len * u1, yb = y0 + bend * u1 * u1;
        bx.strokeStyle = `rgba(255,255,255,${a0 * Math.pow(1 - u0, 1.8)})`;
        bx.lineWidth = R(0.5, 2.2) * (1 - u0 * 0.7);
        bx.beginPath(); bx.moveTo(xa, ya); bx.lineTo(xb, yb); bx.stroke();
      }
    }

    // 4) 안쪽 기운 입자: 몸통 안에 반짝이는 작은 점들
    for (let i = 0; i < 700; i++) {
      const t = R(-0.9, 0.9), s = Math.pow(rnd(), 1.3) * 1.1;
      const [x, y] = pt(t, s);
      const r = R(0.6, 2.4) * (1 - 0.5 * s);
      const g = bx.createRadialGradient(x, y, 0, x, y, r * 3);
      const a = R(0.15, 0.6) * Math.exp(-2 * s) * Math.pow(1 - Math.abs(t), 0.4);
      g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      bx.fillStyle = g; bx.beginPath(); bx.arc(x, y, r * 3, 0, 6.283); bx.fill();
    }

    // 5) 칼끝 파편: 양 끝에서 뒤쪽으로 튀는 길쭉한 마름모
    for (let i = 0; i < 46; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const t = side * R(0.72, 0.97);
      const [x0, y0] = pt(t, R(0, 0.6));
      const ang = Math.PI + side * R(0.15, 0.9);          // 뒤쪽 + 바깥쪽
      const dist = R(10, 120);
      const x = x0 + Math.cos(ang) * dist, y = y0 + Math.sin(ang) * dist;
      const sz = R(2, 7) * (1 - dist / 160);
      bx.save(); bx.translate(x, y); bx.rotate(ang);
      bx.fillStyle = `rgba(255,255,255,${R(0.35, 0.9) * (1 - dist / 150)})`;
      bx.beginPath(); bx.moveTo(sz * 2.6, 0); bx.lineTo(0, sz * 0.5); bx.lineTo(-sz * 2.6, 0); bx.lineTo(0, -sz * 0.5); bx.closePath(); bx.fill();
      bx.restore();
    }

    // 6) 앞날: 가장 밝은 날카로운 선 (가운데 굵고 끝으로 갈수록 바늘처럼)
    const edge = mk(W, H), ex = edge.getContext('2d');
    ex.globalCompositeOperation = 'lighter';
    ex.lineCap = 'round';
    const drawEdge = (ctx, widthMul, alpha, inset, mottle = 0) => {
      const n = 240, nz = noise1();
      for (let k = 0; k < n; k++) {
        const ta = -1 + 2 * k / n, tb = -1 + 2 * (k + 1) / n, tm = (ta + tb) / 2;
        const [xa, ya] = pt(ta, inset), [xb, yb] = pt(tb, inset);
        const w = widthMul * Math.pow(1 - tm * tm, 1.1);
        if (w < 0.15) continue;
        ctx.strokeStyle = `rgba(255,255,255,${alpha * (1 - mottle + mottle * nz((tm + 1) / 2)) * Math.pow(1 - Math.abs(tm), 0.25)})`;
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
      }
    };
    drawEdge(ex, 26, 0.22, 0.05, 0.7);
    drawEdge(ex, 13, 0.45, 0.02, 0.5);
    drawEdge(ex, 6, 0.9, 0.0);
    drawEdge(ex, 2, 1.0, -0.003);

    // 7) 잔상: 조금 뒤에 옅고 가는 초승달 두 개 (빠르게 날아가는 느낌)
    for (const [back, a, w] of [[60, 0.45, 9], [130, 0.32, 7], [210, 0.18, 5]]) {
      const n = 200, nz = noise1();
      for (let k = 0; k < n; k++) {
        const ta = -0.92 + 1.84 * k / n, tb = -0.92 + 1.84 * (k + 1) / n, tm = (ta + tb) / 2;
        const [xa, ya] = pt(ta, 0), [xb, yb] = pt(tb, 0);
        const shrink = 1 - back / 900;                  // 뒤쪽 잔상은 살짝 작게
        ex.strokeStyle = `rgba(255,255,255,${a * (0.4 + 0.6 * nz(k / n)) * Math.pow(1 - tm * tm, 0.8)})`;
        ex.lineWidth = w * Math.pow(1 - tm * tm, 1.2);
        ex.beginPath();
        ex.moveTo(xa - back, CY + (ya - CY) * shrink); ex.lineTo(xb - back, CY + (yb - CY) * shrink); ex.stroke();
      }
    }

    // ---------- 합치기 + 빛 번짐(블룸) ----------
    const out = mk(W, H), o = out.getContext('2d');
    o.fillStyle = '#000'; o.fillRect(0, 0, W, H);
    o.globalCompositeOperation = 'lighter';
    const glowSrc = mk(W, H), gx = glowSrc.getContext('2d');
    gx.drawImage(body, 0, 0); gx.drawImage(edge, 0, 0);
    for (const [blur, a] of [[60, 0.4], [24, 0.35], [8, 0.3]]) {
      o.filter = `blur(${blur}px)`; o.globalAlpha = a; o.drawImage(glowSrc, 0, 0);
    }
    o.filter = 'none'; o.globalAlpha = 1;
    o.drawImage(body, 0, 0);
    o.drawImage(edge, 0, 0);

    // 밝기 → 불투명도 (흰색 + 투명 배경)
    const d = o.getImageData(0, 0, W, H), px = d.data;
    for (let i = 0; i < W * H; i++) {
      const l = 0.8 * Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) / 255; // 살짝 낮춰 앞날이 하얗게 뭉치지 않게
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 255;
      px[i * 4 + 3] = Math.round(clamp(l, 0, 1) * 255);
    }
    const white = mk(W, H); white.getContext('2d').putImageData(d, 0, 0);

    // ---------- 미리보기 ----------
    // 게임과 같은 방식: 색 입힌 그림 + 흰 그림 0.55를 'lighter'로 겹침
    const tint = (color) => { const c = mk(W, H), x = c.getContext('2d'); x.drawImage(white, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, W, H); return c; };
    const red = tint('#ff4d40'), blue = tint('#3c8cff');
    const drawFx = (ctx, img, x, y, w, h, rot) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.globalAlpha = 0.55; ctx.drawImage(white, -w / 2, -h / 2, w, h); ctx.restore();
    };
    // (1) 흰색 원본 크게 + (2) 빨강 + (3) 파랑
    const big = mk(W * 3 + 80, H + 40), g1 = big.getContext('2d');
    g1.fillStyle = '#141419'; g1.fillRect(0, 0, big.width, big.height);
    g1.drawImage(white, 20, 20);
    drawFx(g1, red, 20 + W * 1.5 + 20, 20 + H / 2, W, H, 0);
    drawFx(g1, blue, 20 + W * 2.5 + 40, 20 + H / 2, W, H, 0);

    // (4) 게임 크기: 판정 15x60에 맞춰 이미지 세로 = 60 * (1024/940) ≈ 65px, 실제 화면 그대로 4배 확대해서 보여줌
    const scaleImg = 65 / H; // 화면 px / 이미지 px
    const gw = W * scaleImg, gh = H * scaleImg;
    const game = mk(360, 200), g2 = game.getContext('2d');
    g2.fillStyle = '#1e1e24'; g2.fillRect(0, 0, 360, 200);
    // 플레이어(40x40 빨강) + 검기 3개 (진행 방향: 오른쪽, 위, 대각선)
    g2.fillStyle = '#e63c3c'; g2.fillRect(30, 80, 40, 40);
    const shots = [[170, 100, 0], [110, 40, -Math.PI / 2], [270, 150, Math.PI / 5]];
    for (const [x, y, rot] of shots) {
      // 이미지 가운데 = 몸통 가운데쯤이 판정 중심에 오도록 오른쪽으로 약간 밀어 그림
      drawFx(g2, red, x, y, gw, gh, rot);
      // 판정 사각형 (옅은 선)
      g2.save(); g2.translate(x, y); g2.rotate(rot); g2.strokeStyle = 'rgba(255,255,255,0.35)'; g2.lineWidth = 1;
      g2.strokeRect(-7.5 + (TIP_X + DEPTH - 7.5 * 940 / 60 - W / 2) * scaleImg, -30, 15, 60); g2.restore();
    }
    const game4 = mk(1440, 800), g4 = game4.getContext('2d');
    g4.imageSmoothingEnabled = false; g4.drawImage(game, 0, 0, 1440, 800);

    // 게임용 축소본 (1/4)
    const small = mk(W / 4, H / 4), sx = small.getContext('2d');
    sx.imageSmoothingQuality = 'high'; sx.drawImage(white, 0, 0, W / 4, H / 4);
    return { small: small.toDataURL('image/png'), white: white.toDataURL('image/png'), big: big.toDataURL('image/png'), game: game4.toDataURL('image/png'), size: [W, H] };
  });
  const save = (name, url) => fs.writeFileSync(`${OUT}/${name}`, Buffer.from(url.split(',')[1], 'base64'));
  save('swordman_wave.png', res.small); save('wave_white.png', res.white); save('preview_big.png', res.big); save('preview_game.png', res.game);
  console.log(res.size);
  await b.close();
})();
