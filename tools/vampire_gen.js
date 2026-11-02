// 뱀파이어 그림 생성 (미리 구워두는 용도). 결과는 게임용 1/2 크기 → web/assets/에 복사
//   vampire_spear.png : 사용자가 준 창 그림(tools/src/vampire_spear_src.png)의 흰 배경을 지우고 가로로 눕혀
//                       (창끝이 오른쪽) 뒤쪽에 손잡이를 붙인 것. 창끝 = 오른쪽 끝, 가운데 y = 높이/2 — 보통으로 그림
//   vampire_bat_0/1.png : 박쥐 (날개 위/아래 2장), 64x44, 오른쪽을 봄 — 보통
//   vampire_spike_0~2.png : 바닥에서 솟는 피 가시 3종, 36x84, 아래 가운데가 바닥 — 보통
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

    // ---------- 피 가시 3종 ----------
    const spike = (seed) => {
      let s = seed; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
      const c = mk(72, 168), x = c.getContext('2d'), base = 164, cx = 36;
      const h = 120 + rnd() * 40, lean = (rnd() - 0.5) * 16;
      const pts = [[cx - 22, base]];
      const n = 5;
      for (let i = 1; i <= n; i++) { const t = i / n; pts.push([cx - 22 * (1 - t) + lean * t + (i % 2 ? -7 : 3) * (1 - t), base - h * t * (i === n ? 1 : 0.92)]); }
      for (let i = n - 1; i >= 1; i--) { const t = i / n; pts.push([cx + 22 * (1 - t) + lean * t + (i % 2 ? 8 : -3) * (1 - t), base - h * t * 0.9]); }
      pts.push([cx + 22, base]);
      const gr = x.createLinearGradient(cx - 22, 0, cx + 22, 0); gr.addColorStop(0, '#5a0410'); gr.addColorStop(0.45, '#d01a2c'); gr.addColorStop(1, '#3a020a');
      x.fillStyle = gr; x.strokeStyle = '#1a0004'; x.lineWidth = 3; x.lineJoin = 'round';
      x.beginPath(); pts.forEach(([X, Y], i) => (i ? x.lineTo(X, Y) : x.moveTo(X, Y))); x.closePath(); x.fill(); x.stroke();
      x.strokeStyle = 'rgba(255, 150, 160, 0.75)'; x.lineWidth = 2;                       // 빛 받는 줄
      x.beginPath(); x.moveTo(cx - 4, base - 8); x.lineTo(cx + lean * 0.8 - 1, base - h * 0.8); x.stroke();
      x.fillStyle = '#8a0414'; x.beginPath(); x.ellipse(cx, base - 2, 22, 5, 0, 0, Math.PI * 2); x.fill(); // 바닥 피 웅덩이
      return half(c);
    };

    const out = { spear, bat0: bat(true), bat1: bat(false), spike0: spike(7), spike1: spike(31), spike2: spike(77) };
    const pv = mk(520, 160), pc = pv.getContext('2d'); pc.fillStyle = '#2a2a33'; pc.fillRect(0, 0, 520, 160);
    pc.drawImage(spear, 10, 10); pc.drawImage(out.bat0, 10, 90); pc.drawImage(out.bat1, 90, 90);
    [out.spike0, out.spike1, out.spike2].forEach((s, i) => pc.drawImage(s, 330 + i * 40, 70));
    const r = {}; for (const [k, v] of Object.entries(out)) r[k] = v.toDataURL(); r.pv = pv.toDataURL(); r.size = [spear.width, spear.height];
    return r;
  }, SRC);
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('vampire_spear.png', res.spear); save('vampire_bat_0.png', res.bat0); save('vampire_bat_1.png', res.bat1);
  for (let i = 0; i < 3; i++) save(`vampire_spike_${i}.png`, res['spike' + i]);
  save('preview_vampire.png', res.pv);
  console.log('spear size', res.size);
  await b.close();
})();
