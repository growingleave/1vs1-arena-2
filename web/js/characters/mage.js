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
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery,
            { color: this.color, angle: Math.atan2(this.direction[1], this.direction[0]), count: 10, size: 20 }));
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
// [마법사 - 궁극기] 착지 이펙트: 하늘에서 빛줄기가 꽂히고, 바닥에 마법진 고리 세 겹이 차례로 퍼지며
// 빛살이 사방으로 뻗고 별가루가 솟는다 (화면 효과 전용)
// ==========================================
class MageLandingVFX extends SparkVFX {
    constructor(x, y) {
        super('#64dcff');
        this.x = x; this.y = y;
        this.duration = 0.7;
        this.rays = [];
        for (let i = 0; i < 10; i++) this.rays.push({ a: i / 10 * Math.PI * 2 + vfxRand(-0.15, 0.15), len: vfxRand(60, 110) });
        for (let i = 0; i < 22; i++) this.addSpark(x + vfxRand(-30, 30), y + vfxRand(-8, 8), -Math.PI / 2 + vfxRand(-0.9, 0.9), vfxRand(80, 220), vfxRand(0.3, 0.6), vfxRand(1.2, 2.4));
    }

    get finished() { return this.elapsed >= this.duration && this.sparksDone; }

    draw(ctx) {
        const t = this.elapsed, x = this.x, y = this.y;
        const C = MAGE_CYAN, P = MAGE_PURPLE;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // 하늘에서 꽂히는 빛줄기 (처음 0.25초)
        if (t < 0.25) {
            const a = 1 - t / 0.25, w = 46 * a + 6;
            const beam = ctx.createLinearGradient(0, y - 720, 0, y);
            beam.addColorStop(0, mageRgba(P, 0)); beam.addColorStop(0.7, mageRgba(C, 0.5 * a)); beam.addColorStop(1, `rgba(255,255,255,${a})`);
            ctx.fillStyle = beam; ctx.fillRect(x - w / 2, y - 720, w, 720);
        }
        // 가운데 섬광
        if (t < 0.3) {
            const a = 1 - t / 0.3;
            const g = ctx.createRadialGradient(x, y, 0, x, y, 70);
            g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.4, mageRgba(C, 0.6 * a)); g.addColorStop(1, mageRgba(P, 0));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 70, 0, Math.PI * 2); ctx.fill();
        }
        // 사방으로 뻗는 빛살
        if (t < 0.35) {
            const u = t / 0.35, a = 1 - u;
            ctx.lineCap = 'round';
            for (const r of this.rays) {
                const l = r.len * (0.3 + 0.7 * u);
                ctx.strokeStyle = mageRgba(C, 0.8 * a); ctx.lineWidth = 3 * a + 0.5;
                ctx.beginPath(); ctx.moveTo(x + Math.cos(r.a) * l * 0.3, y + Math.sin(r.a) * l * 0.3 * 0.6);
                ctx.lineTo(x + Math.cos(r.a) * l, y + Math.sin(r.a) * l * 0.6); ctx.stroke();
            }
        }
        // 바닥 마법진 고리 세 겹 (차례로 퍼짐) + 고리 위 룬
        for (let k = 0; k < 3; k++) {
            const u = (t - k * 0.08) / 0.5;
            if (u <= 0 || u >= 1) continue;
            const a = 1 - u, rad = 20 + 110 * u;
            ctx.strokeStyle = mageRgba(k === 1 ? P : C, 0.9 * a); ctx.lineWidth = 3 * a + 0.5;
            ctx.beginPath(); ctx.ellipse(x, y, rad, rad * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
            if (k === 0) for (let i = 0; i < 8; i++) {
                const ang = i / 8 * Math.PI * 2 + t * 2;
                mageStar(ctx, x + Math.cos(ang) * rad, y + Math.sin(ang) * rad * 0.45, 4, a, i % 2 ? C : P);
            }
        }
        this.drawSparks(ctx);
        ctx.restore();
    }
}

