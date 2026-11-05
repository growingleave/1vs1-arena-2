// 샌즈 (abilities/sans.py를 옮김)

const SANS_IMAGE = loadImage('assets/sans.png');

// 그림 (tools/sans_gen.js로 생성)
const SANS_BONE_IMAGE = loadImage('assets/sans_bone.png');         // 48x14 뼈다귀 (가운데) — 보통
// 해골 블래스터 (사용자 그림 누끼, 앞을 봄, 아래쪽이 입): 발사 전 / 발사 중 두 장을 바꿔 그린다
const SANS_BLASTER_IDLE_IMAGE = loadImage('assets/sans_blaster_idle.png'); // 332x443 발사 전 — 보통
const SANS_BLASTER_FIRE_IMAGE = loadImage('assets/sans_blaster_fire.png'); // 388x524 발사 중 (입이 열림) — 보통
const SANS_BLASTER_MOUTH_Y = 0.82; // 그림 높이에서 입(빔이 나오는 곳)의 위치 비율 (가로는 가운데)
const SANS_BEAM_IMAGE = loadImage('assets/sans_beam.png');         // 128x64 빔 몸통 (가로로 늘림) — 흰 빛, 색 입혀 'lighter'
const SANS_BEAM_COLOR = '#9ad8ff';

// 뼈 조각이 튀는 파티클 (화면 전용): 뼈다귀 그림을 작게 잘라 그린 조각 n개가 돌면서 튀고 떨어진다. 이펙트 하나로 묶음
class SansBoneChipsVFX {
    constructor(x, y, angle, n = 6) {
        this.elapsed = 0; this.duration = 0.55;
        this.chips = [];
        for (let i = 0; i < n; i++) {
            const a = angle + vfxRand(-1.2, 1.2), sp = vfxRand(90, 220);
            this.chips.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, rot: vfxRand(0, 6), vr: vfxRand(-14, 14), len: vfxRand(8, 14), end: vfxRand(0, 1) < 0.5 });
        }
    }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; for (const c of this.chips) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 420 * dt; c.rot += c.vr * dt; } }
    draw(ctx) {
        if (!isImageReady(SANS_BONE_IMAGE)) return;
        const a = 1 - Math.max(0, (this.elapsed - 0.3) / 0.25);
        ctx.save(); ctx.globalAlpha = a;
        for (const c of this.chips) {
            ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
            // 뼈다귀 그림의 끝(혹 달린 쪽) 또는 가운데 막대만 잘라 그려 '부러진 조각'처럼
            if (c.end) ctx.drawImage(SANS_BONE_IMAGE, 0, 0, 16, 14, -c.len / 2, -c.len * 0.3, c.len, c.len * 0.6);
            else ctx.drawImage(SANS_BONE_IMAGE, 18, 3, 12, 8, -c.len / 2, -c.len * 0.2, c.len, c.len * 0.4);
            ctx.restore();
        }
        ctx.restore();
    }
}

// 후딜레이: sec초 동안 이동 불가. 이미 더 오래 남은 슬로우(상대가 건 것 등)가 있으면 덮어쓰지 않는다
function sansPostDelay(owner, sec) {
    const e = owner.statusEffects.slow;
    if (e && e.duration >= sec) return;
    slow(owner, sec, 100);
}

