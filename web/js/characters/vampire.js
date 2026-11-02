// 뱀파이어: 피의 창으로 찔러 출혈을 쌓고, 출혈을 빨아들여 회복한다. 박쥐로 변해 벽을 넘나든다
//
// 평타: 창 찌르기 (약한 피해 + 강한 출혈, 내 체력 조금 감소)
// 스킬 1: 상대 출혈을 모두 없애고 남은 출혈 피해만큼 회복
// 스킬 2: 박쥐 변신/해제 (판정 작아짐, 빨라짐, 벽 통과, 받는 피해 증가, 평타·스킬 2만 사용)
//         박쥐 중 평타 = 물기 (부채꼴, 맞히면 회복 + 출혈)
// 궁극기: 앞쪽 45도 긴 부채꼴에 피의 가시 (피해 + 강한 출혈, 내 체력 크게 감소)
// 자해 피해로는 죽지 않는다 (체력 1에서 멈춤)

const VAMP_COLOR = '#d0182c';
const VAMP_SPEAR_IMAGE = loadImage('assets/vampire_spear.png');   // 324x63, 창끝이 오른쪽 끝, 가운데 y (tools/vampire_gen.js)
const VAMP_BAT_IMAGES = [0, 1].map((i) => loadImage(`assets/vampire_bat_${i}.png`)); // 64x44 날개 위/아래, 오른쪽을 봄
const VAMP_SPIKE_IMAGES = [0, 1, 2, 3].map((i) => loadImage(`assets/vampire_spike_${i}.png`)); // 48x112, 바닥 = (24, 107)
const VAMP_POOL_IMAGE = loadImage('assets/vampire_pool.png');   // 390x311, 45도 부채꼴 피 웅덩이, 꼭짓점 (0, 155.5), 반지름 380
const VAMP_STAB_IMAGE = loadImage('assets/vampire_stab.png');   // 160x24, 찌르기 빛줄기, 오른쪽 끝이 창끝 ('lighter')
const VAMP_FANG_TOP_IMAGE = loadImage('assets/vampire_fang_top.png');       // 123x58 윗니 (송곳니가 아래로) — 먼 쪽 턱
const VAMP_FANG_BOTTOM_IMAGE = loadImage('assets/vampire_fang_bottom.png'); // 109x41 아랫니 (이가 위로) — 박쥐 가까운 쪽 턱
// 박쥐일 때 몸 그림 대신 쓰는 투명 그림 (몸 사각형은 안 그리고 방향 점·체력바는 그대로)
const VAMP_EMPTY_IMAGE = (() => { const c = document.createElement('canvas'); c.width = c.height = 1; return loadImage(c.toDataURL()); })();

const VAMP = {
    // 평타: 느리지만 세게. 0.18초 동안 창을 뒤로 당겨 모았다가(선딜레이) 팍 찌르고(0.06초) 판정은 0.11초 동안, 천천히 뒤로 뺌
    spear: { cooldown: 1000, damage: 1.2, length: 160, width: 34, windup: 180, hitTime: 110, life: 450, selfDamage: 3, bleedTime: 4, bleedPower: 5 },
    // 박쥐 물기: 두 턱이 0.09초에 걸쳐 다가와 닫히는 순간 판정
    bite: { cooldown: 1400, radius: 90, arc: 90, damage: 0.5, heal: 10, bleedTime: 3, bleedPower: 4, closeTime: 90, life: 260 },
    drainCooldown: 5000,
    bat: { cooldown: 4000, maxTime: 5000, size: 26, speedUp: 40, damageTaken: 1.3 },
    // 궁극기: 0.35초 동안 피 웅덩이가 범위에 퍼진 뒤(이동 불가) 가시가 파바박 솟음. 솟는 0.2초 동안 판정
    ult: { radius: 380, arc: 45, damage: 2.0, delay: 350, bleedTime: 6, bleedPower: 7, selfDamage: 25 },
};

// ==========================================
// 출혈 (중첩): 걸 때마다 따로 쌓이고, 각각 1초마다 피해를 준다 (최대 6중첩, 넘치면 가장 오래된 것부터 없어짐)
// 상대 몸에 붙는 훅으로 관리한다 (해커 게이지와 같은 방식)
// ==========================================
const VAMP_BLEED_MAX_STACKS = 6;

function vampAttachBleed(target) {
    if (target.vampBleedHooked) return;
    target.vampBleedHooked = true;
    target.vampBleeds = [];
    target.preUpdateHooks.push((dtSec) => {
        const list = target.vampBleeds;
        if (!list.length) return;
        let dmg = 0;
        for (const b of list) {
            b.timer += dtSec;
            if (b.timer >= 1) { b.timer -= 1; b.ticks -= 1; dmg += b.power; }
        }
        target.vampBleeds = list.filter((b) => b.ticks > 0);
        if (dmg > 0) {
            target.takeDamage(dmg);
            Vfx.spawn(new VampBloodVFX(target.rect.centerx, target.rect.centery, -Math.PI / 2, 3 + Math.min(6, list.length), [50, 140]));
        }
    });
    target.postDrawHooks.push((ctx) => vampDrawBleeding(ctx, target));
}

