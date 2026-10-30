// 검사 스킬 1(돌진 베기) 이미지 생성 — 초안 (미리 구워두는 용도라 무거워도 됨)
// 진행 방향 = 오른쪽(+x). 흰색 그림 + 투명 배경으로 저장 (게임에서 색을 입힘)
// 돌진 거리 약 216px(18px x 12틱) + 판정 60x60 → 그림 가로:세로 = 3:1 정도
// 결과: dash_white.png (원본 1500x500), swordman_dash.png (1/4 축소본), preview_*.png (확인용)
// 실행: node tools/swordman_dash_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname; // 저장할 폴더 (기본: 이 파일 옆)

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    // ---------- 도구 ----------
    let seed = 1106;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const R = (a, b) => a + (b - a) * rnd();
    const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(); return (s - 2) / 0.58; }; // 대략 평균 0, 표준편차 1
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const noise1 = () => { const k = []; for (let i = 0; i < 6; i++) k.push([R(2, 14), R(0, 6.28), R(0.2, 1)]); return (u) => { let s = 0, n = 0; for (const [f, ph, a] of k) { s += Math.sin(u * f + ph) * a; n += a; } return 0.5 + 0.5 * s / n; }; };

    // ---------- 모양 ----------
    const W = 1500, H = 500, CY = H / 2;
    const X0 = 140, X1 = 1300;       // 베기 선의 뒤끝 ~ 앞끝
    const FRONT = 1180;              // 가장 두꺼운 곳 (앞쪽에 치우침)
    const LEN = X1 - X0;

    const layer = mk(W, H), lx = layer.getContext('2d');
    lx.globalCompositeOperation = 'lighter';
    lx.lineCap = 'round';

    // 선 하나를 조각조각 그리기: f(u) → [x, y, 굵기, 밝기] (u: 0 → 1)
    const drawPath = (ctx, f, steps = 120) => {
      let prev = f(0);
      for (let k = 1; k <= steps; k++) {
        const cur = f(k / steps);
        const w = (prev[2] + cur[2]) / 2, a = (prev[3] + cur[3]) / 2;
        if (w > 0.1 && a > 0.003) {
          ctx.strokeStyle = `rgba(255,255,255,${clamp(a, 0, 1)})`;
          ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(cur[0], cur[1]); ctx.stroke();
        }
        prev = cur;
      }
    };

    // 두께 모양: 뒤끝은 길게 가늘어지고, 앞은 짧고 날카롭게 끝난다 (방추형)
    const spindle = (x) => {
      if (x < X0 || x > X1) return 0;
      if (x < FRONT) return Math.pow((x - X0) / (FRONT - X0), 1.6);
      return Math.pow(1 - (x - FRONT) / (X1 - FRONT), 0.7);
    };

    // 1) 속도선: 베기 선 위아래로 퍼진 가로줄 (뒤로 갈수록 흐려짐)
    for (let i = 0; i < 520; i++) {
      const y = CY + gauss() * R(30, 80);
      const dist = Math.abs(y - CY);
      const xEnd = R(X0 + LEN * 0.35, X1 - 40) - dist * 0.8;   // 바깥쪽 줄일수록 앞이 짧다
      const len = R(120, 700) * (1 - dist / 260);
      if (len < 30) continue;
      const a0 = R(0.04, 0.22) * Math.exp(-dist / 90);
      const w0 = R(0.6, 2.6) * Math.exp(-dist / 140);
      const nz = noise1();
      drawPath(lx, (u) => [xEnd - len * (1 - u), y, w0 * (0.3 + 0.7 * u), a0 * Math.pow(u, 1.4) * (0.4 + 0.6 * nz(u))], 30);
    }

    // 2) 공기를 가르는 결: 선을 따라 아주 살짝 벌어지는 두 겹의 얇은 곡선 (위/아래)
    for (const side of [-1, 1]) {
      for (let j = 0; j < 14; j++) {
        const spread = R(6, 46), bow = R(0.6, 1.4), a = R(0.08, 0.3) * (1 - spread / 60);
        const nz = noise1();
        drawPath(lx, (u) => {
          const x = X0 + LEN * 0.15 + (X1 - 30 - X0 - LEN * 0.15) * u;
          const open = Math.pow(1 - u, bow);                    // 앞에서 모이고 뒤로 벌어짐
          return [x, CY + side * spread * open, R(0.8, 1.6), a * Math.sin(Math.PI * Math.min(1, u * 1.1)) * (0.4 + 0.6 * nz(u))];
        }, 160);
      }
    }

    // 3) 몸통: 방추형 빛 덩어리 (여러 층으로 쌓아 가운데가 진하게)
    for (let i = 0; i < 40; i++) {
      const s = i / 40; // 0: 바깥 층, 1: 가운데
      const half = 24 * (1 - s);
      drawPath(lx, (u) => {
        const x = X0 + LEN * u, sp = spindle(x);
        return [x, CY, Math.max(0.5, 2 * half * sp), 0.012 + 0.022 * s * sp];
      }, 200);
    }

    // 4) 몸통 안 붓결: 선과 나란한 가는 줄 (앞쪽이 밝게)
    for (let i = 0; i < 260; i++) {
      const off = gauss() * 9;
      const xs = R(X0, FRONT), len = R(150, 700);
      const nz = noise1();
      const a0 = R(0.05, 0.3), w0 = R(0.5, 2.2);
      drawPath(lx, (u) => {
        const x = xs + len * u - len * 0.5;
        const sp = spindle(x);
        return [x, CY + off * sp, w0, a0 * sp * Math.sin(Math.PI * u) * (0.3 + 0.7 * nz(u))];
      }, 40);
    }

    // 5) 앞쪽 공기 파동: 앞끝 조금 뒤에서 앞으로 볼록한 얇은 초승달 2개
    for (const [cx, r, a] of [[X1 - 70, 75, 0.55], [X1 - 170, 100, 0.3], [X1 - 290, 125, 0.14]]) {
      drawPath(lx, (u) => {
        const t = -1 + 2 * u, ang = t * 1.05;
        const x = cx + (Math.cos(ang) - 1) * r * 0.9, y = CY + Math.sin(ang) * r;
        return [x, y, 4 * Math.pow(1 - t * t, 1.3), a * Math.pow(1 - t * t, 0.6)];
      }, 80);
    }

    // 6) 출발점 충격파: 뒤끝 근처의 납작한 타원 고리 + 흙먼지 같은 점들
    for (const [rx, ry, a, w] of [[46, 110, 0.35, 5], [70, 150, 0.16, 3]]) {
      const cx = X0 + 120;
      drawPath(lx, (u) => {
        const ang = Math.PI / 2 + Math.PI * u;                  // 왼쪽 반만 (뒤쪽으로 퍼짐)
        return [cx + Math.cos(ang) * rx, CY + Math.sin(ang) * ry, w * Math.sin(Math.PI * u), a * Math.sin(Math.PI * u)];
      }, 60);
    }
    for (let i = 0; i < 160; i++) {
      const ang = Math.PI + gauss() * 0.9, dist = R(20, 200);
      const x = X0 + 130 + Math.cos(ang) * dist * 0.6, y = CY + Math.sin(ang) * dist;
      const r = R(0.8, 3) * (1 - dist / 260);
      lx.fillStyle = `rgba(255,255,255,${R(0.08, 0.4) * (1 - dist / 220)})`;
      lx.beginPath(); lx.arc(x, y, Math.max(0.3, r), 0, 6.283); lx.fill();
    }

    // 7) 선을 따라 튀는 파편: 뒤쪽 바깥으로 비스듬히 날아가는 길쭉한 조각
    for (let i = 0; i < 70; i++) {
      const x0 = R(X0 + LEN * 0.3, X1 - 60), side = rnd() < 0.5 ? -1 : 1;
      const ang = Math.PI + side * R(0.15, 0.6);
      const dist = R(10, 110);
      const x = x0 + Math.cos(ang) * dist, y = CY + side * R(4, 14) + Math.sin(ang) * dist;
      const sz = R(2, 6) * (1 - dist / 150);
      lx.save(); lx.translate(x, y); lx.rotate(ang);
      lx.fillStyle = `rgba(255,255,255,${R(0.3, 0.85) * (1 - dist / 140)})`;
      lx.beginPath(); lx.moveTo(sz * 3, 0); lx.lineTo(0, sz * 0.45); lx.lineTo(-sz * 3, 0); lx.lineTo(0, -sz * 0.45); lx.closePath(); lx.fill();
      lx.restore();
    }

    // 8) 칼날 선: 가장 밝고 날카로운 한 줄 + 아주 살짝 어긋난 두 번째 베기
    const edge = mk(W, H), ex = edge.getContext('2d');
    ex.globalCompositeOperation = 'lighter';
    ex.lineCap = 'round';
    const blade = (tilt, offset, wMul, a) => drawPath(ex, (u) => {
      const x = X0 + LEN * u, sp = spindle(x);
      return [x, CY + offset + (x - FRONT) * tilt, wMul * sp, a * Math.pow(sp, 0.5)];
    }, 240);
    blade(0, 0, 11, 0.3);
    blade(0, 0, 4.5, 0.75);
    blade(0, 0, 1.8, 1.0);
    blade(-0.035, -3, 3, 0.55);   // 비스듬한 두 번째 칼자국
    blade(0.02, 4, 2, 0.35);      // 세 번째 (더 옅게)

    // ---------- 합치기 + 빛 번짐 ----------
    const out = mk(W, H), o = out.getContext('2d');
    o.fillStyle = '#000'; o.fillRect(0, 0, W, H);
    o.globalCompositeOperation = 'lighter';
    const glowSrc = mk(W, H), gx = glowSrc.getContext('2d');
    gx.drawImage(layer, 0, 0); gx.drawImage(edge, 0, 0);
    for (const [blur, a] of [[50, 0.45], [18, 0.45], [6, 0.4]]) {
      o.filter = `blur(${blur}px)`; o.globalAlpha = a; o.drawImage(glowSrc, 0, 0);
    }
    o.filter = 'none'; o.globalAlpha = 1;
    o.drawImage(layer, 0, 0);
    o.drawImage(edge, 0, 0);

    const d = o.getImageData(0, 0, W, H), px = d.data;
    for (let i = 0; i < W * H; i++) {
      const l = 0.85 * Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) / 255;
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = 255;
      px[i * 4 + 3] = Math.round(clamp(l, 0, 1) * 255);
    }
    const white = mk(W, H); white.getContext('2d').putImageData(d, 0, 0);

    // ---------- 미리보기 ----------
    const tint = (color) => { const c = mk(W, H), x = c.getContext('2d'); x.drawImage(white, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, W, H); return c; };
    const red = tint('#ff4d40'), blue = tint('#3c8cff');
    const drawFx = (ctx, img, x, y, w, h, rot = 0) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.globalAlpha = 0.55; ctx.drawImage(white, -w / 2, -h / 2, w, h); ctx.restore();
    };
    const big = mk(W + 40, H * 3 + 80), g1 = big.getContext('2d');
    g1.fillStyle = '#141419'; g1.fillRect(0, 0, big.width, big.height);
    g1.drawImage(white, 20, 20);
    drawFx(g1, red, 20 + W / 2, 40 + H * 1.5, W, H);
    drawFx(g1, blue, 20 + W / 2, 60 + H * 2.5, W, H);

    // 게임 크기: 베기 선 길이(X0~X1) ≈ 돌진 거리 216px + 판정 60 → 약 1/4.2
    const k = 276 / LEN;
    const gw = W * k, gh = H * k;
    const game = mk(420, 160), g2 = game.getContext('2d');
    g2.fillStyle = '#1e1e24'; g2.fillRect(0, 0, 420, 160);
    // 출발 위치(옅은 네모) → 도착 위치(플레이어)
    const startX = 60, endX = startX + 216;
    g2.strokeStyle = 'rgba(255,255,255,0.25)'; g2.strokeRect(startX - 20, 60, 40, 40);
    // 그림 앞끝(X1)이 판정 앞쪽(도착 위치 + 30)에 오게
    const imgCenterX = (endX + 30) - (X1 - W / 2) * k;
    drawFx(g2, red, imgCenterX, 80, gw, gh);
    g2.fillStyle = '#e63c3c'; g2.fillRect(endX - 20, 60, 40, 40);
    g2.strokeStyle = 'rgba(255,255,255,0.35)'; g2.strokeRect(endX - 30, 50, 60, 60); // 판정 60x60
    const game4 = mk(1680, 640), g4 = game4.getContext('2d');
    g4.imageSmoothingEnabled = false; g4.drawImage(game, 0, 0, 1680, 640);

    const small = mk(W / 4, H / 4), sx = small.getContext('2d');
    sx.imageSmoothingQuality = 'high'; sx.drawImage(white, 0, 0, W / 4, H / 4);
    return { small: small.toDataURL('image/png'), white: white.toDataURL('image/png'), big: big.toDataURL('image/png'), game: game4.toDataURL('image/png') };
  });
  const save = (name, url) => fs.writeFileSync(`${OUT}/${name}`, Buffer.from(url.split(',')[1], 'base64'));
  save('swordman_dash.png', res.small); save('dash_white.png', res.white);
  save('preview_big.png', res.big); save('preview_game.png', res.game);
  await b.close();
})();
