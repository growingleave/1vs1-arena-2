// DIO (abilities/dio.py를 옮김)

const DIO_IMAGE = loadImage('assets/dio.png');
const DIO_STAND_IMAGE = loadImage('assets/dio_skill1.png');

// 이펙트 그림 (tools/dio_gen.js). 시간 정지 시계는 가속자 그림(ACC_CLOCK_IMAGE), 경고 고리·폭발은 폭파광 그림을 함께 쓴다
const DIO_FIST_IMAGE = loadImage('assets/dio_fist.png');   // 64x40 주먹 빛, 오른쪽을 향함, 주먹 끝 x 60 — 금색 입혀 'lighter'
const DIO_KNIFE_IMAGE = loadImage('assets/dio_knife.png'); // 48x16 칼, 칼끝 x 47 — 보통
const DIO_GOLD = '#ffd84a';

function dioGlow(ctx, img, x, y, w, h, { angle = 0, alpha = 1, ax = 0.5, ay = 0.5, core = 0.5, color = DIO_GOLD } = {}) {
    if (!isImageReady(img) || alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y); if (angle) ctx.rotate(angle);
    ctx.globalAlpha = Math.min(1, alpha); ctx.drawImage(vfxTinted(img, color), -w * ax, -h * ay, w, h);
    ctx.globalAlpha = Math.min(1, alpha) * core; ctx.drawImage(img, -w * ax, -h * ay, w, h);
    ctx.restore();
}

// 시간이 멈추는 순간 / 다시 흐르는 순간 (화면 전용): 색이 뒤집히는 원이 퍼지거나(멈춤) 줄어들고(재개), 시계 문자판이 함께
class DioTimeWaveVFX {
    constructor(owner, stopping) { this.owner = owner; this.stopping = stopping; this.elapsed = 0; this.duration = stopping ? 0.6 : 0.4; }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const t = this.elapsed / this.duration, e = dmxEaseOut(t);
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery;
        const r = this.stopping ? 40 + 900 * e : 900 * (1 - e) + 20;
        ctx.save();
        ctx.globalCompositeOperation = 'difference';                         // 원 안의 색이 뒤집힘
        ctx.fillStyle = `rgba(255, 255, 255, ${this.stopping ? (1 - t) * 0.9 : 0.6 * (1 - t)})`;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        accDrawClock(ctx, ACC_CLOCK_IMAGE, DIO_GOLD, cx, cy, 120 + 260 * e, 1, (this.stopping ? -1 : 1) * e * 2, 1.2 * (1 - t));
    }
}

// ==========================================
// [스킬 1] 칼 던지기 (시간 정지 중에는 공중에 멈춘다)
// ==========================================
class DioKnifeBullet {
    constructor(owner, direction) {
        this.owner = owner;
        this.direction = direction;
        this.damage = owner.baseAtk * 0.8;
        this.speed = 18.0;
        this.createdTime = Time.now;
        this.lifespan = 8000;
        this.hitPlayers = [];
        this.width = 16;
        this.height = 6;
        this.posX = owner.rect.centerx + direction[0] * 20;
        this.posY = owner.rect.centery + direction[1] * 20;
        this.startX = this.posX;
        this.startY = this.posY;
        this.maxRange = 700;
        this.angle = directionToAngle(direction);
    }

    getRect() {
        return new Rect(Math.trunc(this.posX - Math.floor(this.width / 2)), Math.trunc(this.posY - Math.floor(this.height / 2)), this.width, this.height);
    }

    update() {
        const speed = this.owner.dioKnifeStopped ? 0.0 : this.speed;
        this.posX += this.direction[0] * speed * this.owner.timeScale;
        this.posY += this.direction[1] * speed * this.owner.timeScale;

        const rect = wallCoreRect(this.getRect()); // 가운데 작은 판정이 벽에 닿을 때만
        for (const wall of CURRENT_WALLS) {
            if (wall.rect.colliderect(rect)) {
                this.lifespan = 0;
                break;
            }
        }
    }

