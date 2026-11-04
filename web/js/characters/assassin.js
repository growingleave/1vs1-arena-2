// 어쌔신 (abilities/assassin.py를 옮김)

const MAX_ASSASSIN_CHARGE = 3;

// 그림 (tools/assassin_gen.js로 생성, 흰 빛 → 캐릭터 색을 입혀 'lighter')
// 회전 베기: 검사 평타처럼 붓질 호가 모인 원. 오른쪽(0도)에서 시작해 시계 방향 한 바퀴, 앞쪽 끝이 가장 두꺼움 (150x150, 바깥 테 = 크기의 0.467)
const ASSASSIN_SPIN_IMAGE = loadImage('assets/assassin_spin.png');
const ASSASSIN_SPIN_IMAGE_START = 0;
// 찌르기: 120x30 예각삼각형, 뒤쪽 밑변 x 7, 칼끝 x 117, 가운데 y 15
const ASSASSIN_THRUST_IMAGE = loadImage('assets/assassin_thrust.png');

// 찌르기 이펙트 (화면 전용): 칼끝이 순식간에 앞으로 뻗고, 살짝 더 밀려나가며 사라짐 + 칼끝 불똥
class AssassinThrustVFX extends SparkVFX {
    constructor(owner, direction) {
        super(owner.fxColor || '#ffffff');
        this.owner = owner; this.dir = direction; this.angle = Math.atan2(direction[1], direction[0]);
        this.duration = 0.16; this.sparked = false;
    }
    get finished() { return this.elapsed >= this.duration && this.sparksDone; }
    update(dt) {
        super.update(dt);
        if (!this.sparked && this.elapsed >= 0.04) {
            this.sparked = true;
            const r = this.owner.rect, tx = r.centerx + this.dir[0] * 60, ty = r.centery + this.dir[1] * 60;
            for (let i = 0; i < 4; i++) this.addSpark(tx, ty, this.angle + vfxRand(-0.35, 0.35), vfxRand(120, 260), vfxRand(0.08, 0.16), vfxRand(0.8, 1.5));
        }
    }
    draw(ctx) {
        const t = Math.min(1, this.elapsed / this.duration);
        if (t < 1 && isImageReady(ASSASSIN_THRUST_IMAGE)) {
            const r = this.owner.rect;
            const ext = Math.min(1, t / 0.3);                   // 0.05초 만에 다 뻗음
            const len = 80 * (0.55 + 0.45 * (1 - (1 - ext) ** 2));
            const push = 10 * Math.max(0, (t - 0.3) / 0.7);     // 그 뒤 살짝 더 밀려나감
            const k = len / 110, a = t < 0.3 ? 1 : 1 - (t - 0.3) / 0.7;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.translate(r.centerx + this.dir[0] * (8 + push), r.centery + this.dir[1] * (8 + push));
            ctx.rotate(this.angle);
            ctx.globalAlpha = Math.min(1, a * 1.1);
            ctx.drawImage(vfxTinted(ASSASSIN_THRUST_IMAGE, this.color), -7 * k, -15 * k * 2.2, 120 * k, 30 * k * 2.2);
            ctx.globalAlpha = a * 0.8;
            ctx.drawImage(ASSASSIN_THRUST_IMAGE, -7 * k, -15 * k * 2.2, 120 * k, 30 * k * 2.2);
            ctx.restore();
        }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; this.drawSparks(ctx); ctx.restore();
    }
}

// 대쉬 바람 줄: 160x60, 앞쪽 끝 x 150, 가운데 y 30 / 갈고리 머리: 40x40, 줄 고리 x 7, 촉 끝 x 38, 가운데 y 20
const ASSASSIN_WIND_IMAGE = loadImage('assets/assassin_wind.png');
const ASSASSIN_HOOK_IMAGE = loadImage('assets/assassin_hook.png');
const ASSASSIN_GAS_IMAGE = loadImage('assets/assassin_gas.png'); // 64x64 흰 가스 뭉치 (보통)
// 흙먼지는 폭파광과 같은 그림을 쓴다 (demolitionist.js가 먼저 로드됨: DMX_DUST_IMAGE, DmxPuffVFX)

