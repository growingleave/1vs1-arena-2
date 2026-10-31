// DIO (abilities/dio.py를 옮김)

const DIO_IMAGE = loadImage('assets/dio.png');
const DIO_STAND_IMAGE = loadImage('assets/dio_skill1.png');

function drawRotatedBox(ctx, x, y, w, h, angleDeg, fill, stroke) {
    ctx.save();
    ctx.translate(Math.trunc(x), Math.trunc(y));
    ctx.rotate(-angleDeg * Math.PI / 180);
    ctx.fillStyle = fill;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1);
    ctx.restore();
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

    applyEffect() {
        this.owner.dioLastHitTime = Time.now;
    }

    draw(ctx) {
        drawRotatedBox(ctx, this.posX, this.posY, this.width, this.height, this.angle, 'rgb(220, 220, 240)', 'rgb(50, 50, 50)');
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
        const ringW = Math.max(2, Math.trunc(7 * (1.0 - p)));
        drawCircle(ctx, this.posX, this.posY, radius - ringW / 2, null, `rgba(255, 255, 255, ${alpha / 255})`, ringW);
        drawCircle(ctx, this.posX, this.posY, Math.max(0, radius - 8) - 1, null, `rgba(255, 215, 0, ${Math.floor(alpha / 2) / 255})`, 2);
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

    applyEffect() {
        this.owner.dioLastHitTime = Time.now;
    }

    draw(ctx) {
        const r = this.getRect();
        ctx.fillStyle = `rgba(255, 255, 255, ${230 / 255})`;
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, 4);
        ctx.fill();
        ctx.strokeStyle = COLOR_GOLD;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 4);
        ctx.stroke();
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
        if (isImageReady(DIO_STAND_IMAGE)) {
            ctx.save();
            ctx.translate(x + s / 2, y + s / 2);
            if (this.dirVec[0] < 0) ctx.scale(-1, 1);
            ctx.drawImage(DIO_STAND_IMAGE, -s / 2, -s / 2, s, s);
            ctx.restore();
        }
        ctx.strokeStyle = COLOR_WHITE;
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
        }
        return expired;
    }

    collidesWith() { return false; }

    draw(ctx) {
        ctx.fillStyle = `rgba(10, 10, 30, ${120 / 255})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
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

    draw(ctx) {
        if (this.expired) return;
        const cx = this.owner.rect.centerx;
        const cy = this.owner.rect.centery;
        const r = this.radius;

        if (this.phase === 2) {
            // 반짝이는 느낌표 경고
            const pulse = (Math.sin(Time.now * 0.02) + 1) * 0.5;
            drawCircle(ctx, cx, cy, r, `rgba(255, 60, 40, ${(180 + 75 * pulse) / 255})`);
            drawCircle(ctx, cx, cy, r - 2, null, 'rgb(255, 220, 60)', 4);
            if (Math.floor(Time.now / 150) % 2 === 0) {
                drawText(ctx, '!', cx, cy - r - 30, 48, 'rgb(255, 220, 60)', { bold: true, align: 'center', baseline: 'middle' });
            }
        } else if (this.phase === 3) {
            drawCircle(ctx, cx, cy, Math.trunc(r * 0.8), `rgba(255, 255, 255, ${220 / 255})`);
            drawCircle(ctx, cx, cy, r - 3, null, 'rgb(255, 120, 40)', 6);
        } else {
            const pulse = (Math.sin(Time.now * 0.015) + 1) * 0.5;
            drawCircle(ctx, cx, cy, Math.trunc(r * (0.9 + 0.1 * pulse)) - 1, null, `rgba(255, 120, 40, ${160 / 255})`, 2);
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
    desc: '전방에 스탠드를 소환해 그 자리에서 계속 잽을 날리는 평타(재사용 시 위치 이동), 충전형 칼 던지기(스킬 1), 5초간 시간 정지(스킬 2), 하늘로 날아올라 무적 상태로 자유롭게 이동하다 단 한 번 강타하는 궁극기를 지닌 흡혈귀',
    apply: applyDio,
    thumbnail: DIO_IMAGE,
};
