// 렉 테스트: CPU를 느리게(기본 6배) 해서 저사양 크롬북을 흉내 내고, 실제 대전을 돌리며 한 프레임에 걸리는 시간을 잰다.
// 한 프레임 = 게임 1틱 + 이펙트 갱신 + 화면 그리기. 60fps를 지키려면 16.7ms 안에 끝나야 한다.
// 입력은 무작위로 스킬을 계속 누르고, 궁극기 게이지는 계속 가득 채운다 (가장 바쁜 상황).
// 실행: node tools/tests/perf_test.js [캐릭터번호쌍...]   예) node tools/tests/perf_test.js 4-6 1-2
//   번호를 안 주면 모든 캐릭터를 자기 자신과 한 번씩. CPU 배율은 THROTTLE=4 처럼 바꿀 수 있다.
//   PERF_EVAL='자바스크립트'로 측정 전에 페이지에서 코드를 실행할 수 있다 (예: 어떤 그리기를 꺼서 무게 비교)
// 주의: 헤드리스 크롬은 그리기를 GPU 없이 해서 실제 크롬북보다 그리기가 느리게 나올 수 있다 (보수적인 결과).
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const PAIRS = process.argv.slice(2).map((a) => a.split('-').map(Number));
const THROTTLE = Number(process.env.THROTTLE || 6);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '../../web/index.html')); await p.waitForTimeout(500);
  await p.evaluate(() => { window.__realRender = game.render.bind(game); game.render = () => {}; }); // 자동 루프는 멈춤
  if (process.env.PERF_EVAL) await p.evaluate(process.env.PERF_EVAL);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  const pairs = PAIRS.length ? PAIRS : await p.evaluate(() => CHARACTER_REGISTRY.map((_, i) => [i, i]));
  console.log(`CPU ${THROTTLE}배 느리게, 대전 20초씩 (60fps 기준 한 프레임 16.7ms)`);
  for (const [c1, c2] of pairs) {
    const r = await p.evaluate(([c1, c2]) => {
      const ctx = document.getElementById('game').getContext('2d');
      const codes = [['KeyW','KeyS','KeyA','KeyD','KeyG','KeyH','KeyJ','KeyY'], ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyL','Semicolon','Quote','KeyP']];
      let seed = c1 * 100 + c2 + 3; const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      Time.now = 0; seedRandom(777); applyControlScheme('chromebook'); Vfx.clear();
      const g = new Game(); g.state = 'LOADOUT'; g.p1CharIdx = c1; g.p2CharIdx = c2; g.enterLoadout(); g.sides.forEach((s) => { s.mode = 'train'; });
      const held = [new Set(), new Set()]; const times = []; let maxVfx = 0;
      for (let f = 0; f < 60 * 23; f++) {
        const downs = [];
        if (f === 5) downs.push('Space', 'Enter');
        if (f === 200) downs.push('Space');
        for (let s = 0; s < 2; s++) if (rng() < 0.25) { const c = codes[s][Math.floor(rng() * 8)]; if (held[s].has(c)) held[s].delete(c); else { held[s].add(c); downs.push(c); } }
        pressedKeys.clear(); [...held[0], ...held[1]].forEach((c) => pressedKeys.add(c));
        tappedKeys.clear(); downs.forEach((c) => tappedKeys.add(c)); downs.forEach((c) => g.handleKeyDown(c));
        const t0 = performance.now();
        g.step(1 / 60, readInput(P1_CONTROLS), readInput(P2_CONTROLS));
        Vfx.update(1 / 60);
        window.__realRender.call(g, ctx);
        ctx.getImageData(0, 0, 1, 1); // 미뤄진 그리기를 이 자리에서 끝내게 해서 그리기 시간까지 잰다
        const dt = performance.now() - t0;
        tappedKeys.clear();
        if (g.state === 'BATTLE') {
          g.player1.hp = Math.max(g.player1.hp, 30); g.player2.hp = Math.max(g.player2.hp, 30);
          g.player1.ultGauge = 100; g.player2.ultGauge = 100;
          if (f > 240) { times.push(dt); maxVfx = Math.max(maxVfx, Vfx.active.length); }
        }
      }
      times.sort((a, b) => a - b);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      return { name: `${CHARACTER_REGISTRY[c1].name} vs ${CHARACTER_REGISTRY[c2].name}`, avg, p95: times[Math.floor(times.length * 0.95)], max: times[times.length - 1],
        over: times.filter((t) => t > 16.7).length / times.length * 100, maxVfx, n: times.length };
    }, [c1, c2]);
    console.log(`${r.name.padEnd(16)} 평균 ${r.avg.toFixed(1)}ms  상위5% ${r.p95.toFixed(1)}ms  최악 ${r.max.toFixed(1)}ms  16.7ms 넘김 ${r.over.toFixed(1)}%  이펙트 최대 ${r.maxVfx}개  (${r.n}프레임)`);
  }
  console.log('ERRS', errs);
  await b.close();
})();