    isExpired() {
        return Time.now - this.createdTime >= this.lifespan ||
               Math.hypot(this.posX - this.startX, this.posY - this.startY) >= this.maxRange;
    }

    collidesWith(target) {
        return canBeHit(this, target) && this.getRect().colliderect(target.rect);
    }

    applyEffect(target) {
        this.owner.dioLastHitTime = Time.now;
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: '#e8ecf4', angle: Math.atan2(this.direction[1], this.direction[0]), count: 8, size: 16 }));
    }

    // 은빛 칼 + 날아갈 때 빛 꼬리. 시간이 멈춰 공중에 떠 있을 땐 금빛으로 반짝이며 살짝 떨림
    draw(ctx) {
        if (!isImageReady(DIO_KNIFE_IMAGE)) return;
        const ang = Math.atan2(this.direction[1], this.direction[0]);
        const stopped = this.owner.dioKnifeStopped;
        const jx = stopped ? Math.sin(Time.now * 0.05 + this.startX) * 0.8 : 0;
        ctx.save();
        if (!stopped) {
            ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
            ctx.strokeStyle = 'rgba(220, 230, 255, 0.45)'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(this.posX - this.direction[0] * 14, this.posY - this.direction[1] * 14); ctx.lineTo(this.posX - this.direction[0] * 40, this.posY - this.direction[1] * 40); ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
        } else {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(255, 216, 74, ${0.25 + 0.15 * Math.sin(Time.now * 0.01 + this.startY)})`;
            ctx.beginPath(); ctx.arc(this.posX, this.posY, 14, 0, Math.PI * 2); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.translate(this.posX + jx, this.posY); ctx.rotate(ang);
        ctx.drawImage(DIO_KNIFE_IMAGE, -30, -8, 36, 12);   // 칼끝이 판정 앞쪽 가까이
        ctx.restore();
    }
}

// ==========================================
// [평타] 스탠드: 정해진 자리에서 좌우 번갈아 잽을 계속 날린다. 다시 쓰면 새 위치로 옮겨진다
// ==========================================
class DioPunchShockwave {
    constructor(owner, x, y, baseSize, damage) {
        this.owner = owner;
        this.posX = x;
        this.posY = y;
        this.baseSize = baseSize;
        this.damage = damage;
        this.createdTime = Time.now;
        this.lifespan = 260;
        this.maxRadius = Math.trunc(baseSize * 1.3);
        this.hitPlayers = [];
    }

    progress() { return Math.min(1.0, (Time.now - this.createdTime) / this.lifespan); }

    currentRadius() { return this.baseSize * 0.5 + this.maxRadius * this.progress(); }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        if (!canBeHit(this, target)) return false;
        return Math.hypot(target.rect.centerx - this.posX, target.rect.centery - this.posY) <= this.currentRadius();
    }

    draw(ctx) {
        const p = this.progress();
        const radius = Math.trunc(this.currentRadius());
        const alpha = Math.max(0, Math.trunc(210 * (1.0 - p)));
        if (radius <= 0 || alpha <= 0) return;
        dioGlow(ctx, DMX_RING_IMAGE, this.posX, this.posY, radius * 2 * 80 / 70, radius * 2 * 80 / 70, { alpha: 1.1 * (1 - p) });
    }
}

class DioPunchHitbox {
    constructor(owner, originX, originY, dirVec, travelDist, width, height, damage, attacks) {
        this.owner = owner;
        this.originX = originX;
        this.originY = originY;
        this.dirVec = dirVec;
        this.travelDist = travelDist;
        this.posX = originX;
        this.posY = originY;
        this.width = width;
        this.height = height;
        this.damage = damage;
        this.createdTime = Time.now;
        this.lifespan = 150;
        this.hitPlayers = [];
        this.attacks = attacks;
        this.shockwaveSpawned = false;
    }

    getRect() {
        return new Rect(Math.trunc(this.posX - Math.floor(this.width / 2)), Math.trunc(this.posY - Math.floor(this.height / 2)), this.width, this.height);
    }

    update() {
        const progress = Math.min(1.0, (Time.now - this.createdTime) / this.lifespan);
        const extend = Math.sin(progress * Math.PI); // 뻗었다가 돌아오는 잽
        this.posX = this.originX + this.dirVec[0] * this.travelDist * extend;
        this.posY = this.originY + this.dirVec[1] * this.travelDist * extend;

        // 주먹이 거의 다 뻗었을 때 충격파
        if (!this.shockwaveSpawned && extend >= 0.92) {
            this.shockwaveSpawned = true;
            this.attacks.push(new DioPunchShockwave(this.owner, this.posX, this.posY, Math.max(this.width, this.height), this.damage));
        }
    }

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        return canBeHit(this, target) && this.getRect().colliderect(target.rect);
    }

    applyEffect(target) {
        this.owner.dioLastHitTime = Time.now;
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: DIO_GOLD, angle: Math.atan2(this.dirVec[1], this.dirVec[0]), count: 7, size: 18 }));
    }

    // 금빛 주먹이 앞으로 뻗었다 돌아옴 + 지나온 자리에 옅은 잔상 두 개 (러시 느낌)
    draw(ctx) {
        const progress = Math.min(1.0, (Time.now - this.createdTime) / this.lifespan);
        const ang = Math.atan2(this.dirVec[1], this.dirVec[0]);
        const len = Math.max(this.width, this.height) * 2.2, h = len * 40 / 64;
        for (let i = 2; i >= 0; i--) {
            const ext = Math.sin(Math.max(0, progress - i * 0.12) * Math.PI);
            const x = this.originX + this.dirVec[0] * this.travelDist * ext, y = this.originY + this.dirVec[1] * this.travelDist * ext;
            dioGlow(ctx, DIO_FIST_IMAGE, x, y, len, h, { angle: ang, alpha: (i === 0 ? 1 : 0.35 / i) * (1 - progress * 0.3), ax: 60 / 64 - 0.25 });
        }
    }
}

class DioStandField {
    constructor(owner, direction, attacks) {
        this.owner = owner;
        this.attacks = attacks;
        this.damage = owner.baseAtk * 0.4; // 계속 때리는 대신 한 대는 약하게
        this.createdTime = Time.now;
        this.hitPlayers = [];
        this.forceExpire = false;

        this.boxSize = owner.rect.w;
        this.dirVec = normalizeOr(direction);
        this.perpVec = [-this.dirVec[1], this.dirVec[0]];

        const dist = 45 + Math.floor(this.boxSize / 2);
        this.boxX = owner.rect.centerx + this.dirVec[0] * dist;
        this.boxY = owner.rect.centery + this.dirVec[1] * dist;

        const offset = this.boxSize * 0.55;
        this.fistW = Math.trunc(this.boxSize * 0.4);
        this.fistH = Math.trunc(this.boxSize * 0.4);
        this.travelDist = this.boxSize * 0.85;
        this.fistOrigins = [
            [this.boxX + this.perpVec[0] * offset, this.boxY + this.perpVec[1] * offset],
            [this.boxX - this.perpVec[0] * offset, this.boxY - this.perpVec[1] * offset],
        ];

        this.punchInterval = 240;
        this.nextPunchSide = 0;
        this.lastPunchTime = -99999; // 소환하자마자 첫 잽
    }

    update() {
        if (Time.now - this.lastPunchTime >= this.punchInterval) {
            this.lastPunchTime = Time.now;
            const [ox, oy] = this.fistOrigins[this.nextPunchSide];
            this.attacks.push(new DioPunchHitbox(this.owner, ox, oy, this.dirVec, this.travelDist,
                                                 this.fistW, this.fistH, this.damage, this.attacks));
            this.nextPunchSide = 1 - this.nextPunchSide;
        }
    }

    isExpired() { return this.forceExpire; }

    collidesWith() { return false; }

    draw(ctx) {
        const s = this.boxSize;
        const x = Math.trunc(this.boxX - Math.floor(s / 2));
        const y = Math.trunc(this.boxY - Math.floor(s / 2));
        // 스탠드 뒤로 은은한 금빛 기운 (일렁임)
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255, 216, 74, ${0.16 + 0.06 * Math.sin(Time.now * 0.008)})`;
        ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.75, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (isImageReady(DIO_STAND_IMAGE)) {
            ctx.save();
            ctx.translate(x + s / 2, y + s / 2);
            if (this.dirVec[0] < 0) ctx.scale(-1, 1);
            ctx.drawImage(DIO_STAND_IMAGE, -s / 2, -s / 2, s, s);
            ctx.restore();
        }
        ctx.strokeStyle = 'rgba(255, 216, 74, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
    }
}

