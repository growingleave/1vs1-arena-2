// ==========================================
// 수호자: 에너지 방패 캐릭터
//   방패 상태 3가지: 손에 듦(보통) / 던짐(owner.gShield) / 세움(owner.gRaised)
//   평타: 방패를 한 바퀴 휘두름 (손에 있을 때만)
//   스킬 1: 보통 → 방패 던지기(벽에 닿으면 각도가 조금 바뀌며 튕김) / 던짐 → 다시 누르면 돌아오며 피해 / 세움 → 앞으로 돌진, 맞으면 기절
//   스킬 2: 보통 → 방패 세우기(앞에서 오는 피해 크게 감소, 다시 누르면 내림) / 던짐 → 방패가 멈추고 충격파(피해 + 슬로우)
//   궁극기: 던짐 → 방패가 멈추고 큰 범위의 상대를 방패 쪽으로 끌어옴 / 보통·세움 → 천천히 줄어드는 임시 체력
// 그림: tools/guardian_gen.js (몸, 방패 정면, 세운 방패 활꼴). 효과선·파편은 코드
// ==========================================
const GUARDIAN_IMAGE = loadImage('assets/guardian.png');             // 128x128 몸
const GUARD_SHIELD_IMAGE = loadImage('assets/guardian_shield.png');  // 96x96 방패 정면 (게임 48)
const GUARD_ARC_IMAGE = loadImage('assets/guardian_arc.png');        // 64x152 세운 방패, 게임 좌표 (10,-38)~(42,38), 오른쪽 = 앞
const GUARD_COLOR = '#78dcff';

const GUARD = {
    swing: { cooldown: 650, radius: 64, damage: 1.0, time: 220 },
    throw: { cooldown: 3000, speed: 11, radius: 17, damage: 1.2, flyTime: 3000, bounces: 4, jitter: 12, parkTime: 3000 },
    recall: { speed: 15, damage: 0.8 },
    shock: { radius: 110, damage: 1.0, slowTime: 1.5, slowPower: 40 },
    raise: { reduce: 0.7, frontAngle: 70, maxTime: 5000, cooldown: 1000 },
    bash: { cooldown: 5000, speed: 13, time: 250, damage: 1.0, stun: 0.8 },
    ult: { radius: 230, windup: 400, pullTime: 500, pullSpeed: 12, damage: 20, tempHp: 80, tempDecay: 8 },
};

// 원(cx, cy, r)이 네모(rect)에 닿는지
function guardCircleHits(cx, cy, r, rect) {
    const nx = Math.max(rect.left, Math.min(cx, rect.right)), ny = Math.max(rect.top, Math.min(cy, rect.bottom));
    return Math.hypot(nx - cx, ny - cy) <= r;
}

// 사방으로 튀는 불꽃 (HitSparkVFX는 한쪽으로만 튀어서 세 방향으로)
function guardBurst(x, y, count, size) {
    for (let i = 0; i < 3; i++) Vfx.spawn(new HitSparkVFX(x, y, { color: GUARD_COLOR, angle: i * Math.PI * 2 / 3, count: Math.ceil(count / 3), size }));
}

// 이번 틱에 새로 누른 키만 (누르고 있어도 한 번만 동작하게)
function guardPressed(owner, idx) {
    return !!(owner.gPressed && owner.gPressed[idx]);
}

