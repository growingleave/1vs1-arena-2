// 캐릭터 몸 그림 생성: 사용자가 준 그림(tools/src/portraits_src.png, 가짜 체크무늬 배경)에서
// 바깥 배경만 지우고(가장자리에서 채우기 → 검은 테두리 안의 흰 얼굴은 남음) 정사각형으로 잘라 저장.
//   mage, hacker, swordman, archer, fighter, assassin, vampire, grinder, sans. 정사각형이라 게임에서 늘어나지 않음
//   실행하면 캐릭터별 spriteSize/spriteAnchor 값을 출력 → 각 캐릭터 apply 함수에 적음
// 실행: node tools/portrait_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || __dirname;
const load = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'src', f)).toString('base64');
// 원본에서 대략의 영역 (x0, y0, x1, y1)
// 원본 파일별 영역 (원본 픽셀 기준 x0, y0, x1, y1)
const SOURCES = [
  { src: load('portraits_src.png'), crops: { mage: [100, 320, 580, 724], hacker: [630, 320, 1075, 724] } },
  { src: load('portraits2_src.png'), crops: {
      swordman: [90, 0, 586, 378], archer: [586, 0, 1080, 378], fighter: [1080, 0, 1566, 378], assassin: [1566, 0, 2020, 378],
      vampire: [200, 378, 680, 724], grinder: [720, 378, 1140, 724], sans: [1180, 378, 1600, 724] } },
];
const SIZE = 128;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(async ([SOURCES, SIZE]) => {
    const out = {}, dbg = {};
    for (const { src: SRC, crops: CROPS } of SOURCES) {
    const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = SRC; });
    for (const [name, [x0, y0, x1, y1]] of Object.entries(CROPS)) {
      const w = x1 - x0, h = y1 - y0;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const cx = c.getContext('2d'); cx.drawImage(img, -x0, -y0);
      const d = cx.getImageData(0, 0, w, h), px = d.data;
      // 배경 = 색이 거의 없고 밝은 픽셀 (흰·회색 체크)
      const isBg = (i) => { const r = px[i], g = px[i + 1], bl = px[i + 2]; return Math.max(r, g, bl) - Math.min(r, g, bl) < 28 && Math.min(r, g, bl) > 150; };
      // 검은 테두리를 2px 두껍게 만들어 벽으로 씀 (테두리 틈으로 얼굴 흰색까지 지워지는 것 방지)
      const dark = new Uint8Array(w * h);
      for (let k = 0; k < w * h; k++) if (Math.min(px[k * 4], px[k * 4 + 1], px[k * 4 + 2]) < 110) dark[k] = 1;
      const wall = new Uint8Array(w * h), R = 3;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (dark[y * w + x])
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) wall[Y * w + X] = 1; }
      const seen = new Uint8Array(w * h), st = [];
      // 위·왼쪽·오른쪽 가장자리에서 시작 (아래쪽은 몸이 잘린 부분)
      for (let x = 0; x < w; x++) st.push(x);
      for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
      while (st.length) {
        const k = st.pop(); if (seen[k]) continue;
        if (wall[k] || !isBg(k * 4)) continue;
        seen[k] = 1;
        const x = k % w, y = (k / w) | 0;
        if (x > 0) st.push(k - 1); if (x < w - 1) st.push(k + 1);
        if (y > 0) st.push(k - w); if (y < h - 1) st.push(k + w);
      }
      // 두꺼운 벽 때문에 남은 테두리 바깥 배경 몇 px도 마저 지움
      for (let it = 0; it <= R; it++) {
        const add = [];
        for (let k = 0; k < w * h; k++) if (!seen[k] && wall[k] && !dark[k] && isBg(k * 4)) {
          const x = k % w, y = (k / w) | 0;
          if ((x > 0 && seen[k - 1]) || (x < w - 1 && seen[k + 1]) || (y > 0 && seen[k - w]) || (y < h - 1 && seen[k + w])) add.push(k);
        }
        for (const k of add) seen[k] = 1;
      }
      // 배경 옆 밝은 가장자리 픽셀도 반투명으로 (흰 테두리 번짐 제거)
      for (let k = 0; k < w * h; k++) {
        if (seen[k]) { px[k * 4 + 3] = 0; continue; }
        const x = k % w, y = (k / w) | 0;
        const nb = (x > 0 && seen[k - 1]) || (x < w - 1 && seen[k + 1]) || (y > 0 && seen[k - w]) || (y < h - 1 && seen[k + w]);
        if (nb) { const m = Math.min(px[k * 4], px[k * 4 + 1], px[k * 4 + 2]); if (m > 110) px[k * 4 + 3] = 90; }
      }
      // 남은 것 중 가장 큰 덩어리(캐릭터)만 남김 (배경에 섞인 잡티 제거)
      const lab = new Int32Array(w * h); let best = 0, bestN = 0, nl = 0;
      for (let k0 = 0; k0 < w * h; k0++) {
        if (lab[k0] || px[k0 * 4 + 3] < 40) continue;
        nl++; let n = 0; const q = [k0]; lab[k0] = nl;
        while (q.length) { const k = q.pop(); n++; const x = k % w, y = (k / w) | 0;
          for (const j of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1])
            if (j >= 0 && !lab[j] && px[j * 4 + 3] >= 40) { lab[j] = nl; q.push(j); } }
        if (n > bestN) { bestN = n; best = nl; }
      }
      for (let k = 0; k < w * h; k++) if (lab[k] !== best && !(px[k * 4 + 3] < 40 && px[k * 4 + 3] > 0 && false)) { if (lab[k] !== best) px[k * 4 + 3] = lab[k] ? 0 : px[k * 4 + 3]; }
      cx.putImageData(d, 0, 0);
      // 실제 그림 범위
      let bx0 = w, bx1 = 0, by0 = h, by1 = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 40) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
      const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1, side = Math.max(bw, bh);
      const s = document.createElement('canvas'); s.width = SIZE; s.height = SIZE;
      const sx = s.getContext('2d'); sx.imageSmoothingQuality = 'high';
      const sc = SIZE / side;
      // 가로 가운데, 아래 맞춤
      sx.drawImage(c, bx0, by0, bw, bh, (SIZE - bw * sc) / 2, SIZE - bh * sc, bw * sc, bh * sc);
      out[name] = s.toDataURL('image/png');
      // 게임용 크기: 모든 캐릭터를 원본 그림과 같은 배율(원본 1px = 0.1285, 마법사 바닥 폭이 히트박스 40에 맞는 배율)로 → 크기가 서로 비슷해 보임.
      // 바닥 = 히트박스 바닥, 가로 가운데 = 바닥 폭의 가운데
      const sd = sx.getImageData(0, SIZE - 3, SIZE, 1).data; let l = SIZE, rr = -1;
      for (let x = 0; x < SIZE; x++) if (sd[x * 4 + 3] > 128) { l = Math.min(l, x); rr = x; }
      const sz = Math.round(side * 0.1285);
      dbg[name] = { side, spriteSize: sz, spriteAnchor: [+((l + rr + 1) / 2 / SIZE).toFixed(3), +(1 - 20 / sz).toFixed(3)] };
    }
    }
    // 확인용: 어두운/밝은 배경 위에 두 장
    const pv = document.createElement('canvas'); pv.width = SIZE * 9; pv.height = SIZE;
    const px2 = pv.getContext('2d');
    let i = 0;
    for (const bg of ['#2a2a35']) for (const n of Object.keys(out)) {
      const im = await new Promise((r) => { const q = new Image(); q.onload = () => r(q); q.src = out[n]; });
      px2.fillStyle = bg; px2.fillRect(i * SIZE, 0, SIZE, SIZE); px2.drawImage(im, i * SIZE, 0); i++;
    }
    out.preview_portraits = pv.toDataURL('image/png');
    out._dbg = JSON.stringify(dbg); return out;
  }, [SOURCES, SIZE]);
  console.log(res._dbg.replace(/},/g, '},\n')); delete res._dbg;
  for (const [n, u] of Object.entries(res)) fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(u.split(',')[1], 'base64'));
  await b.close();
})();