class DioBasicAttack extends Skill {
    constructor() { super('Stand Barrage', 480); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        if (owner.dioStandRef) owner.dioStandRef.forceExpire = true; // 기존 스탠드는 사라진다
        const stand = new DioStandField(owner, direction, attacks);
        owner.dioStandRef = stand;
        attacks.push(stand);
    }
}

// ==========================================
// [스킬 1] 칼 던지기 (최대 5개 충전)
// ==========================================
class DioSkill1 {
    constructor() {
        this.name = 'Knife Throw (Charge)';
        this.keywords = [];
        this.cooldown = 250;
        this.lastUsed = 0;
        this.maxCharges = 5;
        this.currentCharges = 5;
        this.chargeCooldown = 1500;
        this.lastChargeTime = Time.now;
        this.cooldownType = 'charges';
    }

    updateCharges() {
        if (this.currentCharges < this.maxCharges && Time.now - this.lastChargeTime >= this.chargeCooldown) {
            this.currentCharges += 1;
            this.lastChargeTime = Time.now;
        }
    }

    canUse() {
        this.updateCharges();
        return this.currentCharges > 0 && Time.now - this.lastUsed >= this.cooldown;
    }

    use(owner, direction, attacks) {
        this.updateCharges();
        if (this.currentCharges <= 0) return;
        this.lastUsed = Time.now;
        this.currentCharges -= 1;
        if (this.currentCharges === this.maxCharges - 1) this.lastChargeTime = Time.now;
        attacks.push(new DioKnifeBullet(owner, direction));
    }
}