// 흰 빛 점 (한 번 만들어 재사용)
let _sansGlowDot = null;
function sansGlowDot() {
    if (_sansGlowDot) return _sansGlowDot;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(190,240,255,0.7)'); g.addColorStop(1, 'rgba(150,220,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return (_sansGlowDot = c);
}

// 해골 블래스터 (화면 전용): 해골(발사 전 그림)이 입을 쏠 방향으로 향한 채 샌즈 뒤에서 나타나 기를 모으고, 발사 중엔 입 벌린 그림으로 바뀌어(경고 동안) 빔을 뿜은 뒤 입을 닫고 사라진다.
// 빔은 판정(BeamLaser)과 같은 자리·크기로 그린다: 몸 중심 + 방향*30 에서 시작, 길이 length, 폭 width
class SansBlasterVFX extends SparkVFX {
    constructor(laser, { scale, shake }) {
        super(SANS_BEAM_COLOR);
        this.laser = laser; this.owner = laser.owner; this.dir = laser.dirVec;
        this.angle = Math.atan2(this.dir[1], this.dir[0]);
        this.width = scale; this.scale = scale / 41; this.shakePower = shake; // scale = 해골 그림 가로 크기(px)
        this.delay = laser.delay / 1000; this.active = laser.activeDuration / 1000;
        this.duration = this.delay + this.active + 0.65;
        this.nextShake = 0;
    }
    get finished() { return this.elapsed >= this.duration && this.sparksDone; }
    origin() { const r = this.owner.rect; return [r.centerx + this.dir[0] * 30, r.centery + this.dir[1] * 30]; }
    update(dt) {
        super.update(dt);
        const t = this.elapsed;
        if (t >= this.delay && t < this.delay + this.active) {
            if (t >= this.nextShake) { Vfx.shake(this.shakePower, 0.12); this.nextShake = t + 0.1; }
            // 빔 가장자리와 끝에서 튀는 불똥
            const [ox, oy] = this.origin(), L = this.laser.length, W = this.laser.width / 2;
            const px = -this.dir[1], py = this.dir[0];
            for (let i = 0; i < (this.scale > 5 ? 5 : 2); i++) {
                const d = vfxRand(0, L), side = vfxRand(0, 1) < 0.5 ? -1 : 1;
                this.addSpark(ox + this.dir[0] * d + px * W * side, oy + this.dir[1] * d + py * W * side, Math.atan2(py * side, px * side) + vfxRand(-0.4, 0.4), vfxRand(60, 200), vfxRand(0.15, 0.35), vfxRand(1, 2.2));
            }
        }
    }
    draw(ctx) {
        const t = this.elapsed, s = this.scale, end = this.delay + this.active;
        const [ox, oy] = this.origin();
        // 나타남(0~0.15초) → 기 모으기(발사 전 그림) → 발사(발사 중 그림 + 떨림) → 발사 전 그림으로 돌아와 사라짐
        const appear = Math.min(1, t / Math.min(0.15, this.delay * 0.6));
        const alpha = appear * (1 - Math.max(0, (t - end - 0.2) / 0.4)); // 끝나고 0.2초 머문 뒤 0.4초 동안 사라짐
        if (alpha <= 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; this.drawSparks(ctx); ctx.restore(); return; }
        const firing = t >= this.delay && t < end;
        const jitter = firing ? Math.sin(t * 90) * 0.6 * s : 0;
        const back = 12 * s * (1 - appear) + (firing ? 1.5 * s : 0) - jitter;

        // 해골: 입이 빔 시작점에 오게, 그림 아래쪽이 쏘는 방향을 보게 돌린다
        const img = firing ? SANS_BLASTER_FIRE_IMAGE : SANS_BLASTER_IDLE_IMAGE;
        if (isImageReady(img)) {
            const w = this.width * (0.85 + 0.15 * appear) * (firing ? 1.06 : 1), h = w * img.naturalHeight / img.naturalWidth;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.imageSmoothingQuality = 'high'; // 줄여 그릴 때 도트가 지글거리지 않게
            ctx.translate(ox - this.dir[0] * back, oy - this.dir[1] * back);
            ctx.rotate(this.angle - Math.PI / 2);
            ctx.drawImage(img, -w / 2, -h * SANS_BLASTER_MOUTH_Y, w, h);
            ctx.restore();
        }

        // 빔 (판정 위치 그대로): 순식간에 뻗고, 깜빡이며 굵기가 살짝 출렁, 끝나면 가늘어지며 사라짐
        const bt = (t - this.delay) / this.active;
        if (bt > 0 && t < end + 0.12 && isImageReady(SANS_BEAM_IMAGE)) {
            const reach = Math.min(1, (t - this.delay) / 0.06);
            const thin = t > end ? 1 - (t - end) / 0.12 : 1;
            const w = this.laser.width * (0.92 + 0.08 * Math.sin(t * 70)) * thin * 1.25;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.translate(ox, oy); ctx.rotate(this.angle);
            ctx.drawImage(vfxTinted(SANS_BEAM_IMAGE, SANS_BEAM_COLOR), 0, -w / 2, this.laser.length * reach, w);
            ctx.globalAlpha = 0.85; ctx.drawImage(SANS_BEAM_IMAGE, 0, -w * 0.3, this.laser.length * reach, w * 0.6);
            // 입 앞 번쩍임
            ctx.globalAlpha = 1; const fl = Math.min(this.laser.width * 1.6, 220) + 5 * s;
            ctx.drawImage(sansGlowDot(), -fl / 2, -fl / 2, fl, fl);
            ctx.restore();
        }

        // 기 모으기: 입 앞에 커지는 빛 + 빨려 들어가는 빛 알갱이 (경고 동안)
        if (t < this.delay) {
            const k = t / this.delay;
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            const g = (8 + 26 * k) * s / 4;
            ctx.globalAlpha = 0.5 + 0.5 * k; ctx.drawImage(sansGlowDot(), ox - g, oy - g, g * 2, g * 2);
            ctx.fillStyle = 'rgba(190, 240, 255, 0.9)';
            for (let i = 0; i < 10; i++) {
                const ph = (t * 2.5 + i / 10) % 1, a = i * 2.39, d = (15 * s + 20) * (1 - ph);
                ctx.globalAlpha = ph;
                ctx.beginPath(); ctx.arc(ox + Math.cos(a) * d, oy + Math.sin(a) * d, 1.5 + 0.4 * s * ph, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; this.drawSparks(ctx); ctx.restore();
    }
}

// ==========================================
// [평타] 회전하는 뼈다귀 막대
// ==========================================
class SansSpinningBarBullet {
    constructor(owner, direction) {
        this.owner = owner;
        this.direction = direction;
        this.damage = owner.baseAtk * 0.9;
        this.speed = 11.0;
        this.createdTime = Time.now;
        this.lifespan = 1400;
        this.hitPlayers = [];
        this.width = 42;
        this.height = 12;
        this.posX = owner.rect.centerx + direction[0] * 20;
        this.posY = owner.rect.centery + direction[1] * 20;
        this.startX = this.posX;
        this.startY = this.posY;
        this.maxRange = 500;
        this.angle = 0.0;
    }

    getPolygonPoints() {
        return rotatedRectPoints(this.posX, this.posY, this.width, this.height, this.angle);
    }

    update() {
        this.posX += this.direction[0] * this.speed * this.owner.timeScale;
        this.posY += this.direction[1] * this.speed * this.owner.timeScale;
        this.angle += 15.0;
    }

    isExpired() {
        return Time.now - this.createdTime >= this.lifespan ||
               Math.hypot(this.posX - this.startX, this.posY - this.startY) >= this.maxRange;
    }

    collidesWith(target) {
        return canBeHit(this, target) && checkPolygonCollision(this.getPolygonPoints(), target.rect);
    }

    applyEffect(target) {
        slow(target, 0.4, 50);
        this.lifespan = 0;
        const ang = Math.atan2(this.direction[1], this.direction[0]);
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: SANS_BEAM_COLOR, angle: ang, count: 6, size: 14 }));
        Vfx.spawn(new SansBoneChipsVFX(target.rect.centerx, target.rect.centery, ang, 6));
    }

    // 빙글빙글 도는 뼈다귀 그림 (판정 42x12보다 살짝 크게)
    draw(ctx) {
        if (!isImageReady(SANS_BONE_IMAGE)) return;
        ctx.save();
        ctx.translate(this.posX, this.posY); ctx.rotate(-this.angle * Math.PI / 180);
        ctx.drawImage(SANS_BONE_IMAGE, -24, -7, 48, 14);
        ctx.restore();
    }
}

class SansBasicAttack extends Skill {
    constructor() { super('Spinning Bar', 350); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new SansSpinningBarBullet(owner, direction));
        sansPostDelay(owner, 0.15); // 후딜레이: 0.15초 이동 불가
    }
}

