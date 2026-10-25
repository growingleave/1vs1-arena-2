// 폭파광 (abilities/demolitionist.py를 옮김)

// 원 범위 판정 공통: 중심에서 반지름 안에 상대 중심이 들어오면 맞음
function hitsInCircle(attack, target, x, y, radius) {
    if (!canBeHit(attack, target) || attack.hitPlayers.includes(target)) return false;
    return Math.hypot(target.rect.centerx - x, target.rect.centery - y) <= radius;
}

// ==========================================
// 폭발 이펙트 (벽 관통)
// ==========================================
class DemolitionistExplosionEffect {
    constructor(owner, x, y, damage, radius, color = '255, 69, 0', maxAlpha = 200, lifespan = 300) {
        this.owner = owner;
        this.posX = x;
        this.posY = y;
        this.damage = damage;
        this.radius = radius;
        this.color = color;
        this.maxAlpha = maxAlpha;
        this.createdTime = Time.now;
        this.lifespan = lifespan;
        this.hitPlayers = [];
        this.canPenetrateWalls = true;
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        return hitsInCircle(this, target, this.posX, this.posY, this.radius);
    }

    draw(ctx) {
        const progress = Math.min(1.0, Math.max(0.0, (Time.now - this.createdTime) / this.lifespan));
        const alpha = Math.max(0, Math.trunc(this.maxAlpha * (1.0 - progress))) / 255;
        drawCircle(ctx, this.posX, this.posY, Math.trunc(this.radius * progress), `rgba(${this.color}, ${alpha})`);
    }
}

// ==========================================
// [평타] 유탄: 닿거나 사거리 끝/벽에서 터진다 (피해는 폭발이 준다)
// ==========================================
class DemolitionistBasicGrenade {
    constructor(owner, direction, attacks) {
        this.owner = owner;
        this.direction = direction;
        this.attacks = attacks;
        this.damage = 0;
        this.speed = 9.0;
        this.createdTime = Time.now;
        this.lifespan = 2000;
        this.hitPlayers = [];

        this.width = 12;
        this.height = 12;
        this.posX = owner.rect.centerx + direction[0] * 20;
        this.posY = owner.rect.centery + direction[1] * 20;
        this.startX = this.posX;
        this.startY = this.posY;

        const transformed = owner.isTransformed;
        this.maxRange = transformed ? 180 : 320;
        this.explosionRadius = transformed ? 90 : 60;
        this.explosionDamage = owner.baseAtk * 0.8;

        this.exploded = false;
        this.rect = this.getRect();
    }

    getRect() {
        return new Rect(Math.trunc(this.posX - this.width / 2), Math.trunc(this.posY - this.height / 2), this.width, this.height);
    }

    explode() {
        if (this.exploded) return;
        this.exploded = true;
        this.attacks.push(new DemolitionistExplosionEffect(this.owner, this.posX, this.posY, this.explosionDamage, this.explosionRadius));
    }

    update() {
        this.posX += this.direction[0] * this.speed * this.owner.timeScale;
        this.posY += this.direction[1] * this.speed * this.owner.timeScale;
        this.rect = this.getRect();

        if (Math.hypot(this.posX - this.startX, this.posY - this.startY) >= this.maxRange) {
            this.explode();
            return;
        }
        for (const wall of CURRENT_WALLS) {
            if (wall.rect.colliderect(this.rect)) {
                this.explode();
                return;
            }
        }
    }

    isExpired() { return this.exploded || Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        if (this.exploded || !canBeHit(this, target)) return false;
        if (this.rect.colliderect(target.rect)) this.explode();
        return false;
    }

    draw(ctx) {
        if (this.exploded) return;
        drawCircle(ctx, Math.trunc(this.posX), Math.trunc(this.posY), 6, 'rgb(100, 100, 100)');
        drawCircle(ctx, Math.trunc(this.posX), Math.trunc(this.posY), 3, 'rgb(255, 69, 0)');
    }
}

class DemolitionistBasicSkill extends Skill {
    constructor() { super('Grenade Basic Attack', 400); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new DemolitionistBasicGrenade(owner, direction, attacks));
    }
}

// ==========================================
// [스킬 1] 사다리꼴 충격파 + 뒤로 튕겨나는 반동 (변신 중엔 반동 없이 더 크고 강하게)
// ==========================================
class DemolitionistSkill1Effect {
    constructor(owner, direction) {
        this.owner = owner;
        this.direction = direction;
        this.isTransformed = owner.isTransformed;
        this.damage = owner.baseAtk * (this.isTransformed ? 2.2 : 1.4);
        this.createdTime = Time.now;
        this.lifespan = 250;
        this.hitPlayers = [];
        this.posX = owner.rect.centerx + direction[0] * 35;
        this.posY = owner.rect.centery + direction[1] * 35;
        this.angle = directionToAngle(direction);
    }

