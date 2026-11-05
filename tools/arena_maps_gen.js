// 용암 구덩이(맵 1)·설원(맵 2) 바닥·벽 그림 생성 (미리 구워두는 용도) → web/assets/에 복사
//   arena_lava_floor.webp / arena_lava_walls.png  : 현무암 판석 + 희미하게 빛나는 용암 균열, 가운데 그을림 / 화산암 벽(빛나는 금)
//   arena_snow_floor.webp / arena_snow_walls.png  : 눈 덮인 어두운 돌바닥 + 빙판(맵의 빙판 자리에 구움) / 얼음 벽(눈 쌓인 윗면)
//   바닥 = 맨 먼저(보통), 벽 = 바닥 이펙트 다음에 벽 부분만 잘라 그림(보통). 1280x720
// 벽·빙판 위치는 게임의 MAPS[i]에서 읽으므로 옮기면 다시 돌린다.
// 실행: node tools/arena_maps_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.resolve(__dirname, '../web/index.html')); await p.waitForTimeout(300);
  const res = await p.evaluate(() => {
    const W = 1280, H = 720;
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    let seed = 777; const rnd = (a = 0, b = 1) => { seed = (seed * 1664525 + 1013904223) >>> 0; return a + (seed / 4294967296) * (b - a); };

    // 보로노이 판석: 픽셀마다 가장 가까운 점·두 번째로 가까운 점 거리 → 판석 색과 이음매
    function voronoi(n, shade, seam) {
      const pts = []; for (let i = 0; i < n; i++) pts.push([rnd(0, W), rnd(0, H), rnd()]);
      const c = mk(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
      // 격자로 나눠 가까운 점만 찾기 (빠르게)
      const CS = 80, gw = Math.ceil(W / CS), gh = Math.ceil(H / CS), grid = Array.from({ length: gw * gh }, () => []);
      pts.forEach((pt, i) => grid[Math.min(gh - 1, Math.floor(pt[1] / CS)) * gw + Math.min(gw - 1, Math.floor(pt[0] / CS))].push(i));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let d1 = 1e9, d2 = 1e9, best = 0;
        const cx = Math.floor(x / CS), cy = Math.floor(y / CS);
        for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
          const gx = cx + ox, gy = cy + oy; if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
          for (const i of grid[gy * gw + gx]) { const dx = pts[i][0] - x, dy = pts[i][1] - y, dd = dx * dx + dy * dy; if (dd < d1) { d2 = d1; d1 = dd; best = i; } else if (dd < d2) d2 = dd; }
        }
        const edge = Math.sqrt(d2) - Math.sqrt(d1);
        const [r, gg, bb, a] = edge < seam.width ? seam.color(edge, x, y) : shade(pts[best][2], x, y, edge);
        const k = (y * W + x) * 4; d[k] = r; d[k + 1] = gg; d[k + 2] = bb; d[k + 3] = a ?? 255;
      }
      g.putImageData(img, 0, 0);
      return c;
    }
    const noise = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
    // 부드러운 값 노이즈 (격자 노이즈를 이어 붙임) → 빛나는 균열 구역이 네모로 끊기지 않게
    const smooth = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = noise(xi, yi), b = noise(xi + 1, yi), c = noise(xi, yi + 1), d = noise(xi + 1, yi + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };

    // 공통 벽 그리기: 그림자 → 몸통(테마별)
    function wallLayer(walls, body) {
      const wc = mk(W, H), w = wc.getContext('2d');
      w.fillStyle = 'rgba(0,0,0,0.5)'; for (const [x, y, ww, hh] of walls) w.fillRect(x + 6, y + 8, ww, hh);
      w.filter = 'blur(4px)'; w.drawImage(wc, 0, 0); w.filter = 'none';
      for (const r of walls) body(w, ...r);
      return wc;
    }
    const vignette = (g, col, a) => { const vg = g.createRadialGradient(640, 360, 250, 640, 360, 780); vg.addColorStop(0, `rgba(${col},0)`); vg.addColorStop(1, `rgba(${col},${a})`); g.fillStyle = vg; g.fillRect(0, 0, W, H); };

    // ===================== 용암 =====================
    const lavaWalls = MAPS[1].buildWalls().map((w) => [w.rect.x, w.rect.y, w.rect.w, w.rect.h]);
    const lf = voronoi(260,
      (v, x, y, edge) => { const n = noise(x, y) * 8, base = 22 + v * 11 + n; return [base + 6, base * 0.7, base * 0.62]; },
      { width: 3.5, color: (e, x, y) => { const t = 1 - e / 3.5, glow = 0.08 + 0.6 * Math.max(0, Math.min(1, (smooth(x / 140, y / 140) - 0.5) * 3)); return [20 + 150 * t * glow, 8 + 45 * t * glow, 6 + 8 * t * glow]; } });
    const lg = lf.getContext('2d');
    // 균열 빛 번짐
    lg.globalCompositeOperation = 'lighter'; lg.filter = 'blur(6px)'; lg.globalAlpha = 0.12; lg.drawImage(lf, 0, 0); lg.filter = 'none'; lg.globalAlpha = 1; lg.globalCompositeOperation = 'source-over';
    // 재·그을음 얼룩
    for (let i = 0; i < 40; i++) { const x = rnd(0, W), y = rnd(0, H), r = rnd(20, 70); const gr = lg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); lg.fillStyle = gr; lg.beginPath(); lg.arc(x, y, r, 0, Math.PI * 2); lg.fill(); }
    // 가운데 용암 구덩이 둘레: 그을리고 달아오른 바닥
    const cg = lg.createRadialGradient(640, 360, 90, 640, 360, 210); cg.addColorStop(0, 'rgba(200,70,20,0.16)'); cg.addColorStop(0.4, 'rgba(70,16,6,0.25)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
    lg.fillStyle = cg; lg.beginPath(); lg.arc(640, 360, 210, 0, Math.PI * 2); lg.fill();
    // 불씨 점
    for (let i = 0; i < 60; i++) { lg.fillStyle = `rgba(255,${Math.floor(rnd(90, 170))},40,${rnd(0.15, 0.35)})`; lg.fillRect(rnd(0, W), rnd(0, H), 2, 2); }
    vignette(lg, '10,0,0', 0.65);
    const lw = wallLayer(lavaWalls, (w, x, y, ww, hh) => {
      const gr = w.createLinearGradient(0, y, 0, y + hh); gr.addColorStop(0, '#5a3a32'); gr.addColorStop(1, '#2c1814');
      w.fillStyle = gr; w.beginPath(); w.roundRect(x, y, ww, hh, 6); w.fill();
      // 울퉁불퉁한 돌 결
      w.save(); w.beginPath(); w.roundRect(x, y, ww, hh, 6); w.clip();
      for (let i = 0; i < (ww * hh) / 120; i++) { w.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,220,200'},${rnd(0.04, 0.12)})`; const s = rnd(3, 9); w.fillRect(x + rnd(0, ww), y + rnd(0, hh), s, s * rnd(0.5, 1)); }
      // 빛나는 금
      w.strokeStyle = 'rgba(220,100,30,0.6)'; w.lineWidth = 1.4; w.shadowColor = 'rgba(255,90,20,0.5)'; w.shadowBlur = 4;
      for (let k = 0; k < Math.max(1, Math.round((ww + hh) / 60)); k++) {
        let cx = x + rnd(4, ww - 4), cy = y + rnd(4, hh - 4); w.beginPath(); w.moveTo(cx, cy);
        for (let s = 0; s < 4; s++) { cx += rnd(-12, 12); cy += rnd(-10, 10); w.lineTo(Math.max(x + 2, Math.min(x + ww - 2, cx)), Math.max(y + 2, Math.min(y + hh - 2, cy))); }
        w.stroke();
      }
      w.shadowBlur = 0; w.restore();
      w.fillStyle = 'rgba(255,200,170,0.18)'; w.fillRect(x + 3, y + 1, ww - 6, 3);
      w.strokeStyle = '#120806'; w.lineWidth = 2.5; w.beginPath(); w.roundRect(x + 1, y + 1, ww - 2, hh - 2, 6); w.stroke();
    });

    // ===================== 설원 =====================
    seed = 4242;
    const snowWalls = MAPS[2].buildWalls().map((w) => [w.rect.x, w.rect.y, w.rect.w, w.rect.h]);
    const ice = MAPS[2].buildHazards().filter((h) => h instanceof IcePatch).map((h) => h.rect);
    const sf = voronoi(150,
      (v, x, y) => { const n = noise(x, y) * 8, base = 30 + v * 12 + n; return [base * 0.8, base * 0.9, base * 1.15 + 6]; },
      { width: 3, color: () => [14, 18, 26] });
    const sg = sf.getContext('2d');
    // 쌓인 눈 더미 (부드러운 흰 얼룩) + 눈 알갱이
    for (let i = 0; i < 70; i++) {
      const x = rnd(0, W), y = rnd(0, H), r = rnd(30, 110);
      const gr = sg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(190,205,225,${rnd(0.06, 0.13)})`); gr.addColorStop(1, 'rgba(210,225,240,0)');
      sg.fillStyle = gr; sg.beginPath(); sg.ellipse(x, y, r, r * rnd(0.4, 0.8), rnd(0, Math.PI), 0, Math.PI * 2); sg.fill();
    }
    for (let i = 0; i < 600; i++) { sg.fillStyle = `rgba(220,232,250,${rnd(0.08, 0.3)})`; const s = rnd(1, 2.4); sg.fillRect(rnd(0, W), rnd(0, H), s, s); }
    // 빙판: 매끈한 푸른 얼음 + 금 + 반사광
    for (const r of ice) {
      sg.save(); sg.beginPath(); sg.roundRect(r.x, r.y, r.w, r.h, 18); sg.clip();
      const gr = sg.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h); gr.addColorStop(0, 'rgba(70,120,160,0.45)'); gr.addColorStop(0.5, 'rgba(45,90,130,0.42)'); gr.addColorStop(1, 'rgba(65,115,155,0.45)');
      sg.fillStyle = gr; sg.fillRect(r.x, r.y, r.w, r.h);
      sg.strokeStyle = 'rgba(200,225,245,0.22)'; sg.lineWidth = 1.2;
      for (let k = 0; k < 14; k++) { let x = r.x + rnd(0, r.w), y = r.y + rnd(0, r.h); sg.beginPath(); sg.moveTo(x, y); for (let s = 0; s < 4; s++) { x += rnd(-30, 30); y += rnd(-30, 30); sg.lineTo(x, y); } sg.stroke(); }
      sg.strokeStyle = 'rgba(255,255,255,0.06)'; sg.lineWidth = 10;
      for (let k = -r.h; k < r.w; k += 90) { sg.beginPath(); sg.moveTo(r.x + k, r.y + r.h); sg.lineTo(r.x + k + r.h * 0.6, r.y); sg.stroke(); }
      sg.restore();
      sg.strokeStyle = 'rgba(170,205,230,0.4)'; sg.lineWidth = 2; sg.beginPath(); sg.roundRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 18); sg.stroke();
    }
    vignette(sg, '0,4,16', 0.55);
    const sw = wallLayer(snowWalls, (w, x, y, ww, hh) => {
      const gr = w.createLinearGradient(x, y, x + ww, y + hh); gr.addColorStop(0, '#6f98b4'); gr.addColorStop(1, '#3d6380');
      w.fillStyle = gr; w.beginPath(); w.roundRect(x, y, ww, hh, 5); w.fill();
      w.save(); w.beginPath(); w.roundRect(x, y, ww, hh, 5); w.clip();
      // 얼음 속 반사 사선 + 기포
      w.strokeStyle = 'rgba(255,255,255,0.12)'; w.lineWidth = 4;
      for (let k = -hh; k < ww; k += 26) { w.beginPath(); w.moveTo(x + k, y + hh); w.lineTo(x + k + hh * 0.5, y); w.stroke(); }
      for (let i = 0; i < (ww * hh) / 300; i++) { w.fillStyle = 'rgba(255,255,255,0.2)'; w.beginPath(); w.arc(x + rnd(0, ww), y + rnd(0, hh), rnd(0.8, 2), 0, Math.PI * 2); w.fill(); }
      w.restore();
      // 윗면에 쌓인 눈
      w.fillStyle = '#c4d4e0'; w.beginPath(); w.moveTo(x - 1, y + 6);
      for (let s = 0; s <= ww; s += 8) w.lineTo(x + s, y + 3 + Math.sin(s * 0.7 + x) * 2.5);
      w.lineTo(x + ww + 1, y + 6); w.lineTo(x + ww + 1, y - 2); w.quadraticCurveTo(x + ww / 2, y - 6, x - 1, y - 2); w.closePath(); w.fill();
      w.strokeStyle = '#2a4a66'; w.lineWidth = 2; w.beginPath(); w.roundRect(x + 1, y + 1, ww - 2, hh - 2, 5); w.stroke();
    });

    const prev = (f, w) => { const c = mk(W, H), g = c.getContext('2d'); g.drawImage(f, 0, 0); g.drawImage(w, 0, 0); return c.toDataURL('image/jpeg', 0.8); };
    return {
      lavaFloor: lf.toDataURL('image/webp', 0.86), lavaWalls: lw.toDataURL('image/png'), lavaPv: prev(lf, lw),
      snowFloor: sf.toDataURL('image/webp', 0.86), snowWalls: sw.toDataURL('image/png'), snowPv: prev(sf, sw),
    };
  });
  const save = (n, u) => fs.writeFileSync(path.join(OUT, n), Buffer.from(u.split(',')[1], 'base64'));
  save('arena_lava_floor.webp', res.lavaFloor); save('arena_lava_walls.png', res.lavaWalls); save('preview_arena_lava.jpg', res.lavaPv);
  save('arena_snow_floor.webp', res.snowFloor); save('arena_snow_walls.png', res.snowWalls); save('preview_arena_snow.jpg', res.snowPv);
  await b.close();
})();