// ==========================================
// [스킬 1] 가스터 블래스터: 짧은 경고선 뒤 벽을 뚫는 레이저 (0.4초 속박)
// 레이저 틀(BeamLaser)은 common.js에 있고, 궁극기 거대 빔과 마법사 스킬 1도 같은 틀을 쓴다
// ==========================================
class SansGasterLaser extends BeamLaser {
    constructor(owner, direction) {
        super(owner, direction, { damageMult: 2.2, delay: 180, activeDuration: 200, width: 40, length: 550 });
        Vfx.spawn(new SansBlasterVFX(this, { scale: 100, shake: 4 })); // 해골·빔 그림은 이펙트가 그린다
    }

    applyEffect(target) {
        bind(target, 0.4);
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: SANS_BEAM_COLOR, angle: Math.atan2(this.dirVec[1], this.dirVec[0]), count: 14, size: 28 }));
    }

    // 경고선만 (해골·빔은 SansBlasterVFX)
    draw(ctx) {
        if (this.isWarning()) {
            const hl = this.length / 2;
            drawLine(ctx, this.posX - this.dirVec[0] * hl, this.posY - this.dirVec[1] * hl,
                     this.posX + this.dirVec[0] * hl, this.posY + this.dirVec[1] * hl, `rgba(100, 200, 255, ${120 / 255})`, 4);
        }
    }
}