function vampBleed(target, ticks, power) {
    vampAttachBleed(target);
    target.vampBleeds.push({ power, ticks, timer: 0 });
    if (target.vampBleeds.length > VAMP_BLEED_MAX_STACKS) target.vampBleeds.shift();
}

// 지금 걸린 출혈이 앞으로 줄 피해 (뱀파이어 출혈 중첩 + 다른 출혈 상태이상)
function vampBleedRemaining(target) {
    if (!target) return 0;
    let total = 0;
    for (const b of target.vampBleeds || []) total += b.power * b.ticks;
    const e = target.statusEffects.bleed;
    if (e) total += Math.floor(e.tickTimer + e.duration) * e.power;
    return total;
}

function vampClearBleed(target) {
    target.vampBleeds = [];
    delete target.statusEffects.bleed;
}

// 출혈 중인 몸: 붉게 맥박치는 테두리 + 몸에서 흘러내리는 피 방울 + 왼쪽 위에 피 방울 아이콘과 중첩 수 (화면 전용)
function vampDrawBleeding(ctx, target) {
    const n = (target.vampBleeds || []).length;
    if (!n || target.hidden || target.isInvisible) return;
    const r = target.rect, now = Time.now;
    const pulse = 0.35 + 0.25 * Math.sin(now / 120);
    ctx.strokeStyle = `rgba(220, 20, 40, ${pulse})`; ctx.lineWidth = 3;
    ctx.strokeRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3);
    ctx.fillStyle = `rgba(160, 0, 20, ${0.12 + 0.06 * n})`;
    ctx.fillRect(r.x, r.y + r.h * 0.55, r.w, r.h * 0.45);
    // 흘러내리는 방울 (중첩이 많을수록 많이)
    ctx.fillStyle = '#c4121f';
    const drops = Math.min(2 + n, 7);
    for (let i = 0; i < drops; i++) {
        const ph = (now / 650 + i * 0.37) % 1;
        const x = r.x + 4 + ((i * 17 + 5) % Math.max(1, r.w - 8));
        const y = r.top + r.h * 0.3 + ph * (r.h * 0.7 + 16);
        ctx.globalAlpha = 1 - ph * 0.6;
        ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.quadraticCurveTo(x + 3, y, x, y + 3); ctx.quadraticCurveTo(x - 3, y, x, y - 5); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 피 방울 아이콘 + 중첩 수
    const ix = r.left - 11, iy = r.top - 10;
    ctx.fillStyle = '#d0182c'; ctx.strokeStyle = '#2a0006'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ix, iy - 7); ctx.quadraticCurveTo(ix + 6, iy + 1, ix, iy + 5); ctx.quadraticCurveTo(ix - 6, iy + 1, ix, iy - 7); ctx.fill(); ctx.stroke();
    drawText(ctx, String(n), ix, iy + 1, 10, '#ffffff', { bold: true, align: 'center', baseline: 'middle' });
}

// 자해: 체력 1 아래로는 내려가지 않는다 (방어력·박쥐 피해 증가와 상관없이 정해진 만큼)
function vampSelfDamage(owner, amount) {
    const amt = Math.min(amount, owner.hp - 1);
    if (amt <= 0) return;
    owner.hp -= amt;
    owner.hitFlashTime = Time.now;
    owner.hitFlashIntensity = Math.min(1, amt / 100 * 3);
    owner.damagePopups.push({ value: Math.round(amt), time: Time.now, offsetX: 0 });
}

function vampHeal(owner, amount) {
    const before = owner.hp;
    owner.hp = Math.min(owner.maxHp, owner.hp + amount);
    const healed = owner.hp - before;
    if (healed > 0) Vfx.spawn(new VampHealTextVFX(owner, healed));
}

// 부채꼴 점들 (화면 좌표 각도, 라디안)
function vampFanPoints(cx, cy, angle, radius, arcDeg, steps = 10) {
    const half = arcDeg * Math.PI / 360;
    const pts = [[cx, cy]];
    for (let i = 0; i <= steps; i++) {
        const a = angle - half + (2 * half) * (i / steps);
        pts.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
    }
    return pts;
}

// ==========================================
// 화면 효과 (게임 결과와 무관)
// ==========================================
// 회복량 초록 숫자 (몸 위로 떠오름)
class VampHealTextVFX {
    constructor(owner, amount) { this.owner = owner; this.amount = Math.round(amount); this.elapsed = 0; this.duration = 0.8; }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const t = this.elapsed / this.duration, r = this.owner.rect;
        drawText(ctx, `+${this.amount}`, r.centerx, r.top - 30 - t * 24, 16, '#5cff8a', { bold: true, align: 'center', alpha: 1 - t * t });
    }
}