// 대쉬 (화면 전용): 가스를 뒤로 뿜으며 튀어나가는 느낌. 뒤로 뿜는 가스(그림) + 발밑 흙먼지 + 옅은 바람 줄(그림) + 불똥
class AssassinDashVFX extends SparkVFX {
    constructor(owner, direction, duration) {
        super(owner.fxColor || '#ffffff');
        this.owner = owner; this.dir = direction; this.angle = Math.atan2(direction[1], direction[0]);
        this.sx = owner.rect.centerx; this.sy = owner.rect.centery;
        this.moveTime = duration / 1000; this.duration = this.moveTime + 0.75;
        this.ex = this.sx; this.ey = this.sy;
        this.puffs = []; // 가스·먼지 뭉치를 이 이펙트 하나가 다 그린다 (이펙트 개수 아끼기)
        // 출발: 뒤로 확 뿜어지는 가스 + 발밑 흙먼지
        const bx = -direction[0], by = -direction[1];
        for (let i = 0; i < 6; i++) {
            const sp = vfxRand(70, 160), sideA = vfxRand(-0.6, 0.6);
            this.addPuff(this.sx + bx * 10, this.sy + by * 10, vfxRand(30, 46), (bx * Math.cos(sideA) - by * Math.sin(sideA)) * sp,
                (bx * Math.sin(sideA) + by * Math.cos(sideA)) * sp - 8, vfxRand(0.5, 0.75), 0.55, ASSASSIN_GAS_IMAGE);
        }
        for (let i = 0; i < 4; i++) this.addPuff(this.sx + bx * (4 + i * 8) + vfxRand(-6, 6), owner.rect.bottom - 4, 26 + i * 5, bx * 50 + vfxRand(-20, 20), -12, 0.55, 0.5, DMX_DUST_IMAGE);
    }
    addPuff(x, y, size, vx, vy, life, alpha, img) { this.puffs.push({ x, y, size, vx, vy, life, alpha, img, t: 0, rot: vfxRand(0, 6) }); }
    get finished() { return this.elapsed >= this.duration && this.sparksDone; }
    update(dt) {
        super.update(dt);
        for (const p of this.puffs) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        if (this.elapsed <= this.moveTime + 0.02) {
            const r = this.owner.rect;
            this.ex = r.centerx; this.ey = r.centery;
            for (let i = 0; i < 2; i++) this.addSpark(r.centerx + vfxRand(-8, 8), r.centery + vfxRand(-8, 8), this.angle + Math.PI + vfxRand(-0.5, 0.5), vfxRand(100, 260), vfxRand(0.15, 0.3), vfxRand(1, 2));
            // 지나가는 길에 남는 가스
            this.addPuff(r.centerx - this.dir[0] * 12, r.centery - this.dir[1] * 12, vfxRand(26, 38), -this.dir[0] * 40 + vfxRand(-15, 15), -this.dir[1] * 40 + vfxRand(-15, 15) - 6, vfxRand(0.45, 0.65), 0.45, ASSASSIN_GAS_IMAGE);
            if (!this.landed && this.elapsed >= this.moveTime) {   // 도착: 발밑 먼지 + 가스
                this.landed = true;
                this.addPuff(r.centerx + this.dir[0] * 8, r.bottom - 4, 32, this.dir[0] * 30, -12, 0.45, 0.45, DMX_DUST_IMAGE);
                this.addPuff(r.centerx, r.centery, 40, this.dir[0] * 20, -10, 0.5, 0.35, ASSASSIN_GAS_IMAGE);
            }
        }
    }
    draw(ctx) {
        for (const p of this.puffs) {
            const u = p.t / p.life;
            if (u >= 1) continue;
            dmxDraw(ctx, p.img, p.x, p.y, p.size * (0.7 + 0.6 * u), { alpha: p.alpha * (1 - u), angle: p.rot + u });
        }
        const t = Math.max(0, (this.elapsed - this.moveTime) / 0.3);
        if (t < 1 && isImageReady(ASSASSIN_WIND_IMAGE)) {
            const len = Math.hypot(this.ex - this.sx, this.ey - this.sy) + 40;
            const k = len / 150;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.translate(this.ex + this.dir[0] * 14, this.ey + this.dir[1] * 14); ctx.rotate(this.angle);
            const h = 40 * Math.min(1.1, k) * (1 + 0.3 * t);       // 옅고 가늘게, 사라지며 살짝 퍼짐
            ctx.globalAlpha = 0.45 * (1 - t);
            ctx.drawImage(vfxTinted(ASSASSIN_WIND_IMAGE, this.color), -150 * k, -h / 2, 160 * k, h);
            ctx.globalAlpha = (1 - t) * 0.2;
            ctx.drawImage(ASSASSIN_WIND_IMAGE, -150 * k, -h / 2, 160 * k, h);
            ctx.restore();
        }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; this.drawSparks(ctx); ctx.restore();
    }
}

// 몸 주위로 가스가 퍽 퍼짐 (은신 들어갈 때·나올 때, 화면 전용). 뭉치 여러 개를 이펙트 하나로 그린다
class AssassinGasBurstVFX {
    constructor(x, y, n) {
        this.elapsed = 0; this.duration = 0.8;
        this.puffs = [];
        for (let i = 0; i < n; i++) {
            const a = vfxRand(0, Math.PI * 2), sp = vfxRand(40, 110);
            this.puffs.push({ x: x + Math.cos(a) * 8, y: y + Math.sin(a) * 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10, size: vfxRand(30, 46), life: vfxRand(0.5, 0.8), rot: vfxRand(0, 6) });
        }
    }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; for (const p of this.puffs) { p.x += p.vx * dt; p.y += p.vy * dt; } }
    draw(ctx) {
        for (const p of this.puffs) {
            const u = this.elapsed / p.life;
            if (u < 1) dmxDraw(ctx, ASSASSIN_GAS_IMAGE, p.x, p.y, p.size * (0.7 + 0.6 * u), { alpha: 0.55 * (1 - u), angle: p.rot + u });
        }
    }
}
function assassinGasBurst(owner, n) { Vfx.spawn(new AssassinGasBurstVFX(owner.rect.centerx, owner.rect.centery, n)); }