class SansSkill1 extends Skill {
    constructor() { super('Gaster Blaster', 4000); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new SansGasterLaser(owner, direction));
        sansPostDelay(owner, 0.38); // 후딜레이: 레이저가 다 나갈 때까지(경고 0.18초 + 발사 0.2초) 이동 불가
    }
}

// ==========================================
// [스킬 2] 뼈다귀 벽: 맞은 상대를 벽째로 밀고 간다 (1.5초 이동 불가)
// ==========================================
class SansMovingWallBullet {
    constructor(owner, direction) {
        this.owner = owner;
        this.damage = owner.baseAtk * 0.6;
        this.speed = 8.0;
        this.createdTime = Time.now;
        this.lifespan = 1200;
        this.hitPlayers = [];
        this.dirVec = normalizeOr(direction);

        // 진행 방향에 맞춰 세로/가로 벽
        if (Math.abs(this.dirVec[0]) >= Math.abs(this.dirVec[1])) {
            this.width = 15;
            this.height = 100;
        } else {
            this.width = 100;
            this.height = 15;
        }

        this.posX = owner.rect.centerx + this.dirVec[0] * 40;
        this.posY = owner.rect.centery + this.dirVec[1] * 40;
        this.startX = this.posX;
        this.startY = this.posY;
        this.maxRange = 350;
        this.rect = this.getRect();
    }

    getRect() {
        return new Rect(Math.trunc(this.posX - Math.floor(this.width / 2)), Math.trunc(this.posY - Math.floor(this.height / 2)), this.width, this.height);
    }

    update() {
        const oldX = this.posX;
        const oldY = this.posY;
        this.posX += this.dirVec[0] * this.speed * this.owner.timeScale;
        this.posY += this.dirVec[1] * this.speed * this.owner.timeScale;
        this.rect = this.getRect();

        const col = new Rect(Math.trunc(this.posX - 7), Math.trunc(this.posY - 7), 14, 14);
        for (const wall of CURRENT_WALLS) {
            if (col.colliderect(wall.rect)) {
                this.posX = oldX;
                this.posY = oldY;
                this.rect = this.getRect();
                this.createdTime = Time.now - this.lifespan;
                return;
            }
        }

        // 맞은 상대를 같이 밀고 간다
        const dx = this.posX - oldX;
        const dy = this.posY - oldY;
        for (const target of this.hitPlayers) {
            moveEntityWithWalls(target, dx, dy, CURRENT_WALLS);
            slow(target, 0.2, 100);
        }
    }

    isExpired() {
        return Time.now - this.createdTime >= this.lifespan ||
               Math.hypot(this.posX - this.startX, this.posY - this.startY) >= this.maxRange;
    }

    collidesWith(target) {
        return canBeHit(this, target) && this.rect.colliderect(target.rect);
    }

    applyEffect(target) {
        slow(target, 1.5, 100);
        Vfx.spawn(new SansBoneChipsVFX(target.rect.centerx, target.rect.centery, Math.atan2(this.dirVec[1], this.dirVec[0]), 7));
    }