// ==========================================
// [스킬 2] THE WORLD: 3초 시간 정지 + 칼 5개 즉시 충전. 정지 중 공격이 맞으면 바로 풀린다
// ==========================================
class DioTimeStopEffect {
    constructor(owner, target, durationSec) {
        this.owner = owner;
        this.target = target;
        this.durationSec = durationSec;
        this.createdTime = Time.now;
        this.hitPlayers = [];
        this.forceExpire = false;
        this.ended = false;
        Vfx.spawn(new DioTimeWaveVFX(owner, true)); // 화면 전용: 시간이 멈추는 파동
        Vfx.shake(5, 0.25);
    }

    update() {
        if ((this.owner.dioLastHitTime || 0) > this.createdTime) this.forceExpire = true;
    }

    isExpired() {
        const expired = this.forceExpire || (Time.now - this.createdTime) / 1000 >= this.durationSec;
        if (expired) {
            if (this.target) {
                this.target.stunned = false;
                // 일찍 풀릴 때는 남은 정지 효과도 같이 풀어 바로 다시 움직이게 한다
                if (this.forceExpire) {
                    delete this.target.statusEffects.time_slow;
                    delete this.target.statusEffects.slow;
                    delete this.target.statusEffects.silence;
                    this.target.silenced = false;
                }
            }
            this.owner.dioKnifeStopped = false;
            if (!this.ended) { this.ended = true; Vfx.spawn(new DioTimeWaveVFX(this.owner, false)); } // 화면 전용: 시간이 다시 흐름
        }
        return expired;
    }

    collidesWith() { return false; }

