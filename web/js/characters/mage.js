// 마법사 (abilities/mage.py를 옮김)

// 원본 mage.png에서 투명 여백을 잘라낸 이미지
const MAGE_IMAGE = loadImage('assets/mage.png');

// ==========================================
// [마법사 - 투사체] 평타 & 관통 레이저 펄스 (꼬리가 남는 빔)
// ==========================================
class MageEnergyPulse {
    constructor(owner, direction, opts) {
        this.owner = owner;
        this.direction = direction;
        this.color = opts.color;
        this.damage = owner.baseAtk * opts.damageMult;
        this.speed = opts.speed;
        this.canPenetrateWalls = opts.canPenetrateWalls;
        this.applySlow = opts.applySlow;
        this.maxRange = opts.maxRange; // null이면 사거리 제한 없음

        this.width = this.canPenetrateWalls ? 40 : 14;
        this.height = this.width;
        this.angle = directionToAngle(direction);

        this.posX = owner.rect.centerx;
        this.posY = owner.rect.centery;
        this.startX = this.posX;
        this.startY = this.posY;

        this.hitPlayers = [];
        this.createdTime = Time.now;
        this.lifespan = 2000;

        // 지나온 자리들 (꼬리 그리기 + 판정)
        this.positions = [];
        for (let i = 0; i < opts.maxTrail; i++) this.positions.push([this.posX, this.posY]);
    }

    getPolygonPoints() {
        return rotatedRectPoints(this.posX, this.posY, this.width, this.height, this.angle);
    }

    update() {
        const timeScale = this.owner.timeScale;
        this.posX += this.direction[0] * this.speed * timeScale;
        this.posY += this.direction[1] * this.speed * timeScale;
        this.positions.shift();
        this.positions.push([this.posX, this.posY]);
    }


    isExpired() {
        const outOfBounds = this.posX < -100 || this.posX > 1380 || this.posY < -100 || this.posY > 820;
        const timeOver = Time.now - this.createdTime >= this.lifespan;
        let rangeOver = false;
        if (this.maxRange !== null) {
            const distSq = (this.posX - this.startX) ** 2 + (this.posY - this.startY) ** 2;
            rangeOver = distSq >= this.maxRange ** 2;
        }
        return outOfBounds || timeOver || rangeOver;
    }

    collidesWith(target) {
        if (!canBeHit(this, target)) return false;
        const size = this.canPenetrateWalls ? 32 : 16;
        const step = this.positions.length > 20 ? 2 : 1;
        for (let i = 0; i < this.positions.length; i += step) {
            const [px, py] = this.positions[i];
            const pointRect = new Rect(px - Math.floor(size / 2), py - Math.floor(size / 2), size, size);
            if (pointRect.colliderect(target.rect)) return true;
        }
        return false;
    }

    applyEffect(target) {
        if (this.applySlow) slow(target, 1.5, 25);
        // 관통기가 아닌 평타는 맞으면 사라진다
        if (!this.canPenetrateWalls) this.lifespan = 0;
    }

