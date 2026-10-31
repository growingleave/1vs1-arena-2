// 연습장 확인 이미지 찍기 (템플릿): 캐릭터를 세우고 스킬을 쓴 뒤 원하는 순간을 작은 그림으로 저장한다.
// 실행: node tools/tests/shot.js <캐릭터번호> <스킬번호 0~3> <저장할 폴더> [찍을 시각ms,...]
//   예) node tools/tests/shot.js 3 1 /tmp/out 100,300,600  → /tmp/out/shot_100.png ... 와 한 장으로 합친 shot_all.png
// 다른 장면(이동하면서, 벽 앞에서 등)이 필요하면 이 파일을 복사해서 아래 장면 부분만 고친다.
const path = require('path');
const fs = require('fs');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const [CH = '0', SK = '0', OUT = '.', TIMES = '100,300,600'] = process.argv.slice(2);
const times = TIMES.split(',').map(Number);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../web/index.html')); await p.waitForTimeout(400);
  await p.keyboard.press('Digit2'); await p.waitForTimeout(300); // 연습장(LOADOUT)으로
  await p.evaluate(([ch]) => {
    // 시간을 직접 돌리기 위해 자동 그리기·VFX 갱신을 멈춘다
    Net.isOnline = () => true; window.__vu = Vfx.update.bind(Vfx); Vfx.update = () => {};
    window.__r = game.render.bind(game); game.render = () => {};
    window.__mk = (o = {}) => ({ up: false, down: false, left: false, right: false, skills: [false, false, false, false], ...o });
    window.__run = (ms, o) => { for (let t = 0; t < ms; t += 1000 / 60) { game.step(1 / 60, __mk(o), __mk()); __vu(1 / 60); } };
    window.__use = (i) => { const k = [false, false, false, false]; k[i] = true; game.step(1 / 60, __mk({ skills: k }), __mk()); __vu(1 / 60); };
    // 장면: P1을 (320,330)에 오른쪽 보게, 허수아비는 오른쪽 위
    Time.now += 5000; game.attacks = []; Vfx.clear();
    CHARACTER_REGISTRY[ch].apply(game.player1);
    const pl = game.player1; pl.rect.setCenter(320, 330); pl.facing = [1, 0];
    pl.statusEffects = {}; pl.castTimer = 0; pl.ultGauge = 100;
    pl.abilities.forEach((a) => a && (a.lastUsed = -99999));
    game.dummy1.hp = 99999; game.dummy1.rect.setCenter(440, 300);
  }, [Number(CH)]);
  await p.evaluate((sk) => __use(sk), Number(SK));
  fs.mkdirSync(OUT, { recursive: true });
  const clip = { x: 200, y: 200, width: 280, height: 200 };
  let t0 = 0; const files = [];
  for (const ms of times) {
    await p.evaluate((d) => __run(d), ms - t0); t0 = ms;
    await p.evaluate(() => __r(document.getElementById('game').getContext('2d')));
    const f = path.join(OUT, `shot_${ms}.png`); await p.screenshot({ path: f, clip }); files.push(f);
  }
  // 한 장으로 합치기 (가로로 나란히)
  const srcs = files.map((f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
  const url = await p.evaluate(async ([srcs, w, h]) => {
    const imgs = await Promise.all(srcs.map((s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; })));
    const c = document.createElement('canvas'); c.width = w * imgs.length; c.height = h;
    imgs.forEach((im, i) => c.getContext('2d').drawImage(im, i * w, 0, w, h)); return c.toDataURL();
  }, [srcs, clip.width, clip.height]);
  fs.writeFileSync(path.join(OUT, 'shot_all.png'), Buffer.from(url.split(',')[1], 'base64'));
  console.log('saved', path.join(OUT, 'shot_all.png'), 'errs', errs);
  await b.close();
})();
