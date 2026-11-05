// 클래식 아레나(기본맵) 바닥·벽 그림 생성 (미리 구워두는 용도) → web/assets/에 복사
//   arena_classic_floor.webp 1280x720 : 어두운 금속 바닥 타일 + 가운데 원형 표시 + 양쪽 시작 구역 + 가장자리 경고 띠 — 보통 (맨 먼저)
//   arena_classic_walls.png  1280x720 : 벽(그림자·윤곽·리벳 포함), 나머지 투명 — 보통 (바닥 이펙트 다음, 캐릭터 전)
// 벽 위치는 게임의 MAPS[0].buildWalls()에서 읽으므로 벽을 옮기면 이 스크립트를 다시 돌린다.
// 실행: node tools/arena_classic_gen.js <저장할 폴더>  (Playwright 필요)
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
    const walls = MAPS[0].buildWalls().map((w) => [w.rect.x, w.rect.y, w.rect.w, w.rect.h]);
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    let seed = 12345; const rnd = (a = 0, b = 1) => { seed = (seed * 1664525 + 1013904223) >>> 0; return a + (seed / 4294967296) * (b - a); };

    // ================= 바닥 =================
    const f = mk(W, H), g = f.getContext('2d');
    g.fillStyle = '#15151b'; g.fillRect(0, 0, W, H);
    // 80x80 금속 판: 판마다 밝기 조금씩 다르게 + 위쪽 밝은 모서리, 아래쪽 어두운 이음새
    const T = 80;
    for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) {
      const v = 22 + Math.floor(rnd(-3, 4));
      g.fillStyle = `rgb(${v}, ${v}, ${v + 6})`; g.fillRect(x + 1, y + 1, T - 2, T - 2);
      const gr = g.createLinearGradient(x, y, x + T, y + T); gr.addColorStop(0, 'rgba(255,255,255,0.025)'); gr.addColorStop(1, 'rgba(0,0,0,0.06)');
      g.fillStyle = gr; g.fillRect(x + 1, y + 1, T - 2, T - 2);
      g.fillStyle = 'rgba(255,255,255,0.045)'; g.fillRect(x + 1, y + 1, T - 2, 1); g.fillRect(x + 1, y + 1, 1, T - 2);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + T - 1, T, 1); g.fillRect(x + T - 1, y, 1, T);
      // 판 모서리 나사
      g.fillStyle = 'rgba(255,255,255,0.07)';
      for (const [dx, dy] of [[6, 6], [T - 8, 6], [6, T - 8], [T - 8, T - 8]]) { g.beginPath(); g.arc(x + dx + 1, y + dy + 1, 1.6, 0, Math.PI * 2); g.fill(); }
      // 가끔 줄무늬 미끄럼 방지 판
      if (rnd() < 0.12) {
        g.save(); g.beginPath(); g.rect(x + 10, y + 10, T - 20, T - 20); g.clip();
        g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 3;
        for (let k = -T; k < T; k += 10) { g.beginPath(); g.moveTo(x + 10 + k, y + 10); g.lineTo(x + 10 + k + T, y + 10 + T); g.stroke(); }
        g.restore();
      }
    }
    // 긁힌 자국·얼룩
    for (let i = 0; i < 70; i++) {
      const x = rnd(0, W), y = rnd(0, H), a = rnd(0, Math.PI), l = rnd(8, 40);
      g.strokeStyle = `rgba(255,255,255,${rnd(0.02, 0.05)})`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (let i = 0; i < 14; i++) {
      const x = rnd(0, W), y = rnd(0, H), r = rnd(20, 60);
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // 가운데 원형 경기 표시 (바랜 페인트)
    const paint = (col, a) => `rgba(${col},${a})`;
    g.lineWidth = 4; g.strokeStyle = paint('210,180,90', 0.16); g.beginPath(); g.arc(640, 360, 150, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2; g.strokeStyle = paint('210,180,90', 0.12); g.beginPath(); g.arc(640, 360, 165, 0, Math.PI * 2); g.stroke();
    g.setLineDash([14, 10]); g.lineWidth = 2; g.strokeStyle = paint('210,180,90', 0.12);
    g.beginPath(); g.moveTo(640, 20); g.lineTo(640, 190); g.moveTo(640, 530); g.lineTo(640, 700); g.stroke(); g.setLineDash([]);
    // 양쪽 시작 구역 (P1 빨강 왼쪽, P2 파랑 오른쪽)
    // 시작 자리 = 게임의 시작 위치(몸 가운데 (220,380), (1060,380))
    const zone = (x, y, col) => {
      g.fillStyle = paint(col, 0.06); g.beginPath(); g.arc(x, y, 46, 0, Math.PI * 2); g.fill();
      g.strokeStyle = paint(col, 0.3); g.lineWidth = 3; g.beginPath(); g.arc(x, y, 46, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = paint(col, 0.16); g.lineWidth = 2; g.beginPath(); g.arc(x, y, 30, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = paint(col, 0.35); g.lineWidth = 3;
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { g.beginPath(); g.moveTo(x + Math.cos(a) * 52, y + Math.sin(a) * 52); g.lineTo(x + Math.cos(a) * 64, y + Math.sin(a) * 64); g.stroke(); }
    };
    zone(220, 380, '230,70,70'); zone(1060, 380, '70,140,240');
    // 가장자리 경고 띠 (노랑·검정 사선, 바램)
    const band = 12;
    g.save(); g.beginPath(); g.rect(0, 0, W, H); g.rect(band, band, W - band * 2, H - band * 2); g.clip('evenodd');
    g.fillStyle = '#1c1a12'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(200,160,40,0.32)'; g.lineWidth = 9;
    for (let k = -H; k < W + H; k += 26) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + H, H); g.stroke(); }
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2; g.strokeRect(band + 1, band + 1, W - band * 2 - 2, H - band * 2 - 2);
    // 가장자리 어둡게 (비네트)
    const vg = g.createRadialGradient(640, 360, 260, 640, 360, 780); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);

    // ================= 벽 =================
    const wc = mk(W, H), w = wc.getContext('2d');
    // 바닥에 떨어지는 그림자 (오른쪽 아래로)
    w.fillStyle = 'rgba(0,0,0,0.45)'; for (const [x, y, ww, hh] of walls) w.fillRect(x + 7, y + 9, ww, hh);
    w.filter = 'blur(4px)'; w.drawImage(wc, 0, 0); w.filter = 'none';
    for (const [x, y, ww, hh] of walls) {
      // 몸통: 위가 밝은 어두운 강철
      const gr = w.createLinearGradient(0, y, 0, y + hh); gr.addColorStop(0, '#5a5e6c'); gr.addColorStop(1, '#3a3d48');
      w.fillStyle = gr; w.fillRect(x, y, ww, hh);
      // 안쪽 판 + 테두리
      w.strokeStyle = 'rgba(0,0,0,0.35)'; w.lineWidth = 2; w.strokeRect(x + 7, y + 7, ww - 14, hh - 14);
      w.strokeStyle = 'rgba(255,255,255,0.06)'; w.lineWidth = 1; w.strokeRect(x + 8.5, y + 8.5, ww - 17, hh - 17);
      // 밝은 윗면·왼쪽, 어두운 아래·오른쪽 (입체감)
      w.fillStyle = 'rgba(255,255,255,0.22)'; w.fillRect(x, y, ww, 3); w.fillRect(x, y, 3, hh);
      w.fillStyle = 'rgba(0,0,0,0.4)'; w.fillRect(x, y + hh - 4, ww, 4); w.fillRect(x + ww - 3, y, 3, hh);
      // 긴 벽은 경고 띠 한 줄
      if (Math.max(ww, hh) >= 150) {
        w.save(); w.beginPath();
        if (ww >= hh) w.rect(x + 16, y + hh / 2 - 4, ww - 32, 8); else w.rect(x + ww / 2 - 4, y + 16, 8, hh - 32);
        w.clip(); w.fillStyle = '#20201a'; w.fillRect(x, y, ww, hh);
        w.strokeStyle = 'rgba(220,170,40,0.55)'; w.lineWidth = 5;
        for (let k = -hh - ww; k < ww + hh; k += 14) { w.beginPath(); w.moveTo(x + k, y); w.lineTo(x + k + hh, y + hh); w.stroke(); }
        w.restore();
      }
      // 모서리 리벳
      for (const [rx, ry] of [[x + 4, y + 4], [x + ww - 5, y + 4], [x + 4, y + hh - 6], [x + ww - 5, y + hh - 6]]) {
        w.fillStyle = '#20222a'; w.beginPath(); w.arc(rx + 1, ry + 1, 2.2, 0, Math.PI * 2); w.fill();
        w.fillStyle = '#9aa0ae'; w.beginPath(); w.arc(rx + 0.5, ry + 0.5, 1.4, 0, Math.PI * 2); w.fill();
      }
      w.strokeStyle = '#121318'; w.lineWidth = 2; w.strokeRect(x + 1, y + 1, ww - 2, hh - 2);
    }

    const pv = mk(W, H), px = pv.getContext('2d'); px.drawImage(f, 0, 0); px.drawImage(wc, 0, 0);
    return { floor: f.toDataURL('image/webp', 0.86), walls: wc.toDataURL('image/png'), pv: pv.toDataURL('image/png') };
  });
  const save = (n, u) => fs.writeFileSync(path.join(OUT, n), Buffer.from(u.split(',')[1], 'base64'));
  save('arena_classic_floor.webp', res.floor); save('arena_classic_walls.png', res.walls); save('preview_arena_classic.png', res.pv);
  await b.close();
})();