// ==========================================
// [평타] 방패 한 바퀴 휘두르기
// ==========================================
class GuardianSwing {
    constructor(owner) {
        this.owner = owner;
        this.damage = owner.baseAtk * GUARD.swing.damage;
        this.createdTime = Time.now;
        this.lifespan = GUARD.swing.time;
        this.hitPlayers = [];
        this.canPenetrateWalls = true;
        this.noFizzle = true;
        this.startAngle = Math.atan2(owner.facing[1], owner.facing[0]);
        owner.gSwinging = this;
    }
    update() {}
    isExpired() {
        const done = Time.now - this.createdTime >= this.lifespan;
        if (done && this.owner.gSwinging === this) this.owner.gSwinging = null;
        return done;
    }
    collidesWith(target) {
        return canBeHit(this, target) && guardCircleHits(this.owner.rect.centerx, this.owner.rect.centery, GUARD.swing.radius, target.rect);
    }
    applyEffect(target) {
        const a = Math.atan2(target.rect.centery - this.owner.rect.centery, target.rect.centerx - this.owner.rect.centerx);
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: GUARD_COLOR, angle: a, count: 10, size: 22 }));
    }
    // 방패가 몸 둘레를 시계 방향으로 한 바퀴 + 지나간 자리에 빛 꼬리
    draw(ctx) {
        const u = Math.min(1, (Time.now - this.createdTime) / this.lifespan);
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery, R = GUARD.swing.radius - 18;
        const a = this.startAngle + u * Math.PI * 2;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
            ctx.strokeStyle = `rgba(120, 220, 255, ${0.5 - k * 0.14})`; ctx.lineWidth = 14 - k * 4;
            ctx.beginPath(); ctx.arc(cx, cy, R + 6, Math.max(this.startAngle, a - 2.2 + k * 0.5), a); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        const sx = cx + Math.cos(a) * R, sy = cy + Math.sin(a) * R;
        if (isImageReady(GUARD_SHIELD_IMAGE)) ctx.drawImage(GUARD_SHIELD_IMAGE, sx - 18, sy - 18, 36, 36);
        ctx.restore();
    }
}

class GuardianBasicSkill extends Skill {
    constructor() { super('Shield Swing', GUARD.swing.cooldown); this.owner = null; }
    canUse() {
        const o = this.owner;
        if (o && (o.gShield || o.gRaised || o.gSwinging)) return false; // 방패가 손에 있을 때만
        return super.canUse();
    }
    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new GuardianSwing(owner));
    }
}

// ==========================================
// [스킬 1] 던진 방패: 날아감(fly) → 멈춤(park) → 돌아옴(return)
// ==========================================
class GuardianShield {
    constructor(owner, direction) {
        this.owner = owner;
        const [dx, dy] = normalizeOr(direction);
        this.x = owner.rect.centerx + dx * 26;
        this.y = owner.rect.centery + dy * 26;
        this.vx = dx * GUARD.throw.speed;
        this.vy = dy * GUARD.throw.speed;
        this.r = GUARD.throw.radius;
        this.state = 'fly';
        this.stateTime = Time.now;
        this.createdTime = Time.now;
        this.bounces = 0;
        this.damage = owner.baseAtk * GUARD.throw.damage;
        this.dealsDamage = true;
        this.hitPlayers = [];
        this.canPenetrateWalls = true; // 벽은 직접 튕김 처리
        this.noFizzle = true;
        this.shockUsed = false;
        this.caught = false;
        this.spin = 0;
        owner.gShield = this;
    }

    setState(state, dealsDamage, damage) {
        this.state = state;
        this.stateTime = Time.now;
        this.dealsDamage = dealsDamage;
        this.damage = damage;
        this.hitPlayers = [];
    }

    park() { this.setState('park', false, 0); }

    recall(withDamage) {
        this.setState('return', withDamage, withDamage ? this.owner.baseAtk * GUARD.recall.damage : 0);
    }

    blocked(x, y, walls) {
        const r = this.r;
        if (x - r < 0 || x + r > WIDTH || y - r < 0 || y + r > HEIGHT) return true;
        const box = new Rect(Math.round(x - r * 0.7), Math.round(y - r * 0.7), Math.round(r * 1.4), Math.round(r * 1.4));
        return walls.some((w) => w.rect.colliderect(box));
    }

    // 튕길 때 각도를 조금 무작위로 틀기 (gameRandom: 온라인에서 양쪽이 같게)
    jitter() {
        const a = (gameRandom() * 2 - 1) * GUARD.throw.jitter * Math.PI / 180;
        const c = Math.cos(a), s = Math.sin(a);
        [this.vx, this.vy] = [this.vx * c - this.vy * s, this.vx * s + this.vy * c];
    }