// 갈고리 줄 + 머리 그리기 (줄은 코드: 어두운 줄 + 밝은 결)
function drawAssassinHook(ctx, ox, oy, hx, hy, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2b2e36'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = 'rgba(210, 215, 225, 0.8)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.setLineDash([]);
    if (isImageReady(ASSASSIN_HOOK_IMAGE)) {
        ctx.translate(hx, hy); ctx.rotate(Math.atan2(hy - oy, hx - ox));
        ctx.drawImage(ASSASSIN_HOOK_IMAGE, -30, -20, 40, 40); // 촉 끝(x 38)이 (hx,hy)보다 살짝 앞
    }
    ctx.restore();
}

// 갈고리가 박히는 순간 '팍' 튀는 불똥 + 번쩍 고리 + (벽이면) 돌가루 먼지
class AssassinHookImpactVFX extends SparkVFX {
    constructor(x, y, angle, color, onWall) {
        super(color);
        this.x = x; this.y = y; this.duration = 0.25; this.onWall = onWall;
        // 벽: 튕겨 나오듯 뒤로 / 플레이어: 사방으로
        for (let i = 0; i < 16; i++) this.addSpark(x, y, (onWall ? angle + Math.PI : angle) + vfxRand(-1.3, 1.3), vfxRand(150, 420), vfxRand(0.12, 0.3), vfxRand(1.2, 2.4));
        for (let i = 0; i < 6; i++) this.addSpark(x, y, vfxRand(0, Math.PI * 2), vfxRand(60, 160), vfxRand(0.1, 0.2), vfxRand(0.8, 1.4));
        if (onWall) for (let i = 0; i < 2; i++) Vfx.spawn(new DmxPuffVFX(x - Math.cos(angle) * 6, y - Math.sin(angle) * 6, 26 + i * 8,
            { vx: -Math.cos(angle) * 40 + vfxRand(-20, 20), vy: -Math.sin(angle) * 40 - 10, duration: 0.5, alpha: 0.5 }));
        Vfx.shake(2, 0.08);
    }
    get finished() { return this.elapsed >= this.duration && this.sparksDone; }
    draw(ctx) {
        const t = Math.min(1, this.elapsed / this.duration);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        if (t < 1) {
            const [r, g, b] = this.rgb;
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${1 - t})`; ctx.lineWidth = 3 * (1 - t) + 1;
            ctx.beginPath(); ctx.arc(this.x, this.y, 6 + 22 * (1 - (1 - t) ** 2), 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * (1 - t)})`;
            ctx.beginPath(); ctx.arc(this.x, this.y, 9 * (1 - t), 0, Math.PI * 2); ctx.fill();
        }
        this.drawSparks(ctx);
        ctx.restore();
    }
}

// 벽에 박힌 갈고리로 날아가는 동안: 박힌 자리에 남은 갈고리와 줄 (화면 전용)
class AssassinHookRopeVFX {
    constructor(owner, x, y, angle, duration) { this.owner = owner; this.x = x; this.y = y; this.angle = angle; this.duration = duration; this.elapsed = 0; }
    get finished() { return this.elapsed >= this.duration + 0.12; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const r = this.owner.rect, a = this.elapsed <= this.duration ? 1 : 1 - (this.elapsed - this.duration) / 0.12;
        drawAssassinHook(ctx, r.centerx, r.centery, this.x, this.y, a);
    }
}

// 평타 적중 불똥 (찌르기·회전 공통)
function assassinHitSpark(owner, target, angle, big) {
    Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: owner.fxColor || '#ffffff', angle, count: big ? 12 : 9, size: big ? 24 : 18 }));
}
const ULT_SLASH_PHASE_DURATION = 260; // X자 참격 한 획이 지나가는 시간(ms)

function addAssassinCharge(owner) {
    owner.assassinCharge = Math.min(MAX_ASSASSIN_CHARGE, (owner.assassinCharge || 0) + 1);
}


// ==========================================
// [평타] 짧은 찌르기 / 차지가 있으면 360도 회전 베기
// ==========================================
class AssassinThrustAttack {
    constructor(owner, direction) {
        this.owner = owner;
        this.damage = owner.baseAtk;
        this.createdTime = Time.now;
        this.lifespan = 130;
        this.hitPlayers = [];
        // 판정 = 찌르기 그림 크기 (몸 중심에서 8~88, 폭 30). 원래 46x16 (5~51)
        this.width = 80;
        this.height = 30;
        this.posX = owner.rect.centerx + direction[0] * 48;
        this.posY = owner.rect.centery + direction[1] * 48;
        this.angle = directionToAngle(direction);
        this.screenAngle = Math.atan2(direction[1], direction[0]);
        Vfx.spawn(new AssassinThrustVFX(owner, direction));
    }