    // 뼈다귀 벽: 판정(가로 15 x 세로 100 또는 그 반대)의 긴 쪽을 따라 놓인 큰 뼈다귀 하나 (판정 그대로)
    draw(ctx) {
        if (!isImageReady(SANS_BONE_IMAGE)) return;
        const r = this.rect, vertical = r.h > r.w;
        const len = Math.max(r.w, r.h) + 14, thick = Math.min(r.w, r.h) + 9;
        ctx.save();
        ctx.translate(r.centerx, r.centery); if (vertical) ctx.rotate(Math.PI / 2);
        ctx.drawImage(SANS_BONE_IMAGE, -len / 2, -thick / 2, len, thick);
        ctx.restore();
    }
}

class SansSkill2 extends Skill {
    constructor() { super('Bone Wall Push', 5000); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new SansMovingWallBullet(owner, direction));
        sansPostDelay(owner, 0.2); // 후딜레이: 0.2초 이동 불가
    }
}

// ==========================================
// [궁극기] 메가 가스터 블래스터: 1초 동안 기를 모은 뒤(범위 경고 표시), 3초 동안 0.1초마다 피해를 주는 거대 빔.
// 기 모으는 동안과 쏘는 동안 모두 무적이지만 움직일 수 없다.
// (원본은 주석에 '1초 경고'라고 되어 있지만 값이 1ms라 경고 없이 바로 나갔다. 상대가 피할 수 있게 1초로 고침)
// ==========================================
const SANS_ULT_WINDUP_MS = 1300; // 기 모으는(경고) 시간 (원래 1000)
const SANS_ULT_FIRE_MS = 3000;

class SansMegaLaserBeam extends BeamLaser {
    constructor(owner, direction) {
        super(owner, direction, { damageMult: 0.5, delay: SANS_ULT_WINDUP_MS, activeDuration: SANS_ULT_FIRE_MS, width: 400, length: 1500 });
        this.interval = 100;
        this.lastDamageTick = 0;
        const lockSec = (SANS_ULT_WINDUP_MS + SANS_ULT_FIRE_MS) / 1000 + 0.6;
        silence(owner, lockSec);
        slow(owner, lockSec, 100);
        Vfx.spawn(new SansBlasterVFX(this, { scale: 280, shake: 6 })); // 거대 해골·빔 그림은 이펙트가 그린다
    }

    applyEffect(target) {
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: SANS_BEAM_COLOR, angle: Math.atan2(this.dirVec[1], this.dirVec[0]), count: 5, size: 18 }));
    }

    update() {
        defenseMod(this.owner, 0.2, 100);
        // 0.1초마다 맞은 목록을 비워 다시 맞을 수 있게 한다
        if (!this.isWarning() && Time.now - this.lastDamageTick >= this.interval) {
            this.lastDamageTick = Time.now;
            this.hitPlayers.length = 0;
        }
    }

    draw(ctx) {
        const pts = this.getPolygonPoints();
        if (this.isWarning()) this.drawWarning(ctx, pts); // 빔은 SansBlasterVFX가 그린다
    }

    // 기 모으는 동안의 경고: 쏠 때가 가까울수록 범위가 진해지고 빠르게 깜빡인다
    drawWarning(ctx, pts) {
        const progress = Math.min(1, (Time.now - this.createdTime) / this.delay); // 0 → 1
        const blinkSpeed = 0.012 + 0.03 * progress;
        const blink = (Math.sin((Time.now - this.createdTime) * blinkSpeed) + 1) / 2;

        // 1. 빔이 나갈 범위
        fillPolygon(ctx, pts, `rgba(100, 200, 255, ${0.08 + 0.22 * progress})`);
        ctx.save();
        ctx.setLineDash([18, 12]);
        ctx.lineDashOffset = -(Time.now - this.createdTime) * 0.1;
        drawPolygon(ctx, pts, 'rgba(0, 0, 0, 0)', `rgba(255, 90, 90, ${0.5 + 0.5 * blink})`, 3 + 2 * progress);
        ctx.restore();

        // 2. 가운데 경고선 (쏠 방향으로 점점 그어진다)
        const hl = this.length / 2;
        const sx = this.posX - this.dirVec[0] * hl;
        const sy = this.posY - this.dirVec[1] * hl;
        drawLine(ctx, sx, sy, sx + this.dirVec[0] * this.length * progress, sy + this.dirVec[1] * this.length * progress,
                 `rgba(255, 255, 255, ${0.4 + 0.5 * blink})`, 2);

        // 4. 머리 위 느낌표
        if (blink > 0.35) {
            drawText(ctx, '!', this.owner.rect.centerx, this.owner.rect.top - 40, 44, 'rgb(255, 90, 90)',
                     { bold: true, align: 'center', baseline: 'middle' });
        }
    }
}