    update(walls) {
        const ts = this.owner.timeScale;
        this.spin += 0.35 * ts;
        if (this.state === 'fly') {
            const steps = 4;
            for (let i = 0; i < steps; i++) {
                let bounced = false;
                const nx = this.x + this.vx * ts / steps;
                if (this.blocked(nx, this.y, walls)) { this.vx = -this.vx; bounced = true; } else this.x = nx;
                const ny = this.y + this.vy * ts / steps;
                if (this.blocked(this.x, ny, walls)) { this.vy = -this.vy; bounced = true; } else this.y = ny;
                if (bounced) {
                    this.jitter();
                    this.bounces += 1;
                    Vfx.spawn(new HitSparkVFX(this.x, this.y, { color: GUARD_COLOR, angle: Math.atan2(this.vy, this.vx), count: 7, size: 14 }));
                    this.hitPlayers = []; // 튕긴 뒤엔 다시 맞힐 수 있음
                }
            }
            if (this.bounces > GUARD.throw.bounces || Time.now - this.stateTime >= GUARD.throw.flyTime) this.park();
        } else if (this.state === 'park') {
            if (Time.now - this.stateTime >= GUARD.throw.parkTime) this.recall(false); // 오래 멈춰 있으면 저절로 돌아옴 (피해 없음)
        } else if (this.state === 'return') {
            const o = this.owner.rect, dx = o.centerx - this.x, dy = o.centery - this.y, d = Math.hypot(dx, dy);
            const sp = GUARD.recall.speed * ts;
            if (d <= Math.max(24, sp)) this.catchIt();
            else { this.x += dx / d * sp; this.y += dy / d * sp; }
        }
    }

    catchIt() {
        if (this.caught) return;
        this.caught = true;
        if (this.owner.gShield === this) this.owner.gShield = null;
        const s1 = this.owner.abilities[1];
        if (s1) s1.lastUsed = Time.now; // 던지기 쿨타임은 받은 때부터
    }

    isExpired() { return this.caught; }

    collidesWith(target) {
        if (!this.dealsDamage || (this.state !== 'fly' && this.state !== 'return')) return false;
        return canBeHit(this, target) && guardCircleHits(this.x, this.y, this.r + 4, target.rect);
    }

    applyEffect(target) {
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: GUARD_COLOR, angle: Math.atan2(this.vy, this.vx), count: 12, size: 24 }));
        Vfx.shake(2, 0.06);
    }

    draw(ctx) {
        const s = this.r * 2 + 6;
        ctx.save();
        // 멈춰 있으면 바닥에 은은한 고리
        if (this.state === 'park') {
            const p = 0.5 + 0.5 * Math.sin(Time.now / 150);
            ctx.strokeStyle = `rgba(120, 220, 255, ${0.25 + 0.25 * p})`; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 8 + p * 3, 0, Math.PI * 2); ctx.stroke();
        }
        // 날아가는 동안 꼬리 빛
        if (this.state !== 'park') {
            ctx.globalCompositeOperation = 'lighter';
            const sp = Math.hypot(this.vx, this.vy) || 1;
            const bx = this.state === 'return' ? this.owner.rect.centerx - this.x : -this.vx, by = this.state === 'return' ? this.owner.rect.centery - this.y : -this.vy;
            const bl = Math.hypot(bx, by) || 1, tx = (this.state === 'return' ? -bx : bx) / bl, ty = (this.state === 'return' ? -by : by) / bl;
            for (let k = 1; k <= 3; k++) {
                ctx.fillStyle = `rgba(120, 220, 255, ${0.22 - k * 0.05})`;
                ctx.beginPath(); ctx.arc(this.x + tx * k * 9, this.y + ty * k * 9, this.r - k * 2, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over';
            void sp;
        }
        ctx.translate(this.x, this.y);
        ctx.rotate(this.state === 'park' ? 0 : this.spin);
        if (isImageReady(GUARD_SHIELD_IMAGE)) ctx.drawImage(GUARD_SHIELD_IMAGE, -s / 2, -s / 2, s, s);
        else { ctx.fillStyle = GUARD_COLOR; ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
    }
}

// [스킬 1 · 방패 세움] 앞으로 방패 돌진: 맞으면 기절
class GuardianBash {
    constructor(owner, direction) {
        this.owner = owner;
        this.direction = normalizeOr(direction);
        this.damage = owner.baseAtk * GUARD.bash.damage;
        this.startTime = Time.now;
        this.duration = GUARD.bash.time;
        this.hitPlayers = [];
        this.isDash = true;
        this.noFizzle = true;
        Vfx.spawn(new TrailSparkVFX(owner, () => Time.now - this.startTime < this.duration,
            { color: GUARD_COLOR, angle: Math.atan2(this.direction[1], this.direction[0]), rate: 80, side: 16 }));
    }
    update(walls) {
        slow(this.owner, 0.1, 100, true);
        const ts = this.owner.timeScale;
        moveEntityWithWalls(this.owner, this.direction[0] * GUARD.bash.speed * ts, this.direction[1] * GUARD.bash.speed * ts, walls);
    }
    isExpired() {
        const done = Time.now - this.startTime >= this.duration;
        if (done) finishDash(this.owner);
        return done;
    }
    collidesWith(target) {
        return canBeHit(this, target) && this.owner.rect.inflate(16, 16).colliderect(target.rect);
    }
    applyEffect(target) {
        slow(target, GUARD.bash.stun, 100); // 기절 = 이동 불가 + 침묵
        silence(target, GUARD.bash.stun);
        this.startTime = Time.now - this.duration; // 맞히면 돌진 끝
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: GUARD_COLOR, angle: Math.atan2(this.direction[1], this.direction[0]), count: 14, size: 28 }));
        Vfx.shake(4, 0.1);
    }
    draw() {}
}