    getPolygonPoints() {
        return rotatedRectPoints(this.posX, this.posY, this.width, this.height, this.angle);
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        return canBeHit(this, target) && checkPolygonCollision(this.getPolygonPoints(), target.rect);
    }

    applyEffect(target) { assassinHitSpark(this.owner, target, this.screenAngle, false); }

    draw() {}
}

class AssassinSpinAttack {
    constructor(owner) {
        this.owner = owner;
        this.damage = owner.baseAtk * 1.2;
        this.radius = 60; // 회전 베기 그림 바깥 테에 맞춤 (원래 56)
        this.createdTime = Time.now;
        this.lifespan = 220;
        this.hitPlayers = [];
        this.canPenetrateWalls = true;

        // 그림 이펙트: 어쌔신 앞의 보이지 않는 막대가 시계 방향으로 돌며 그림을 드러낸다 (화면 효과 전용)
        const face = Math.atan2(owner.facing[1], owner.facing[0]);
        // 검사 평타 부채꼴을 360도로: 그림이 돌면서 시작선(바라보는 방향) 뒤에서 빠져나온다 (화면 효과 전용)
        Vfx.spawn(new RingSlashVFX(0, 0, {
            image: ASSASSIN_SPIN_IMAGE,
            follow: owner,
            size: 128,                  // 바깥 테 반지름 ≈ 60 (판정 반지름 60과 같음)
            color: owner.fxColor || '#ffffff',
            rotation: face - ASSASSIN_SPIN_IMAGE_START,
            startAngle: ASSASSIN_SPIN_IMAGE_START,
            sweepAngle: Math.PI * 2,
            sweep: this.lifespan / 1000,
            fade: 0.3,
            spinTotal: 0,
            ghosts: 0,
            revealEase: 'linear',
            revealMode: 'rotate',
            softEdge: 20 * Math.PI / 180,
        }));
        // 칼끝을 따라 바깥으로 튀는 불똥 (한 바퀴)
        Vfx.spawn(new SweepSparkVFX({ follow: owner, color: owner.fxColor || '#ffffff', radius: 58, fromAngle: face, toAngle: face + Math.PI * 2, sweep: this.lifespan / 1000, count: 14 }));
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    // 그림 원(반지름 60)에 상대 몸(네모)이 조금이라도 닿으면 맞음. 원래는 상대 몸 가운데 점이 원 안에 들어와야 맞았다
    collidesWith(target) {
        if (!canBeHit(this, target)) return false;
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery, r = target.rect;
        const nx = Math.max(r.left, Math.min(cx, r.right)), ny = Math.max(r.top, Math.min(cy, r.bottom)); // 네모에서 원 중심과 가장 가까운 점
        return Math.hypot(nx - cx, ny - cy) <= this.radius;
    }

    applyEffect(target) {
        assassinHitSpark(this.owner, target, Math.atan2(target.rect.centery - this.owner.rect.centery, target.rect.centerx - this.owner.rect.centerx), true);
    }

    // 그림 이펙트(RingSlashVFX)가 판정 크기에 맞춰 그려진다
    draw() {}
}
class AssassinBasicSkill extends Skill {
    constructor() { super('Thrust / Spin Slash', 350, ['melee']); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        if ((owner.assassinCharge || 0) > 0) {
            owner.assassinCharge -= 1; // 차지 하나당 회전 베기 한 번
            attacks.push(new AssassinSpinAttack(owner));
        } else {
            attacks.push(new AssassinThrustAttack(owner, direction));
        }
    }
}

// ==========================================
// 정해진 시간 동안 한 방향으로 움직이는 짧은 이동 (대쉬, 갈고리로 벽까지 날아가기).
// 원본과 같이 벽에 닿아도 시간이 다 될 때까지 계속 민다
// ==========================================
class AssassinMoveManager {
    constructor(owner, direction, speed, duration) {
        this.owner = owner;
        this.direction = direction;
        this.dashSpeed = speed;
        this.duration = duration;
        this.createdTime = Time.now;
        this.damage = 0;
        this.hitPlayers = [];
        this.isDash = true;
    }

    update(walls) {
        if (Time.now - this.createdTime < this.duration) {
            slow(this.owner, 0.1, 100);
            silence(this.owner, 0.1);
            const ts = this.owner.timeScale;
            moveEntityWithWalls(this.owner, this.direction[0] * this.dashSpeed * ts, this.direction[1] * this.dashSpeed * ts, walls);
        }
    }

    isExpired() {
        const expired = Time.now - this.createdTime >= this.duration;
        if (expired) clearDashLock(this.owner, { silenceLock: true });
        return expired;
    }

