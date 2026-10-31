// 온라인 동기화 테스트: 같은 입력으로 게임을 두 번 돌려(그리기 간격만 다르게) 매 틱 체크섬이 같은지 비교한다.
// 다르면 게임 로직이 화면(그리기·VFX)이나 Math.random에 영향을 받는다는 뜻.
// 실행: node tools/tests/sync_test.js [캐릭터번호쌍...]   예) node tools/tests/sync_test.js 3-3 3-0 0-3
//   (번호: 0 검사, 1 마법사, 2 무투가, 3 가속자, 4 데몰리셔니스트, 5 해커, 6 어쌔신, 7 그라인더, 8 DIO, 9 샌즈, 10 궁수)
//   번호를 안 주면 모든 캐릭터를 한 바퀴 돈다. 결과 줄이 전부 '같음', ERRS []면 통과.
const path = require('path');
const PAIRS = process.argv.slice(2).map((a) => a.split('-').map(Number));
const URL = 'file://' + path.resolve(__dirname, '../../web/index.html');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs=[]; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(500);
  const res = await p.evaluate((PAIRS) => {
    const ctx = document.getElementById('game').getContext('2d');
    const codes = [['KeyW','KeyS','KeyA','KeyD','KeyG','KeyH','KeyJ','KeyY'], ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyL','Semicolon','Quote','KeyP']];
    const scriptRng = (seed) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const run = (c1, c2, renderEvery) => {
      Time.now = 0; seedRandom(12345); applyControlScheme('chromebook');
      const g = new Game(); g.state = 'LOADOUT'; g.p1CharIdx = c1; g.p2CharIdx = c2; g.enterLoadout();
      const rng = scriptRng(c1 * 100 + c2 + 7); const sums = []; const held = [new Set(), new Set()];
      let vfxSeen = 0;
      for (let f = 0; f < 2400; f++) {
        const downs = [];
        if (f === 5) downs.push('Space', 'Enter');
        if (f === 200) downs.push('Space');
        for (let s = 0; s < 2; s++) if (rng() < 0.15) { const c = codes[s][Math.floor(rng() * 8)]; if (held[s].has(c)) held[s].delete(c); else { held[s].add(c); downs.push(c); } }
        pressedKeys.clear(); [...held[0], ...held[1]].forEach(c => pressedKeys.add(c));
        tappedKeys.clear(); downs.forEach(c => tappedKeys.add(c)); downs.forEach(c => g.handleKeyDown(c));
        g.step(1/60, readInput(P1_CONTROLS), readInput(P2_CONTROLS)); tappedKeys.clear();
        if (g.state === 'BATTLE') { g.player1.hp = Math.max(g.player1.hp, 30); g.player2.hp = Math.max(g.player2.hp, 30); }
        if (f % renderEvery === 0) { Vfx.update(renderEvery / 60); g.render(ctx); vfxSeen = Math.max(vfxSeen, Vfx.active.length); }
        sums.push(gameChecksum(g));
      }
      return { sums, vfxSeen };
    };
    const out = [];
    const pairs = PAIRS.length ? PAIRS : CHARACTER_REGISTRY.map((_, i) => [i, (i + 1) % CHARACTER_REGISTRY.length]);
    for (const [c1, c2] of pairs) {
      const a = run(c1, c2, 1), bb = run(c1, c2, 6);
      let diff = -1; for (let i = 0; i < a.sums.length; i++) if (a.sums[i] !== bb.sums[i]) { diff = i; break; }
      out.push(`${CHARACTER_REGISTRY[c1].name} vs ${CHARACTER_REGISTRY[c2].name}: ${diff === -1 ? '같음' : '다름 @' + diff} (화면에 동시에 있던 칼 이펙트 최대 ${a.vfxSeen}개)`);
    }
    return out;
  }, PAIRS);
  console.log(res.join('\n'), '\nERRS', errs);
  await b.close();
})();
