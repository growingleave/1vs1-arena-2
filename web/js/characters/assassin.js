// 어쌔신 (abilities/assassin.py를 옮김)

const MAX_ASSASSIN_CHARGE = 3;

// 회전 베기 이펙트 그림 (흰색, 배경 투명). 원 모양 칼자국이 오른쪽 위(약 -37도)에서 시작해
// 시계 방향으로 한 바퀴 가까이 돈다
const ASSASSIN_SPIN_IMAGE = loadImage('assets/assassin_spin.png');
const ASSASSIN_SPIN_IMAGE_START = -37 * Math.PI / 180;
const ULT_SLASH_PHASE_DURATION = 260; // X자 참격 한 획이 지나가는 시간(ms)

function addAssassinCharge(owner) {
    owner.assassinCharge = Math.min(MAX_ASSASSIN_CHARGE, (owner.assassinCharge || 0) + 1);
}

function rgbList(color) { // '#rrggbb' → 'r, g, b'
    return `${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}`;
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
        this.width = 46;
        this.height = 16;
        this.posX = owner.rect.centerx + direction[0] * 28;
        this.posY = owner.rect.centery + direction[1] * 28;
        this.angle = directionToAngle(direction);
    }

    getPolygonPoints() {
        return rotatedRectPoints(this.posX, this.posY, this.width, this.height, this.angle);
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        return canBeHit(this, target) && checkPolygonCollision(this.getPolygonPoints(), target.rect);
    }

    draw(ctx) {
        drawPolygon(ctx, this.getPolygonPoints(), 'rgb(220, 220, 230)', COLOR_WHITE, 1);
    }
}

class AssassinSpinAttack {
    constructor(owner) {
        this.owner = owner;
        this.damage = owner.baseAtk * 1.2;
        this.radius = 56;
        this.createdTime = Time.now;
        this.lifespan = 220;
        this.hitPlayers = [];
        this.canPenetrateWalls = true;

        // 그림 이펙트: 어쌔신 앞의 보이지 않는 막대가 시계 방향으로 돌며 그림을 드러낸다 (화면 효과 전용)
        const face = Math.atan2(owner.facing[1], owner.facing[0]);
        Vfx.spawn(new RingSlashVFX(0, 0, {
            image: ASSASSIN_SPIN_IMAGE,
            follow: owner,
            size: 135,
            color: owner.playerNum === 2 ? '#3c8cff' : '#ff4d40',
            rotation: face - ASSASSIN_SPIN_IMAGE_START,
            startAngle: ASSASSIN_SPIN_IMAGE_START,
            sweepAngle: Math.PI * 2,
            sweep: this.lifespan / 1000,
            fade: 0.3,
            // 그림은 제자리에 두고, 어쌔신 앞에서 시작하는 보이지 않는 막대가 시계 방향으로
            // 일정한 속도로 한 바퀴 돌며 지나간 자리를 드러낸다
            spinTotal: 0,
            revealEase: 'linear',
            softEdge: 25 * Math.PI / 180,
            // 다 드러나면 막대가 돌던 속도를 이어받아 어쌔신을 중심으로 계속 돌며(점점 느리게) 사라진다.
            // 막대 속도 = 한 바퀴 / 0.22초. 점점 느려지는 곡선(처음 속도 = 3 x 각도 / 시간)에 맞춘 각도
            afterSpin: (Math.PI * 2 / (this.lifespan / 1000)) * 0.3 / 3,
            ghosts: 3,                  // 도는 동안 뒤따라오는 잔상
        }));
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        if (!canBeHit(this, target)) return false;
        return Math.hypot(target.rect.centerx - this.owner.rect.centerx, target.rect.centery - this.owner.rect.centery) <= this.radius;
    }