// ==========================================
// [마법사 - 궁극기] 하늘 폭격
// 1) 떠오름 0.5초 (제자리)  2) 0.5초 뒤부터 최대 3초 동안 조준원 안 아무 곳에 작은 폭발을 계속 떨어뜨림
// 3) 궁극기 키를 다시 누르거나 시간이 다 되면: 0.4초 모은 뒤 조준원 전체에 큰 피해를 주며 내려와 끝
// 하늘에 있는 동안은 보이지 않고(그림자만), 무적, 벽 통과, 조준원(=마법사 위치)은 움직일 수 있다
// ==========================================
const MAGE_ULT = {
    radius: 140,         // 조준원(전범위 피해) 반지름
    rise: 500, delay: 500, bombard: 3000, warn: 400, strike: 200, // ms
    bombGap: 120,        // 작은 폭발 간격(ms)
    bombDelay: 250,      // 표시 후 터지기까지(ms)
    bombRadius: 55,
    bombDamage: 0.4,     // baseAtk 배수 (작은 폭발 하나)
    strikeDamage: 2.0,   // baseAtk 배수 (전범위)
};

class MageSkyBombardment {
    constructor(owner, color) {
        this.owner = owner;
        this.color = color;
        this.phase = 'rise';
        this.phaseStartTime = Time.now;
        this.expired = false;
        this.canPenetrateWalls = true;
        this.hitPlayers = [];
        this.damage = 0;
        this.radius = MAGE_ULT.radius;
        this.startX = owner.rect.centerx;
        this.startY = owner.rect.centery;
        this.bombs = [];         // { x, y, at } at: 터지는 시각
        this.justExploded = [];  // 이번 틱에 터진 폭발 (collidesWith에서 피해)
        this.nextBombAt = 0;
        this.lastKeyDown = true; // 처음 시전할 때 누른 키가 바로 재사용으로 이어지지 않게

        this.originalChargeRate = owner.ultChargeRate;
        owner.ultChargeRate = 0.0;
        owner.invincible = true;
        owner.hidden = true;
        silence(owner, 15.0);
        ghost(owner, 15.0);
        slow(owner, MAGE_ULT.rise / 1000, 100); // 떠오르는 동안 제자리
    }

    setPhase(phase) {
        this.phase = phase;
        this.phaseStartTime = Time.now;
    }

    startStrike() {
        this.setPhase('warn');
        this.bombs = [];
        slow(this.owner, (MAGE_ULT.warn + MAGE_ULT.strike) / 1000, 100);
    }

    update() {
        this.justExploded = [];
        if (this.owner.hp <= 0) { this.finish(); return; }

        const keyDown = this.owner.input.skills[3];
        const pressed = !this.lastKeyDown && keyDown;
        this.lastKeyDown = keyDown;
        const elapsed = Time.now - this.phaseStartTime;
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery;

        if (this.phase === 'rise') {
            if (elapsed >= MAGE_ULT.rise) this.setPhase('delay');
        } else if (this.phase === 'delay' || this.phase === 'bombard') {
            if (pressed) { this.startStrike(); return; }
            if (this.phase === 'delay' && elapsed >= MAGE_ULT.delay) { this.setPhase('bombard'); this.nextBombAt = Time.now; }
            if (this.phase === 'bombard') {
                // 조준원 안 아무 곳에 작은 폭발 예약 (게임 난수라 두 기기가 같다)
                while (Time.now >= this.nextBombAt) {
                    const ang = gameRandom() * Math.PI * 2, d = Math.sqrt(gameRandom()) * (this.radius - 20);
                    this.bombs.push({ x: cx + Math.cos(ang) * d, y: cy + Math.sin(ang) * d, at: this.nextBombAt + MAGE_ULT.bombDelay });
                    this.nextBombAt += MAGE_ULT.bombGap;
                }
                if (Time.now - this.phaseStartTime >= MAGE_ULT.bombard) this.startStrike();
            }
        } else if (this.phase === 'warn') {
            if (elapsed >= MAGE_ULT.warn) {
                this.setPhase('strike');
                this.damage = this.owner.baseAtk * MAGE_ULT.strikeDamage;
                this.hitPlayers = [];
                Vfx.spawn(new BlastVFX(cx, cy, { radius: this.radius, color: '#b478ff', color2: '#64dcff', duration: 0.45, count: 26 }));
                Vfx.shake(8, 0.3);
            }
        } else if (this.phase === 'strike') {
            if (elapsed >= MAGE_ULT.strike) {
                Vfx.spawn(new MageLandingVFX(cx, cy)); // 내려옴
                Vfx.shake(6, 0.25);
                this.finish();
            }
        }

        // 터질 시각이 된 작은 폭발
        this.bombs = this.bombs.filter(b => {
            if (Time.now < b.at) return true;
            this.justExploded.push(b);
            Vfx.spawn(new BlastVFX(b.x, b.y, { radius: MAGE_ULT.bombRadius, color: '#b478ff', color2: '#64dcff' }));
            Vfx.shake(2, 0.06);
            return false;
        });
    }

