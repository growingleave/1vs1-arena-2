// 뱀파이어 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
//   vampire_spear.png : 사용자가 준 창 그림(tools/src/vampire_spear_src.png)의 흰 배경을 지우고 가로로 눕혀
//                       (창끝이 오른쪽) 뒤쪽에 손잡이를 붙인 것. 창끝 = 오른쪽 끝, 가운데 y = 높이/2 — 보통으로 그림
//   vampire_bat_0/1.png : 박쥐 (날개 위/아래 2장), 64x44, 오른쪽을 봄 — 보통
//   vampire_spike_0~3.png : 바닥에서 솟는 피 가시 4종, 48x112, 아래 가운데(24,107)가 바닥 — 보통
//   vampire_pool.png : 궁극기 범위 피 웅덩이 (45도 부채꼴, 꼭짓점 왼쪽 가운데, 반지름 380) — 보통
//   vampire_stab.png : 평타 찌르기 빛줄기 160x24, 오른쪽 끝이 창끝 — 'lighter'
//   preview_vampire.png (확인용)
// 실행: node tools/vampire_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || __dirname;
const SRC = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'src/vampire_spear_src.png')).toString('base64');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(async (SRC) => {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const half = (src) => { const s = mk(Math.round(src.width / 2), Math.round(src.height / 2)), x = s.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, s.width, s.height); return s; };
    const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = SRC; });

    // ---------- 1. 흰 배경 지우기 (밝을수록 투명, 가장자리는 부드럽게) ----------
    const a = mk(img.width, img.height), ax = a.getContext('2d');
    ax.drawImage(img, 0, 0);
    const d = ax.getImageData(0, 0, a.width, a.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      // 원본 배경은 흰색·회색 체크무늬 → 색이 없고(회색) 밝은 픽셀은 지운다. 붉은 날과 검은 테두리는 남김
      const mx = Math.max(px[i], px[i + 1], px[i + 2]), mn = Math.min(px[i], px[i + 1], px[i + 2]);
      const sat = mx - mn;
      const grayness = Math.max(0, Math.min(1, (40 - sat) / 25));     // 회색일수록 1
      const bright = Math.max(0, Math.min(1, (mn - 90) / 50));        // 밝을수록 1 (검은 테두리는 0)
      const alpha = 1 - grayness * bright;
      px[i + 3] = Math.round(px[i + 3] * alpha);
    }
    ax.putImageData(d, 0, 0);

    // ---------- 2. 가로로 눕히기: 원본 축은 오른쪽 아래로 29.5도, 창끝이 오른쪽 아래(왼쪽 위 초승달 쪽이 뒤) → -29.5도 돌려 창끝이 오른쪽 ----------
    const ROT = -29.5 * Math.PI / 180;
    const R = mk(700, 400), rx = R.getContext('2d');
    rx.translate(350, 200); rx.rotate(ROT); rx.drawImage(a, -181, -172); // 무게중심(181,172)을 가운데로
    // 실제 그림이 있는 범위 찾기
    const rd = rx.getImageData(0, 0, 700, 400).data;
    let x0 = 700, x1 = 0, y0 = 400, y1 = 0;
    for (let y = 0; y < 400; y++) for (let x = 0; x < 700; x++) if (rd[(y * 700 + x) * 4 + 3] > 30) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;

    // ---------- 3. 손잡이 붙이기 (검은 자루 + 붉은 감개 + 끝 장식) ----------
    const HANDLE = 170, H = Math.max(bh, 60) + 8;
    const W = HANDLE + bw - 10;
    const S = mk(W, H), sx = S.getContext('2d'), cy = H / 2;
    // 자루
    const g = sx.createLinearGradient(0, cy - 7, 0, cy + 7); g.addColorStop(0, '#4a1a20'); g.addColorStop(0.5, '#1a0a0c'); g.addColorStop(1, '#050203');
    sx.fillStyle = g; sx.strokeStyle = '#000'; sx.lineWidth = 3;
    sx.beginPath(); sx.roundRect(14, cy - 7, HANDLE + 10, 14, 6); sx.fill(); sx.stroke();
    // 붉은 감개 (손 잡는 곳)
    sx.strokeStyle = '#8a0d1c'; sx.lineWidth = 4;
    for (let x = 40; x < 120; x += 11) { sx.beginPath(); sx.moveTo(x, cy - 7); sx.lineTo(x + 7, cy + 7); sx.stroke(); }
    // 끝 장식 (뾰족한 붉은 물방울)
    sx.fillStyle = '#b5121f'; sx.strokeStyle = '#000'; sx.lineWidth = 3;
    sx.beginPath(); sx.moveTo(2, cy); sx.quadraticCurveTo(10, cy - 13, 22, cy - 9); sx.lineTo(22, cy + 9); sx.quadraticCurveTo(10, cy + 13, 2, cy); sx.fill(); sx.stroke();
    // 날밑 (자루와 날 사이 고리)
    sx.fillStyle = '#2a0a0e'; sx.beginPath(); sx.roundRect(HANDLE - 4, cy - 13, 12, 26, 4); sx.fill(); sx.stroke();
    // 날 (원본 그림)
    sx.drawImage(R, x0, y0, bw, bh, HANDLE - 10, cy - bh / 2, bw, bh);
    const spear = half(S);

    // ---------- 박쥐 2장 (날개 위/아래) ----------
    const bat = (up) => {
      const c = mk(128, 88), x = c.getContext('2d'), X = 64, Y = 50;
      x.fillStyle = '#1b0d16'; x.strokeStyle = '#000'; x.lineWidth = 3; x.lineJoin = 'round';
      for (const s of [-1, 1]) {   // 날개 (위로 펼침 / 아래로 접음)
        const tipY = up ? Y - 38 : Y + 22;
        x.beginPath(); x.moveTo(X + s * 8, Y - 4);
        x.quadraticCurveTo(X + s * 30, tipY - 6, X + s * 60, tipY);
        x.lineTo(X + s * 50, Y + (up ? -8 : 14)); x.lineTo(X + s * 40, Y + (up ? 0 : 6)); x.lineTo(X + s * 28, Y + (up ? -2 : 8)); x.lineTo(X + s * 18, Y + 6);
        x.closePath(); x.fill(); x.stroke();
        x.strokeStyle = 'rgba(160, 30, 50, 0.7)'; x.lineWidth = 2;             // 날개 뼈
        x.beginPath(); x.moveTo(X + s * 10, Y - 2); x.lineTo(X + s * 56, tipY + 2); x.moveTo(X + s * 12, Y); x.lineTo(X + s * 40, Y + (up ? 0 : 6)); x.stroke();
        x.strokeStyle = '#000'; x.lineWidth = 3;
      }
      x.beginPath(); x.ellipse(X, Y, 13, 15, 0, 0, Math.PI * 2); x.fill(); x.stroke();   // 몸
      x.beginPath(); x.moveTo(X - 9, Y - 10); x.lineTo(X - 6, Y - 24); x.lineTo(X - 1, Y - 12); x.moveTo(X + 9, Y - 10); x.lineTo(X + 6, Y - 24); x.lineTo(X + 1, Y - 12); x.fill(); x.stroke(); // 귀
      x.fillStyle = '#ff2a3a'; for (const s of [-1, 1]) { x.beginPath(); x.arc(X + s * 5 + 3, Y - 4, 3, 0, Math.PI * 2); x.fill(); } // 눈 (오른쪽을 보게 살짝 오른쪽)
      x.fillStyle = '#fff'; x.beginPath(); x.moveTo(X + 1, Y + 5); x.lineTo(X + 3, Y + 11); x.lineTo(X + 5, Y + 5); x.moveTo(X + 7, Y + 5); x.lineTo(X + 9, Y + 10); x.lineTo(X + 11, Y + 5); x.fill(); // 송곳니
      return half(c);
    };

    // ---------- 피 가시 4종 (자세히): 굵은 본 가시 + 옆 잔가시, 결 따라 어두운 줄·밝은 반사, 흘러내리는 피, 바닥 왕관 모양 튐 ----------
    // 96x224로 그려 1/2 → 48x112. 아래 가운데(24, 108)가 바닥
    const spike = (seed) => {
      let s = seed; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      const c = mk(96, 224), x = c.getContext('2d'), base = 214, cx = 48;
      x.lineJoin = 'round'; x.lineCap = 'round';
      const shard = (bx, by, w, h, lean, dark) => {   // 들쭉날쭉한 가시 하나
        const L = [], R = [], n = 7;
        for (let i = 0; i <= n; i++) {
          const t = i / n, ww = w * Math.pow(1 - t, 0.85);
          const jag = (i % 2 ? 1 : -0.4) * w * 0.18 * (1 - t) * (0.5 + rnd());
          L.push([bx - ww + lean * t + jag, by - h * t]);
          R.push([bx + ww + lean * t - jag * 0.6, by - h * t * (i === n ? 1 : 0.97)]);
        }
        const tipX = bx + lean, tipY = by - h - 6;
        const pts = [...L.slice(0, n), [tipX, tipY], ...R.slice(0, n).reverse()];
        const gr = x.createLinearGradient(bx - w, 0, bx + w + lean, 0);
        gr.addColorStop(0, dark ? '#2a0006' : '#4a020c'); gr.addColorStop(0.35, dark ? '#7a0614' : '#b0101f');
        gr.addColorStop(0.55, dark ? '#a00d1c' : '#e8283a'); gr.addColorStop(1, '#300006');
        x.fillStyle = gr; x.strokeStyle = '#140003'; x.lineWidth = 3.5;
        x.beginPath(); pts.forEach(([X, Y], i) => (i ? x.lineTo(X, Y) : x.moveTo(X, Y))); x.closePath(); x.fill(); x.stroke();
        // 결 (어두운 줄 2개)
        x.strokeStyle = 'rgba(40, 0, 6, 0.55)'; x.lineWidth = 2;
        for (const k of [-0.45, 0.35]) { x.beginPath(); x.moveTo(bx + w * k, by - 4); x.quadraticCurveTo(bx + w * k * 0.6 + lean * 0.5, by - h * 0.5, tipX - lean * 0.1, tipY + h * 0.18); x.stroke(); }
        // 밝은 반사 (가운데 왼쪽, 끝으로 갈수록 가늘게)
        x.strokeStyle = 'rgba(255, 170, 180, 0.85)'; x.lineWidth = 2.5;
        x.beginPath(); x.moveTo(bx - w * 0.15, by - 10); x.lineTo(bx - w * 0.05 + lean * 0.7, by - h * 0.72); x.stroke();
        x.strokeStyle = 'rgba(255, 235, 240, 0.9)'; x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(bx - w * 0.12, by - h * 0.3); x.lineTo(bx - w * 0.02 + lean * 0.75, by - h * 0.62); x.stroke();
      };
      const H = 150 + rnd() * 50, lean = (rnd() - 0.5) * 18;
      // 옆 잔가시 (뒤쪽, 어둡게)
      shard(cx - 18, base - 6, 9, H * (0.38 + rnd() * 0.15), -10 - rnd() * 8, true);
      shard(cx + 19, base - 4, 8, H * (0.3 + rnd() * 0.15), 9 + rnd() * 8, true);
      // 본 가시
      shard(cx, base, 20, H, lean, false);
      // 흘러내리는 피 줄기
      x.fillStyle = '#c4121f'; x.strokeStyle = '#300006'; x.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) {
        const dx = cx + (i ? 8 : -9) + lean * 0.3, top = base - H * (0.35 + rnd() * 0.25), len = 18 + rnd() * 26;
        x.beginPath(); x.moveTo(dx - 2.5, top); x.lineTo(dx - 2, top + len); x.arc(dx, top + len, 3.2, Math.PI, 0, true); x.lineTo(dx + 2.5, top); x.closePath(); x.fill(); x.stroke();
      }
      // 바닥: 피 웅덩이 + 왕관 모양으로 튄 피
      x.fillStyle = '#6a0410'; x.beginPath(); x.ellipse(cx, base - 1, 40, 8, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#a80d1c'; x.beginPath(); x.ellipse(cx, base - 2, 30, 5.5, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#c4121f'; x.strokeStyle = '#300006'; x.lineWidth = 1.5;
      for (const [ox, hh] of [[-34, 10], [-26, 16], [27, 14], [35, 9]]) {
        x.beginPath(); x.moveTo(cx + ox - 3, base - 2); x.lineTo(cx + ox + (ox < 0 ? -2 : 2), base - 2 - hh); x.lineTo(cx + ox + 3, base - 2); x.closePath(); x.fill(); x.stroke();
        x.beginPath(); x.arc(cx + ox + (ox < 0 ? -3 : 3), base - 6 - hh, 2.2, 0, Math.PI * 2); x.fill();
      }
      return half(c);
    };

    // ---------- 피 웅덩이 (궁극기 범위): 45도 부채꼴, 반지름 380 → 그림 760x(2*380*sin22.5)≈ 760x300 을 1/2 ----------
    // 꼭짓점 = 왼쪽 가운데 (0, 높이/2), 오른쪽을 향함. 가장자리는 울퉁불퉁, 안쪽에 진한 얼룩과 빛 반사
    const pool = () => {
      const R = 760, half45 = 22.5 * Math.PI / 180, Hh = Math.ceil(R * Math.sin(half45)) + 20;
      const c = mk(R + 20, Hh * 2), x = c.getContext('2d'), oy = Hh;
      let s = 13; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      const edge = (r0, jit) => {
        x.beginPath(); x.moveTo(0, oy);
        const n = 48;
        for (let i = 0; i <= n; i++) {
          const a = -half45 + 2 * half45 * i / n, rr = r0 + (rnd() - 0.5) * jit;
          x.lineTo(Math.cos(a) * rr, oy + Math.sin(a) * rr * 1.04);
        }
        x.closePath();
      };
      x.fillStyle = '#3a0208'; edge(R - 14, 30); x.fill();                 // 바깥 테두리 (어둡게)
      const g = x.createRadialGradient(0, oy, 0, 0, oy, R);
      g.addColorStop(0, '#9a0a18'); g.addColorStop(0.6, '#7a0612'); g.addColorStop(1, '#52030c');
      x.fillStyle = g; edge(R - 34, 24); x.fill();
      // 진한 얼룩
      for (let i = 0; i < 40; i++) {
        const d = 40 + rnd() * (R - 90), a = (rnd() * 2 - 1) * half45 * 0.85;
        x.fillStyle = `rgba(${rnd() < 0.5 ? '40, 0, 6' : '170, 16, 32'}, ${0.25 + rnd() * 0.3})`;
        x.beginPath(); x.ellipse(Math.cos(a) * d, oy + Math.sin(a) * d, 8 + rnd() * 26 * d / R, 4 + rnd() * 10 * d / R, a, 0, Math.PI * 2); x.fill();
      }
      // 빛 반사 (흰 점·줄)
      for (let i = 0; i < 26; i++) {
        const d = 60 + rnd() * (R - 120), a = (rnd() * 2 - 1) * half45 * 0.8;
        x.fillStyle = `rgba(255, 190, 200, ${0.25 + rnd() * 0.35})`;
        x.beginPath(); x.ellipse(Math.cos(a) * d, oy + Math.sin(a) * d, 2 + rnd() * 8, 1 + rnd() * 2, a + 0.3, 0, Math.PI * 2); x.fill();
      }
      return half(c);
    };

    // ---------- 찌르기 궤적 (평타): 가로로 긴 빛줄기, 오른쪽 끝이 창끝. 흰 심 + 붉은 테 ----------
    const stab = () => {
      const c = mk(320, 48), x = c.getContext('2d'), y = 24;
      const red = x.createLinearGradient(0, 0, 320, 0); red.addColorStop(0, 'rgba(208,24,44,0)'); red.addColorStop(0.7, 'rgba(230,40,60,0.8)'); red.addColorStop(1, 'rgba(255,90,100,1)');
      x.fillStyle = red; x.beginPath(); x.moveTo(0, y); x.lineTo(290, y - 14); x.lineTo(320, y); x.lineTo(290, y + 14); x.closePath(); x.fill();
      const wh = x.createLinearGradient(60, 0, 320, 0); wh.addColorStop(0, 'rgba(255,255,255,0)'); wh.addColorStop(1, 'rgba(255,255,255,1)');
      x.fillStyle = wh; x.beginPath(); x.moveTo(60, y); x.lineTo(296, y - 5); x.lineTo(318, y); x.lineTo(296, y + 5); x.closePath(); x.fill();
      for (const [dy, x0] of [[-11, 140], [11, 160], [-18, 220], [18, 230]]) { x.strokeStyle = 'rgba(255, 150, 160, 0.6)'; x.lineWidth = 2; x.beginPath(); x.moveTo(x0, y + dy); x.lineTo(300, y + dy * 0.4); x.stroke(); }
      return half(c);
    };

    const out = { spear, bat0: bat(true), bat1: bat(false), spike0: spike(7), spike1: spike(31), spike2: spike(77), spike3: spike(123), pool: pool(), stab: stab() };
    const pv = mk(820, 200), pc = pv.getContext('2d'); pc.fillStyle = '#2a2a33'; pc.fillRect(0, 0, 820, 200);
    pc.drawImage(spear, 10, 10); pc.drawImage(out.bat0, 10, 90); pc.drawImage(out.bat1, 90, 90);
    [out.spike0, out.spike1, out.spike2, out.spike3].forEach((s, i) => pc.drawImage(s, 170 + i * 52, 80)); pc.drawImage(out.pool, 400, 10); pc.drawImage(out.stab, 10, 60);
    const r = {}; for (const [k, v] of Object.entries(out)) r[k] = v.toDataURL(); r.pv = pv.toDataURL(); r.size = [spear.width, spear.height];
    return r;
  }, SRC);
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('vampire_spear.png', res.spear); save('vampire_bat_0.png', res.bat0); save('vampire_bat_1.png', res.bat1);
  for (let i = 0; i < 4; i++) save(`vampire_spike_${i}.png`, res['spike' + i]);
  save('vampire_pool.png', res.pool); save('vampire_stab.png', res.stab);
  save('preview_vampire.png', res.pv);
  console.log('spear size', res.size);
  await b.close();
})();
