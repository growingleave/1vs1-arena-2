// 샌즈 (abilities/sans.py를 옮김)

const SANS_IMAGE = loadImage('assets/sans.png');

// 방향(dirVec) 기준으로 길이 length, 폭 width인 직사각형 꼭짓점
function beamPoints(cx, cy, dirVec, perpVec, length, width) {
    const hl = length / 2;
    const hw = width / 2;
    const [dx, dy] = dirVec;
    const [px, py] = perpVec;
    return [
        [cx + dx * hl + px * hw, cy + dy * hl + py * hw],
        [cx + dx * hl - px * hw, cy + dy * hl - py * hw],
        [cx - dx * hl - px * hw, cy - dy * hl - py * hw],
        [cx - dx * hl + px * hw, cy - dy * hl + py * hw],
    ];
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
    }

    draw(ctx) {
        drawPolygon(ctx, this.getPolygonPoints(), COLOR_WHITE, 'rgb(150, 150, 150)', 1);
    }
}

class SansBasicAttack extends Skill {
    constructor() { super('Spinning Bar', 350); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new SansSpinningBarBullet(owner, direction));
    }
}

// ==========================================
// [스킬 1] 가스터 블래스터: 짧은 경고선 뒤 벽을 뚫는 레이저 (0.4초 속박)
// 궁극기의 거대 빔도 같은 틀을 쓴다
// ==========================================
class SansLaser {
    constructor(owner, direction, { damageMult, delay, activeDuration, width, length }) {
        this.owner = owner;
        this.damage = owner.baseAtk * damageMult;
        this.createdTime = Time.now;
        this.delay = delay;
        this.activeDuration = activeDuration;
        this.lifespan = delay + activeDuration;
        this.hitPlayers = [];
        this.canPenetrateWalls = true;
        this.width = width;
        this.length = length;
        this.dirVec = normalizeOr(direction);
        this.perpVec = [-this.dirVec[1], this.dirVec[0]];
        const forward = Math.floor(length / 2) + 30;
        this.posX = owner.rect.centerx + this.dirVec[0] * forward;
        this.posY = owner.rect.centery + this.dirVec[1] * forward;
    }

    getPolygonPoints() {
        return beamPoints(this.posX, this.posY, this.dirVec, this.perpVec, this.length, this.width);
    }

    corePoints() {
        return beamPoints(this.posX, this.posY, this.dirVec, this.perpVec, this.length, this.width / 2);
    }

    isWarning() { return Time.now - this.createdTime < this.delay; }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        if (this.isWarning() || !canBeHit(this, target)) return false;
        return checkPolygonCollision(this.getPolygonPoints(), target.rect);
    }
}

class SansGasterLaser extends SansLaser {
    constructor(owner, direction) {
        super(owner, direction, { damageMult: 2.2, delay: 180, activeDuration: 200, width: 40, length: 550 });
    }

    applyEffect(target) {
        bind(target, 0.4);
    }

    draw(ctx) {
        if (this.isWarning()) {
            const hl = this.length / 2;
            drawLine(ctx, this.posX - this.dirVec[0] * hl, this.posY - this.dirVec[1] * hl,
                     this.posX + this.dirVec[0] * hl, this.posY + this.dirVec[1] * hl, `rgba(100, 200, 255, ${120 / 255})`, 4);
        } else {
            fillPolygon(ctx, this.getPolygonPoints(), `rgba(150, 220, 255, ${220 / 255})`);
            fillPolygon(ctx, this.corePoints(), COLOR_WHITE);
        }
    }
}

class SansSkill1 extends Skill {
    constructor() { super('Gaster Blaster', 4000); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new SansGasterLaser(owner, direction));
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
    }

    draw(ctx) {
        const r = this.rect;
        ctx.fillStyle = 'rgb(240, 240, 240)';
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgb(100, 100, 100)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 3);
        ctx.stroke();
    }
}

class SansSkill2 extends Skill {
    constructor() { super('Bone Wall Push', 5000); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new SansMovingWallBullet(owner, direction));
    }
}

// ==========================================
// [궁극기] 메가 가스터 블래스터: 1초 동안 기를 모은 뒤(범위 경고 표시), 3초 동안 0.1초마다 피해를 주는 거대 빔.
// 기 모으는 동안과 쏘는 동안 모두 무적이지만 움직일 수 없다.
// (원본은 주석에 '1초 경고'라고 되어 있지만 값이 1ms라 경고 없이 바로 나갔다. 상대가 피할 수 있게 1초로 고침)
// ==========================================
const SANS_ULT_WINDUP_MS = 1000;
const SANS_ULT_FIRE_MS = 3000;

class SansMegaLaserBeam extends SansLaser {
    constructor(owner, direction) {
        super(owner, direction, { damageMult: 0.5, delay: SANS_ULT_WINDUP_MS, activeDuration: SANS_ULT_FIRE_MS, width: 400, length: 1500 });
        this.interval = 100;
        this.lastDamageTick = 0;
        const lockSec = (SANS_ULT_WINDUP_MS + SANS_ULT_FIRE_MS) / 1000 + 0.6;
        silence(owner, lockSec);
        slow(owner, lockSec, 100);
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
        if (this.isWarning()) {
            this.drawWarning(ctx, pts);
        } else {
            const flash = Math.floor(Time.now / 60) % 2 === 0;
            fillPolygon(ctx, pts, flash ? `rgba(100, 200, 255, ${220 / 255})` : `rgba(140, 230, 255, ${240 / 255})`);
            fillPolygon(ctx, this.corePoints(), COLOR_WHITE);
        }
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

        // 3. 샌즈 앞에 에너지가 모이는 원
        const mx = this.owner.rect.centerx + this.dirVec[0] * 40;
        const my = this.owner.rect.centery + this.dirVec[1] * 40;
        drawCircle(ctx, mx, my, 10 + 40 * progress, `rgba(140, 230, 255, ${0.25 + 0.35 * progress})`);
        drawCircle(ctx, mx, my, 4 + 16 * progress, `rgba(255, 255, 255, ${0.6 + 0.4 * blink})`);

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
    player.maxHp = 100;
    player.hp = 100;
    player.speed = 4.4;
    player.dodgeTextTimer = -99999;
    player.lastDodgeTime = -99999;
    player.spriteImage = SANS_IMAGE;

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
    name: '샌즈',
    desc: '평타: 뼈다귀를 던집니다(14, 슬로우 50% 0.4초), 스킬 1: 에너지 블라스트를 쏩니다(33), 0.4초간 속박, 스킬 2: 뼈다귀 벽을 던져 대미지를 주고 상대를 넉백 시킵니다(9), 1.5초간 이동 불가, 궁극기: 1초간 기를 모은 뒤(경고 표시) 큰 에너지 블라스트를 쏴 주변 지형을 삭제시킵니다(11X30), 특성: 30% 확률로 공격을 회피하고 상태이상을 정화합니다',
    apply: applySans,
    thumbnail: SANS_IMAGE,
};
