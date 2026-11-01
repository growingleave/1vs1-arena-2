// 마법사 스킬 2(비행) 이펙트 초안 미리보기: 게임에서 코드로 그릴 모양을 장면별로 한 장에 그린다
// 실행: node tools/mage_float_preview.js <저장할 폴더>  (Playwright 필요) → preview_float.png
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || __dirname;
const img = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '../web/assets', f)).toString('base64');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const url = await p.evaluate(async ([spriteSrc, staffSrc]) => {
    const load = async (s) => { const i = new Image(); i.src = s; await i.decode(); return i; };
    const sprite = await load(spriteSrc), staff = await load(staffSrc);
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const CYAN = [100, 220, 255], PURPLE = [180, 120, 255];
    const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
    let seed = 9; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    // 색을 입힌 스프라이트 (잔상·빛 테두리용)
    const tinted = (color) => { const c = mk(44, 44), x = c.getContext('2d'); x.drawImage(sprite, 0, 0, 44, 44); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, 44, 44); return c; };
    const tCyan = tinted(rgba(CYAN, 1)), tPurple = tinted(rgba(PURPLE, 1));

    const star = (c, x, y, r, a, col = [255, 255, 255]) => {
      c.fillStyle = rgba(col, a); c.beginPath();
      for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4, rr = k % 2 === 0 ? r : r * 0.25; c.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); }
      c.closePath(); c.fill();
    };
    const staffAt = (c, x, y, ang) => { c.save(); c.translate(x, y); c.rotate(ang); c.drawImage(staff, -172.5 * 0.34, -40 * 0.34, 210 * 0.34, 80 * 0.34); c.restore(); };

    // 그림자 (바닥, 몸보다 아래)
    const shadow = (c, x, y, s = 1) => { c.fillStyle = 'rgba(0,0,0,0.38)'; c.beginPath(); c.ellipse(x, y + 24, 17 * s, 6 * s, 0, 0, Math.PI * 2); c.fill(); };
    // 날개: 등 뒤 빛 깃털 3장씩
    const wings = (c, x, y, flap) => {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
        // 위·아래로 펼치고 뒤(왼쪽)로 젖힌 깃털 3장
        const len = 58 - i * 10, ang = s * (Math.PI / 2 + 0.55 + i * 0.3 - flap * 0.12);
        c.save(); c.translate(x - 4, y + s * 4); c.rotate(ang);
        const g = c.createLinearGradient(0, 0, len, 0); g.addColorStop(0, rgba(CYAN, 0.95)); g.addColorStop(0.6, rgba(PURPLE, 0.6)); g.addColorStop(1, rgba(PURPLE, 0));
        c.fillStyle = g; c.beginPath(); c.ellipse(len / 2 + 14, 0, len / 2, 8 - i * 1.5, 0, 0, Math.PI * 2); c.fill();
        c.restore();
      }
      c.restore();
    };
    // 떠 있는 몸: 빛 테두리 + 반투명 몸 + 지팡이
    const body = (c, x, y, { alpha = 0.72, aura = 1, withWings = false, flap = 0 } = {}) => {
      if (withWings) wings(c, x, y, flap);
      c.save(); c.globalCompositeOperation = 'lighter'; c.filter = 'blur(3px)'; c.globalAlpha = 0.9 * aura;
      c.drawImage(tCyan, x - 25, y - 25, 50, 50); c.globalAlpha = 0.6 * aura; c.drawImage(tPurple, x - 24, y - 24, 48, 48);
      c.restore();
      c.save(); c.globalAlpha = alpha; c.drawImage(sprite, x - 23, y - 23, 46, 46); c.restore();
      staffAt(c, x + 31, y, 0);
    };
    const label = (c, t) => { c.fillStyle = '#ffe14d'; c.font = 'bold 13px sans-serif'; c.fillText(t, 8, 18); };

    const PW = 240, PH = 200, N = 5;
    const sheet = mk(PW * N, PH), s = sheet.getContext('2d');
    s.fillStyle = '#1e1e24'; s.fillRect(0, 0, sheet.width, sheet.height);
    const panel = (i, fn) => { s.save(); s.translate(i * PW, 0); s.beginPath(); s.rect(0, 0, PW, PH); s.clip(); fn(s); s.restore(); s.fillStyle = '#333'; s.fillRect(i * PW + PW - 1, 0, 1, PH); };

    // 1) 떠오름: 발밑 마법진 + 위로 솟는 빛 고리 + 반짝이 폭발
    panel(0, (c) => {
      const x = 120, y = 110;
      c.save(); c.globalCompositeOperation = 'lighter';
      c.strokeStyle = rgba(CYAN, 0.9); c.lineWidth = 2; c.beginPath(); c.ellipse(x, y + 24, 34, 12, 0, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = rgba(PURPLE, 0.7); c.beginPath(); c.ellipse(x, y + 24, 24, 8, 0, 0, Math.PI * 2); c.stroke();
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; star(c, x + Math.cos(a) * 29, y + 24 + Math.sin(a) * 10, 3, 0.9, CYAN); }
      for (const [dy, a, r] of [[-6, 0.6, 28], [-26, 0.4, 24], [-46, 0.22, 20]]) { c.strokeStyle = rgba(CYAN, a); c.lineWidth = 2; c.beginPath(); c.ellipse(x, y + 24 + dy, r, r * 0.35, 0, 0, Math.PI * 2); c.stroke(); }
      for (let k = 0; k < 18; k++) { const a = rnd() * Math.PI * 2, d = 20 + rnd() * 40; star(c, x + Math.cos(a) * d, y + 5 + Math.sin(a) * d * 0.7, 2 + rnd() * 3, 0.5 + rnd() * 0.5, rnd() < 0.5 ? CYAN : PURPLE); }
      c.restore();
      shadow(c, x, y);
      body(c, x, y - 6, { alpha: 0.85 });
      label(c, '1) 떠오름');
    });

    // 2) 나는 중 (오른쪽으로 이동): 그림자 + 둥실 + 반투명·빛 테두리 + 잔상 + 가루 흔적
    const flying = (c, withWings) => {
      const x = 150, y = 100;
      shadow(c, x, y + 12, 0.85);
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) { const t = rnd(); star(c, x - 20 - t * 110, y + (rnd() - 0.5) * 30, 1.5 + rnd() * 2.5, (1 - t) * 0.9, rnd() < 0.5 ? CYAN : PURPLE); }
      for (let i = 3; i >= 1; i--) { c.globalAlpha = 0.32 - i * 0.07; c.drawImage(i % 2 ? tPurple : tCyan, x - 22 - i * 22, y - 22 + Math.sin(i) * 2, 44, 44); }
      c.restore();
      body(c, x, y, { withWings, flap: 0.6 });
    };
    panel(1, (c) => { flying(c, false); label(c, '2) 나는 중'); });
    panel(2, (c) => { flying(c, true); label(c, '2-b) 나는 중 + 날개'); });

    // 3) 벽 통과: 벽 위에 동심원 파문
    panel(3, (c) => {
      const x = 125, y = 100;
      c.fillStyle = '#646464'; c.fillRect(105, 30, 40, 150); c.strokeStyle = '#323232'; c.lineWidth = 2; c.strokeRect(106, 31, 38, 148);
      shadow(c, x, y + 12, 0.85);
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const [r, a] of [[16, 0.8], [28, 0.5], [40, 0.25]]) { c.strokeStyle = rgba(CYAN, a); c.lineWidth = 2; c.beginPath(); c.ellipse(x, y, r * 0.5, r, 0, 0, Math.PI * 2); c.stroke(); }
      c.restore();
      body(c, x, y, { alpha: 0.6 });
      label(c, '3) 벽 통과 파문');
    });

    // 4) 끝나기 직전 깜빡임 + 내려옴 충격파 (두 순간을 나란히)
    panel(4, (c) => {
      let x = 70, y = 95;
      shadow(c, x, y + 8, 0.9);
      body(c, x, y, { alpha: 0.85, aura: 0.25 });
      c.fillStyle = '#aaa'; c.font = '11px sans-serif'; c.fillText('깜빡(곧 끝남)', 30, 160);
      x = 175; y = 105;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const [r, a] of [[30, 0.7], [44, 0.35]]) { c.strokeStyle = rgba(CYAN, a); c.lineWidth = 2.5; c.beginPath(); c.ellipse(x, y + 20, r, r * 0.35, 0, 0, Math.PI * 2); c.stroke(); }
      c.restore();
      for (let k = 0; k < 8; k++) { const a = Math.PI + (k / 7) * Math.PI; c.fillStyle = 'rgba(200,200,210,0.35)'; c.beginPath(); c.arc(x + Math.cos(a) * 34, y + 20 + Math.sin(a) * -6 + 4, 4 + rnd() * 3, 0, Math.PI * 2); c.fill(); }
      c.drawImage(sprite, x - 22, y - 22, 44, 44); staffAt(c, x + 30, y, 0);
      c.fillStyle = '#aaa'; c.fillText('내려옴', 155, 160);
      label(c, '4) 끝 알림 · 착지');
    });

    // 2배로 키워서 저장
    const big = mk(sheet.width * 1.5, sheet.height * 1.5), bg = big.getContext('2d');
    bg.imageSmoothingEnabled = false; bg.drawImage(sheet, 0, 0, big.width, big.height);
    return big.toDataURL('image/png');
  }, [img('mage.png'), img('mage_staff.png')]);
  fs.writeFileSync(`${OUT}/preview_float.png`, Buffer.from(url.split(',')[1], 'base64'));
  await b.close();
})();