    // 그림 이펙트(RingSlashVFX)가 주인공이라, 판정 범위는 옅은 원으로만 보여준다
    draw(ctx) {
        const progress = Math.min(1.0, (Time.now - this.createdTime) / this.lifespan);
        drawCircle(ctx, this.owner.rect.centerx, this.owner.rect.centery, this.radius - 1, null,
                   `rgba(230, 230, 240, ${0.25 * (1 - progress)})`, 2);
    }
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
    constructor() { super('Quick Step', 600, ['dash']); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        addAssassinCharge(owner);
        attacks.push(new AssassinMoveManager(owner, direction, 20.0, 60)); // 아주 짧은 대쉬
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
            drawLine(ctx, this.owner.rect.centerx, this.owner.rect.centery, this.target.rect.centerx, this.target.rect.centery,
                     'rgb(180, 40, 40)', 3);
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
                this.attacks.push(createHookPull(this.owner, this.direction, traveled));
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
        }
        return false; // 갈고리 자체는 피해를 주지 않는다
    }

    draw(ctx) {
        if (this.resolved) return;
        const x = Math.trunc(this.posX);
        const y = Math.trunc(this.posY);
        drawLine(ctx, this.owner.rect.centerx, this.owner.rect.centery, x, y, 'rgb(150, 150, 150)', 2);
        drawCircle(ctx, x, y, 6, 'rgb(90, 90, 100)');
        drawCircle(ctx, x, y, 5, null, 'rgb(220, 220, 220)', 2);
    }
}

class AssassinHookSkill extends Skill {
    constructor() { super('Grapple Hook', 4500); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        addAssassinCharge(owner);
        attacks.push(new AssassinHookProjectile(owner, direction, attacks));
    }
}

