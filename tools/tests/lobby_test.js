// 방 목록(멀티존 방식) 테스트: 이름·비밀번호로 방 만들기 → 다른 기기 목록에 보임 → 비밀번호 틀림/맞음 → 대전 시작,
// 비밀번호 없는 방은 누르면 바로 들어감, 게임 중인 방은 못 누름, 금지어 가리기
// 실행: 서버를 먼저 켜고 (PORT=3123 npm start) → PORT=3123 node tools/tests/lobby_test.js [스크린샷 폴더]
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const PORT = process.env.PORT || 3000;
const OUT = process.argv[2];

(async () => {
  const b = await chromium.launch();
  const errs = [];
  const open = async () => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(600); return p;
  };
  const ok = (cond, label) => { console.log((cond ? '통과' : '실패') + ' - ' + label); if (!cond) process.exitCode = 1; };
  const [host, guest, viewer] = [await open(), await open(), await open()];

  // 1. 비밀번호 방 만들기
  await host.click('#btn-create'); await host.fill('#room-name', '친구랑 한판'); await host.fill('#room-pw', '1234'); await host.click('#btn-create-ok');
  await host.waitForFunction(() => Net.status === 'waiting', null, { timeout: 10000 });
  const code = await host.evaluate(() => Net.code);
  // 2. 다른 기기 목록에 보임
  await guest.waitForFunction((c) => Lobby.rooms.some((r) => r.id === c), code, { timeout: 5000 });
  const r = await guest.evaluate((c) => Lobby.rooms.find((x) => x.id === c), code);
  ok(r.name === '친구랑 한판' && r.locked && r.state === 'waiting', `목록에 방 이름·잠금 표시 (${JSON.stringify(r)})`);
  if (OUT) await guest.screenshot({ path: OUT + '/lobby_list.png' });
  // 3. 누르면 비밀번호 칸 → 틀리면 오류, 맞으면 시작
  await guest.click(`.room[data-id="${code}"]`);
  ok(!!(await guest.waitForSelector('#join-pw', { state: 'visible', timeout: 3000 }).catch(() => null)), '잠긴 방을 누르면 비밀번호 칸이 열림');
  await guest.fill('#join-pw', '9999'); await guest.click('#btn-pw-ok');
  await guest.waitForFunction(() => Net.lastErrorCode === 'badpw', null, { timeout: 5000 });
  ok((await guest.textContent('#lobby .notice')).includes('틀렸'), '틀린 비밀번호 → 안내');
  ok(await guest.isVisible('#join-pw'), '틀려도 비밀번호 칸 유지');
  await guest.waitForTimeout(1700); // 틀린 뒤 잠깐 대기 (서버 제한 1.5초)
  await guest.fill('#join-pw', '1234'); await guest.click('#btn-pw-ok');
  await host.waitForFunction(() => Net.isOnline(), null, { timeout: 20000 });
  await guest.waitForFunction(() => Net.isOnline(), null, { timeout: 20000 });
  ok(true, '맞는 비밀번호 → 대전 시작');
  // 4. 구경꾼 목록: 게임 중이라 못 누름
  await viewer.waitForFunction((c) => (Lobby.rooms.find((x) => x.id === c) || {}).state === 'playing', code, { timeout: 5000 });
  ok(await viewer.isDisabled(`.room[data-id="${code}"]`), '게임 중인 방은 못 누름');

  // 5. 비밀번호 없는 방 + 금지어
  const h2 = await open(), g2 = await open();
  await h2.click('#btn-create'); await h2.fill('#room-name', '시발 놀자'); await h2.click('#btn-create-ok');
  await h2.waitForFunction(() => Net.status === 'waiting', null, { timeout: 10000 });
  const code2 = await h2.evaluate(() => Net.code);
  await g2.waitForFunction((c) => Lobby.rooms.some((r) => r.id === c), code2, { timeout: 5000 });
  const r2 = await g2.evaluate((c) => Lobby.rooms.find((x) => x.id === c), code2);
  ok(!r2.locked && !r2.name.includes('시발'), `비밀번호 없음 + 금지어 가림 (${r2.name})`);
  if (OUT) await g2.screenshot({ path: OUT + '/lobby_list2.png' });
  await g2.click(`.room[data-id="${code2}"]`);
  await g2.waitForFunction(() => Net.isOnline(), null, { timeout: 20000 });
  ok(true, '비밀번호 없는 방은 누르면 바로 들어감');

  // 6. 방장이 나가면 목록에서 사라짐
  const h3 = await open();
  await h3.click('#btn-create'); await h3.click('#btn-create-ok');
  await h3.waitForFunction(() => Net.status === 'waiting', null, { timeout: 10000 });
  const code3 = await h3.evaluate(() => Net.code);
  await viewer.waitForFunction((c) => Lobby.rooms.some((r) => r.id === c), code3, { timeout: 5000 });
  await h3.context().close();
  await viewer.waitForFunction((c) => !Lobby.rooms.some((r) => r.id === c), code3, { timeout: 5000 });
  ok(true, '방장이 창을 닫으면 목록에서 사라짐');
  ok(errs.length === 0, '페이지 오류 없음 ' + JSON.stringify(errs));
  await b.close();
})();