    getTrapPoints() {
        const local = this.isTransformed
            ? [[-30, -25], [90, -65], [90, 65], [-30, 25]]
            : [[-20, -18], [60, -45], [60, 45], [-20, 18]];
        return transformLocalPoints(this.posX, this.posY, this.angle, local);
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        if (!canBeHit(this, target) || this.hitPlayers.includes(target)) return false;
        return checkPolygonCollision(this.getTrapPoints(), target.rect);
    }

    applyEffect(target) {
        if (!this.isTransformed) forcedMove(target, 0.3, 350.0, this.direction);
    }

    draw(ctx) {
        const fill = this.isTransformed ? `rgba(180, 50, 255, ${200 / 255})` : `rgba(255, 140, 0, ${200 / 255})`;
        drawPolygon(ctx, this.getTrapPoints(), fill, `rgba(255, 255, 255, ${240 / 255})`, 2);
    }
}

// 돌진/반동 공통: 일정 시간 owner를 direction으로 밀어낸다
class DemolitionistRecoilManager {
    constructor(owner, direction) {
        this.owner = owner;
        this.direction = [-direction[0], -direction[1]];
        this.dashSpeed = 14.0;
        this.dashDuration = 180;
        this.createdTime = Time.now;
        this.damage = 0;
        this.hitPlayers = [];
        this.isDash = true;
    }

    update(walls) {
        if (Time.now - this.createdTime < this.dashDuration) {
            slow(this.owner, 0.1, 100);
            silence(this.owner, 0.1);
            const ts = this.owner.timeScale;
            moveEntityWithWalls(this.owner, this.direction[0] * this.dashSpeed * ts, this.direction[1] * this.dashSpeed * ts, walls);
        }
    }

    isExpired() {
        const expired = Time.now - this.createdTime >= this.dashDuration;
        if (expired) clearDashLock(this.owner, { silenceLock: true });
        return expired;
    }

    collidesWith() { return false; }

    draw() {}
}

class DemolitionistSkill1 extends Skill {
    constructor() { super('Trapezoid Shockwave', 1500); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new DemolitionistSkill1Effect(owner, direction));
        if (!owner.isTransformed) attacks.push(new DemolitionistRecoilManager(owner, direction));
    }
}

// ==========================================
// [스킬 2] (변신 중에만) 돌진하며 지나간 자리에 3번 폭발
// ==========================================
class DemolitionistSkill2DashManager {
    constructor(owner, direction, attacks) {
        this.owner = owner;
        this.direction = direction;
        this.attacks = attacks;
        this.dashSpeed = 10.0;
        this.dashDuration = 450;
        this.createdTime = Time.now;
        this.damage = 0;
        this.hitPlayers = [];
        this.isDash = true;
        this.triggered = [true, false, false];

        this.spawnExplosion(1.5, 80); // 첫 폭발은 바로
    }

    spawnExplosion(mult, radius) {
        this.attacks.push(new DemolitionistExplosionEffect(
            this.owner, this.owner.rect.centerx, this.owner.rect.centery, this.owner.baseAtk * mult, radius));
    }

    update(walls) {
        const elapsed = Time.now - this.createdTime;
        if (elapsed < this.dashDuration) {
            slow(this.owner, 0.1, 100);
            const ts = this.owner.timeScale;
            moveEntityWithWalls(this.owner, this.direction[0] * this.dashSpeed * ts, this.direction[1] * this.dashSpeed * ts, walls);
        }
        if (!this.triggered[1] && elapsed >= 225) {
            this.triggered[1] = true;
            this.spawnExplosion(1.5, 80);
        }
    }

    isExpired() {
        const expired = Time.now - this.createdTime >= this.dashDuration;
        if (expired && !this.triggered[2]) {
            this.triggered[2] = true;
            this.spawnExplosion(2.0, 100);
            clearDashLock(this.owner);
        }
        return expired;
    }

    collidesWith() { return false; }

    draw() {}
}

class DemolitionistSkill2 extends Skill {
    constructor() {
        super('Transform Trail Bomb', 3500, ['dash']);
        this.owner = null;
    }

    canUse() {
        if (this.owner && !this.owner.isTransformed) return false;
        return super.canUse();
    }

    use(owner, direction, attacks) {
        this.owner = owner;
        if (!owner.isTransformed) return;
        this.lastUsed = Time.now;
        attacks.push(new DemolitionistSkill2DashManager(owner, direction, attacks));
    }
}

// ==========================================
// [궁극기] 2초 무적으로 기를 모은 뒤 대폭발 → 15초 변신 (스킬 강화)
// ==========================================
class DemolitionistTransformManager {
    constructor(owner) {
        this.owner = owner;
        this.startTime = Time.now;
        this.duration = 15000;
        this.damage = 0;
        this.hitPlayers = [];
    }

    update() {}