    collidesWith() { return false; }

    draw() {}
}

class AssassinDashSkill extends Skill {
    constructor() { super('Quick Step', 1500, ['dash']); } // 이동기 너프: 0.6 → 1.5초

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        addAssassinCharge(owner);
        attacks.push(new AssassinMoveManager(owner, direction, 20.0, 60)); // 아주 짧은 대쉬
        Vfx.spawn(new AssassinDashVFX(owner, direction, 60));
    }
}

// ==========================================
// [스킬 2] 갈고리: 벽에 맞으면 그쪽으로 날아가고, 상대에 맞으면 상대에게 붙어 1초 기절
// ==========================================
// 벽에 맞았을 때: 그 지점까지 거리에 맞춘 시간 동안 날아간다 (순간이동 아님)
function createHookPull(owner, direction, distance) {
    const speed = 26.0;
    const framesNeeded = Math.max(1.0, distance / speed);
    return new AssassinMoveManager(owner, direction, speed, Math.max(120, Math.trunc(framesNeeded * (1000 / 60))));
}

class AssassinHookGrappleToTarget {
    constructor(owner, target) {
        this.owner = owner;
        this.target = target;
        this.dashSpeed = 26.0;
        this.createdTime = Time.now;
        this.maxDuration = 500;
        this.arriveDistance = 46;
        this.resolved = false;
        this.damage = 0;
        this.hitPlayers = [];
        this.isDash = true;
    }

    finish(applyStun) {
        this.resolved = true;
        clearDashLock(this.owner, { silenceLock: true });
        if (applyStun && this.target) {
            slow(this.target, 1.0, 100); // 기절 = 이동 불가 + 침묵
            silence(this.target, 1.0);
        }
    }

    update(walls) {
        if (this.resolved) return;
        if (Time.now - this.createdTime >= this.maxDuration || !this.target) {
            this.finish(false);
            return;
        }

        const dx = this.target.rect.centerx - this.owner.rect.centerx;
        const dy = this.target.rect.centery - this.owner.rect.centery;
        const dist = Math.hypot(dx, dy);
        if (dist <= this.arriveDistance) {
            this.finish(true);
            return;
        }

        slow(this.owner, 0.1, 100);
        silence(this.owner, 0.1);
        const ts = this.owner.timeScale;
        moveEntityWithWalls(this.owner, (dx / dist) * this.dashSpeed * ts, (dy / dist) * this.dashSpeed * ts, walls);
    }

    isExpired() { return this.resolved; }

    collidesWith() { return false; }

    draw(ctx) {
        if (!this.resolved && this.target) {
            drawAssassinHook(ctx, this.owner.rect.centerx, this.owner.rect.centery, this.target.rect.centerx, this.target.rect.centery);
        }
    }
}

class AssassinHookProjectile {
    constructor(owner, direction, attacks) {
        this.owner = owner;
        this.direction = direction;
        this.attacks = attacks;
        this.damage = 0;
        this.speed = 20.0;
        this.createdTime = Time.now;
        this.lifespan = 1200;
        this.hitPlayers = [];
        this.width = 14;
        this.height = 14;
        this.posX = owner.rect.centerx + direction[0] * 22;
        this.posY = owner.rect.centery + direction[1] * 22;
        this.startX = this.posX;
        this.startY = this.posY;
        this.maxRange = 480;
        this.resolved = false;
        this.canPenetrateWalls = true; // 벽 충돌은 직접 처리한다
    }

    getRect() {
        return new Rect(Math.trunc(this.posX - this.width / 2), Math.trunc(this.posY - this.height / 2), this.width, this.height);
    }

    update() {
        if (this.resolved) return;
        this.posX += this.direction[0] * this.speed * this.owner.timeScale;
        this.posY += this.direction[1] * this.speed * this.owner.timeScale;

        const rect = wallCoreRect(this.getRect()); // 가운데 작은 판정이 벽에 닿을 때만
        for (const wall of CURRENT_WALLS) {
            if (rect.colliderect(wall.rect)) {
                this.resolved = true;
                this.lifespan = 0;
                const traveled = Math.hypot(this.posX - this.startX, this.posY - this.startY);
                const pull = createHookPull(this.owner, this.direction, traveled);
                this.attacks.push(pull);
                const ang = Math.atan2(this.direction[1], this.direction[0]);
                Vfx.spawn(new AssassinHookImpactVFX(this.posX, this.posY, ang, this.owner.fxColor || '#ffffff', true));
                Vfx.spawn(new AssassinHookRopeVFX(this.owner, this.posX, this.posY, ang, pull.duration / 1000));
                return;
            }
        }
    }

    isExpired() {
        if (this.resolved) return true;
        return Time.now - this.createdTime >= this.lifespan ||
               Math.hypot(this.posX - this.startX, this.posY - this.startY) >= this.maxRange;
    }

