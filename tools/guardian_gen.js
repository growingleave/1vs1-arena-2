// 수호자 그림 생성 (미리 구워두는 용도). 게임용 = 그림의 1/2 크기 → web/assets/에 복사
//   guardian.png 128x128 : 몸 (다른 캐릭터처럼 흰 얼굴 + 검은 눈, 남색 헬멧·하늘색 바이저 띠) — 보통
//   guardian_shield.png 96x96 (게임 48) : 방패 정면 = 가운데 회색 금속 원 + 육각형 타일 에너지 막 — 보통
//   guardian_arc.png 64x152 (게임 32x76) : 세운 방패 위에서 본 활꼴. 게임 좌표 (10,-38)~(42,38), 원점 = 몸 가운데, 오른쪽 = 앞 — 보통
// 실행: node tools/guardian_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const OUTL = '#0b0d14', CY = '120, 220, 255';
    const hexPath = (g, x, y, r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); };
    // 육각형 타일을 clip 영역 안에 깐다
    const hexTiles = (g, x0, y0, w, h, r, fillA, lineA) => {
      const dx = r * Math.sqrt(3), dy = r * 1.5;
      for (let row = -1, y = y0 - r; y < y0 + h + r; row++, y += dy) {
        for (let x = x0 - r + (row % 2 ? dx / 2 : 0); x < x0 + w + r; x += dx) {
          hexPath(g, x, y, r - 1.2);
          g.fillStyle = `rgba(${CY}, ${fillA * (0.6 + 0.4 * ((x * 7 + y * 13) % 5) / 5)})`; g.fill();
          g.strokeStyle = `rgba(${CY}, ${lineA})`; g.lineWidth = 1.6; g.stroke();
        }
      }
    };

    // ---------- 방패 정면 ----------
    const S = mk(96, 96), s = S.getContext('2d'), C = 48;
    // 바깥 빛
    const gl = s.createRadialGradient(C, C, 30, C, C, 47); gl.addColorStop(0, `rgba(${CY},0.0)`); gl.addColorStop(0.7, `rgba(${CY},0.35)`); gl.addColorStop(1, `rgba(${CY},0)`);
    s.fillStyle = gl; s.beginPath(); s.arc(C, C, 47, 0, Math.PI * 2); s.fill();
    s.save(); s.beginPath(); s.arc(C, C, 40, 0, Math.PI * 2); s.clip();
    s.fillStyle = 'rgba(20, 60, 90, 0.55)'; s.fillRect(0, 0, 96, 96);
    hexTiles(s, 0, 0, 96, 96, 8, 0.28, 0.85);
    s.restore();
    s.strokeStyle = `rgba(${CY}, 1)`; s.lineWidth = 3; s.beginPath(); s.arc(C, C, 40, 0, Math.PI * 2); s.stroke();
    s.strokeStyle = 'rgba(230, 250, 255, 0.9)'; s.lineWidth = 1.2; s.beginPath(); s.arc(C, C, 38, 0, Math.PI * 2); s.stroke();
    // 가운데 회색 금속 원
    const mg = s.createRadialGradient(C - 5, C - 6, 2, C, C, 17); mg.addColorStop(0, '#e6e9ee'); mg.addColorStop(0.55, '#9aa1ab'); mg.addColorStop(1, '#5a616c');
    s.fillStyle = mg; s.strokeStyle = OUTL; s.lineWidth = 3; s.beginPath(); s.arc(C, C, 16, 0, Math.PI * 2); s.fill(); s.stroke();
    s.strokeStyle = 'rgba(40, 45, 55, 0.7)'; s.lineWidth = 1.5; s.beginPath(); s.arc(C, C, 10, 0, Math.PI * 2); s.stroke();
    s.fillStyle = `rgba(${CY}, 0.9)`; s.beginPath(); s.arc(C, C, 4, 0, Math.PI * 2); s.fill();

    // ---------- 세운 방패 (위에서 본 활꼴) ----------
    // 게임 좌표 (10,-38)~(42,38) → 그림 2배: 원점 (−20, 76)
    const A = mk(64, 152), a = A.getContext('2d');
    a.translate(-20, 76);
    const R = 68, half = 62 * Math.PI / 180, band = 16;
    const arcPath = () => { a.beginPath(); a.arc(0, 0, R + band / 2, -half, half); a.arc(0, 0, R - band / 2, half, -half, true); a.closePath(); };
    a.save(); a.shadowColor = `rgba(${CY},0.9)`; a.shadowBlur = 10; arcPath(); a.fillStyle = 'rgba(20, 60, 90, 0.6)'; a.fill(); a.restore();
    a.save(); arcPath(); a.clip(); hexTiles(a, 30, -76, 60, 152, 6, 0.35, 0.9); a.restore();
    arcPath(); a.strokeStyle = `rgba(${CY}, 1)`; a.lineWidth = 2.5; a.stroke();
    // 가운데 회색 원 (가장자리에서 본 것 → 납작한 타원)
    const mg2 = a.createLinearGradient(R - 8, 0, R + 8, 0); mg2.addColorStop(0, '#5a616c'); mg2.addColorStop(0.5, '#d6dae0'); mg2.addColorStop(1, '#5a616c');
    a.fillStyle = mg2; a.strokeStyle = OUTL; a.lineWidth = 2.5; a.beginPath(); a.ellipse(R, 0, 8, 17, 0, 0, Math.PI * 2); a.fill(); a.stroke();

    // ---------- 몸 ----------
    const B = mk(128, 128), g = B.getContext('2d'); g.lineJoin = 'round';
    // 어깨·몸통 (남색 갑옷)
    g.fillStyle = '#22314f'; g.strokeStyle = OUTL; g.lineWidth = 5;
    g.beginPath(); g.moveTo(22, 127); g.lineTo(26, 100); g.quadraticCurveTo(64, 86, 102, 100); g.lineTo(106, 127); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#9aa1ab'; g.beginPath(); g.ellipse(64, 112, 10, 9, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = `rgba(${CY},1)`; g.beginPath(); g.arc(64, 112, 3.5, 0, Math.PI * 2); g.fill();
    // 얼굴 (흰 네모)
    g.fillStyle = '#ffffff'; g.lineWidth = 5; g.beginPath(); g.roundRect(30, 46, 68, 52, 6); g.fill(); g.stroke();
    // 눈
    g.fillStyle = '#111'; g.fillRect(50, 62, 8, 20); g.fillRect(72, 62, 8, 20);
    // 헬멧 (남색 + 하늘색 띠, 귀 쪽 날개)
    g.fillStyle = '#22314f'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(24, 58); g.quadraticCurveTo(24, 14, 64, 12); g.quadraticCurveTo(104, 14, 104, 58); g.lineTo(96, 58); g.lineTo(94, 46); g.lineTo(34, 46); g.lineTo(32, 58); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = `rgba(${CY},1)`; g.beginPath(); g.roundRect(30, 38, 68, 8, 3); g.fill(); g.lineWidth = 3; g.stroke();
    g.fillStyle = '#3c5584'; g.beginPath(); g.moveTo(40, 22); g.quadraticCurveTo(64, 14, 88, 22); g.lineTo(84, 28); g.quadraticCurveTo(64, 22, 44, 28); g.closePath(); g.fill();
    // 이마 육각 문양
    g.beginPath(); for (let i = 0; i < 6; i++) { const q = Math.PI / 6 + i * Math.PI / 3; g.lineTo(64 + Math.cos(q) * 7, 28 + Math.sin(q) * 7); } g.closePath(); g.fillStyle = `rgba(${CY},1)`; g.fill(); g.lineWidth = 2.5; g.stroke();

    const pv = mk(300, 160), q = pv.getContext('2d'); q.fillStyle = '#1b1b22'; q.fillRect(0, 0, 300, 160);
    q.drawImage(B, 4, 16); q.drawImage(S, 140, 30); q.drawImage(A, 240, 4);
    return { body: B.toDataURL(), shield: S.toDataURL(), arc: A.toDataURL(), pv: pv.toDataURL() };
  });
  const save = (n, u) => fs.writeFileSync(path.join(OUT, n), Buffer.from(u.split(',')[1], 'base64'));
  save('guardian.png', res.body); save('guardian_shield.png', res.shield); save('guardian_arc.png', res.arc); save('preview_guardian.png', res.pv);
  await b.close();
})();