// 피 방울 (튀었다가 떨어짐). 여러 개를 이펙트 하나로 묶음
class VampBloodVFX {
    constructor(x, y, angle, count = 10, speed = [80, 240]) {
        this.drops = [];
        for (let i = 0; i < count; i++) {
            const a = angle + vfxRand(-0.9, 0.9), s = vfxRand(speed[0], speed[1]);
            this.drops.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, r: vfxRand(1.5, 3.5), life: vfxRand(0.3, 0.55) });
        }
        this.elapsed = 0;
    }
    get finished() { return this.elapsed >= 0.6; }
    update(dt) {
        this.elapsed += dt;
        for (const d of this.drops) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 520 * dt; }
    }
    draw(ctx) {
        ctx.fillStyle = '#b3101f';
        for (const d of this.drops) {
            const u = this.elapsed / d.life;
            if (u >= 1) continue;
            ctx.globalAlpha = 1 - u;
            ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}

// 스킬 1: 상대 몸에서 피가 줄기처럼 빨려 나와 내게 들어옴
class VampDrainVFX {
    constructor(owner, target) {
        this.owner = owner; this.target = target; this.elapsed = 0; this.duration = 0.55;
        this.blobs = [];
        for (let i = 0; i < 16; i++) this.blobs.push({ delay: i * 0.018, off: vfxRand(-14, 14), r: vfxRand(2.5, 5) });
    }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const a = this.target.rect, b = this.owner.rect;
        const dx = b.centerx - a.centerx, dy = b.centery - a.centery, len = Math.hypot(dx, dy) || 1;
        const px = -dy / len, py = dx / len;
        ctx.fillStyle = '#d0182c';
        for (const o of this.blobs) {
            const t = (this.elapsed - o.delay) / 0.3;
            if (t <= 0 || t >= 1) continue;
            const bend = Math.sin(t * Math.PI) * o.off;
            ctx.globalAlpha = 0.9 * (1 - t * 0.3);
            ctx.beginPath(); ctx.arc(a.centerx + dx * t + px * bend, a.centery + dy * t + py * bend, o.r * (1 - t * 0.4), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}

// 박쥐 변신/해제 순간: 작은 박쥐 그림자들이 흩어짐
class VampBatPuffVFX {
    constructor(x, y) {
        this.x = x; this.y = y; this.elapsed = 0; this.duration = 0.45;
        this.bats = [];
        for (let i = 0; i < 6; i++) { const a = vfxRand(0, Math.PI * 2); this.bats.push({ a, s: vfxRand(70, 150), f: vfxRand(0, 1) }); }
    }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const t = this.elapsed / this.duration;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = 'rgba(120, 10, 30, 0.35)';
        ctx.beginPath(); ctx.arc(this.x, this.y, 10 + 26 * t, 0, Math.PI * 2); ctx.fill();
        for (const b of this.bats) {
            const img = VAMP_BAT_IMAGES[Math.floor((this.elapsed * 12 + b.f * 2)) % 2];
            if (!isImageReady(img)) continue;
            const x = this.x + Math.cos(b.a) * b.s * t, y = this.y + Math.sin(b.a) * b.s * t - 10 * t;
            ctx.drawImage(img, x - 11, y - 8, 22, 15);
        }
        ctx.globalAlpha = 1;
    }
}

// 궁극기: 범위 전체에 피 웅덩이가 퍼지고(선딜레이), 가시가 가까운 곳부터 파바박 솟았다가 가라앉음
class VampSpikesVFX {
    constructor(cx, cy, angle) {
        this.cx = cx; this.cy = cy; this.angle = angle;
        this.elapsed = 0; this.duration = 1.6;
        const U = VAMP.ult, R = U.radius, half = U.arc * Math.PI / 360, burst = U.delay / 1000;
        this.burst = burst;
        this.spikes = [];
        for (let i = 0; i < 28; i++) {
            const u = (i + Math.random() * 0.9) / 28;
            const d = 36 + (R - 50) * u;
            const a = angle + vfxRand(-half, half) * 0.9;
            const big = Math.random() < 0.25;
            this.spikes.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, at: burst + u * 0.16 + Math.random() * 0.03,
                h: vfxRand(56, 84) * (0.8 + 0.4 * u) * (big ? 1.35 : 1), img: VAMP_SPIKE_IMAGES[i % 4], flip: Math.random() < 0.5, splashed: false,
                tilt: vfxRand(-0.5, 0.5) }); // 삐뚤빼뚤한 방향
        }
        this.spikes.sort((p, q) => p.y - q.y); // 위(먼 쪽)부터 그려서 겹침이 자연스럽게
        // 선딜레이 동안 웅덩이에서 터지는 거품
        this.bubbles = [];
        for (let i = 0; i < 14; i++) {
            const d = vfxRand(40, R - 30), a = angle + vfxRand(-half, half) * 0.85;
            this.bubbles.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, at: vfxRand(0.05, burst), r: vfxRand(4, 9) });
        }
        this.splashes = [];
        this.shaken = false;
    }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) {
        this.elapsed += dt;
        if (!this.shaken && this.elapsed >= this.burst) { this.shaken = true; Vfx.shake(6, 0.25); }
        for (const s of this.spikes) {
            if (!s.splashed && this.elapsed >= s.at) { s.splashed = true; if (this.splashes.length < 10) this.splashes.push(new VampBloodVFX(s.x, s.y, -Math.PI / 2, 5, [80, 200])); }
        }
        for (const p of this.splashes) p.update(dt);
    }
    // 피 웅덩이 (바닥 층: 벽·캐릭터 아래): 꼭짓점에서 바깥으로 퍼지며 드러나고(0.3초), 가시가 솟을 때 진해졌다가 천천히 사라짐
    drawGround(ctx) {
        if (!isImageReady(VAMP_POOL_IMAGE)) return;
        const t = this.elapsed, R = VAMP.ult.radius, half = VAMP.ult.arc * Math.PI / 360;
        const reveal = Math.min(1, t / 0.3), r = R * (1 - Math.pow(1 - reveal, 3)) + 12;
        let a = t < this.burst ? 0.55 + 0.15 * Math.sin(t * 40) : 0.9;
        if (t > 1.0) a *= Math.max(0, 1 - (t - 1.0) / 0.6);
        if (a <= 0) return;
        ctx.save();
        ctx.translate(this.cx, this.cy);
        ctx.rotate(this.angle);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, -half - 0.05, half + 0.05); ctx.closePath(); ctx.clip();
        ctx.globalAlpha = a;
        const k = R / 380;
        ctx.drawImage(VAMP_POOL_IMAGE, 0, -155.5 * k, 390 * k, 311 * k);
        // 퍼지는 앞쪽 가장자리 (밝은 붉은 줄)
        if (reveal < 1) {
            ctx.globalAlpha = 0.8; ctx.strokeStyle = '#ff4050'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, 0, r - 4, -half, half); ctx.stroke();
        }
        ctx.restore();
        // 거품 (선딜레이 동안)
        ctx.strokeStyle = 'rgba(255, 120, 130, 0.8)'; ctx.lineWidth = 1.5;
        for (const b of this.bubbles) {
            const u = (t - b.at) / 0.25;
            if (u < 0 || u >= 1) continue;
            ctx.globalAlpha = 1 - u;
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.4 + u), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
    draw(ctx) {
        for (const s of this.spikes) {
            const t = this.elapsed - s.at;
            if (t < 0 || !isImageReady(s.img)) continue;
            // 0.05초 만에 솟고(넘쳤다가 돌아옴), 0.5초 버티다 0.3초에 걸쳐 가라앉음
            let k;
            if (t < 0.05) k = t / 0.05 * 1.2;
            else if (t < 0.1) k = 1.2 - (t - 0.05) / 0.05 * 0.2;
            else if (t < 0.6) k = 1;
            else k = Math.max(0, 1 - (t - 0.6) / 0.3);
            if (k <= 0) continue;
            const h = s.h * k, w = s.h * 48 / 112;
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(s.tilt);
            if (s.flip) ctx.scale(-1, 1);
            ctx.globalAlpha = Math.min(1, k * 1.5);
            ctx.drawImage(s.img, -w / 2, -h * 107 / 112, w, h);
            // 솟는 순간 끝에서 번쩍
            if (t < 0.08) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255, 120, 130, ${0.8 * (1 - t / 0.08)})`; ctx.beginPath(); ctx.arc(0, -h * 0.95, 7, 0, Math.PI * 2); ctx.fill(); }
            ctx.restore();
        }
        for (const p of this.splashes) p.draw(ctx);
    }
}

// ==========================================
// [평타] 창 찌르기: 창을 뒤로 당겨 피를 모았다가(선딜레이) 팍 찌르고(판정은 짧게) 천천히 뒤로 뺀다
// ==========================================
class VampireSpearAttack {
    constructor(owner, direction) {
        this.owner = owner;
        this.dir = normalizeOr(direction);
        this.damage = owner.baseAtk * VAMP.spear.damage;
        this.createdTime = Time.now;
        this.lifespan = VAMP.spear.windup + VAMP.spear.life;
        this.hitPlayers = [];
        this.fxColor = VAMP_COLOR;
        this.noFizzle = true;
        this.thrusted = false;
    }
    // 찌르는 순간: 창끝에서 앞으로 튀는 붉은 불꽃 + 피 안개 (화면 전용)
    update() {
        if (this.thrusted || Time.now - this.createdTime < VAMP.spear.windup) return;
        this.thrusted = true;
        const r = this.owner.rect, ang = Math.atan2(this.dir[1], this.dir[0]), reach = 20 + VAMP.spear.length;
        Vfx.spawn(new HitSparkVFX(r.centerx + this.dir[0] * reach, r.centery + this.dir[1] * reach, { color: VAMP_COLOR, angle: ang, count: 9, size: 20 }));
        Vfx.spawn(new VampBloodVFX(r.centerx + this.dir[0] * reach * 0.7, r.centery + this.dir[1] * reach * 0.7, ang, 6, [140, 260]));
    }
    isExpired() { return Time.now - this.createdTime >= this.lifespan; }
    // 몸 앞 20 ~ 20+length, 폭 width 인 길쭉한 사각형
    getPoints() {
        const r = this.owner.rect, [dx, dy] = this.dir, px = -dy, py = dx, hw = VAMP.spear.width / 2;
        const x0 = r.centerx + dx * 20, y0 = r.centery + dy * 20;
        const x1 = r.centerx + dx * (20 + VAMP.spear.length), y1 = r.centery + dy * (20 + VAMP.spear.length);
        return [[x0 + px * hw, y0 + py * hw], [x1 + px * hw, y1 + py * hw], [x1 - px * hw, y1 - py * hw], [x0 - px * hw, y0 - py * hw]];
    }
    collidesWith(target) {
        const ms = Time.now - this.createdTime - VAMP.spear.windup;
        if (ms < 0 || ms > VAMP.spear.hitTime) return false; // 찌르는 순간만
        return canBeHit(this, target) && checkPolygonCollision(this.getPoints(), target.rect);
    }
    applyEffect(target) {
        vampBleed(target, VAMP.spear.bleedTime, VAMP.spear.bleedPower);
        const ang = Math.atan2(this.dir[1], this.dir[0]);
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: '#ff3040', angle: ang, count: 12, size: 28 }));
        Vfx.spawn(new VampBloodVFX(target.rect.centerx, target.rect.centery, ang, 12, [120, 300]));
        Vfx.shake(3, 0.08);
    }
    draw(ctx) {
        const all = Time.now - this.createdTime, W = VAMP.spear.windup, L = VAMP.spear.length;
        const ms = all - W; // 찌르기 시작부터
        // 뻗은 정도: 선딜레이 동안 뒤로 당김(0.25→0) → 0.06초에 확 뻗고 → 0.11초까지 버티고 → 천천히 뒤로
        let ext;
        if (ms < 0) { const u = all / W; ext = 0.25 * (1 - u * u); }
        else if (ms < 60) ext = 1 - Math.pow(1 - ms / 60, 3);
        else if (ms < 110) ext = 1;
        else { const u = (ms - 110) / (VAMP.spear.life - 110); ext = 1 - u * u * (3 - 2 * u); }
        const r = this.owner.rect, [dx, dy] = this.dir, ang = Math.atan2(dy, dx);
        const tip = 20 + L * (0.25 + 0.75 * ext);
        const tremble = ms < 0 ? Math.sin(all * 0.9) * 1.5 * (all / W) : 0; // 모으는 동안 떨림
        ctx.save();
        ctx.translate(r.centerx, r.centery);
        ctx.rotate(ang);
        // 모으는 동안: 창끝으로 빨려 드는 붉은 피 입자 + 점점 커지는 붉은 빛
        if (ms < 0) {
            const u = all / W;
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(255, 40, 60, ${0.25 + 0.5 * u})`;
            ctx.beginPath(); ctx.arc(tip, tremble, 4 + 7 * u, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255, 70, 90, 0.9)';
            for (let i = 0; i < 7; i++) {
                const a = i * 0.9 + 0.4, ph = (u * 2 + i * 0.29) % 1, d = 34 * (1 - ph);
                ctx.globalAlpha = ph;
                ctx.beginPath(); ctx.arc(tip + Math.cos(a) * d, tremble + Math.sin(a) * d * 0.8, 2.2, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }
        // 찌르기 빛줄기 (찌르는 순간만)
        if (ms >= 0 && ms < 170 && isImageReady(VAMP_STAB_IMAGE)) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = ms < 60 ? 1 : 1 - (ms - 60) / 110;
            ctx.drawImage(VAMP_STAB_IMAGE, 10, -VAMP.spear.width * 0.6, L + 24, VAMP.spear.width * 1.2);
            ctx.globalCompositeOperation = 'source-over';
        }
        // 창
        const len = 190, h = len * 63 / 324;
        ctx.globalAlpha = all > this.lifespan - 90 ? (this.lifespan - all) / 90 : 1;
        if (isImageReady(VAMP_SPEAR_IMAGE)) ctx.drawImage(VAMP_SPEAR_IMAGE, tip - len, -h / 2 + tremble, len, h);
        else { ctx.fillStyle = VAMP_COLOR; ctx.fillRect(tip - len, -4, len, 8); }
        ctx.restore();
    }
}