    collidesWith(target) {
        if (this.resolved || !canBeHit(this, target)) return false;
        if (this.getRect().colliderect(target.rect)) {
            this.resolved = true;
            this.lifespan = 0;
            this.attacks.push(new AssassinHookGrappleToTarget(this.owner, target));
            Vfx.spawn(new AssassinHookImpactVFX(target.rect.centerx, target.rect.centery, Math.atan2(this.direction[1], this.direction[0]), this.owner.fxColor || '#ffffff', false));
        }
        return false; // 갈고리 자체는 피해를 주지 않는다
    }

    draw(ctx) {
        if (this.resolved) return;
        const x = Math.trunc(this.posX);
        const y = Math.trunc(this.posY);
        drawAssassinHook(ctx, this.owner.rect.centerx, this.owner.rect.centery, x, y);
    }
}

class AssassinHookSkill extends Skill {
    constructor() { super('Grapple Hook', 8000); } // 이동기 너프: 4.5 → 8초

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        addAssassinCharge(owner);
        attacks.push(new AssassinHookProjectile(owner, direction, attacks));
    }
}

// ==========================================
// [궁극기] 0.5초 은신(무적) 후, 시전한 자리 앞에 X자 참격
// ==========================================
// 궁극기 참격 한 획 그림: 600x60, 왼쪽 끝 x 10 → 오른쪽 끝 x 590, 가운데 y 30 (흰 빛)
const ASSASSIN_XSLASH_IMAGE = loadImage('assets/assassin_xslash.png');

// 흰 빛 점 (한 번만 만들어 두고 계속 쓴다: 매 프레임 그라디언트를 새로 만들지 않기 위해)
let _assassinGlowDot = null;
function assassinGlowDot() {
    if (_assassinGlowDot) return _assassinGlowDot;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return (_assassinGlowDot = c);
}

// 칼끝을 따라 튀는 불똥 묶음 (참격이 addSpark로 채운다, 화면 전용)
class AssassinBladeSparksVFX extends SparkVFX {
    constructor(color, duration) { super(color); this.duration = duration; }
    get finished() { return this.elapsed >= this.duration; }
    draw(ctx) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; this.drawSparks(ctx); ctx.restore(); }
}

class AssassinXSlashAttack {
    constructor(owner, direction, color, origin) {
        this.owner = owner;
        this.fxColor = owner.fxColor || '#ffffff';
        this.damage = owner.baseAtk * 3.0;
        this.createdTime = Time.now;

        this.size = 520;
        this.bladeLen = 62;
        this.bladeWidth = 45;
        this.phaseDuration = ULT_SLASH_PHASE_DURATION;
        this.fadeTime = 450; // 두 획이 다 그어진 뒤 사라지는 시간
        this.lifespan = this.phaseDuration * 2 + this.fadeTime + 20;

        // X자 중심은 캐릭터보다 앞쪽
        this.posX = origin[0] + direction[0] * 160;
        this.posY = origin[1] + direction[1] * 160;

        // 1획: 오른쪽 대각선, 2획: 왼쪽 대각선
        const base = directionToAngle(direction);
        this.strokeAngles = [base - 45, base + 45];

        this.hitPlayers = [];
        this.canPenetrateWalls = true;
        this.currentBladePts = null;
        this.currentBladeCenter = null;
        this.lastIdx = -1;
        // 화면 전용: 칼끝을 따라 튀는 불똥
        this.sparks = new AssassinBladeSparksVFX(this.fxColor, (this.lifespan + 400) / 1000);
        Vfx.spawn(this.sparks);
    }

    strokeProgress() {
        const elapsed = Time.now - this.createdTime;
        if (elapsed < this.phaseDuration) return [0, Math.min(1, elapsed / this.phaseDuration)];
        if (elapsed < this.phaseDuration * 2) return [1, Math.min(1, (elapsed - this.phaseDuration) / this.phaseDuration)];
        return [-1, 1];
    }