    isExpired() {
        if (Time.now - this.startTime >= this.duration) {
            this.owner.isTransformed = false;
            if (this.owner.originalColor !== undefined) this.owner.color = this.owner.originalColor;
            if (this.owner.originalUltChargeRate !== undefined) this.owner.ultChargeRate = this.owner.originalUltChargeRate;
            this.owner.ultChargeMultiplier = 2.5;
            return true;
        }
        return false;
    }

    collidesWith() { return false; }

    // 머리 위 남은 변신 시간 막대
    draw(ctx) {
        const progress = Math.max(0.0, Math.min(1.0, 1.0 - (Time.now - this.startTime) / this.duration));
        const barW = 32;
        const barH = 4;
        const x = this.owner.rect.centerx - barW / 2;
        const y = this.owner.rect.top - 22;
        ctx.fillStyle = '#1e1e23';
        ctx.fillRect(x, y, barW, barH);
        ctx.strokeStyle = 'rgb(138, 43, 226)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, barW - 1, barH - 1);
        const fillW = Math.trunc(barW * progress);
        if (fillW > 0) {
            ctx.fillStyle = 'rgb(138, 43, 226)';
            ctx.fillRect(x, y, fillW, barH);
        }
    }
}

class DemolitionistUltDelayField {
    constructor(owner, attacks) {
        this.owner = owner;
        this.attacks = attacks;
        this.damage = 0;
        this.hitPlayers = [];
        this.startTime = Time.now;
        this.duration = 2000;
        this.triggered = false;
        this.forceExpire = false;
    }

    update() {
        // 2초간 무적 + 이동 불가 + 침묵
        defenseMod(this.owner, 0.2, 100);
        slow(this.owner, 0.1, 100);
        silence(this.owner, 0.1);

        if (Time.now - this.startTime >= this.duration && !this.triggered) {
            this.triggered = true;
            this.forceExpire = true;

            // 폭발과 동시에 바로 움직일 수 있게 잠금을 푼다
            clearDashLock(this.owner, { silenceLock: true });

            const owner = this.owner;
            this.attacks.push(new DemolitionistExplosionEffect(
                owner, owner.rect.centerx, owner.rect.centery, 45.0, 180, '255, 0, 0', 220, 400));

            owner.isTransformed = true;
            if (owner.originalColor === undefined) owner.originalColor = owner.color;
            owner.color = '#8a2be2';
            if (owner.originalUltChargeRate === undefined) owner.originalUltChargeRate = owner.ultChargeRate;
            owner.ultChargeRate = 0.0;
            owner.ultChargeMultiplier = 0.0;

            this.attacks.push(new DemolitionistTransformManager(owner));
        }
    }

    isExpired() { return this.forceExpire; }

    collidesWith() { return false; }

    draw(ctx) {
        const progress = Math.min(1.0, (Time.now - this.startTime) / this.duration);
        drawCircle(ctx, this.owner.rect.centerx, this.owner.rect.centery, Math.trunc(180 * progress) - 1.5,
                   null, `rgba(255, 69, 0, ${60 / 255})`, 3);
    }
}

class DemolitionistUltSkill extends Skill {
    constructor() {
        super('Mega Blast Transform', 500, ['ult'], -99999);
        this.owner = null;
    }

    canUse() {
        if (this.owner && this.owner.isTransformed) return false;
        return super.canUse();
    }

    use(owner, direction, attacks) {
        this.owner = owner;
        if (owner.isTransformed) return;
        this.lastUsed = Time.now;
        attacks.push(new DemolitionistUltDelayField(owner, attacks));
    }
}

// ==========================================
// 캐릭터 등록
// ==========================================
function applyDemolitionist(player) {
    player.baseAtk = 13;
    player.maxHp = 100;
    player.hp = 100;
    player.speed = 4.3;
    player.isTransformed = false;
    player.ultChargeMultiplier = 2.5; // 패시브: 준 피해로 궁극기가 2.5배 빨리 찬다

    const skill2 = new DemolitionistSkill2();
    skill2.owner = player;
    const ult = new DemolitionistUltSkill();
    ult.owner = player;

    player.abilities = [new DemolitionistBasicSkill(), new DemolitionistSkill1(), skill2, ult];
}

const DEMOLITIONIST_CHARACTER_DATA = {
    id: 'DEMOLITIONIST',
    name: '폭파광',
    desc: '평타: 폭발물을 쏩니다(10), 강화 평타: 공속이 빨라집니다, 스킬 1: 사다리꼴 범위로 적을 밉니다(18), 강화 평타: 더 넓은 범위와 강한 대미지로 적을 공격합니다(29), 스킬 2(변신 중에만 사용 가능): 돌진하며 경로에 연속 폭발을 일으킵니다(20/20/26), 궁극기: 무적 상태가 되며 변신을 하며 폭발하고 스킬이 강화됩니다(45)',
    apply: applyDemolitionist,
    thumbnail: null,
};
