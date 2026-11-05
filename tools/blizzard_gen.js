// 설원 화톳불·눈보라 그림 생성 (미리 구워두는 용도) → web/assets/에 복사. 게임용 = 그림의 1/2 크기
//   snow_brazier_off.png 96x96 (게임 48) : 꺼진 화톳불 (돌 고리 + 장작 + 위에 눈) — 보통
//   snow_brazier_on.png  96x96 (게임 48) : 켜진 화톳불 바닥 (빨갛게 달아오른 숯) — 보통
//   snow_fire_0~3.png    64x96 (게임 32x48) : 불꽃 4장 (바닥 가운데 (32,88)가 장작 위) — 'lighter'
//   snow_tile_near.png / snow_tile_far.png 256x256 (게임 그대로) : 이어 붙일 수 있는 눈발 무늬 (가까운 큰 눈 / 먼 작은 눈) — 보통, 패턴으로 깔고 흘려 보냄
// 실행: node tools/blizzard_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    let seed = 99; const rnd = (a = 0, b = 1) => { seed = (seed * 1664525 + 1013904223) >>> 0; return a + (seed / 4294967296) * (b - a); };
    const OUTL = '#0e0c0b';

    function brazier(lit) {
      const c = mk(96, 96), g = c.getContext('2d'), cx = 48, cy = 54;
      // 바닥 그림자
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(cx + 3, cy + 6, 38, 20, 0, 0, Math.PI * 2); g.fill();
      if (lit) { const gl = g.createRadialGradient(cx, cy, 4, cx, cy, 46); gl.addColorStop(0, 'rgba(255,150,60,0.55)'); gl.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = gl; g.beginPath(); g.arc(cx, cy, 46, 0, Math.PI * 2); g.fill(); }
      // 가운데 숯 바닥
      const pit = g.createRadialGradient(cx, cy, 2, cx, cy, 22);
      if (lit) { pit.addColorStop(0, '#ffcf6a'); pit.addColorStop(0.45, '#e2531c'); pit.addColorStop(1, '#3a120a'); } else { pit.addColorStop(0, '#3a3836'); pit.addColorStop(1, '#1a1918'); }
      g.fillStyle = pit; g.beginPath(); g.ellipse(cx, cy, 24, 15, 0, 0, Math.PI * 2); g.fill();
      // 장작 (X자)
      for (const [a, col] of [[0.5, lit ? '#5a2c16' : '#4a3426'], [-0.5, lit ? '#6a3418' : '#56402e']]) {
        g.save(); g.translate(cx, cy); g.rotate(a); g.fillStyle = col; g.strokeStyle = OUTL; g.lineWidth = 3;
        g.beginPath(); g.roundRect(-22, -5, 44, 10, 5); g.fill(); g.stroke();
        if (lit) { g.fillStyle = 'rgba(255,140,50,0.8)'; g.fillRect(-10, -1, 20, 2); }
        g.restore();
      }
      // 돌 고리
      for (let i = 0; i < 9; i++) {
        const a = i * Math.PI * 2 / 9, x = cx + Math.cos(a) * 30, y = cy + Math.sin(a) * 18, r = 9 + (i % 3);
        const sg = g.createLinearGradient(x, y - r, x, y + r); sg.addColorStop(0, '#8d8f96'); sg.addColorStop(1, '#4a4c52');
        g.fillStyle = sg; g.strokeStyle = OUTL; g.lineWidth = 2.5; g.beginPath(); g.ellipse(x, y, r, r * 0.8, a, 0, Math.PI * 2); g.fill(); g.stroke();
        if (lit) { g.fillStyle = 'rgba(255,160,80,0.25)'; g.beginPath(); g.ellipse(x - Math.cos(a) * 3, y - Math.sin(a) * 2, r * 0.6, r * 0.4, a, 0, Math.PI * 2); g.fill(); }
        else { g.fillStyle = 'rgba(235,242,250,0.85)'; g.beginPath(); g.ellipse(x, y - r * 0.45, r * 0.7, r * 0.3, 0, 0, Math.PI * 2); g.fill(); }
      }
      return c;
    }

    function flame(phase) {
      const c = mk(64, 96), g = c.getContext('2d'), bx = 32, by = 88;
      const layer = (w, h, col, sway) => {
        g.fillStyle = col; g.beginPath(); g.moveTo(bx - w, by);
        g.bezierCurveTo(bx - w * 1.1, by - h * 0.45, bx - w * 0.3 + sway, by - h * 0.7, bx + sway * 1.6, by - h);
        g.bezierCurveTo(bx + w * 0.4 + sway, by - h * 0.65, bx + w * 1.1, by - h * 0.4, bx + w, by);
        g.closePath(); g.fill();
      };
      const s = Math.sin(phase * Math.PI / 2) * 4, h = 70 + Math.cos(phase * 1.7) * 8;
      g.filter = 'blur(1.5px)';
      layer(22, h, 'rgba(230, 70, 20, 0.85)', s);
      layer(16, h * 0.78, 'rgba(255, 140, 40, 0.9)', -s * 0.7);
      layer(9, h * 0.5, 'rgba(255, 225, 140, 0.95)', s * 0.5);
      g.filter = 'none';
      // 불티
      for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(255,200,120,0.9)'; g.fillRect(bx + rnd(-16, 16), by - h - rnd(0, 12) + 10, 2, 2); }
      return c;
    }

    // 이어 붙여도 이음매가 안 보이는 눈발 무늬 (가장자리 넘어가면 반대편에도 그림)
    function snowTile(n, rMin, rMax, alpha, streak) {
      const S = 256, c = mk(S, S), g = c.getContext('2d');
      for (let i = 0; i < n; i++) {
        const x = rnd(0, S), y = rnd(0, S), r = rnd(rMin, rMax), a = rnd(alpha * 0.5, alpha);
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
          const X = x + ox, Y = y + oy; if (X < -20 || X > S + 20 || Y < -20 || Y > S + 20) continue;
          if (streak) { // 바람에 날리는 눈: 짧은 사선 꼬리
            const gr = g.createLinearGradient(X, Y, X + 10, Y - 14); gr.addColorStop(0, `rgba(240,248,255,${a})`); gr.addColorStop(1, 'rgba(240,248,255,0)');
            g.strokeStyle = gr; g.lineWidth = r; g.lineCap = 'round'; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + 10, Y - 14); g.stroke();
          }
          const gr = g.createRadialGradient(X, Y, 0, X, Y, r * 1.6); gr.addColorStop(0, `rgba(250,253,255,${a})`); gr.addColorStop(1, 'rgba(250,253,255,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(X, Y, r * 1.6, 0, Math.PI * 2); g.fill();
        }
      }
      return c;
    }

    const half = (src) => { const s = mk(src.width / 2, src.height / 2), x = s.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, s.width, s.height); return s; };
    const off = brazier(false), on = brazier(true), fires = [0, 1, 2, 3].map(flame);
    const near = snowTile(26, 1.8, 3, 0.85, true), far = snowTile(70, 0.8, 1.4, 0.55, false);
    const pv = mk(420, 160), q = pv.getContext('2d'); q.fillStyle = '#1b2230'; q.fillRect(0, 0, 420, 160);
    q.drawImage(off, 0, 30); q.drawImage(on, 100, 30); q.drawImage(fires[0], 116, -2); q.drawImage(near, 200, 0, 110, 110); q.drawImage(far, 310, 0, 110, 110);
    return { off: half(off).toDataURL(), on: half(on).toDataURL(), fires: fires.map((f) => half(f).toDataURL()), near: near.toDataURL(), far: far.toDataURL(), pv: pv.toDataURL() };
  });
  const save = (n, u) => fs.writeFileSync(path.join(OUT, n), Buffer.from(u.split(',')[1], 'base64'));
  save('snow_brazier_off.png', res.off); save('snow_brazier_on.png', res.on); res.fires.forEach((u, i) => save(`snow_fire_${i}.png`, u));
  save('snow_tile_near.png', res.near); save('snow_tile_far.png', res.far); save('preview_blizzard.png', res.pv);
  await b.close();
})();