// ==========================================
// [박쥐 평타] 물기: 박쥐 가까운 쪽 아랫니와 먼 쪽 윗니가 서로 다가와 '앙' 닫힘. 닫히는 순간 판정 (회복 + 출혈)
// ==========================================
const VAMP_BITE_DIST = 58;   // 입 가운데까지 거리
class VampireBiteAttack {
    constructor(owner, direction) {
        this.owner = owner;
        const d = normalizeOr(direction);
        this.angle = Math.atan2(d[1], d[0]);
        this.damage = owner.baseAtk * VAMP.bite.damage;
        this.createdTime = Time.now;
        this.lifespan = VAMP.bite.life;
        this.hitPlayers = [];
        this.canPenetrateWalls = true;
        this.noFizzle = true;
        this.snapped = false;
    }
    mouth() {
        const r = this.owner.rect;
        return [r.centerx + Math.cos(this.angle) * VAMP_BITE_DIST, r.centery + Math.sin(this.angle) * VAMP_BITE_DIST];
    }
    // 닫히는 순간: 흰 불꽃 + 피 (화면 전용)
    update() {
        if (this.snapped || Time.now - this.createdTime < VAMP.bite.closeTime) return;
        this.snapped = true;
        const [x, y] = this.mouth();
        Vfx.spawn(new HitSparkVFX(x, y, { color: '#ffffff', angle: this.angle, count: 8, size: 22 }));
        Vfx.spawn(new VampBloodVFX(x, y, this.angle, 6, [80, 200]));
    }
    isExpired() { return Time.now - this.createdTime >= this.lifespan; }
    getPoints() {
        const r = this.owner.rect;
        return vampFanPoints(r.centerx, r.centery, this.angle, VAMP.bite.radius, VAMP.bite.arc);
    }
    collidesWith(target) {
        const ms = Time.now - this.createdTime;
        if (ms < VAMP.bite.closeTime - 20 || ms > VAMP.bite.closeTime + 80) return false; // 닫히는 순간만
        return canBeHit(this, target) && checkPolygonCollision(this.getPoints(), target.rect);
    }
    applyEffect(target) {
        vampHeal(this.owner, VAMP.bite.heal);
        vampBleed(target, VAMP.bite.bleedTime, VAMP.bite.bleedPower);
        Vfx.spawn(new VampBloodVFX(target.rect.centerx, target.rect.centery, this.angle, 10));
    }
    draw(ctx) {
        const ms = Time.now - this.createdTime, C = VAMP.bite.closeTime;
        const t = Math.min(1, ms / this.lifespan);
        fillPolygon(ctx, this.getPoints(), `rgba(208, 24, 44, ${0.14 * (1 - t)})`);
        if (!isImageReady(VAMP_FANG_TOP_IMAGE) || !isImageReady(VAMP_FANG_BOTTOM_IMAGE)) return;
        // 두 턱 사이 거리: 처음엔 크게 벌어져 있다가 점점 빨라지며 닫힘
        const u = Math.min(1, ms / C), gap = 46 * (1 - u * u);
        const shake = u >= 1 && ms < C + 60 ? (Math.floor(ms / 18) % 2 ? 2.5 : -2.5) : 0;
        const fade = ms > C + 60 ? Math.max(0, 1 - (ms - C - 60) / (this.lifespan - C - 60)) : 1;
        const [x, y] = this.mouth();
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.angle + Math.PI / 2); // 로컬 위쪽(-y) = 앞쪽
        ctx.translate(shake, 0);
        ctx.globalAlpha = Math.min(1, ms / 30) * fade;
        const tw = 70, th = tw * 58 / 123, bw = 62, bh = bw * 41 / 109;
        // 먼 쪽(앞) 윗니: 송곳니가 박쥐 쪽(아래)을 향함 / 가까운 쪽 아랫니: 이가 앞(위)을 향함. 닫히면 살짝 겹침
        ctx.drawImage(VAMP_FANG_TOP_IMAGE, -tw / 2, -gap / 2 - th + 6, tw, th);
        ctx.drawImage(VAMP_FANG_BOTTOM_IMAGE, -bw / 2, gap / 2 - 5, bw, bh);
        // 다가오는 동안 턱 뒤로 붉은 속도선
        if (u < 1) {
            ctx.strokeStyle = `rgba(255, 60, 80, ${0.6 * u})`; ctx.lineWidth = 2;
            ctx.beginPath();
            for (const sx of [-22, 0, 22]) { ctx.moveTo(sx, -gap / 2 - th - 2); ctx.lineTo(sx, -gap / 2 - th - 14); ctx.moveTo(sx, gap / 2 + bh); ctx.lineTo(sx, gap / 2 + bh + 12); }
            ctx.stroke();
        }
        // 닫히는 순간 붉은 번쩍
        if (u >= 1 && ms < C + 70) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(255, 60, 80, ${0.75 * (1 - (ms - C) / 70)})`;
            ctx.beginPath(); ctx.ellipse(0, 0, tw * 0.5, 7, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
}

class VampireBasicSkill extends Skill {
    constructor() { super('Blood Spear', VAMP.spear.cooldown, ['melee']); this.owner = null; }
    // 박쥐일 때는 물기 쿨타임 (더 김)
    canUse() {
        const cd = this.owner && this.owner.vampBat ? VAMP.bite.cooldown : VAMP.spear.cooldown;
        return Time.now - this.lastUsed >= cd;
    }
    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        if (owner.vampBat) {
            attacks.push(new VampireBiteAttack(owner, direction));
        } else {
            attacks.push(new VampireSpearAttack(owner, direction));
            vampSelfDamage(owner, VAMP.spear.selfDamage);
        }
    }
}

// ==========================================
// [스킬 1] 흡혈: 상대 출혈을 모두 없애고, 남은 출혈 피해만큼 회복
// ==========================================
class VampireDrainSkill extends Skill {
    constructor() { super('Blood Drain', VAMP.drainCooldown); this.owner = null; }
    canUse() {
        const o = this.owner;
        if (!o || o.vampBat) return false;
        return super.canUse() && vampBleedRemaining(o.opponent) > 0; // 상대가 출혈 중일 때만
    }
    use(owner) {
        const target = owner.opponent;
        const amount = vampBleedRemaining(target);
        if (amount <= 0) return;
        this.lastUsed = Time.now;
        vampClearBleed(target);
        vampHeal(owner, amount);
        Vfx.spawn(new VampDrainVFX(owner, target));
        Vfx.spawn(new VampBloodVFX(target.rect.centerx, target.rect.centery, Math.atan2(owner.rect.centery - target.rect.centery, owner.rect.centerx - target.rect.centerx), 10));
    }
}

// ==========================================
// [스킬 2] 박쥐 변신/해제. 쿨타임은 해제할 때부터
// ==========================================
function vampSetSize(owner, size) {
    const r = owner.rect, cx = r.centerx, cy = r.centery;
    r.w = size; r.h = size;
    r.setCenter(cx, cy);
}

// 벽 안에 끼어 있으면 가장 가까운 쪽으로 밀어낸다 (박쥐가 벽 속에서 풀릴 때)
function vampPushOutOfWalls(owner) {
    const r = owner.rect;
    for (const wall of CURRENT_WALLS) {
        if (!r.colliderect(wall.rect)) continue;
        const w = wall.rect;
        const left = r.right - w.left, right = w.right - r.left, up = r.bottom - w.top, down = w.bottom - r.top;
        const m = Math.min(left, right, up, down);
        if (m === left) r.right = w.left;
        else if (m === right) r.left = w.right;
        else if (m === up) r.bottom = w.top;
        else r.top = w.bottom;
    }
    r.clampIp(ARENA_RECT);
}

class VampireBatSkill extends Skill {
    constructor() { super('Bat Form', VAMP.bat.cooldown); this.owner = null; this.enterTime = -99999; }
    canUse() {
        // 박쥐일 때는 언제든 해제 (단, 변신 직후 0.3초는 키를 누르고 있어 바로 풀리지 않게)
        if (this.owner && this.owner.vampBat) return Time.now - this.enterTime >= 300;
        return super.canUse();
    }
    use(owner) {
        if (owner.vampBat) vampExitBat(owner, this);
        else {
            owner.vampBat = true;
            this.enterTime = Time.now;
            vampSetSize(owner, VAMP.bat.size);
            owner.spriteImage = VAMP_EMPTY_IMAGE;
            Vfx.spawn(new VampBatPuffVFX(owner.rect.centerx, owner.rect.centery));
        }
    }
}

function vampExitBat(owner, skill) {
    owner.vampBat = false;
    skill.lastUsed = Time.now; // 쿨타임은 해제할 때부터
    delete owner.statusEffects.ghost;
    owner.ignoreWalls = false;
    vampSetSize(owner, 40);
    vampPushOutOfWalls(owner);
    owner.spriteImage = null;
    Vfx.spawn(new VampBatPuffVFX(owner.rect.centerx, owner.rect.centery));
}

// ==========================================
// [궁극기] 피의 가시: 앞쪽 45도 긴 부채꼴, 피해 + 강한 출혈, 나도 크게 다침
// ==========================================
class VampireUltAttack {
    constructor(owner, direction) {
        this.owner = owner;
        const d = normalizeOr(direction);
        this.angle = Math.atan2(d[1], d[0]);
        this.cx = owner.rect.centerx; this.cy = owner.rect.centery;
        this.damage = owner.baseAtk * VAMP.ult.damage;
        this.createdTime = Time.now;
        this.lifespan = VAMP.ult.delay + 200;
        slow(owner, VAMP.ult.delay / 1000 + 0.15, 100); // 선딜레이 동안 제자리
        this.hitPlayers = [];
        this.canPenetrateWalls = true;
        this.noFizzle = true;
        Vfx.spawn(new VampSpikesVFX(this.cx, this.cy, this.angle));
    }
    update() {}
    isExpired() { return Time.now - this.createdTime >= this.lifespan; }
    getPoints() { return vampFanPoints(this.cx, this.cy, this.angle, VAMP.ult.radius, VAMP.ult.arc, 8); }
    // 가시가 솟는 동안(delay 뒤 0.2초)만 맞음
    collidesWith(target) {
        if (Time.now - this.createdTime < VAMP.ult.delay) return false;
        return canBeHit(this, target) && checkPolygonCollision(this.getPoints(), target.rect);
    }
    applyEffect(target) {
        vampBleed(target, VAMP.ult.bleedTime, VAMP.ult.bleedPower);
        Vfx.spawn(new VampBloodVFX(target.rect.centerx, target.rect.centery, -Math.PI / 2, 14, [120, 280]));
    }
    // 범위·가시는 VampSpikesVFX가 그린다 (그림이 아직 안 불러와졌을 때만 옅은 부채꼴)
    draw(ctx) {
        if (isImageReady(VAMP_POOL_IMAGE)) return;
        const t = (Time.now - this.createdTime) / this.lifespan;
        fillPolygon(ctx, this.getPoints(), `rgba(160, 10, 30, ${0.3 * (1 - t)})`);
    }
}

class VampireUltSkill extends Skill {
    constructor() { super('Blood Spikes', 500, ['ult'], -99999); this.owner = null; }
    canUse() { return !(this.owner && this.owner.vampBat) && super.canUse(); }
    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new VampireUltAttack(owner, direction));
        vampSelfDamage(owner, VAMP.ult.selfDamage);
    }
}

// ==========================================
// 캐릭터 등록
// ==========================================
function applyVampire(player) {
    player.maxHp = 230;
    player.maxUltGauge = 110; // 궁극기 게이지 통 (검사 100 기준)
    player.hp = player.maxHp;
    player.baseAtk = 12;
    player.speed = 4.4;
    player.vampBat = false;

    const drain = new VampireDrainSkill(); drain.owner = player;
    const bat = new VampireBatSkill(); bat.owner = player;
    const ult = new VampireUltSkill(); ult.owner = player;
    const basic = new VampireBasicSkill(); basic.owner = player;
    player.abilities = [basic, drain, bat, ult];

    // 박쥐: 받는 피해 증가
    const baseTakeDamage = player.takeDamage.bind(player);
    player.takeDamage = (raw) => baseTakeDamage(player.vampBat ? raw * VAMP.bat.damageTaken : raw);

    // 박쥐인 동안 매 틱: 벽 통과 + 빨라짐
    player.preUpdateHooks.push(() => {
        if (!player.vampBat) return;
        if (Time.now - bat.enterTime >= VAMP.bat.maxTime) { vampExitBat(player, bat); return; } // 최대 5초
        ghost(player, 0.1);
        speedUp(player, 0.1, VAMP.bat.speedUp);
    });

    // 박쥐 그림 (몸 사각형 대신). 날개를 퍼덕이며 살짝 위아래로
    player.preDrawHooks.push((ctx) => {
        if (!player.vampBat) return;
        const r = player.rect, f = Math.floor(Time.now / 110) % 2, bob = Math.sin(Time.now / 110) * 2;
        const img = VAMP_BAT_IMAGES[f];
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath(); ctx.ellipse(r.centerx, r.bottom + 6, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
        // 어두운 바닥에서도 보이게 몸 뒤에 옅은 붉은 기운
        ctx.fillStyle = 'rgba(208, 24, 44, 0.28)';
        ctx.beginPath(); ctx.arc(r.centerx, r.centery + bob, 24, 0, Math.PI * 2); ctx.fill();
        if (!isImageReady(img)) return;
        ctx.save();
        ctx.translate(r.centerx, r.centery + bob);
        if (player.facing[0] < 0) ctx.scale(-1, 1);
        ctx.drawImage(img, -32, -22, 64, 44);
        ctx.restore();
        // 남은 변신 시간: 박쥐 위 작은 고리가 줄어듦
        const left = Math.max(0, 1 - (Time.now - bat.enterTime) / VAMP.bat.maxTime);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(r.centerx, r.top - 26, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = left < 0.3 ? '#ff5060' : '#e8c0c8'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(r.centerx, r.top - 26, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.stroke();
    });
}

const VAMPIRE_CHARACTER_DATA = {
    id: 'VAMPIRE',
    fxColor: VAMP_COLOR,
    name: '뱀파이어',
    desc: '평타(1초): 0.18초 동안 창에 피를 모았다가 앞을 길게 팍 찌릅니다(14.4, 길이 160) + 강한 출혈(초당 5, 4초). 출혈은 걸 때마다 따로 쌓입니다(최대 6중첩). 쓸 때마다 내 체력 3 감소(이걸로는 죽지 않음), 스킬 1(5초): 상대의 출혈을 모두 없애고 남은 출혈 피해만큼 내 체력을 회복합니다(상대가 출혈 중일 때만), 스킬 2(4초): 박쥐로 변신하거나 해제합니다(최대 5초). 판정이 작아지고 이동속도 +40%·벽 통과, 대신 받는 피해 +30%이고 평타와 스킬 2만 쓸 수 있습니다. 쿨타임은 해제할 때부터, 박쥐 평타(1.4초): 앞쪽 90도 부채꼴을 물어 피해(6)를 주고 체력 10 회복 + 출혈(초당 4, 3초), 궁극기: 앞쪽 45도 긴 부채꼴에 피 웅덩이가 퍼지고(0.35초, 이동 불가) 피의 가시가 솟아 피해(24) + 강한 출혈(초당 7, 6초). 내 체력 25 감소(이걸로는 죽지 않음)',
    apply: applyVampire,
    thumbnail: null,
};