    // 멈춘 동안: 화면이 어두운 남색으로 가라앉고, DIO 뒤로 거꾸로 천천히 도는 시계 문자판 + 남은 시간 고리
    draw(ctx) {
        const el = (Time.now - this.createdTime) / 1000, left = Math.max(0, 1 - el / this.durationSec);
        ctx.fillStyle = `rgba(20, 16, 40, ${0.5})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery;
        accDrawClock(ctx, ACC_CLOCK_IMAGE, DIO_GOLD, cx, cy, 150, 1, -el * 0.4, 0.35);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255, 216, 74, 0.8)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
        ctx.restore();
    }
}

class DioSkill2 extends Skill {
    constructor() {
        super('The World (Time Stop)', 12000);
        this.owner = null;
        this.skill1Ref = null;
    }

    use(owner, direction, attacks) {
        this.owner = owner;
        this.lastUsed = Time.now;

        if (this.skill1Ref) {
            this.skill1Ref.currentCharges = 5;
            this.skill1Ref.lastChargeTime = Time.now;
        }

        const target = owner.opponent;
        if (target) {
            const duration = 3.0;
            timeSlow(target, duration, 100.0);
            slow(target, duration, 100.0);
            silence(target, duration);
            target.stunned = true;
            owner.dioKnifeStopped = true;
            attacks.push(new DioTimeStopEffect(owner, target, duration));
        }
    }
}

// ==========================================
// [궁극기] 로드롤러: 하늘로 날아올라(무적, 벽 통과) 자유롭게 움직이다가 단 한 번 내리찍는다
// 마법사 궁극기와 같은 구조 (3발이 아니라 1발)
// ==========================================
class DioRoadRollerManager {
    constructor(owner, color) {
        this.owner = owner;
        this.color = color;
        this.shotsRemaining = 1;
        this.phase = 1;
        this.phaseStartTime = Time.now;
        this.expired = false;
        this.canPenetrateWalls = true;
        this.hitPlayers = [];
        this.damage = 0;
        this.radius = 85;
        this.lastKeyDown = true;

        this.originalChargeRate = owner.ultChargeRate;
        owner.ultChargeRate = 0.0;
        owner.invincible = true;
        owner.hidden = true;
        silence(owner, 15.0);
        ghost(owner, 15.0);
    }

    triggerShot() {
        if (this.phase === 1) {
            this.phase = 2;
            this.phaseStartTime = Time.now;
            slow(this.owner, 0.5, 100);
        }
    }

    update() {
        if (this.owner.hp <= 0) {
            this.finish();
            return;
        }

        const keyDown = this.owner.input.skills[3];
        if (!this.lastKeyDown && keyDown) this.triggerShot();
        this.lastKeyDown = keyDown;

        const elapsed = Time.now - this.phaseStartTime;
        if (this.phase === 1) {
            this.damage = 0;
            if (elapsed >= 3000) {
                this.phase = 2;
                this.phaseStartTime = Time.now;
                slow(this.owner, 0.5, 100);
            }
        } else if (this.phase === 2) {
            this.damage = 0;
            if (elapsed >= 500) {
                this.phase = 3;
                this.damage = this.owner.baseAtk * 2.0;
                this.phaseStartTime = Time.now;
            }
        } else if (this.phase === 3 && elapsed >= 200) {
            this.shotsRemaining -= 1;
            if (this.shotsRemaining > 0) {
                this.phase = 1;
                this.damage = 0;
                this.phaseStartTime = Time.now;
                this.hitPlayers = [];
            } else {
                this.finish();
            }
        }
    }

    finish() {
        this.owner.invincible = false;
        this.owner.hidden = false;
        this.owner.ultChargeRate = this.originalChargeRate;
        delete this.owner.statusEffects.silence;
        delete this.owner.statusEffects.ghost;
        this.owner.silenced = false;
        this.expired = true;
    }

    isExpired() { return this.expired; }

    collidesWith(target) {
        if (this.phase !== 3 || target === this.owner || target.invincible || target.defense >= 100.0) return false;
        return (target.rect.centerx - this.owner.rect.centerx) ** 2 + (target.rect.centery - this.owner.rect.centery) ** 2 <= this.radius ** 2;
    }

    // 하늘에 떠 있는 동안: 바닥에 금빛 그림자 고리 / 내려오기 직전(0.5초): 그림자가 커지고 경고 고리가 깜빡 / 착지: 큰 폭발 (화면 전용)
    draw(ctx) {
        if (this.expired) return;
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery, r = this.radius;
        const el = Time.now - this.phaseStartTime;
        if (this.phase === 1) {
            const pulse = 0.5 + 0.5 * Math.sin(Time.now * 0.012);
            ctx.save(); ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; ctx.beginPath(); ctx.ellipse(cx, cy + 6, r * 0.45, r * 0.18, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            dioGlow(ctx, DMX_RING_IMAGE, cx, cy, r * 2.2, r * 2.2, { alpha: 0.45 + 0.25 * pulse, core: 0.3 });
        } else if (this.phase === 2) {
            const k = Math.min(1, el / 500);
            ctx.save(); ctx.fillStyle = `rgba(0, 0, 0, ${0.25 + 0.35 * k})`;                    // 점점 커지는 그림자
            ctx.beginPath(); ctx.ellipse(cx, cy, r * (0.4 + 0.6 * k), r * (0.4 + 0.6 * k) * 0.85, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
            const blink = Math.floor(Time.now / 80) % 2 === 0;
            dmxDraw(ctx, DMX_WARN_IMAGE, cx, cy, r * 2 * 100 / 92, { lighter: true, tint: blink ? '#ff3a24' : DIO_GOLD, alpha: 0.9, angle: el * 0.004 });
        } else if (this.phase === 3 && !this.boomed) {
            this.boomed = true;
            Vfx.spawn(new DmxBoomVFX(cx, cy, r, { red: true, big: true }));
            Vfx.spawn(new AccClockBurstVFX(cx, cy, { color: DIO_GOLD, from: 80, to: r * 3, duration: 0.45, spin: 1.5 }));
        }
    }
}

class DioUltimateSkill extends Skill {
    constructor() {
        super('Road Roller', 500, ['ult'], -99999);
        this.ultChargeRate = 8.0;
    }

    use(owner, direction, attacks, color) {
        this.lastUsed = Time.now;
        attacks.push(new DioRoadRollerManager(owner, color));
    }
}

// ==========================================
// 캐릭터 등록
// ==========================================
function applyDio(player) {
    player.baseAtk = 15;
    player.maxHp = 100;
    player.hp = 100;
    player.speed = 4.7;
    player.dioKnifeStopped = false;
    player.dioLastHitTime = 0;
    player.dioStandRef = null;
    player.spriteImage = DIO_IMAGE;

    const skill1 = new DioSkill1();
    const skill2 = new DioSkill2();
    skill2.skill1Ref = skill1;

    player.abilities = [
        new DioBasicAttack(),   // 평타: 스탠드 소환 (다시 쓰면 위치 이동)
        skill1,                 // 스킬 1: 칼 던지기 (5개 충전)
        skill2,                 // 스킬 2: 시간 정지
        new DioUltimateSkill(), // 궁극기: 로드롤러
    ];
    player.ultChargeRate = player.abilities[3].ultChargeRate;
}

const DIO_CHARACTER_DATA = {
    id: 'DIO',
    fxColor: '#ffd84a',
    name: 'DIO',
    desc: '평타(0.48초): 앞에 스탠드를 소환해 그 자리에서 0.24초마다 잽을 날립니다(6씩). 다시 쓰면 새 자리로 옮깁니다, 스킬 1(1.5초마다 충전·최대 5개): 칼을 던집니다(12). 시간 정지 중에는 공중에 멈췄다가 시간이 흐르면 날아갑니다, 스킬 2(12초): 3초 동안 상대의 시간을 멈추고(이동·스킬 불가) 칼을 5개 채웁니다. 멈춘 상대가 공격에 맞으면 바로 풀립니다, 궁극기: 하늘로 날아올라(무적, 벽 통과) 3초 동안 자유롭게 움직이다가 다시 누르거나 시간이 다 되면 0.5초 뒤 로드롤러로 내리찍습니다(30, 반경 85)',
    apply: applyDio,
    thumbnail: DIO_IMAGE,
};
