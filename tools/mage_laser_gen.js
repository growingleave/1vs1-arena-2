// 마법사 스킬 1(관통 레이저) 그림 생성 (미리 구워두는 용도라 무거워도 됨)
// 진행 방향 = 오른쪽(+x). 왼쪽 끝(쏜 자리)에 옆에서 본 마법진, 오른쪽 끝은 가늘어지며 사라진다.
// 나선·반짝이만 다른 2장을 만들어 게임에서 번갈아 보여준다 (일렁이는 느낌)
// 결과: mage_laser_{0,1}.png (게임용, 보라, 1000x120 = 게임 레이저 길이 1000·폭 40에 맞춤, 'lighter'로 그림)
//       preview_laser.png (확인용) → mage_laser_*.png를 web/assets/에 복사
// 실행: node tools/mage_laser_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    let seed = 777;
    const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const R = (a, b) => a + (b - a) * rnd();
    const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(); return (s - 2) / 0.58; };
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const noise1 = () => { const k = []; for (let i = 0; i < 6; i++) k.push([R(4, 30), R(0, 6.28), R(0.2, 1)]); return (u) => { let s = 0, n = 0; for (const [f, ph, a] of k) { s += Math.sin(u * f + ph) * a; n += a; } return 0.5 + 0.5 * s / n; }; };

    // 원본 크기 2000x240 (게임에선 1/2 → 1000x120). 레이저 폭 40(게임) = 80(원본)
    const W = 2000, H = 240, CY = H / 2, HALF = 40;
    const X0 = 30, X1 = W - 10; // 레이저 시작·끝

    // 레이저 끝 모양: 시작은 마법진에서 바로 굵게, 끝 10%에서 가늘어진다
    const shape = (x) => {
      const u = (x - X0) / (X1 - X0);
      if (u < 0 || u > 1) return 0;
      const start = Math.min(1, u / 0.015);
      const end = u > 0.88 ? Math.pow(1 - (u - 0.88) / 0.12, 0.7) : 1;
      return start * end;
    };

    const draw = (c, frame) => {
      c.globalCompositeOperation = 'lighter';
      const path = (f, steps = 400) => {
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
      const xAt = (u) => X0 + (X1 - X0) * u;

      // 1) 몸통: 가장자리가 일렁이는 띠 (면으로 채움, 여러 겹)
      const edgeN = noise1();
      for (let i = 0; i < 16; i++) {
        const s = i / 16, half = HALF * (1.15 - s);
        c.beginPath();
        for (let k = 0; k <= 300; k++) { const x = xAt(k / 300); c.lineTo(x, CY - half * shape(x) * (0.9 + 0.2 * edgeN(k / 300 + frame))); }
        for (let k = 300; k >= 0; k--) { const x = xAt(k / 300); c.lineTo(x, CY + half * shape(x) * (0.9 + 0.2 * edgeN(k / 300 + 0.5 + frame))); }
        c.closePath(); c.fillStyle = `rgba(255,255,255,${0.012 + 0.02 * s})`; c.fill();
      }
      // 2) 가운데 흰 심지 (굵기가 살짝 출렁임)
      const coreN = noise1();
      path((u) => [xAt(u), CY, 18 * shape(xAt(u)) * (0.75 + 0.5 * coreN(u)), 0.4]);
      path((u) => [xAt(u), CY, 8 * shape(xAt(u)), 1]);
      // 3) 가장자리 선: 위·아래로 가는 빛줄기
      for (const side of [-1, 1]) {
        const n = noise1();
        path((u) => [xAt(u), CY + side * HALF * shape(xAt(u)) * (0.95 + 0.1 * n(u)), 2.2, 0.6 * shape(xAt(u)) * (0.5 + 0.5 * n(u))]);
      }
      // 4) 레이저를 감는 나선 두 가닥 (프레임마다 위상이 달라 돌아가는 느낌)
      for (const ph of [0, Math.PI]) {
        path((u) => {
          const x = xAt(u), sp = shape(x);
          const tw = u * 60 + ph + frame * Math.PI;
          const depth = 0.5 + 0.5 * Math.cos(tw);
          return [x, CY + Math.sin(tw) * (HALF * 1.25) * sp, 1.2 + 1.8 * depth, (0.25 + 0.55 * depth) * sp];
        }, 1200);
      }
      // 5) 길이 방향 가는 줄무늬 (빛이 흘러가는 느낌)
      for (let i = 0; i < 70; i++) {
        const y = CY + gauss() * HALF * 0.45, x0 = R(X0, X1 - 200), len = R(80, 500);
        const n = noise1();
        path((u) => { const x = x0 + len * u; return [x, y, R(0.6, 1.8), R(0.15, 0.5) * Math.sin(Math.PI * u) * shape(x) * n(u)]; }, 30);
      }
      // 6) 반짝이 가루: 레이저 밖으로 튀어나온 작은 별·점
      const star = (x, y, r, a) => {
        c.fillStyle = `rgba(255,255,255,${a})`; c.beginPath();
        for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4, rr = k % 2 === 0 ? r : r * 0.25; c.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); }
        c.closePath(); c.fill();
      };
      for (let i = 0; i < 90; i++) {
        const x = xAt(rnd()), y = CY + (rnd() < 0.5 ? -1 : 1) * (HALF * R(0.9, 2.2)) * shape(x);
        if (rnd() < 0.4) star(x, y, R(3, 8), R(0.4, 1)); else { c.fillStyle = `rgba(255,255,255,${R(0.3, 0.9)})`; c.beginPath(); c.arc(x, y, R(0.8, 2.2), 0, Math.PI * 2); c.fill(); }
      }
      // 7) 쏜 자리 마법진: 옆에서 본 원(납작한 타원) 2겹 + 룬 점
      c.lineWidth = 3;
      for (const [rx, ry, a] of [[16, 95, 0.9], [11, 68, 0.6]]) {
        c.strokeStyle = `rgba(255,255,255,${a})`;
        c.beginPath(); c.ellipse(X0 + 8, CY, rx, ry, 0, 0, Math.PI * 2); c.stroke();
      }
      for (let k = 0; k < 12; k++) {
        const ang = k / 12 * Math.PI * 2 + frame * 0.26;
        star(X0 + 8 + Math.cos(ang) * 16, CY + Math.sin(ang) * 95, 5, 0.9);
      }
      const g = c.createRadialGradient(X0 + 8, CY, 0, X0 + 8, CY, 70);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(X0 + 8, CY, 70, 0, Math.PI * 2); c.fill();
    };

    // 색 입히기 + 빛 번짐 → 1/2 크기, 검은 배경 → 투명
    const bake = (white, color) => {
      const t = mk(W, H), tx = t.getContext('2d');
      tx.drawImage(white, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = color; tx.fillRect(0, 0, W, H);
      const o = mk(W, H), x = o.getContext('2d');
      x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'lighter';
      for (const [blur, a] of [[30, 0.7], [10, 0.7], [3, 0.6]]) { x.filter = `blur(${blur}px)`; x.globalAlpha = a; x.drawImage(t, 0, 0); }
      x.filter = 'none'; x.globalAlpha = 1; x.drawImage(t, 0, 0);
      x.globalAlpha = 0.6; x.drawImage(white, 0, 0);
      const small = mk(W / 2, H / 2), sx = small.getContext('2d');
      sx.imageSmoothingQuality = 'high'; sx.drawImage(o, 0, 0, W / 2, H / 2);
      const preview = small.toDataURL('image/png');
      const d = sx.getImageData(0, 0, small.width, small.height), px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        const m = Math.max(px[i], px[i + 1], px[i + 2]);
        if (m === 0) { px[i + 3] = 0; continue; }
        px[i] = px[i] * 255 / m; px[i + 1] = px[i + 1] * 255 / m; px[i + 2] = px[i + 2] * 255 / m; px[i + 3] = m;
      }
      sx.putImageData(d, 0, 0);
      return { game: small.toDataURL('image/png'), preview, canvas: o };
    };

    const out = {};
    const previews = [];
    for (let f = 0; f < 2; f++) {
      const w = mk(W, H); draw(w.getContext('2d'), f);
      const r = bake(w, '#b478ff');
      out[`mage_laser_${f}.png`] = r.game;
      previews.push(r.canvas);
    }
    const pv = mk(W, H * 2 + 20), pc = pv.getContext('2d');
    pc.fillStyle = '#000'; pc.fillRect(0, 0, pv.width, pv.height);
    pc.drawImage(previews[0], 0, 0); pc.drawImage(previews[1], 0, H + 20);
    out['preview_laser.png'] = pv.toDataURL('image/png');
    return out;
  });
  for (const [n, u] of Object.entries(res)) fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  await b.close();
})();