class GuardianShieldSkill extends Skill {
    constructor() { super('Shield Throw', GUARD.throw.cooldown); this.owner = null; this.lastBash = -99999; }
    canUse() {
        const o = this.owner;
        if (!o || !guardPressed(o, 1)) return false;
        if (o.gShield) return o.gShield.state !== 'return' || !o.gShield.dealsDamage; // 던진 상태: 불러오기
        if (o.gRaised) return Time.now - this.lastBash >= GUARD.bash.cooldown;   // 세운 상태: 돌진
        if (o.gSwinging) return false;
        return super.canUse();                                                    // 보통: 던지기
    }
    use(owner, direction, attacks) {
        if (owner.gShield) { owner.gShield.recall(true); return; }
        if (owner.gRaised) { this.lastBash = Time.now; attacks.push(new GuardianBash(owner, direction)); return; }
        this.lastUsed = Time.now; // 받을 때 다시 시작 (받은 때부터 3초)
        attacks.push(new GuardianShield(owner, direction));
    }
}

// ==========================================
// [스킬 2] 방패 세우기 / 던진 방패에서 충격파
// ==========================================
class GuardianShockwave {
    constructor(owner, x, y) {
        this.owner = owner;
        this.x = x; this.y = y;
        this.damage = owner.baseAtk * GUARD.shock.damage;
        this.createdTime = Time.now;
        this.lifespan = 420;
        this.hitPlayers = [];
        this.canPenetrateWalls = true;
        this.noFizzle = true;
        // 화면 전용: 육각 파편이 바깥으로 튐
        guardBurst(x, y, 16, 26);
        Vfx.shake(3, 0.08);
    }
    update() {}
    isExpired() { return Time.now - this.createdTime >= this.lifespan; }
    collidesWith(target) {
        if (Time.now - this.createdTime > 120) return false; // 터지는 순간만
        return canBeHit(this, target) && guardCircleHits(this.x, this.y, GUARD.shock.radius, target.rect);
    }
    applyEffect(target) { slow(target, GUARD.shock.slowTime, GUARD.shock.slowPower); }
    draw(ctx) {
        const u = Math.min(1, (Time.now - this.createdTime) / this.lifespan), R = GUARD.shock.radius * (0.35 + 0.65 * Math.sqrt(u));
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(120, 220, 255, ${0.18 * (1 - u)})`; ctx.beginPath(); ctx.arc(this.x, this.y, R, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(160, 235, 255, ${0.9 * (1 - u)})`; ctx.lineWidth = 6 * (1 - u) + 2;
        ctx.beginPath(); ctx.arc(this.x, this.y, R, 0, Math.PI * 2); ctx.stroke();
        // 고리를 따라 육각형 무늬
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 14; i++) {
            const a = i * Math.PI * 2 / 14, hx = this.x + Math.cos(a) * R, hy = this.y + Math.sin(a) * R;
            ctx.beginPath(); for (let k = 0; k < 6; k++) { const b = k * Math.PI / 3; ctx.lineTo(hx + Math.cos(b) * 6, hy + Math.sin(b) * 6); } ctx.closePath(); ctx.stroke();
        }
        ctx.restore();
    }
}

