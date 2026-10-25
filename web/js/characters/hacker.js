// 해커 (abilities/hacker.py를 옮김)

const HACKER_IMAGE = loadImage('assets/hacker.png');

// ==========================================
// 해킹 게이지: 상대 머리 옆의 초록 도넛. 100%가 되면 침묵·슬로우·화상 + "해킹 상태"
// ==========================================
function triggerFullHack(owner, target) {
    target.hackerGauge = 0.0;
    target.hackerTextTimer = Time.now;
    silence(target, 2.5);
    slow(target, 2.5, 50);
    burn(target, 6.0, owner.baseAtk * 0.25);
    target.hackedUntil = Time.now + 6000;
}

function drawClockwiseDonut(ctx, x, y, radius, percent) {
    drawCircle(ctx, x, y, radius - 1.5, null, 'rgb(120, 130, 150)', 3);
    if (percent > 0) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, radius - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (percent / 100));
        ctx.closePath();
        ctx.fillStyle = 'rgb(0, 255, 150)';
        ctx.fill();
    }
    drawCircle(ctx, x, y, radius - 7, null, 'rgb(120, 130, 150)', 2);
}

// 대상에게 해킹 게이지를 처음 붙일 때 한 번만 호출된다 (여러 번 불러도 안전)
function attachHackerGauge(target) {
    if (target.hackerGauge === undefined) target.hackerGauge = 0.0;
    if (target.lastGaugeIncreaseTime === undefined) target.lastGaugeIncreaseTime = Time.now;
    if (target.hackerTextTimer === undefined) target.hackerTextTimer = -99999;
    if (target.lastGaugeDecayTick === undefined) target.lastGaugeDecayTick = Time.now;
    if (target.hasHackerHooks) return;
    target.hasHackerHooks = true;

    target.preUpdateHooks.unshift(() => {
        const now = Time.now;
        const dtSec = Math.max(0, (now - target.lastGaugeDecayTick) / 1000);
        target.lastGaugeDecayTick = now;

        // 4초 동안 안 맞으면 초당 15%씩 줄어든다
        if (target.hackerGauge > 0 && now - target.lastGaugeIncreaseTime > 4000) {
            target.hackerGauge = Math.max(0, target.hackerGauge - 15.0 * dtSec);
        }

        // 공격력 30% 감소 디버프는 2초 뒤 원래대로
        if (target.atkDebuffTimer !== undefined && now >= target.atkDebuffTimer) {
            if (target.hackerOriginalBaseAtk !== undefined) {
                target.baseAtk = target.hackerOriginalBaseAtk;
                target.hackerOriginalBaseAtk = undefined;
            }
            target.atkDebuffTimer = undefined;
        }
    });

    target.postDrawHooks.push((ctx) => {
        const r = target.rect;
        if (target.hackerGauge > 0) drawClockwiseDonut(ctx, r.centerx + 50, r.top - 18, 26, target.hackerGauge);

        if (Time.now - target.hackerTextTimer < 2000) {
            drawText(ctx, '해킹!', r.centerx + 50, r.top - 58, 24, 'rgb(0, 255, 150)', { bold: true, align: 'center', baseline: 'middle' });
        }

        // 해킹 상태에서 큐브에 맞아 생긴 보라색 도트 피해 표시
        const corruptUntil = target.hackerCorruptUntil || 0;
        if (corruptUntil > Time.now) {
            const alpha = (200 * Math.min(1.0, (corruptUntil - Time.now) / 600)) / 255;
            const radius = Math.trunc(Math.max(r.w, r.h) * 0.65 + 4 * Math.sin(Time.now / 120));
            drawCircle(ctx, r.centerx, r.centery, radius - 1.5, null, `rgba(170, 60, 255, ${alpha})`, 3);
            for (let i = 0; i < 6; i++) {
                const ang = Time.now / 200 + i * (2 * Math.PI / 6);
                drawCircle(ctx, Math.trunc(r.centerx + Math.cos(ang) * (radius - 6)), Math.trunc(r.centery + Math.sin(ang) * (radius - 6)),
                           3, `rgba(210, 130, 255, ${alpha})`);
            }
        }
    });
}