    draw(ctx) {
        if (!this.canPenetrateWalls && isImageReady(MAGE_BOLT_IMAGE)) {
            this.drawBolt(ctx);
            return;
        }
        const n = this.positions.length;
        if (n < 2) return;

        const step = n > 20 ? 2 : 1;
        const baseW = this.canPenetrateWalls ? 10 : 3;
        const extraW = this.canPenetrateWalls ? 12 : 3;
        ctx.lineCap = 'round';
        for (let i = 0; i < n - step; i += step) {
            const t = (i + step) / n;
            const [x1, y1] = this.positions[i];
            const [x2, y2] = this.positions[i + step];
            ctx.strokeStyle = withAlpha(this.color, t);
            ctx.lineWidth = Math.trunc(baseW + extraW * t);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        ctx.lineCap = 'butt';

        ctx.beginPath();
        ctx.arc(this.posX, this.posY, this.canPenetrateWalls ? 18 : 6, 0, Math.PI * 2);
        ctx.fillStyle = COLOR_WHITE;
        ctx.fill();
    }
}

// 평타 마법빔 그림 (tools/mage_bolt_gen.js로 생성, 800x120, 하늘색이 이미 들어 있음)
// 머리 x 740, 가운데 y 60. 화면에서 머리가 투사체 위치에 오고, 꼬리는 지나온 거리만큼만 보인다
const MAGE_BOLT_IMAGE = loadImage('assets/mage_bolt.png');
const MAGE_BOLT_HEAD = 740, MAGE_BOLT_CY = 60;
const MAGE_BOLT_SCALE = 0.6; // 그림 px → 화면 px (꼬리 약 430px)

MageEnergyPulse.prototype.drawBolt = function (ctx) {
    const traveled = Math.hypot(this.posX - this.startX, this.posY - this.startY);
    const k = MAGE_BOLT_SCALE, img = MAGE_BOLT_IMAGE;
    ctx.save();
    ctx.translate(this.posX, this.posY);
    ctx.rotate(Math.atan2(this.direction[1], this.direction[0]));
    // 쏜 자리보다 뒤로는 꼬리가 안 보이게
    ctx.beginPath();
    ctx.rect(-traveled, -img.naturalHeight * k, traveled + 200, img.naturalHeight * k * 2);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(img, -MAGE_BOLT_HEAD * k, -MAGE_BOLT_CY * k, img.naturalWidth * k, img.naturalHeight * k);
    ctx.restore();
};

// ==========================================
// [마법사 - 궁극기] 3연속 조준 저격
// 하늘로 날아올라(보이지 않음, 무적, 벽 통과) 조준원을 움직이다가 3번 내리꽂는다.
// 1단계: 조준 (최대 3초, 궁극기 키를 다시 누르면 바로 발사)
// 2단계: 0.5초 경고 (제자리 고정)   3단계: 0.2초 동안 피해
// ==========================================
class SniperUltManager {
    constructor(owner, color) {
        this.owner = owner;
        this.color = color;
        this.shotsRemaining = 3;
        this.phase = 1;
        this.phaseStartTime = Time.now;
        this.expired = false;
        this.canPenetrateWalls = true;
        this.hitPlayers = [];
        this.damage = 0;

        this.radius = 85;
        this.lastKeyDown = true; // 처음 시전할 때 누른 키가 바로 발사로 이어지지 않게

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

        // 궁극기 키를 새로 누르면 즉시 발사
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
        } else if (this.phase === 3) {
            if (elapsed >= 200) {
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
        if (this.phase !== 3 || target === this.owner) return false;
        if (target.invincible || target.defense >= 100.0) return false;
        const cx = this.owner.rect.centerx;
        const cy = this.owner.rect.centery;
        return (target.rect.centerx - cx) ** 2 + (target.rect.centery - cy) ** 2 <= this.radius ** 2;
    }

    draw(ctx) {
        if (this.expired) return;
        const cx = this.owner.rect.centerx;
        const cy = this.owner.rect.centery;
        const r = this.radius;

        const circle = (radius, fill, stroke, width) => {
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(0, radius), 0, Math.PI * 2);
            if (fill) { ctx.fillStyle = fill; ctx.fill(); }
            if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
        };

        if (this.phase === 2) {
            const pulse = (Math.sin(Time.now * 0.02) + 1) * 0.5;
            circle(r, `rgba(140, 100, 255, ${(180 + 75 * pulse) / 255})`);
            circle(Math.trunc(r * 0.5), `rgba(100, 220, 255, ${220 / 255})`);
            circle(r - 2, null, 'rgb(200, 150, 255)', 4);
        } else if (this.phase === 3) {
            circle(r, `rgba(180, 120, 255, ${200 / 255})`);
            circle(Math.trunc(r * 0.7), `rgba(100, 220, 255, ${220 / 255})`);
            circle(Math.trunc(r * 0.35), COLOR_WHITE);
        } else {
            // 조준 중: 숨 쉬듯 커졌다 작아지는 조준원 + 십자선
            const pulse = (Math.sin(Time.now * 0.015) + 1) * 0.5;
            const cur = Math.trunc(r * (0.9 + 0.1 * pulse));
            circle(cur, null, `rgba(100, 220, 255, ${180 / 255})`, 2);
            circle(Math.trunc(cur * 0.4), null, `rgba(180, 120, 255, ${120 / 255})`, 1);
            const len = cur + 8;
            ctx.strokeStyle = `rgba(100, 220, 255, ${220 / 255})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx - len, cy);
            ctx.lineTo(cx + len, cy);
            ctx.moveTo(cx, cy - len);
            ctx.lineTo(cx, cy + len);
            ctx.stroke();
        }
    }
}

// ==========================================
// 스킬
// ==========================================
class MageBasicSkillRunner extends Skill {
    constructor() { super('Tracer Beam', 500, ['projectile']); }

    use(owner, direction, attacks) {
        owner.castTimer = 0.1;
        owner.pendingAction = () => {
            this.lastUsed = Time.now;
            attacks.push(new MageEnergyPulse(owner, direction, {
                canPenetrateWalls: false, damageMult: 1.0, speed: 45,
                color: '#64dcff', maxTrail: 40, applySlow: false, maxRange: 800,
            }));
        };
    }
}

// ==========================================
// [마법사 - 스킬 1] 관통 레이저 (샌즈 블래스터와 같은 방식)
// 짧은 경고선 뒤 벽을 뚫는 넓은 레이저가 0.2초 동안 판정, 맞으면 슬로우 25% 1.5초
// ==========================================
class MagePiercingLaser extends BeamLaser {
    constructor(owner, direction) {
        super(owner, direction, { damageMult: 2.0, delay: 150, activeDuration: 200, width: 40, length: 1000 });
    }

    applyEffect(target) {
        slow(target, 1.5, 25);
    }

    draw(ctx) {
        if (this.isWarning()) {
            const hl = this.length / 2;
            drawLine(ctx, this.posX - this.dirVec[0] * hl, this.posY - this.dirVec[1] * hl,
                     this.posX + this.dirVec[0] * hl, this.posY + this.dirVec[1] * hl, `rgba(180, 120, 255, ${120 / 255})`, 4);
        } else if (isImageReady(MAGE_LASER_IMAGES[0]) && isImageReady(MAGE_LASER_IMAGES[1])) {
            this.drawImageBeam(ctx);
        } else {
            fillPolygon(ctx, this.getPolygonPoints(), `rgba(180, 120, 255, ${220 / 255})`);
            fillPolygon(ctx, this.corePoints(), COLOR_WHITE);
        }
    }

    // 레이저 그림: 처음 0.04초 동안 굵어지며 열리고, 마지막 0.06초 동안 가늘어지며 사라진다. 그림 2장을 번갈아(일렁임)
    drawImageBeam(ctx) {
        const t = Time.now - this.createdTime - this.delay; // 0 ~ activeDuration(ms)
        const open = Math.min(1, t / 40);
        const close = Math.min(1, Math.max(0, (this.activeDuration - t) / 60));
        const thick = (0.3 + 0.7 * open) * (0.2 + 0.8 * close);
        const img = MAGE_LASER_IMAGES[Math.floor(t / 50) % 2];
        const w = img.naturalWidth, h = img.naturalHeight;
        ctx.save();
        ctx.translate(this.posX, this.posY);
        ctx.rotate(Math.atan2(this.dirVec[1], this.dirVec[0]));
        ctx.scale(this.length / w, thick);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, 0.4 + close);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
    }
}

// 스킬 1 레이저 그림 (tools/mage_laser_gen.js로 생성, 1000x120, 보라가 이미 들어 있음, 2장 번갈아)
const MAGE_LASER_IMAGES = [0, 1].map(i => loadImage(`assets/mage_laser_${i}.png`));

class MageLaserSkillRunner extends Skill {
    constructor() { super('Penetrating Pulse', 2200, ['projectile']); }

    use(owner, direction, attacks) {
        owner.castTimer = 0.4;
        owner.pendingAction = () => {
            this.lastUsed = Time.now;
            attacks.push(new MagePiercingLaser(owner, direction));
        };
    }
}

class MageGhostSkill extends Skill {
    constructor() { super('Aether Walk', 5000, ['buff']); }

    use(owner) {
        this.lastUsed = Time.now;
        ghost(owner, 2.0);
        speedUp(owner, 2.0, 30);
    }
}

class MageUltSkill extends Skill {
    constructor() {
        super('Triple Sniper', 500, ['ult', 'projectile'], -99999);
        this.ultChargeRate = 8.0;
    }

    use(owner, direction, attacks, color) {
        this.lastUsed = Time.now;
        attacks.push(new SniperUltManager(owner, color));
    }
}

// 방향 표시: 보석 지팡이 그림 (tools/mage_staff_gen.js로 생성, 210x80, 보석 가운데 x 172.5 y 40)
// 오른쪽을 바라보는 기준으로 보석 가운데가 원점. 그림이 아직 안 불러와졌으면 예전 막대 지팡이
const MAGE_STAFF_IMAGE = loadImage('assets/mage_staff.png');
const MAGE_STAFF_SCALE = 0.34; // 그림 px → 화면 px (보석 폭 약 10px, 손잡이 약 28px)

function drawMageStaff(ctx) {
    if (isImageReady(MAGE_STAFF_IMAGE)) {
        const k = MAGE_STAFF_SCALE;
        ctx.drawImage(MAGE_STAFF_IMAGE, -172.5 * k, -40 * k, 210 * k, 80 * k);
        return;
    }
    ctx.strokeStyle = '#784623';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-26, 0);
    ctx.stroke();

    ctx.fillStyle = '#784623';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#aa2dbe';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
}

// ==========================================
// 캐릭터 등록
// ==========================================
function applyMageToPlayer(player) {
    player.maxHp = 150;
    player.hp = player.maxHp;
    player.baseAtk = 15;
    player.speed = 3.6;
    player.spriteImage = MAGE_IMAGE;
    player.drawDotTemplate = drawMageStaff;
    player.dotMargin = 32; // 이미지(44px)가 히트박스보다 커서 더 띄운다

    player.abilities = [
        new MageBasicSkillRunner(),
        new MageLaserSkillRunner(),
        new MageGhostSkill(),
        new MageUltSkill(),
    ];
    player.ultChargeRate = player.abilities[3].ultChargeRate;
}

const MAGE_CHARACTER_DATA = {
    id: 'MAGE',
    name: '마법사',
    desc: '평타: 마법빔을 멀리 쏩니다(15), 스킬 1: 짧게 조준한 뒤 벽을 뚫는 레이저를 쏩니다(슬로우 25% 1.5초, 30), 스킬 2: 2초간 벽을 뚫고 이동속도가 30% 증가합니다, 궁극기: 하늘로 날아가 강하게 마법빔을 아래로 쏩니다(30, 3연발)',
    apply: applyMageToPlayer,
    thumbnail: MAGE_IMAGE,
};