    update() {
        const [idx, t] = this.strokeProgress();
        if (idx === -1) {
            this.currentBladePts = null;
            this.currentBladeCenter = null;
            if (!this.burst) { // 화면 전용: X가 완성되면 두 칼자국을 따라 불똥이 한꺼번에 튐
                this.burst = true;
                for (const deg of this.strokeAngles) {
                    const rad = deg * Math.PI / 180, dx = Math.cos(rad), dy = -Math.sin(rad);
                    for (let k = 0; k < 14; k++) {
                        const d = vfxRand(-250, 250);
                        this.sparks.addSpark(this.posX + dx * d, this.posY + dy * d, Math.atan2(dy, dx) + (vfxRand(0, 1) < 0.5 ? 1 : -1) * Math.PI / 2 + vfxRand(-0.4, 0.4), vfxRand(60, 200), vfxRand(0.2, 0.45), vfxRand(1, 2));
                    }
                }
            }
        } else {
            const angle = this.strokeAngles[idx];
            const rad = angle * Math.PI / 180;
            const dist = (this.size / 2) * (1.0 - 2.0 * t);
            const cx = this.posX + Math.cos(rad) * dist;
            const cy = this.posY - Math.sin(rad) * dist;
            this.currentBladePts = rotatedRectPoints(cx, cy, this.bladeLen * 2, this.bladeWidth, angle);
            this.currentBladeCenter = [cx, cy];
            // 화면 전용: 획이 시작될 때 살짝 흔들림, 칼끝에서 불똥
            if (idx !== this.lastIdx) { this.lastIdx = idx; Vfx.shake(3, 0.1); }
            if (idx === 1 && t >= 0.5 && !this.crossed) { this.crossed = true; Vfx.shake(5, 0.15); }
            const travel = Math.atan2(Math.sin(rad), -Math.cos(rad));
            for (let k = 0; k < 2; k++) this.sparks.addSpark(cx, cy, travel + Math.PI + vfxRand(-0.6, 0.6), vfxRand(120, 320), vfxRand(0.15, 0.35), vfxRand(1, 2.2));
        }
    }

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        if (!canBeHit(this, target) || this.currentBladePts === null) return false;
        return checkPolygonCollision(this.currentBladePts, target.rect);
    }

    applyEffect(target) {
        const [idx] = this.strokeProgress();
        const rad = this.strokeAngles[Math.max(0, idx)] * Math.PI / 180;
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: this.fxColor, angle: Math.atan2(Math.sin(rad), -Math.cos(rad)), count: 16, size: 32 }));
    }

    // X자 가운데 번쩍임: 두 번째 획이 가운데를 지날 때 십자 빛 + 퍼지는 고리 (화면 전용)
    drawCrossFlash(ctx, elapsed) {
        const t = (elapsed - this.phaseDuration * 1.5) / 350;
        if (t < 0 || t >= 1) return;
        const [r, g, b] = [parseInt(this.fxColor.slice(1, 3), 16), parseInt(this.fxColor.slice(3, 5), 16), parseInt(this.fxColor.slice(5, 7), 16)];
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.translate(this.posX, this.posY);
        const a = 1 - t, L = 90 + 60 * t;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        for (const rot of [0, Math.PI / 2]) {
            ctx.save(); ctx.rotate(rot + Math.PI / 4);
            ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, -4 * a); ctx.lineTo(L, 0); ctx.lineTo(0, 4 * a); ctx.closePath(); ctx.fill();
            ctx.restore();
        }
        ctx.strokeStyle = `rgba(${r},${g},${b},${a})`; ctx.lineWidth = 3 * a + 1;
        ctx.beginPath(); ctx.arc(0, 0, 20 + 70 * (1 - (1 - t) ** 2), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.9 * a; ctx.drawImage(assassinGlowDot(), -40, -40, 80, 80);
        ctx.restore();
    }

    // 참격 그림이 칼끝(판정)이 지나간 만큼 대각선을 따라 드러나고, 두 획이 끝나면 함께 사라진다
    draw(ctx) {
        if (!isImageReady(ASSASSIN_XSLASH_IMAGE)) return;
        const elapsed = Time.now - this.createdTime;
        const fade = Math.max(0, (elapsed - this.phaseDuration * 2) / this.fadeTime);
        if (fade >= 1) return;
        const tinted = vfxTinted(ASSASSIN_XSLASH_IMAGE, this.fxColor);
        this.drawCrossFlash(ctx, elapsed);
        for (let idx = 0; idx < 2; idx++) {
            const t = Math.min(1, (elapsed - idx * this.phaseDuration) / this.phaseDuration);
            if (t <= 0) continue;
            const rad = this.strokeAngles[idx] * Math.PI / 180;
            const travel = Math.atan2(Math.sin(rad), -Math.cos(rad)); // 칼끝이 움직이는 화면 방향
            const head = -this.size / 2 + this.size * t + this.bladeLen * 0.6; // 칼끝 바로 앞까지
            const widen = 1 + 0.25 * fade;
            ctx.save();
            ctx.translate(this.posX, this.posY); ctx.rotate(travel);
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath(); ctx.rect(-320, -60, head + 320, 120); ctx.clip();
            ctx.globalAlpha = 1 - fade;
            ctx.drawImage(tinted, -290, -30 * widen, 580, 60 * widen);
            ctx.globalAlpha = (1 - fade) * 0.6;
            ctx.drawImage(ASSASSIN_XSLASH_IMAGE, -290, -30 * widen, 580, 60 * widen);
            // 나란히 따라오는 가는 칼자국 두 줄 (조금 늦게, 옅게)
            ctx.globalAlpha = (1 - fade) * 0.55;
            ctx.drawImage(tinted, -250, -16 - 9 * widen, 500, 22);
            ctx.drawImage(tinted, -230, 16 + 9 * widen - 22, 460, 22);
            ctx.restore();
            // 칼끝 번쩍임 (잘린 경계를 가린다)
            if (t < 1) {
                const hx = this.posX + Math.cos(travel) * (head - 20), hy = this.posY + Math.sin(travel) * (head - 20);
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 0.95; ctx.drawImage(assassinGlowDot(), hx - 26, hy - 26, 52, 52);
                ctx.restore();
            }
        }
    }
}