    finish() {
        if (this.expired) return;
        this.owner.invincible = false;
        this.owner.hidden = false;
        this.owner.ultChargeRate = this.originalChargeRate;
        delete this.owner.statusEffects.silence;
        delete this.owner.statusEffects.ghost;
        this.owner.silenced = false;
        this.expired = true;
        this.damage = 0;
    }

    isExpired() { return this.expired; }

    // 전범위 강타에 맞으면 (collidesWith가 true일 때 game.js가 부른다)
    applyEffect(target) {
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery;
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery,
            { color: '#64dcff', angle: Math.atan2(target.rect.centery - cy, target.rect.centerx - cx), count: 18, size: 36 }));
    }

    canHitTarget(target) {
        return target !== this.owner && !target.invincible && target.defense < 100.0;
    }

    // 작은 폭발은 여기서 바로 피해를 주고, 전범위 피해만 true로 돌려 game.js가 처리하게 한다
    collidesWith(target) {
        if (!this.canHitTarget(target)) return false;
        for (const b of this.justExploded) {
            if (Math.hypot(target.rect.centerx - b.x, target.rect.centery - b.y) <= MAGE_ULT.bombRadius + 15) {
                const finalDamage = target.takeDamage(this.owner.baseAtk * MAGE_ULT.bombDamage);
                this.owner.addUltGauge(finalDamage * this.owner.ultChargeMultiplier);
                Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery,
                    { color: '#b478ff', angle: Math.atan2(target.rect.centery - b.y, target.rect.centerx - b.x), count: 6, size: 16 }));
            }
        }
        if (this.phase !== 'strike') return false;
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery;
        return (target.rect.centerx - cx) ** 2 + (target.rect.centery - cy) ** 2 <= this.radius ** 2;
    }

    draw(ctx) {
        if (this.expired) return;
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery;
        const elapsed = Time.now - this.phaseStartTime;
        const C = MAGE_CYAN, P = MAGE_PURPLE;
        ctx.save();

        if (this.phase === 'rise') {
            // 떠오름: 빛기둥 + 발밑 마법진 + 작아지며 사라지는 마법사
            const e = Math.min(1, elapsed / MAGE_ULT.rise);
            ctx.globalCompositeOperation = 'lighter';
            const pillar = ctx.createLinearGradient(0, cy + 20, 0, cy - 300);
            pillar.addColorStop(0, mageRgba(C, 0.7 * (1 - e * 0.5))); pillar.addColorStop(1, mageRgba(P, 0));
            ctx.fillStyle = pillar; ctx.fillRect(cx - 22 * (1 - e * 0.6), cy - 300, 44 * (1 - e * 0.6), 320);
            ctx.lineWidth = 2;
            ctx.strokeStyle = mageRgba(C, 0.9 * (1 - e)); ctx.beginPath(); ctx.ellipse(cx, cy + 24, 40, 14, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = mageRgba(P, 0.7 * (1 - e)); ctx.beginPath(); ctx.ellipse(cx, cy + 24, 28, 10, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
            if (isImageReady(MAGE_IMAGE)) {
                const s = 44 * (1 - 0.45 * e);
                ctx.globalAlpha = 1 - e;
                ctx.drawImage(MAGE_IMAGE, cx - s / 2, cy - s / 2 - 90 * e * e, s, s);
                ctx.globalAlpha = 1;
            }
            ctx.restore();
            return;
        }

        // 바닥 그림자 (하늘 높이 있어서 작고 흐리게)
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(cx, cy, 14, 5, 0, 0, Math.PI * 2); ctx.fill();

        ctx.globalCompositeOperation = 'lighter';
        const r = this.radius;
        const spin = Time.now * 0.0008;
        const warnT = this.phase === 'warn' ? Math.min(1, elapsed / MAGE_ULT.warn) : 0;
        // 마법진: 바깥 두 겹 고리 + 돌아가는 룬(별) + 안쪽 육각형
        ctx.lineWidth = 2;
        ctx.strokeStyle = mageRgba(C, 0.75 + 0.25 * warnT); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = mageRgba(P, 0.5 + 0.4 * warnT); ctx.beginPath(); ctx.arc(cx, cy, r - 10, 0, Math.PI * 2); ctx.stroke();
        for (let k = 0; k < 12; k++) {
            const a = spin + k / 12 * Math.PI * 2;
            mageStar(ctx, cx + Math.cos(a) * (r - 5), cy + Math.sin(a) * (r - 5), 4, 0.9, k % 2 ? C : P);
        }
        ctx.strokeStyle = mageRgba(P, 0.4 + 0.4 * warnT);
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) { const a = -spin * 1.5 + k / 6 * Math.PI * 2; ctx.lineTo(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55); }
        ctx.stroke();

        if (this.phase === 'warn' || this.phase === 'strike') {
            // 모으기: 안쪽이 차오르고, 하늘에서 빛기둥이 내려온다
            const fill = this.phase === 'strike' ? 1 : warnT;
            ctx.fillStyle = mageRgba(P, 0.25 * fill); ctx.beginPath(); ctx.arc(cx, cy, r * fill, 0, Math.PI * 2); ctx.fill();
            const beamW = 30 + 50 * fill;
            const beam = ctx.createLinearGradient(0, cy - 720, 0, cy);
            beam.addColorStop(0, mageRgba(P, 0)); beam.addColorStop(1, mageRgba(C, 0.6 * fill));
            ctx.fillStyle = beam; ctx.fillRect(cx - beamW / 2, cy - 720, beamW, 720);
        } else {
            // 조준 십자선
            ctx.strokeStyle = mageRgba(C, 0.6);
            ctx.beginPath(); ctx.moveTo(cx - 14, cy); ctx.lineTo(cx + 14, cy); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 14); ctx.stroke();
        }

        // 떨어질 자리 표시: 줄어드는 고리
        for (const b of this.bombs) {
            const t = 1 - Math.max(0, (b.at - Time.now) / MAGE_ULT.bombDelay);
            ctx.strokeStyle = mageRgba(P, 0.4 + 0.5 * t);
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(b.x, b.y, MAGE_ULT.bombRadius * (1.2 - 0.6 * t), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
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
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery,
            { color: '#b478ff', angle: Math.atan2(this.dirVec[1], this.dirVec[0]), count: 14, size: 26 }));
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
        super('Sky Bombardment', 500, ['ult', 'projectile'], -99999);
        this.ultChargeRate = 8.0;
    }

    use(owner, direction, attacks, color) {
        this.lastUsed = Time.now;
        attacks.push(new MageSkyBombardment(owner, color));
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
// [마법사 - 스킬 2] 비행 이펙트 (화면 효과 전용, 게임 계산과 무관)
// 떠오름(마법진 + 솟는 빛 고리) → 나는 동안 그림자·둥실거림·반투명·빛 테두리·날개·잔상·가루, 벽 위에선 파문
// ==========================================
const MAGE_GHOST_TIME = 2.0;
const MAGE_CYAN = [100, 220, 255], MAGE_PURPLE = [180, 120, 255];
const mageRgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
const mageFloatTrail = new WeakMap(); // 플레이어 → 최근 위치들 (잔상·가루용, 화면 전용)
let mageAuraCanvas = null;

// 스킬 2로 떠 있는 정도 (0~1). 궁극기 중(숨김)에는 0
function mageLift(p) {
    const g = p.statusEffects.ghost;
    if (!g || p.hidden || g.duration > MAGE_GHOST_TIME + 0.01) return 0; // 궁극기의 긴 망령화는 제외
    const elapsed = MAGE_GHOST_TIME - g.duration;
    return Math.min(1, elapsed / 0.15) * Math.min(1, g.duration / 0.15);
}

function mageInWall(p) {
    return CURRENT_WALLS.some(w => p.rect.colliderect(w.rect));
}

function mageBodyStyle(p) {
    const lift = mageLift(p);
    if (lift <= 0) return null;
    const bob = Math.sin(Time.now * 0.008) * 2;
    return { alpha: 1 - (mageInWall(p) ? 0.45 : 0.28) * lift, offsetY: (-8 + bob) * lift };
}

// 색을 입혀 흐리게 만든 마법사 그림 (빛 테두리, 한 번만 만든다)
function mageAura() {
    if (mageAuraCanvas || !isImageReady(MAGE_IMAGE)) return mageAuraCanvas;
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const x = c.getContext('2d');
    const t = document.createElement('canvas'); t.width = 64; t.height = 64;
    const tx = t.getContext('2d');
    tx.drawImage(MAGE_IMAGE, 7, 7, 50, 50); tx.globalCompositeOperation = 'source-in';
    tx.fillStyle = mageRgba(MAGE_CYAN, 1); tx.fillRect(0, 0, 64, 64);
    x.filter = 'blur(3px)'; x.drawImage(t, 0, 0); x.drawImage(t, 0, 0);
    mageAuraCanvas = c;
    return c;
}

function mageStar(ctx, x, y, r, a, col) {
    ctx.fillStyle = mageRgba(col, a);
    ctx.beginPath();
    for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4, rr = k % 2 === 0 ? r : r * 0.25; ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); }
    ctx.closePath(); ctx.fill();
}