class SansUltimate extends Skill {
    constructor() { super('Mega Judgment', 500, ['ult'], -99999); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new SansMegaLaserBeam(owner, direction));
    }
}

// ==========================================
// 캐릭터 등록
// ==========================================
function applySans(player) {
    player.baseAtk = 15;
    player.maxHp = 225;
    player.maxUltGauge = 160; // 궁극기 게이지 통 (검사 100 기준)
    player.hp = player.maxHp;
    player.speed = 4.4;
    player.dodgeTextTimer = -99999;
    player.lastDodgeTime = -99999;
    player.spriteImage = SANS_IMAGE;
    // 몸 그림: 바닥이 히트박스 바닥에 닿고, 모든 캐릭터가 같은 배율 (tools/portrait_gen.js 출력값)
    player.spriteSize = 49; // 15% 키움
    player.spriteAnchor = [0.504, 0.592];

    // 특성: 맞을 때 20% 확률로 완전 회피 + 슬로우/침묵 정화 + 0.2초 무적
    const baseTakeDamage = player.takeDamage.bind(player);
    player.takeDamage = (rawDamage) => {
        if (rawDamage <= 0) return 0.0;
        if (gameRandom() < 0.2) {
            player.dodgeTextTimer = Time.now;
            player.lastDodgeTime = Time.now;
            delete player.statusEffects.slow;
            delete player.statusEffects.silence;
            player.silenced = false;
            player.speedMultiplier = 1.0;
            defenseMod(player, 0.2, 100);
            player.defense = 100.0;
            return 0.0;
        }
        return baseTakeDamage(rawDamage);
    };

    // 회피 직후 0.2초 동안은 슬로우/침묵이 다시 걸려도 바로 지운다
    player.preUpdateHooks.push(() => {
        if (Time.now - player.lastDodgeTime < 200) {
            delete player.statusEffects.slow;
            delete player.statusEffects.silence;
            player.silenced = false;
            if (player.speedMultiplier < 1.0) player.speedMultiplier = 1.0;
        }
    });

    player.postDrawHooks.push((ctx) => {
        if (Time.now - player.dodgeTextTimer < 600) {
            drawText(ctx, '회피함!', player.rect.centerx, player.rect.top - 22, 20, 'rgb(255, 255, 0)',
                     { bold: true, align: 'center', baseline: 'middle' });
        }
    });

    player.abilities = [
        new SansBasicAttack(), // 평타
        new SansSkill1(),      // 스킬 1 (가스터 블래스터)
        new SansSkill2(),      // 스킬 2 (뼈다귀 벽)
        new SansUltimate(),    // 궁극기 (메가 가스터 블래스터)
    ];
}

const SANS_CHARACTER_DATA = {
    id: 'SANS',
    fxColor: '#9ad8ff',
    name: '샌즈',
    desc: '평타(0.35초): 회전하는 뼈다귀를 던집니다(13.5, 슬로우 50% 0.4초). 0.15초 후딜레이, 스킬 1(4초): 짧은 경고 뒤 가스터 블래스터가 벽을 뚫는 레이저를 쏩니다(33, 0.4초 속박). 레이저가 끝날 때까지 이동 불가, 스킬 2(5초): 긴 뼈다귀를 던져 맞은 적을 밀고 갑니다(9, 1.5초 이동 불가). 0.2초 후딜레이, 궁극기: 1.3초 동안 기를 모은 뒤(경고 표시) 거대한 블래스터 빔을 3초 동안 쏩니다(0.1초마다 7.5). 쓰는 동안 무적이지만 움직일 수 없습니다, 특성: 맞을 때 20% 확률로 공격을 완전히 피하고 슬로우·침묵을 정화합니다(0.2초 무적)',
    apply: applySans,
    thumbnail: SANS_IMAGE,
};