// 해커가 공격하는 쪽에서 쓰는 작은 판정 사각형 (벽에 너무 일찍 막히지 않게)
function smallCollisionRect(x, y) {
    return new Rect(Math.trunc(x - 7), Math.trunc(y - 7), 14, 14);
}

// ==========================================
// [스킬 1] 회전하는 데이터 큐브: 해킹 게이지 +50, 공격력 30% 감소, 슬로우
// ==========================================
class HackerCubeBullet {
    constructor(owner, direction) {
        this.owner = owner;
        this.direction = direction;
        this.damage = owner.baseAtk * 0.9;
        this.speed = 9.0;
        this.createdTime = Time.now;
        this.lifespan = 1500;
        this.hitPlayers = [];
        this.size = 48;
        this.posX = owner.rect.centerx + direction[0] * 35;
        this.posY = owner.rect.centery + direction[1] * 35;
        this.startX = this.posX;
        this.startY = this.posY;
        this.maxRange = 450;
        this.angle = 0.0;
        this.rect = squareRect(this.posX, this.posY, this.size);
    }

    update() {
        const oldX = this.posX;
        const oldY = this.posY;
        this.posX += this.direction[0] * this.speed * this.owner.timeScale;
        this.posY += this.direction[1] * this.speed * this.owner.timeScale;
        this.angle += 4.0;
        this.rect = squareRect(this.posX, this.posY, this.size);

        const col = smallCollisionRect(this.posX, this.posY);
        for (const wall of CURRENT_WALLS) {
            if (col.colliderect(wall.rect)) {
                this.posX = oldX;
                this.posY = oldY;
                this.rect = squareRect(this.posX, this.posY, this.size);
                this.createdTime = Time.now - this.lifespan;
                break;
            }
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
        attachHackerGauge(target);
        const wasHacked = (target.hackedUntil || 0) > Time.now;

        target.hackerGauge = Math.min(100.0, target.hackerGauge + 50.0);
        target.lastGaugeIncreaseTime = Time.now;

        // 2초간 공격력 30% 감소
        if (target.hackerOriginalBaseAtk === undefined) target.hackerOriginalBaseAtk = target.baseAtk;
        target.baseAtk = target.hackerOriginalBaseAtk * 0.7;
        target.atkDebuffTimer = Time.now + 2000;

        slow(target, 1.5, 50);

        if (target.hackerGauge >= 100.0) triggerFullHack(this.owner, target);

        // 이미 해킹 상태였다면 더 강한 보라색 도트 피해
        if (wasHacked) {
            bleed(target, 4.0, this.owner.baseAtk * 0.6);
            target.hackerCorruptUntil = Time.now + 4000;
        }

        this.lifespan = 0;
    }

    draw(ctx) {
        const s = this.size;
        ctx.save();
        ctx.translate(Math.trunc(this.posX), Math.trunc(this.posY));
        ctx.rotate(-this.angle * Math.PI / 180);
        ctx.strokeStyle = 'rgb(0, 255, 150)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-s / 2 + 1.5, -s / 2 + 1.5, s - 3, s - 3, 6);
        ctx.stroke();
        const inner = s / 2;
        ctx.strokeStyle = 'rgb(0, 255, 200)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-inner / 2 + 1, -inner / 2 + 1, inner - 2, inner - 2, 4);
        ctx.stroke();
        ctx.restore();
    }
}

class HackerSkill1 extends Skill {
    constructor() { super('Data Cube', 4000); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new HackerCubeBullet(owner, direction));
    }
}

// ==========================================
// [스킬 2] 텔레포트 사각형: 닿거나 막히거나 사거리 끝에서 그 자리로 순간이동
// ==========================================
class HackerTeleportSquareBullet {
    constructor(owner, direction) {
        this.owner = owner;
        this.direction = direction;
        this.damage = 0;
        this.speed = 13.0;
        this.createdTime = Time.now;
        this.lifespan = 1200;
        this.hitPlayers = [];
        this.size = 28;
        this.posX = owner.rect.centerx + direction[0] * 25;
        this.posY = owner.rect.centery + direction[1] * 25;
        this.startX = this.posX;
        this.startY = this.posY;
        this.maxRange = 400;
        this.teleported = false;
        this.rect = squareRect(this.posX, this.posY, this.size);
    }