class GuardianGuardSkill extends Skill {
    constructor() { super('Shield Guard', GUARD.raise.cooldown); this.owner = null; }
    canUse() {
        const o = this.owner;
        if (!o || !guardPressed(o, 2)) return false;
        if (o.gShield) return !o.gShield.shockUsed && o.gShield.state !== 'return'; // 던진 방패마다 한 번
        if (o.gRaised) return true;                                                 // 내리기
        if (o.gSwinging) return false;
        return super.canUse();                                                      // 세우기
    }
    use(owner, direction, attacks) {
        if (owner.gShield) {
            const sh = owner.gShield;
            sh.shockUsed = true;
            sh.park();
            attacks.push(new GuardianShockwave(owner, sh.x, sh.y));
            return;
        }
        if (owner.gRaised) { guardLower(owner, this); return; }
        owner.gRaised = true;
        owner.gRaiseStart = Time.now;
    }
}

function guardLower(owner, skill) {
    owner.gRaised = false;
    skill.lastUsed = Time.now; // 내린 뒤 1초 동안 다시 못 세움
}

// ==========================================
// [궁극기] 던짐: 방패 쪽으로 끌어오기 / 보통·세움: 임시 체력
// ==========================================
class GuardianPull {
    constructor(owner, shield) {
        this.owner = owner;
        this.shield = shield;
        this.x = shield.x; this.y = shield.y;
        this.damage = GUARD.ult.damage;
        this.createdTime = Time.now;
        this.lifespan = GUARD.ult.windup + GUARD.ult.pullTime + 150;
        this.hitPlayers = [];
        this.canPenetrateWalls = true;
        this.noFizzle = true;
        this.target = null;
    }
    update() {
        const el = Time.now - this.createdTime;
        // 끌려오는 동안: 방패 쪽으로 움직이고 아무것도 못 함
        if (this.target && el < GUARD.ult.windup + GUARD.ult.pullTime) {
            const t = this.target, dx = this.x - t.rect.centerx, dy = this.y - t.rect.centery, d = Math.hypot(dx, dy);
            if (d > 6) {
                const sp = Math.min(d, GUARD.ult.pullSpeed);
                moveEntityWithWalls(t, dx / d * sp, dy / d * sp, CURRENT_WALLS);
            }
            slow(t, 0.1, 100);
            silence(t, 0.1);
        }
    }
    isExpired() { return Time.now - this.createdTime >= this.lifespan; }
    collidesWith(target) {
        const el = Time.now - this.createdTime;
        if (el < GUARD.ult.windup || el > GUARD.ult.windup + 60) return false; // 모은 뒤 한 번
        return canBeHit(this, target) && guardCircleHits(this.x, this.y, GUARD.ult.radius, target.rect);
    }
    applyEffect(target) {
        this.target = target;
        Vfx.shake(5, 0.15);
    }
    draw(ctx) {
        const el = Time.now - this.createdTime, R = GUARD.ult.radius;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        if (el < GUARD.ult.windup) {
            // 모으는 동안: 큰 원 + 안쪽으로 줄어드는 고리들
            const u = el / GUARD.ult.windup;
            ctx.fillStyle = `rgba(120, 220, 255, ${0.06 + 0.08 * u})`; ctx.beginPath(); ctx.arc(this.x, this.y, R, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = `rgba(120, 220, 255, ${0.5 + 0.4 * u})`; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(this.x, this.y, R, 0, Math.PI * 2); ctx.stroke();
            for (let k = 0; k < 3; k++) {
                const ph = (u * 2 + k / 3) % 1;
                ctx.strokeStyle = `rgba(180, 240, 255, ${0.6 * ph})`; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(this.x, this.y, R * (1 - ph) + 10, 0, Math.PI * 2); ctx.stroke();
            }
        } else {
            // 끌어오는 동안: 상대와 방패를 잇는 에너지 줄 + 바깥에서 안으로 빨려드는 선
            const u = Math.min(1, (el - GUARD.ult.windup) / (GUARD.ult.pullTime + 150));
            ctx.strokeStyle = `rgba(120, 220, 255, ${0.7 * (1 - u)})`; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(this.x, this.y, R * (1 - u * 0.7), 0, Math.PI * 2); ctx.stroke();
            for (let i = 0; i < 12; i++) {
                const a = i * Math.PI / 6 + el * 0.002, r1 = R * (1 - ((u * 2 + i * 0.13) % 1)), r0 = Math.max(0, r1 - 30);
                ctx.strokeStyle = `rgba(170, 235, 255, ${0.6 * (1 - u)})`; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(this.x + Math.cos(a) * r1, this.y + Math.sin(a) * r1); ctx.lineTo(this.x + Math.cos(a) * r0, this.y + Math.sin(a) * r0); ctx.stroke();
            }
            if (this.target && !this.target.hidden) {
                ctx.strokeStyle = `rgba(200, 245, 255, ${0.9 * (1 - u)})`; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.target.rect.centerx, this.target.rect.centery); ctx.stroke();
            }
        }
        ctx.restore();
    }
}