class AssassinStealthManager {
    constructor(owner, attacks, color) {
        this.owner = owner;
        this.attacks = attacks;
        this.color = color;
        this.createdTime = Time.now;
        this.duration = 500;
        this.damage = 0;
        this.hitPlayers = [];
        this.castDirection = owner.facing;                          // 시전 방향 고정
        this.castPosition = [owner.rect.centerx, owner.rect.centery]; // 시전 위치 고정

        owner.invincible = true;
        owner.isInvisible = true;
        assassinGasBurst(owner, 8); // 화면 전용: 사라질 때 가스가 퍽
        silence(owner, (this.duration + ULT_SLASH_PHASE_DURATION * 2) / 1000);
    }

    update() {}

    isExpired() {
        if (Time.now - this.createdTime >= this.duration) {
            this.owner.invincible = false;
            this.owner.isInvisible = false;
            this.owner.assassinJumpTime = Time.now; // 다시 나타나며 살짝 뛰어오르는 연출
            assassinGasBurst(this.owner, 5);
            this.attacks.push(new AssassinXSlashAttack(this.owner, this.castDirection, this.color, this.castPosition));
            return true;
        }
        return false;
    }

    collidesWith() { return false; }

    draw() {}
}

class AssassinUltSkill extends Skill {
    constructor() {
        super('Vanish Strike', 500, ['ult'], -99999);
        this.ultChargeRate = ULT_PASSIVE_RATE;
    }

    use(owner, direction, attacks, color) {
        this.lastUsed = Time.now;
        addAssassinCharge(owner);
        attacks.push(new AssassinStealthManager(owner, attacks, color));
    }
}

// ==========================================
// 캐릭터 등록
// ==========================================
function applyAssassinToPlayer(player) {
    player.maxHp = 225;
    player.maxUltGauge = 90; // 궁극기 게이지 통 (검사 100 기준)
    player.hp = player.maxHp;
    player.baseAtk = 14;
    player.speed = 5.1;
    player.assassinCharge = 0;
    player.isInvisible = false;
    player.assassinJumpTime = -99999;

    // 강화 평타(회전 베기) 남은 수: 캐릭터 오른쪽 위에 숫자, 그 아래 작은 마름모 칸 (찬 칸 = 남은 수, 최대 3칸)
    // (은신 중엔 숨김, 왼쪽은 쿨타임 표시 자리)
    player.postDrawHooks.push((ctx) => {
        const n = player.assassinCharge || 0;
        if (n <= 0 || player.isInvisible || player.hidden) return;
        drawChargePips(ctx, player, n, MAX_ASSASSIN_CHARGE, player.fxColor || '#ffffff');
    });

    player.abilities = [
        new AssassinBasicSkill(), // 평타 (찌르기 / 차지 소모 시 회전 베기)
        new AssassinDashSkill(),  // 스킬 1 (짧은 대쉬)
        new AssassinHookSkill(),  // 스킬 2 (갈고리)
        new AssassinUltSkill(),   // 궁극기 (은신 후 X자 참격)
    ];
    player.ultChargeRate = player.abilities[3].ultChargeRate;

    // 은신 중엔 안 보이고, 다시 나타날 때 포물선으로 살짝 뛰어오른다
    const baseDrawBody = player.drawBody.bind(player);
    player.drawBody = (ctx) => {
        if (player.isInvisible) return;
        const jumpElapsed = Time.now - player.assassinJumpTime;
        if (jumpElapsed >= 0 && jumpElapsed < 260) {
            const p = jumpElapsed / 260;
            const originalY = player.rect.y;
            player.rect.y = originalY + Math.trunc(-26 * 4.0 * p * (1.0 - p));
            baseDrawBody(ctx);
            player.rect.y = originalY;
        } else {
            baseDrawBody(ctx);
        }
    };
}

const ASSASSIN_CHARACTER_DATA = {
    id: 'ASSASSIN',
    fxColor: '#c080ff',
    name: '어쌔신',
    desc: '평타(0.35초): 단검으로 앞을 찌릅니다(14), 강화 평타: 차지가 있으면 찌르기 대신 주위를 한 바퀴 벱니다(16.8, 반경 60), 스킬 1(1.5초): 아주 짧게 대쉬하고 차지를 1개 얻습니다(최대 3개), 스킬 2(8초): 갈고리를 던집니다. 벽에 박히면 그쪽으로 날아가고, 상대에 박히면 1초 기절시키고 상대에게 날아갑니다, 궁극기: 0.5초 은신(무적) 후 앞쪽에 거대한 X자 참격을 긋습니다(42). 차지도 1개 얻습니다',
    apply: applyAssassinToPlayer,
    thumbnail: null,
};