// ==========================================
// [궁극기] 0.5초 은신(무적) 후, 시전한 자리 앞에 X자 참격
// ==========================================
class AssassinXSlashAttack {
    constructor(owner, direction, color, origin) {
        this.owner = owner;
        this.color = rgbList(color);
        this.damage = owner.baseAtk * 3.0;
        this.createdTime = Time.now;

        this.size = 520;
        this.bladeLen = 62;
        this.bladeWidth = 45;
        this.phaseDuration = ULT_SLASH_PHASE_DURATION;
        this.afterimageFade = 260;
        this.groundTrailFade = 900;
        this.lifespan = this.phaseDuration * 2 + Math.max(this.afterimageFade, this.groundTrailFade) + 20;

        // X자 중심은 캐릭터보다 앞쪽
        this.posX = origin[0] + direction[0] * 160;
        this.posY = origin[1] + direction[1] * 160;

        // 1획: 오른쪽 대각선, 2획: 왼쪽 대각선
        const base = directionToAngle(direction);
        this.strokeAngles = [base - 45, base + 45];

        this.hitPlayers = [];
        this.canPenetrateWalls = true;
        this.afterimages = [];
        this.lastAfterTime = 0;
        this.currentBladePts = null;
        this.currentBladeCenter = null;
        this.phantomSize = owner.rect.w;
        this.groundTrailStart = [null, null];
        this.groundTrailEnd = [null, null];
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
        } else {
            const angle = this.strokeAngles[idx];
            const rad = angle * Math.PI / 180;
            const dist = (this.size / 2) * (1.0 - 2.0 * t);
            const cx = this.posX + Math.cos(rad) * dist;
            const cy = this.posY - Math.sin(rad) * dist;
            this.currentBladePts = rotatedRectPoints(cx, cy, this.bladeLen * 2, this.bladeWidth, angle);
            this.currentBladeCenter = [cx, cy];
            if (Time.now - this.lastAfterTime >= 30) {
                this.afterimages.push({ pts: this.currentBladePts, time: Time.now });
                this.lastAfterTime = Time.now;
            }
            if (this.groundTrailStart[idx] === null) this.groundTrailStart[idx] = [cx, cy];
            this.groundTrailEnd[idx] = [cx, cy];
        }
        this.afterimages = this.afterimages.filter(img => Time.now - img.time < this.afterimageFade);
    }

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        if (!canBeHit(this, target) || this.currentBladePts === null) return false;
        return checkPolygonCollision(this.currentBladePts, target.rect);
    }

    draw(ctx) {
        // 원본은 참격 중심 800x800 영역 안에만 그린다
        const half = 400;
        ctx.save();
        ctx.beginPath();
        ctx.rect(Math.trunc(this.posX - half), Math.trunc(this.posY - half), half * 2, half * 2);
        ctx.clip();

        // 바닥에 남는 칼자국
        const elapsed = Time.now - this.createdTime;
        const total = this.phaseDuration * 2;
        const trailAlpha = (elapsed <= total ? 210 : Math.max(0, Math.trunc(210 * (1.0 - (elapsed - total) / this.groundTrailFade)))) / 255;
        if (trailAlpha > 0) {
            for (let i = 0; i < 2; i++) {
                if (this.groundTrailStart[i] === null) continue;
                let [sx, sy] = this.groundTrailStart[i];
                let [ex, ey] = this.groundTrailEnd[i];
                const d = Math.hypot(ex - sx, ey - sy);
                if (d > 0) {
                    const ux = (ex - sx) / d;
                    const uy = (ey - sy) / d;
                    sx -= ux * 30; sy -= uy * 30;
                    ex += ux * 30; ey += uy * 30;
                }
                drawLine(ctx, sx, sy, ex, ey, `rgba(255, 255, 255, ${trailAlpha})`, 3);
                drawLine(ctx, sx, sy, ex, ey, `rgba(${this.color}, ${trailAlpha})`, 1);
            }
        }

        for (const img of this.afterimages) {
            const a = Math.max(0, Math.trunc(220 * (1.0 - (Time.now - img.time) / this.afterimageFade))) / 255;
            if (a <= 0) continue;
            drawPolygon(ctx, img.pts, `rgba(${this.color}, ${a})`, `rgba(255, 255, 255, ${a})`, 1);
        }

        if (this.currentBladePts !== null) {
            drawPolygon(ctx, this.currentBladePts, COLOR_WHITE, `rgb(${this.color})`, 2);
        }

        // 칼날을 따라 움직이는 잔영 (충돌체 아님)
        if (this.currentBladeCenter !== null) {
            const s = this.phantomSize;
            const x = Math.trunc(this.currentBladeCenter[0]) - Math.floor(s / 2);
            const y = Math.trunc(this.currentBladeCenter[1]) - Math.floor(s / 2);
            ctx.fillStyle = `rgba(${this.color}, ${150 / 255})`;
            ctx.fillRect(x, y, s, s);
            ctx.strokeStyle = `rgba(255, 255, 255, ${200 / 255})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
        }
        ctx.restore();
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
        silence(owner, (this.duration + ULT_SLASH_PHASE_DURATION * 2) / 1000);
    }

    update() {}

    isExpired() {
        if (Time.now - this.createdTime >= this.duration) {
            this.owner.invincible = false;
            this.owner.isInvisible = false;
            this.owner.assassinJumpTime = Time.now; // 다시 나타나며 살짝 뛰어오르는 연출
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
        this.ultChargeRate = 5.0;
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
    player.maxHp = 85;
    player.hp = player.maxHp;
    player.baseAtk = 14;
    player.speed = 5.1;
    player.assassinCharge = 0;
    player.isInvisible = false;
    player.assassinJumpTime = -99999;

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
    name: '어쌔신',
    desc: '평타: 단검으로 적을 찌릅니다(14), 스킬 1: 짧게 돌진하고 평타를 강화합니다(최대 3번), 강화 평타: 원형으로 검을 돌립니다(17), 스킬 2: 갈고리를 던져 벽이나 상대로 이동할 수 있습니다, 상대를 맞추면 1초간 기절시킵니다, 궁극기: x자로 크게 그어 큰 대미지를 줍니다(42)',
    apply: applyAssassinToPlayer,
    thumbnail: null,
};