class GuardianUltSkill extends Skill {
    constructor() {
        super('Aegis', 500, ['ult'], -99999);
        this.ultChargeRate = ULT_PASSIVE_RATE;
        this.owner = null;
    }
    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        if (owner.gShield) {
            owner.gShield.park();
            attacks.push(new GuardianPull(owner, owner.gShield));
            return;
        }
        owner.gTempHp = GUARD.ult.tempHp;
        guardBurst(owner.rect.centerx, owner.rect.centery, 15, 24);
    }
}

// ==========================================
// 캐릭터 등록
// ==========================================
function applyGuardian(player) {
    player.spriteImage = GUARDIAN_IMAGE;
    player.spriteSize = 54;
    player.spriteAnchor = [0.5, 0.63];
    player.baseAtk = 15;
    player.maxHp = 270;
    player.maxUltGauge = 110; // 궁극기 게이지 통 (검사 100 기준)
    player.hp = player.maxHp;
    player.speed = 4.2;
    player.gShield = null;
    player.gRaised = false;
    player.gTempHp = 0;
    player.gPrevHeld = [false, false, false, false];
    player.gPressed = [false, false, false, false];

    const basic = new GuardianBasicSkill(); basic.owner = player;
    const s1 = new GuardianShieldSkill(); s1.owner = player;
    const s2 = new GuardianGuardSkill(); s2.owner = player;
    const ult = new GuardianUltSkill(); ult.owner = player;
    player.abilities = [basic, s1, s2, ult];
    player.ultChargeRate = ult.ultChargeRate;

    player.preUpdateHooks.push((dtSec, input) => {
        // 새로 누른 키 (스킬 1·2는 누를 때마다 한 번)
        const held = (input && input.skills) || [false, false, false, false];
        player.gPressed = held.map((v, i) => v && !player.gPrevHeld[i]);
        player.gPrevHeld = held.slice();
        // 세운 방패는 최대 5초
        if (player.gRaised && Time.now - player.gRaiseStart >= GUARD.raise.maxTime) guardLower(player, s2);
        // 임시 체력은 천천히 줄어듦
        if (player.gTempHp > 0) player.gTempHp = Math.max(0, player.gTempHp - GUARD.ult.tempDecay * dtSec);
    });

    // 받는 피해: 방패를 세웠으면 앞쪽(±70도)에서 온 피해 70% 감소 → 남은 피해는 임시 체력이 먼저 받음
    const baseTakeDamage = player.takeDamage.bind(player);
    player.takeDamage = (raw) => {
        let dmg = raw;
        const from = player.incomingFrom;
        if (player.gRaised && from) {
            const dx = from[0] - player.rect.centerx, dy = from[1] - player.rect.centery, d = Math.hypot(dx, dy);
            if (d > 0) {
                const dot = (dx * player.facing[0] + dy * player.facing[1]) / d;
                if (dot >= Math.cos(GUARD.raise.frontAngle * Math.PI / 180)) {
                    dmg = raw * (1 - GUARD.raise.reduce);
                    Vfx.spawn(new HitSparkVFX(player.rect.centerx + player.facing[0] * 30, player.rect.centery + player.facing[1] * 30,
                        { color: GUARD_COLOR, angle: Math.atan2(dy, dx), count: 6, size: 14 }));
                }
            }
        }
        const before = player.hp;
        const result = baseTakeDamage(dmg);
        const lost = before - player.hp;
        if (player.gTempHp > 0 && lost > 0) {
            const absorb = Math.min(player.gTempHp, lost);
            player.hp += absorb;
            player.gTempHp -= absorb;
        }
        return result;
    };

    // 방패 그림: 손에 들고 있으면 앞쪽에 작게, 세웠으면 앞쪽 활꼴. 임시 체력이면 막 + 체력바 옆 하늘색
    player.postDrawHooks.push((ctx) => {
        if (player.hidden) return;
        const r = player.rect, [fx, fy] = player.facing, ang = Math.atan2(fy, fx);
        if (player.gRaised) {
            ctx.save(); ctx.translate(r.centerx, r.centery); ctx.rotate(ang);
            if (isImageReady(GUARD_ARC_IMAGE)) ctx.drawImage(GUARD_ARC_IMAGE, 10, -38, 32, 76);
            ctx.restore();
        } else if (!player.gShield && !player.gSwinging && isImageReady(GUARD_SHIELD_IMAGE)) {
            ctx.drawImage(GUARD_SHIELD_IMAGE, r.centerx + fx * 22 - 13, r.centery + fy * 16 - 9, 26, 26);
        }
        if (player.gTempHp > 0) {
            const a = Math.min(1, player.gTempHp / GUARD.ult.tempHp);
            ctx.strokeStyle = `rgba(150, 230, 255, ${0.25 + 0.4 * a})`; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(r.centerx, r.centery, 32, 0, Math.PI * 2); ctx.stroke();
            // 체력바 위에 하늘색으로 임시 체력 (체력 다음 칸부터)
            const barW = 40, barX = r.centerx - barW / 2, barY = r.top - 10;
            const hpW = barW * Math.max(0, player.hp / player.maxHp), tW = Math.min(barW, barW * player.gTempHp / player.maxHp);
            ctx.fillStyle = '#9fe8ff';
            if (hpW + tW <= barW) ctx.fillRect(barX + hpW, barY, tW, 5);
            else ctx.fillRect(barX + barW - tW, barY, tW, 5);
        }
    });
}

