// 마법사 평타(마법빔) 그림 생성 (미리 구워두는 용도라 무거워도 됨)
// 진행 방향 = 오른쪽(+x), 머리(빛 구슬)가 오른쪽 끝. 꼬리는 왼쪽으로 길게.
// 결과: mage_bolt.png (게임용, 하늘색, 1/2 크기 800x120, 머리 x 740, 꼬리 x 20, 가운데 y 60, 'lighter'로 그림)
//       bolt_white.png (흰 원본), preview_*.png (확인용) → mage_bolt.png를 web/assets/에 복사
// 실행: node tools/mage_bolt_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    let seed = 4242;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const R = (a, b) => a + (b - a) * rnd();
    const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(); return (s - 2) / 0.58; };
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

    // ---------- 모양 (흰색으로 그림) ----------
    const W = 1600, H = 240, CY = H / 2;
    const HEAD = 1480, TAIL = 40;   // 머리 x, 꼬리 끝 x
    const L = HEAD - TAIL;
    const white = mk(W, H), c = white.getContext('2d');
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';

    // 선을 조각조각: f(u) → [x, y, 굵기, 밝기], u: 0(꼬리) → 1(머리)
    const path = (f, steps = 200) => {
      let prev = f(0);
      for (let k = 1; k <= steps; k++) {
        const cur = f(k / steps);
        const w = (prev[2] + cur[2]) / 2, a = (prev[3] + cur[3]) / 2;
        if (w > 0.1 && a > 0.003) {
          c.strokeStyle = `rgba(255,255,255,${Math.min(1, a)})`; c.lineWidth = w;
          c.lineCap = w > 3 ? 'butt' : 'round';
          c.beginPath(); c.moveTo(prev[0], prev[1]); c.lineTo(cur[0], cur[1]); c.stroke();
        }
        prev = cur;
      }
    };
    const xAt = (u) => TAIL + L * u;

    // 1) 빔 몸통: 꼬리는 가늘고 옅게, 머리 쪽으로 굵고 밝게
    path((u) => [xAt(u), CY, 2 + 14 * Math.pow(u, 1.6), 0.18 * Math.pow(u, 1.2)]);
    path((u) => [xAt(u), CY, 1 + 6 * Math.pow(u, 1.4), 0.5 * Math.pow(u, 1.0)]);
    path((u) => [xAt(u), CY, 0.6 + 2.4 * u, 0.95 * Math.pow(u, 0.7)]);

    // 2) 나선 두 가닥: 빔을 감고 돌며, 꼬리 쪽으로 갈수록 넓게 퍼지고 옅어진다
    for (const [phase, amp, a] of [[0, 1, 0.75], [Math.PI, 1, 0.75], [Math.PI / 2, 0.55, 0.35]]) {
      path((u) => {
        const spread = 6 + 20 * Math.pow(1 - u, 0.8) * amp;
        const twist = u * 26 + phase;
        // 앞뒤 깊이: 사인의 앞쪽(cos>0)일 때 더 밝게
        const depth = 0.55 + 0.45 * Math.cos(twist);
        return [xAt(u), CY + Math.sin(twist) * spread, 1.6 * depth + 0.4, a * depth * Math.pow(u, 0.9)];
      }, 500);
    }

    // 3) 마법 가루: 빔 주변의 작은 네 꼭지 별과 점 (머리 쪽에 많고, 꼬리 쪽은 바깥으로 퍼짐)
    const star = (x, y, r, a) => {
      c.fillStyle = `rgba(255,255,255,${a})`;
      c.beginPath();
      for (let k = 0; k < 8; k++) {
        const ang = k * Math.PI / 4, rr = k % 2 === 0 ? r : r * 0.25;
        c.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
      }
      c.closePath(); c.fill();
    };
    for (let i = 0; i < 110; i++) {
      const u = Math.pow(rnd(), 0.6);
      const spread = 6 + 34 * (1 - u);
      const x = xAt(u) + R(-10, 10), y = CY + gauss() * spread;
      const a = R(0.3, 1) * Math.pow(u, 0.8);
      if (rnd() < 0.35) star(x, y, R(3, 8) * (0.5 + u), a);
      else { c.fillStyle = `rgba(255,255,255,${a})`; c.beginPath(); c.arc(x, y, R(0.6, 2), 0, Math.PI * 2); c.fill(); }
    }

    // 4) 머리: 빛 구슬 + 십자 반짝임 + 작은 고리
    const head = (r, a) => {
      const g = c.createRadialGradient(HEAD, CY, 0, HEAD, CY, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.35, `rgba(255,255,255,${a * 0.55})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(HEAD, CY, r, 0, Math.PI * 2); c.fill();
    };
    head(46, 0.55); head(18, 1);
    path((u) => [HEAD - 70 + 140 * u, CY, 3 * Math.sin(Math.PI * u), Math.sin(Math.PI * u)], 60);       // 가로 반짝임
    path((u) => [HEAD, CY - 44 + 88 * u, 2.4 * Math.sin(Math.PI * u), 0.85 * Math.sin(Math.PI * u)], 60); // 세로 반짝임
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(HEAD - 6, CY, 9, 26, 0, 0, Math.PI * 2); c.stroke();   // 앞쪽 고리 (옆에서 본 원)
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.beginPath(); c.ellipse(HEAD - 40, CY, 7, 18, 0, 0, Math.PI * 2); c.stroke();  // 뒤쪽 작은 고리

    // ---------- 색 입히기 + 빛 번짐 ----------
    const colorize = (color) => {
      const t = mk(W, H), tx = t.getContext('2d');
      tx.drawImage(white, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = color; tx.fillRect(0, 0, W, H);
      const o = mk(W, H), x = o.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'lighter';
      for (const [blur, a] of [[24, 0.7], [8, 0.7], [2, 0.6]]) { x.filter = `blur(${blur}px)`; x.globalAlpha = a; x.drawImage(t, 0, 0); }
      x.filter = 'none'; x.globalAlpha = 1; x.drawImage(t, 0, 0);
      x.globalAlpha = 0.65; x.drawImage(white, 0, 0);
      return o;
    };
    const cyan = colorize('#64dcff'), red = colorize('#ff4d40'), blue = colorize('#3c8cff');

    // 미리보기 1: 원본 크게 (하늘색 / 빨강 / 파랑)
    const big = mk(W, H * 3 + 40), g1 = big.getContext('2d');
    g1.fillStyle = '#000'; g1.fillRect(0, 0, big.width, big.height);
    g1.drawImage(cyan, 0, 0); g1.drawImage(red, 0, H + 20); g1.drawImage(blue, 0, H * 2 + 40);

    // 미리보기 2: 게임 크기 — 지금 모습 vs 새 그림 (빔 꼬리 약 400px, 머리 지름 ~14px 정도)
    const k = 0.3; // 원본 → 게임 배율 (L 1440px → 약 430px)
    const game = mk(560, 150), g2 = game.getContext('2d');
    g2.fillStyle = '#1e1e24'; g2.fillRect(0, 0, 560, 150);
    // 지금 모습 (위): 하늘색 선(꼬리일수록 옅고 가늘게) + 흰 점
    const y0 = 40, hx = 500;
    for (let i = 0; i < 40; i++) {
      const t = (i + 1) / 40, x1 = hx - 430 + 430 * i / 40, x2 = hx - 430 + 430 * (i + 1) / 40;
      g2.strokeStyle = `rgba(100,220,255,${t})`; g2.lineWidth = Math.trunc(3 + 3 * t);
      g2.beginPath(); g2.moveTo(x1, y0); g2.lineTo(x2, y0); g2.stroke();
    }
    g2.fillStyle = '#fff'; g2.beginPath(); g2.arc(hx, y0, 6, 0, Math.PI * 2); g2.fill();
    // 새 그림 (아래)
    g2.save(); g2.globalCompositeOperation = 'lighter';
    g2.drawImage(cyan, hx - HEAD * k, 105 - CY * k, W * k, H * k);
    g2.restore();
    g2.fillStyle = '#ffe14d'; g2.font = '11px sans-serif'; g2.fillText('지금', 8, 16); g2.fillText('새 그림', 8, 82);
    const game4 = mk(2240, 600), g4 = game4.getContext('2d');
    g4.imageSmoothingEnabled = false; g4.drawImage(game, 0, 0, 2240, 600);

    // 게임용: 1/2 크기, 검은 배경 → 투명 (밝기 = 불투명도, 색은 그대로)
    const small = mk(W / 2, H / 2), sx = small.getContext('2d');
    sx.imageSmoothingQuality = 'high'; sx.drawImage(cyan, 0, 0, W / 2, H / 2);
    const d = sx.getImageData(0, 0, small.width, small.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const m = Math.max(px[i], px[i + 1], px[i + 2]);
      if (m === 0) { px[i + 3] = 0; continue; }
      px[i] = px[i] * 255 / m; px[i + 1] = px[i + 1] * 255 / m; px[i + 2] = px[i + 2] * 255 / m; px[i + 3] = m;
    }
    sx.putImageData(d, 0, 0);

    return { big: big.toDataURL('image/png'), game: game4.toDataURL('image/png'), white: white.toDataURL('image/png'), small: small.toDataURL('image/png') };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('preview_big.png', res.big); save('preview_game.png', res.game); save('bolt_white.png', res.white); save('mage_bolt.png', res.small);
  await b.close();
})();