function drawMageFloatUnder(ctx) {
    const p = this;
    const cx = p.rect.centerx, cy = p.rect.centery;
    const g = p.statusEffects.ghost;
    let trail = mageFloatTrail.get(p);
    if (!trail) { trail = []; mageFloatTrail.set(p, trail); }
    const lift = mageLift(p);
    if (lift <= 0) { trail.length = 0; return; }
    const elapsed = MAGE_GHOST_TIME - g.duration;
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(last[0] - cx, last[1] - cy) > 6) trail.push([cx, cy]);
    if (trail.length > 12) trail.shift();
    const bodyY = cy + mageBodyStyle(p).offsetY;

    ctx.save();
    // 그림자: 바닥에 그대로 (몸만 떠오른다)
    ctx.fillStyle = `rgba(0,0,0,${0.38 * lift})`;
    ctx.beginPath(); ctx.ellipse(cx, cy + 24, 17, 6, 0, 0, Math.PI * 2); ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    // 떠오름: 처음 0.35초 동안 발밑 마법진 + 위로 솟는 빛 고리
    if (elapsed < 0.35) {
        const t = elapsed / 0.35, a = 1 - t;
        ctx.lineWidth = 2;
        ctx.strokeStyle = mageRgba(MAGE_CYAN, 0.9 * a);
        ctx.beginPath(); ctx.ellipse(cx, cy + 24, 34, 12, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = mageRgba(MAGE_PURPLE, 0.7 * a);
        ctx.beginPath(); ctx.ellipse(cx, cy + 24, 24, 8, 0, 0, Math.PI * 2); ctx.stroke();
        for (let k = 0; k < 3; k++) {
            const u = (t + k / 3) % 1;
            ctx.strokeStyle = mageRgba(MAGE_CYAN, 0.6 * (1 - u) * a);
            ctx.beginPath(); ctx.ellipse(cx, cy + 24 - u * 50, 28 - u * 8, (28 - u * 8) * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
        }
    }
    // 잔상 + 가루: 지나온 자리
    const n = trail.length;
    for (let i = 0; i < n - 1; i++) {
        const [tx, ty] = trail[i], age = (n - 1 - i) / n;
        if (i >= n - 4 && isImageReady(MAGE_IMAGE)) {
            ctx.globalAlpha = 0.28 * (1 - age) * lift;
            ctx.drawImage(mageAura() || MAGE_IMAGE, tx - 32, ty - 32 + (bodyY - cy), 64, 64);
            ctx.globalAlpha = 1;
        }
        mageStar(ctx, tx + Math.sin(i * 12.9) * 12, ty + Math.cos(i * 7.3) * 12, 2.5, 0.8 * (1 - age) * lift, i % 2 ? MAGE_CYAN : MAGE_PURPLE);
    }
    // 날개: 바라보는 방향의 수직으로 펼치고 뒤로 젖힌 빛 깃털 3장씩 (천천히 퍼덕임)
    const face = Math.atan2(p.facing[1], p.facing[0]);
    const flap = Math.sin(Time.now * 0.012);
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        const len = 58 - i * 10, ang = face + Math.PI + side * (Math.PI / 2 - 0.55 - i * 0.3 + flap * 0.12);
        ctx.save();
        ctx.translate(cx, bodyY);
        ctx.rotate(ang);
        const gr = ctx.createLinearGradient(0, 0, len + 14, 0);
        gr.addColorStop(0, mageRgba(MAGE_CYAN, 0.9 * lift)); gr.addColorStop(0.6, mageRgba(MAGE_PURPLE, 0.55 * lift)); gr.addColorStop(1, mageRgba(MAGE_PURPLE, 0));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.ellipse(len / 2 + 14, 0, len / 2, 8 - i * 1.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
    // 빛 테두리 (몸 뒤)
    const aura = mageAura();
    if (aura) { ctx.globalAlpha = 0.9 * lift; ctx.drawImage(aura, cx - 32, bodyY - 32, 64, 64); ctx.globalAlpha = 1; }
    // 벽 통과 중: 벽 위에 동심원 파문
    if (mageInWall(p)) {
        for (let k = 0; k < 3; k++) {
            const u = (Time.now / 500 + k / 3) % 1;
            ctx.strokeStyle = mageRgba(MAGE_CYAN, 0.8 * (1 - u));
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(cx, bodyY, 8 + u * 18, 16 + u * 30, face, 0, Math.PI * 2); ctx.stroke();
        }
    }
    ctx.restore();
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
    player.bodyStyle = mageBodyStyle;
    player.preDrawHooks.push((ctx) => drawMageFloatUnder.call(player, ctx));
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
    desc: '평타: 마법빔을 멀리 쏩니다(15), 스킬 1: 짧게 조준한 뒤 벽을 뚫는 레이저를 쏩니다(슬로우 25% 1.5초, 30), 스킬 2: 2초간 벽을 뚫고 이동속도가 30% 증가합니다, 궁극기: 하늘로 날아올라 조준원 안에 작은 폭발을 계속 떨어뜨리고(6씩), 다시 누르거나 3초가 지나면 조준원 전체를 강타하며 내려옵니다(30)',
    apply: applyMageToPlayer,
    thumbnail: MAGE_IMAGE,
};