const GUARDIAN_CHARACTER_DATA = {
    id: 'GUARDIAN',
    fxColor: GUARD_COLOR,
    name: '수호자',
    desc: '평타(0.65초): 방패를 몸 둘레로 한 바퀴 휘두릅니다(15, 반경 64). 방패가 손에 있을 때만, 스킬 1: 방패를 던집니다(18). 벽에 닿으면 각도가 조금 바뀌며 튕깁니다(최대 4번, 3초). 던진 동안 다시 누르면 방패가 돌아오며 오는 길에 피해(12). 쿨타임은 방패를 받은 때부터 3초, 스킬 2: 방패를 세웁니다(다시 누르면 내림, 최대 5초). 세운 동안 앞쪽에서 오는 피해 70% 감소(느려지지 않음), 평타는 못 씀, 던진 방패 + 스킬 2: 방패가 멈추고 충격파(15, 반경 110, 슬로우 40% 1.5초). 던질 때마다 한 번, 세운 방패 + 스킬 1(5초): 앞으로 돌진하고 맞으면 피해(15) + 0.8초 기절, 궁극기: 던진 방패가 있으면 방패가 멈추고 0.4초 뒤 반경 230 안의 상대를 방패 쪽으로 끌어옵니다(20). 방패가 손에 있으면 임시 체력 80을 얻습니다(초당 8씩 줄어듦)',
    apply: applyGuardian,
    thumbnail: GUARDIAN_IMAGE,
};