    teleport() {
        if (this.teleported) return;
        this.teleported = true;

        let [dx, dy] = this.direction;
        const len = Math.hypot(dx, dy);
        if (len > 0) { dx /= len; dy /= len; } else { dx = 1; dy = 0; }

        const r = this.owner.rect;
        r.centerx = Math.trunc(this.posX - dx * 25);
        r.centery = Math.trunc(this.posY - dy * 25);
        r.clampIp(ARENA_RECT);

        // 벽 안에 끼지 않게 가까운 쪽으로 밀어낸다
        for (const wall of CURRENT_WALLS) {
            if (r.colliderect(wall.rect)) {
                const overlapX = Math.min(r.right - wall.rect.left, wall.rect.right - r.left);
                const overlapY = Math.min(r.bottom - wall.rect.top, wall.rect.bottom - r.top);
                if (overlapX < overlapY) {
                    if (r.centerx < wall.rect.centerx) r.right = wall.rect.left;
                    else r.left = wall.rect.right;
                } else if (r.centery < wall.rect.centery) {
                    r.bottom = wall.rect.top;
                } else {
                    r.top = wall.rect.bottom;
                }
            }
        }
        r.clampIp(ARENA_RECT);
    }

    update() {
        const oldX = this.posX;
        const oldY = this.posY;
        this.posX += this.direction[0] * this.speed * this.owner.timeScale;
        this.posY += this.direction[1] * this.speed * this.owner.timeScale;
        this.rect = squareRect(this.posX, this.posY, this.size);

        const col = smallCollisionRect(this.posX, this.posY);
        for (const wall of CURRENT_WALLS) {
            if (col.colliderect(wall.rect)) {
                this.posX = oldX;
                this.posY = oldY;
                this.rect = squareRect(this.posX, this.posY, this.size);
                this.teleport();
                break;
            }
        }
    }

    isExpired() {
        const timeOver = Time.now - this.createdTime >= this.lifespan;
        const outOfRange = Math.hypot(this.posX - this.startX, this.posY - this.startY) >= this.maxRange;
        if (timeOver || outOfRange) {
            this.teleport();
            return true;
        }
        return this.teleported;
    }

    collidesWith(target) {
        return canBeHit(this, target) && this.rect.colliderect(target.rect);
    }

    applyEffect() {
        this.teleport();
        this.lifespan = 0;
    }

    draw(ctx) {
        const s = this.size;
        const x = Math.trunc(this.posX - s / 2);
        const y = Math.trunc(this.posY - s / 2);
        ctx.strokeStyle = 'rgb(0, 255, 185)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(x + 1.5, y + 1.5, s - 3, s - 3, 4);
        ctx.stroke();
        ctx.fillStyle = `rgba(0, 255, 120, ${100 / 255})`;
        ctx.beginPath();
        ctx.roundRect(x + 3, y + 3, s - 6, s - 6, 2);
        ctx.fill();
    }
}

class HackerSkill2 extends Skill {
    constructor() { super('Teleport Square', 5000); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new HackerTeleportSquareBullet(owner, direction));
    }
}

// ==========================================
// [궁극기] 주변 원 안의 상대를 즉시 해킹 + 3.5초 혼란
// ==========================================
class HackerUltimateArea {
    constructor(owner) {
        this.owner = owner;
        this.damage = 0;
        this.createdTime = Time.now;
        this.duration = 400;
        this.radius = 280;
        this.hitPlayers = [];
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.duration; }

    collidesWith(target) {
        if (!canBeHit(this, target) || this.hitPlayers.includes(target)) return false;
        return Math.hypot(target.rect.centerx - this.owner.rect.centerx, target.rect.centery - this.owner.rect.centery) <= this.radius;
    }

    applyEffect(target) {
        attachHackerGauge(target);
        target.lastGaugeIncreaseTime = Time.now;
        triggerFullHack(this.owner, target);
        confuse(target, 3.5);
    }

