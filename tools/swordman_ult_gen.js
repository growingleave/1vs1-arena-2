// 검사 궁극기 그림 생성 (미리 구워두는 용도라 무거워도 됨): (1) 가볍게 돌진  (2) 확 베어버림
// 가는 가로줄 + 글리치(가로로 어긋난 띠, 색 번짐) / 화면을 가로지르는 긴 직선 칼자국 여러 개
// 색 번짐(빨강·청록)까지 구워야 해서 흰 그림에 색을 입히지 않고 팀 색(red/blue)별로 따로 만든다.
// 글리치 띠만 다른 그림을 2장씩 만들어 게임에서 번갈아 보여준다 (지지직 움직이는 느낌)
// 결과 (1/2 크기, 검은 배경 → 투명, 'lighter'로 그림):
//   swordman_ult_dash_{red,blue}_{0,1}.png (800x210, 길: x 60~690, 가운데 y 105)
//   swordman_ult_cut_{red,blue}_{0,1}.png  (800x400, 길: x 40~760, 가운데 y 200)
//   ult_concept_{red,blue}.png (확인용 원본 크기)
// 실행: node tools/swordman_ult_gen.js <저장할 폴더>  (Playwright 필요) → swordman_ult_*.png를 web/assets/에 복사
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname; // 저장할 폴더 (기본: 이 파일 옆)

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    let seed = 777;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const R = (a, b) => a + (b - a) * rnd();
    const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(); return (s - 2) / 0.58; };
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

    // 양끝이 가늘어지는 직선 (조각마다 굵기·밝기)
    const taperLine = (ctx, x0, y0, x1, y1, width, alpha, steps = 40, headBias = 0.5) => {
      for (let k = 0; k < steps; k++) {
        const u0 = k / steps, u1 = (k + 1) / steps, um = (u0 + u1) / 2;
        // headBias 쪽이 가장 두껍다
        const t = um < headBias ? um / headBias : (1 - um) / (1 - headBias);
        const w = width * Math.pow(Math.max(0, t), 0.6);
        if (w < 0.15) continue;
        ctx.strokeStyle = `rgba(255,255,255,${alpha * Math.pow(Math.max(0, t), 0.4)})`;
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(x0 + (x1 - x0) * u0, y0 + (y1 - y0) * u0); ctx.lineTo(x0 + (x1 - x0) * u1, y0 + (y1 - y0) * u1); ctx.stroke();
      }
    };

    // 흰 그림 → 색 입히고 색 번짐(빨강·청록을 좌우로 어긋나게) + 빛 번짐
    const colorize = (white, color, W, H, aberr = 4, glow = [[30, 0.5], [10, 0.6], [3, 0.5]]) => {
      const tint = (c) => { const t = mk(W, H), x = t.getContext('2d'); x.drawImage(white, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = c; x.fillRect(0, 0, W, H); return t; };
      const main = tint(color), red = tint('#ff3050'), cyan = tint('#30e0ff');
      const o = mk(W, H), x = o.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'lighter';
      for (const [blur, a] of glow) { x.filter = `blur(${blur}px)`; x.globalAlpha = a; x.drawImage(main, 0, 0); }
      x.filter = 'none';
      x.globalAlpha = 0.45; x.drawImage(red, -aberr, 0); x.drawImage(cyan, aberr, 0);
      x.globalAlpha = 1; x.drawImage(main, 0, 0);
      x.globalAlpha = 0.6; x.drawImage(white, 0, 0);
      x.globalAlpha = 1;
      return o;
    };

    // 글리치: 가로 띠를 몇 개 골라 옆으로 밀고, 그 띠만 색을 어긋나게
    const glitch = (src, W, H, count, maxShift, yRange) => {
      const o = mk(W, H), x = o.getContext('2d');
      x.drawImage(src, 0, 0);
      for (let i = 0; i < count; i++) {
        const h = R(2, 18), y = yRange[0] + R(0, yRange[1] - yRange[0]);
        const shift = (rnd() < 0.5 ? -1 : 1) * R(8, maxShift);
        x.drawImage(src, 0, y, W, h, shift, y, W, h);
        if (rnd() < 0.5) { // 띠 위에 얇은 밝은 줄
          x.globalCompositeOperation = 'lighter';
          x.fillStyle = `rgba(120,200,255,${R(0.05, 0.25)})`; x.fillRect(R(0, W * 0.5), y, R(100, W * 0.6), 1.5);
          x.globalCompositeOperation = 'source-over';
        }
      }
      return o;
    };

    // ===================== (1) 가볍게 돌진 =====================
    const W1 = 1600, H1 = 420, CY1 = 210, A0 = 120, A1 = 1380;
    const w1 = mk(W1, H1), c1 = w1.getContext('2d');
    c1.globalCompositeOperation = 'lighter'; c1.lineCap = 'round';
    // 가운데 아주 가는 주 선 (앞쪽이 밝음)
    taperLine(c1, A0, CY1, A1, CY1, 5, 1.0, 80, 0.85);
    // 나란한 가는 가로줄들
    for (let i = 0; i < 60; i++) {
      const y = CY1 + gauss() * 22;
      const x1 = R(A0 + 300, A1 - 20), len = R(150, 900);
      taperLine(c1, x1 - len, y, x1, y, R(0.6, 2.4), R(0.15, 0.6) * Math.exp(-Math.abs(y - CY1) / 30), 30, 0.75);
    }
    // 흐린 공기 띠
    c1.fillStyle = 'rgba(255,255,255,0.04)'; c1.fillRect(A0 + 200, CY1 - 10, A1 - A0 - 200, 20);
    // 작은 네모 픽셀 조각 (글리치 입자)
    for (let i = 0; i < 70; i++) {
      const x = R(A0 + 100, A1), y = CY1 + gauss() * 60, s = R(2, 6);
      c1.fillStyle = `rgba(255,255,255,${R(0.2, 0.8)})`; c1.fillRect(x, y, s, s);
    }
    // 앞끝 작은 섬광
    const fl = c1.createRadialGradient(A1, CY1, 0, A1, CY1, 40);
    fl.addColorStop(0, 'rgba(255,255,255,0.9)'); fl.addColorStop(1, 'rgba(255,255,255,0)');
    c1.fillStyle = fl; c1.beginPath(); c1.arc(A1, CY1, 40, 0, Math.PI * 2); c1.fill();

    // ===================== (2) 확 베어버림 =====================
    const W2 = 1600, H2 = 800, CY2 = 400, B0 = 80, B1 = 1520;
    const w2 = mk(W2, H2), c2 = w2.getContext('2d');
    c2.globalCompositeOperation = 'lighter'; c2.lineCap = 'round';
    // 길을 따라 굵은 빛 띠 (두께가 들쭉날쭉)
    for (let i = 0; i < 26; i++) {
      const off = gauss() * 16;
      taperLine(c2, B0, CY2 + off, B1, CY2 + off * 0.6, R(2, 10), R(0.15, 0.5), 60, R(0.35, 0.65));
    }
    taperLine(c2, B0, CY2, B1, CY2, 14, 1.0, 80, 0.55);
    // 화면을 가로지르는 긴 칼자국: 대부분 세로에 가깝게, 몇 개는 비스듬히. 일부는 두 줄
    const cuts = [];
    for (let i = 0; i < 16; i++) {
      const cx = R(B0 + 150, B1 - 150), cy = CY2 + gauss() * 40;
      const steep = rnd() < 0.65;
      const ang = steep ? Math.PI / 2 + R(-0.35, 0.35) : R(-0.45, 0.45) + (rnd() < 0.5 ? 0.12 : -0.12);
      const len = steep ? R(450, 820) : R(700, 1300);
      cuts.push({ cx, cy, ang, len });
      const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2;
      const head = R(0.35, 0.65), w = R(2, 5.5);
      taperLine(c2, cx - dx, cy - dy, cx + dx, cy + dy, w, 1.0, 60, head);
      if (rnd() < 0.55) { // 바로 옆에 얇은 두 번째 줄
        const nx = -Math.sin(ang) * R(5, 12), ny = Math.cos(ang) * R(5, 12);
        taperLine(c2, cx - dx * 0.9 + nx, cy - dy * 0.9 + ny, cx + dx * 0.9 + nx, cy + dy * 0.9 + ny, w * 0.5, 0.6, 60, head);
      }
    }
    // 칼자국 교차점 근처에서 튀는 길쭉한 파편 (유리 깨지듯)
    for (let i = 0; i < 160; i++) {
      const c = cuts[Math.floor(rnd() * cuts.length)];
      const along = R(-0.45, 0.45) * c.len;
      const x = c.cx + Math.cos(c.ang) * along + gauss() * 14, y = c.cy + Math.sin(c.ang) * along + gauss() * 14;
      const a = c.ang + R(-0.3, 0.3), l = R(6, 40), wd = R(0.8, 3);
      c2.save(); c2.translate(x, y); c2.rotate(a);
      c2.fillStyle = `rgba(255,255,255,${R(0.25, 0.85)})`;
      c2.beginPath(); c2.moveTo(l, 0); c2.lineTo(0, wd); c2.lineTo(-l * 0.4, 0); c2.lineTo(0, -wd); c2.closePath(); c2.fill();
      c2.restore();
    }
    // 네모 픽셀 조각 + 반짝이는 점
    for (let i = 0; i < 140; i++) {
      const x = R(B0, B1), y = CY2 + gauss() * 160, s = R(2, 7);
      c2.fillStyle = `rgba(255,255,255,${R(0.15, 0.7)})`; c2.fillRect(x, y, s, s);
    }
    // 가운데 큰 섬광
    const f2 = c2.createRadialGradient(W2 * 0.62, CY2, 0, W2 * 0.62, CY2, 220);
    f2.addColorStop(0, 'rgba(255,255,255,0.35)'); f2.addColorStop(1, 'rgba(255,255,255,0)');
    c2.fillStyle = f2; c2.fillRect(0, 0, W2, H2);

    // 검은 배경 그림 → 1/2 크기 + 투명 배경 (밝기 = 불투명도, 색은 그대로). 'lighter'로 그리면 원래 모습이 된다
    const toGame = (src, W, H) => {
      const c = mk(W / 2, H / 2), x = c.getContext('2d');
      x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, W / 2, H / 2);
      const d = x.getImageData(0, 0, c.width, c.height), px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        const m = Math.max(px[i], px[i + 1], px[i + 2]);
        if (m === 0) { px[i + 3] = 0; continue; }
        px[i] = px[i] * 255 / m; px[i + 1] = px[i + 1] * 255 / m; px[i + 2] = px[i + 2] * 255 / m; px[i + 3] = m;
      }
      x.putImageData(d, 0, 0);
      return c.toDataURL('image/png');
    };

    // ---------- 색 입히기 + 글리치 ----------
    const out = {};
    for (const [name, color] of [['blue', '#2f8cff'], ['red', '#ff4d40']]) {
      const dBase = colorize(w1, color, W1, H1, 4), kBase = colorize(w2, color, W2, H2, 7, [[50, 0.55], [16, 0.6], [4, 0.5]]);
      for (let f = 0; f < 2; f++) {
        out[`swordman_ult_dash_${name}_${f}.png`] = toGame(glitch(dBase, W1, H1, 16, 40, [CY1 - 60, CY1 + 60]), W1, H1);
        out[`swordman_ult_cut_${name}_${f}.png`] = toGame(glitch(kBase, W2, H2, 18, 80, [CY2 - 120, CY2 + 120]), W2, H2);
      }
      const d = glitch(dBase, W1, H1, 16, 40, [CY1 - 60, CY1 + 60]);
      const k = glitch(kBase, W2, H2, 18, 80, [CY2 - 120, CY2 + 120]);
      // 두 장면을 한 장에
      const sheet = mk(1600, H1 + H2 + 60), s = sheet.getContext('2d');
      s.fillStyle = '#000'; s.fillRect(0, 0, sheet.width, sheet.height);
      s.drawImage(d, 0, 0); s.drawImage(k, 0, H1 + 60);
      s.fillStyle = '#ffe14d'; s.font = 'bold 34px sans-serif';
      s.fillText('1) 가볍게 돌진', 24, 48); s.fillText('2) 확 베어버림', 24, H1 + 60 + 48);
      out[`ult_concept_${name}.png`] = sheet.toDataURL('image/png');
    }
    return out;
  });
  for (const [n, u] of Object.entries(res)) fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  await b.close();
})();
