// 검사 궁극기 납도 그림 생성: 칼집 + 칼 (가로, 칼집 입구와 칼 손잡이가 오른쪽, 칼끝이 왼쪽)
// 불투명한 물체 그림이라 'lighter' 없이 보통으로 그린다. 칼을 먼저, 칼집을 위에 그리면 칼집 속 칼날이 가려진다
// 결과 (게임용 1/2 크기) → web/assets/에 복사
//   swordman_scabbard.png 190x30: 칼집 (왼쪽 끝 x 5, 입구 x 185)
//   swordman_sword.png    260x30: 칼 (칼끝 x 5, 칼날이 끝나는 곳(날밑 앞) x 178, 손잡이 끝 x 255)
//   preview_sheath.png (확인용)
// 실행: node tools/swordman_sheath_gen.js <저장할 폴더>  (Playwright 필요)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const OUT = process.argv[2] || __dirname;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const res = await p.evaluate(() => {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const H = 60, CY = 30;
    const vgrad = (c, y0, y1, stops) => { const g = c.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
    const silver = (c, y0, y1) => vgrad(c, y0, y1, [[0, '#f4f7fb'], [0.45, '#b9c2d0'], [0.55, '#8a93a3'], [1, '#d7dde6']]);

    // ---------- 칼집 ----------
    const sc = mk(380, H), s = sc.getContext('2d');
    // 몸통: 짙은 남색 옻칠, 윗면에 빛 받는 선
    s.fillStyle = vgrad(s, 17, 43, [[0, '#4a5170'], [0.3, '#262a3d'], [1, '#12141f']]);
    s.beginPath(); s.moveTo(18, 20); s.lineTo(368, 17); s.lineTo(368, 43); s.lineTo(18, 40); s.quadraticCurveTo(8, 30, 18, 20); s.fill();
    s.strokeStyle = 'rgba(160,175,220,0.5)'; s.lineWidth = 1.5;
    s.beginPath(); s.moveTo(24, 22); s.lineTo(360, 19.5); s.stroke();
    // 은 장식: 끝 마개, 가운데 띠 두 개, 입구 테
    s.fillStyle = silver(s, 18, 42);
    s.beginPath(); s.moveTo(18, 20); s.lineTo(40, 19.6); s.lineTo(40, 40.4); s.lineTo(18, 40); s.quadraticCurveTo(8, 30, 18, 20); s.fill();
    for (const x of [130, 250]) s.fillRect(x, 18.5, 8, 23);
    s.fillRect(344, 16, 24, 28);
    s.strokeStyle = '#5c6474'; s.lineWidth = 1;
    s.strokeRect(344, 16, 24, 28);
    // 끈 매듭 (입구 근처 아래쪽)
    s.strokeStyle = '#c9d2e3'; s.lineWidth = 3;
    s.beginPath(); s.moveTo(300, 40); s.quadraticCurveTo(290, 54, 270, 52); s.moveTo(306, 40); s.quadraticCurveTo(312, 55, 330, 53); s.stroke();
    // 입구 구멍 (칼이 들어가는 곳)
    s.fillStyle = '#05060a'; s.fillRect(366, 25, 4, 10);

    // ---------- 칼 ----------
    const sw = mk(520, H), w = sw.getContext('2d');
    // 칼날: 칼끝(왼쪽)이 뾰족, 등은 어둡고 날은 밝게, 물결 무늬(하몬)
    w.fillStyle = vgrad(w, 23, 37, [[0, '#7d8696'], [0.4, '#dfe5ee'], [0.75, '#ffffff'], [1, '#aeb6c4']]);
    w.beginPath(); w.moveTo(10, 32); w.quadraticCurveTo(26, 24, 46, 24); w.lineTo(356, 24); w.lineTo(356, 36); w.lineTo(30, 36); w.closePath(); w.fill();
    w.strokeStyle = 'rgba(255,255,255,0.95)'; w.lineWidth = 1.2;
    w.beginPath(); w.moveTo(14, 33); w.lineTo(356, 35.4); w.stroke();          // 날 끝 빛
    w.strokeStyle = 'rgba(140,160,190,0.7)'; w.lineWidth = 1;
    w.beginPath(); for (let x = 40; x <= 350; x += 6) w.lineTo(x, 31 + Math.sin(x * 0.22) * 1.2); w.stroke(); // 하몬
    w.strokeStyle = 'rgba(60,66,80,0.8)'; w.beginPath(); w.moveTo(46, 25.5); w.lineTo(356, 25.5); w.stroke(); // 등선
    // 칼날 고정쇠(금색)
    w.fillStyle = vgrad(w, 22, 38, [[0, '#fff0a8'], [0.5, '#d4a52a'], [1, '#7a5410']]); w.fillRect(352, 22, 14, 16);
    // 날밑: 세로로 긴 둥근 판
    w.fillStyle = vgrad(w, 6, 54, [[0, '#606a80'], [0.5, '#2a2e3c'], [1, '#14161e']]);
    w.beginPath(); w.ellipse(372, CY, 6, 23, 0, 0, Math.PI * 2); w.fill();
    w.strokeStyle = '#c9d2e3'; w.lineWidth = 1.5; w.stroke();
    // 손잡이: 남색 끈을 마름모로 감은 무늬 + 은 끝마개
    w.fillStyle = '#1c2236'; w.fillRect(378, 19, 120, 22);
    w.fillStyle = '#e8ecf3';
    for (let x = 384; x < 492; x += 14) { w.beginPath(); w.moveTo(x, CY); w.lineTo(x + 5, 21); w.lineTo(x + 10, CY); w.lineTo(x + 5, 39); w.closePath(); w.fill(); }
    w.fillStyle = '#1c2236';
    for (let x = 384; x < 492; x += 14) { w.beginPath(); w.moveTo(x + 2, CY); w.lineTo(x + 5, 25); w.lineTo(x + 8, CY); w.lineTo(x + 5, 35); w.closePath(); w.fill(); }
    w.fillStyle = silver(w, 18, 42); w.beginPath(); w.roundRect(496, 18, 14, 24, 5); w.fill();

    // 1/2 크기로
    const half = (c) => { const o = mk(c.width / 2, c.height / 2), x = o.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, o.width, o.height); return o; };
    const scH = half(sc), swH = half(sw);
    const pv = mk(560, 160), pc = pv.getContext('2d');
    pc.fillStyle = '#1e1e24'; pc.fillRect(0, 0, 560, 160);
    pc.drawImage(sw, 20, 10); pc.drawImage(sc, 20, 80);
    return { sc: scH.toDataURL('image/png'), sw: swH.toDataURL('image/png'), pv: pv.toDataURL('image/png') };
  });
  const save = (n, u) => fs.writeFileSync(`${OUT}/${n}`, Buffer.from(u.split(',')[1], 'base64'));
  save('swordman_scabbard.png', res.sc); save('swordman_sword.png', res.sw); save('preview_sheath.png', res.pv);
  await b.close();
})();