    draw(ctx) {
        const r = Math.trunc(this.radius * ((Time.now - this.createdTime) / this.duration));
        const cx = this.owner.rect.centerx;
        const cy = this.owner.rect.centery;
        drawCircle(ctx, cx, cy, r, `rgba(0, 255, 150, ${45 / 255})`);
        drawCircle(ctx, cx, cy, r - 2, null, `rgba(0, 255, 200, ${200 / 255})`, 4);
    }
}

class HackerUltimate extends Skill {
    constructor() { super('Cyber Overload', 500, ['ult'], -99999); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new HackerUltimateArea(owner));
    }
}

// ==========================================
// [평타] 좁은 부채꼴 스캔 (피해 없음). 안에 있는 동안 해킹 게이지가 초당 40% 찬다
// ==========================================
class HackerScanEffect {
    constructor(owner, direction) {
        this.owner = owner;
        this.direction = direction;
        this.damage = 0;
        this.createdTime = Time.now;
        this.duration = 2000;
        this.lifespan = 2000;
        this.range = 520;
        this.halfAngle = 7.5;
        this.hitPlayers = [];
        this.lastTickTime = Time.now;
    }

    unitDirection() {
        const [dx, dy] = this.direction;
        const len = Math.hypot(dx, dy);
        return len === 0 ? [1, 0] : [dx / len, dy / len];
    }

    update() {
        const dt = Time.now - this.lastTickTime;
        this.lastTickTime = Time.now;
        const [ux, uy] = this.unitDirection();

        const target = this.owner.opponent;
        if (!target || target.invincible || target.defense >= 100.0) return;

        const tx = target.rect.centerx - this.owner.rect.centerx;
        const ty = target.rect.centery - this.owner.rect.centery;
        const dist = Math.hypot(tx, ty);
        if (!(dist > 0 && dist <= this.range)) return;

        const dot = Math.max(-1, Math.min(1, (ux * tx + uy * ty) / dist));
        if (Math.acos(dot) * 180 / Math.PI > this.halfAngle) return;

        attachHackerGauge(target);
        target.hackerGauge = Math.min(100.0, target.hackerGauge + 40.0 * (dt / 1000));
        target.lastGaugeIncreaseTime = Time.now;
        if (target.hackerGauge >= 100.0) triggerFullHack(this.owner, target);
    }

    isExpired() { return Time.now - this.createdTime >= this.duration; }

    collidesWith() { return false; }

    draw(ctx) {
        const ox = this.owner.rect.centerx;
        const oy = this.owner.rect.centery;
        const [ux, uy] = this.unitDirection();
        const base = Math.atan2(uy, ux);
        const half = this.halfAngle * Math.PI / 180;

        const pts = [[ox, oy]];
        const steps = 12;
        for (let i = 0; i <= steps; i++) {
            const a = base - half + (half * 2 * i) / steps;
            pts.push([ox + Math.cos(a) * this.range, oy + Math.sin(a) * this.range]);
        }
        drawPolygon(ctx, pts, `rgba(0, 255, 120, ${15 / 255})`, `rgba(0, 255, 180, ${80 / 255})`, 2);
    }
}

class HackerBasicAttack extends Skill {
    constructor() { super('Data Scan Cone', 1500); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new HackerScanEffect(owner, direction));
    }
}

// ==========================================
// 캐릭터 등록
// ==========================================
function applyHacker(player) {
    player.baseAtk = 18;
    player.maxHp = 110;
    player.hp = 110;
    player.speed = 4.3;
    player.spriteImage = HACKER_IMAGE;
    player.abilities = [
        new HackerBasicAttack(), // 평타 (스캔)
        new HackerSkill1(),      // 스킬 1 (데이터 큐브)
        new HackerSkill2(),      // 스킬 2 (텔레포트)
        new HackerUltimate(),    // 궁극기 (사이버 오버로드)
    ];
}

const HACKER_CHARACTER_DATA = {
    id: 'HACKER',
    name: '해커',
    desc: '부채꼴 스캔 평타, 대형 큐브 1스킬, 안전한 텔레포트 2스킬, 광역 해킹 및 제어 효과의 궁극기를 지닌 캐릭터',
    apply: applyHacker,
    thumbnail: HACKER_IMAGE,
};
