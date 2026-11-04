// 해커 (abilities/hacker.py를 옮김)

const HACKER_IMAGE = loadImage('assets/hacker.png');

// 이펙트 그림 (tools/hacker_gen.js로 생성): 흰 빛 그림 → 해커 초록을 입혀 'lighter'로
const HK_SCAN_IMAGE = loadImage('assets/hk_scan.png');     // 256x80 스캔 빔, 왼쪽 가운데가 해커 쪽, 오른쪽 끝 폭 = 높이
const HK_CUBE_IMAGE = loadImage('assets/hk_cube.png');     // 64x64 데이터 큐브, 바깥 네모 한 변 ≈ 56
const HK_PORTAL_IMAGE = loadImage('assets/hk_portal.png'); // 64x64 텔레포트 포털
const HK_RING_IMAGE = loadImage('assets/hk_ring.png');     // 256x256 해킹 파동 고리, 바깥 반지름 ≈ 124
const HK_HEX_IMAGE = loadImage('assets/hk_hex.png');       // 256x256 궁극기 바닥 육각 격자, 반지름 ≈ 125
const HK_SKULL_IMAGE = loadImage('assets/hk_skull.png');   // 128x128 해킹된 상대 몸에 뜨는 해골 (사용자 그림을 초록으로, 이미 색이 있어 보통으로 그림)
const HK_GREEN = '#5cff8a';

function hkGlow(ctx, img, x, y, w, h, { angle = 0, alpha = 1, ax = 0.5, ay = 0.5, core = 0.45 } = {}) {
    if (!isImageReady(img) || alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y); if (angle) ctx.rotate(angle);
    ctx.globalAlpha = Math.min(1, alpha); ctx.drawImage(vfxTinted(img, HK_GREEN), -w * ax, -h * ay, w, h);
    ctx.globalAlpha = Math.min(1, alpha) * core; ctx.drawImage(img, -w * ax, -h * ay, w, h);
    ctx.restore();
}

// 픽셀 조각이 흩어지는 이펙트 (화면 전용): 작은 초록 네모들이 깜빡이며 퍼지고 사라짐. 이펙트 하나로 묶음
class HackerPixelVFX {
    constructor(x, y, n = 12, speed = 160, duration = 0.45) {
        this.elapsed = 0; this.duration = duration;
        this.px = [];
        for (let i = 0; i < n; i++) { const a = vfxRand(0, Math.PI * 2), sp = vfxRand(speed * 0.3, speed); this.px.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: vfxRand(2, 5), ph: vfxRand(0, 6) }); }
    }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; const drag = Math.exp(-4 * dt); for (const p of this.px) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= drag; p.vy *= drag; } }
    draw(ctx) {
        const k = 1 - this.elapsed / this.duration;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const p of this.px) {
            const flick = Math.sin(this.elapsed * 40 + p.ph) > -0.3 ? 1 : 0.3;  // 지직거리듯 깜빡
            ctx.fillStyle = `rgba(92, 255, 138, ${k * flick})`; ctx.fillRect(Math.round(p.x - p.s / 2), Math.round(p.y - p.s / 2), p.s, p.s);
        }
        ctx.restore();
    }
}

// 궁극기 (화면 전용, 1.3초): 바닥 육각 격자가 번쩍 켜졌다 꺼지고, 원 안으로 데이터 비가 쏟아지고, 회로 고리 세 겹이 차례로 퍼짐
class HackerUltVFX {
    constructor(owner, radius) {
        this.owner = owner; this.radius = radius; this.elapsed = 0; this.duration = 1.3;
        this.cx = owner.rect.centerx; this.cy = owner.rect.centery;
        this.rain = [];
        for (let i = 0; i < 26; i++) { const x = vfxRand(-radius, radius); this.rain.push({ x, y0: vfxRand(-radius, 0), sp: vfxRand(260, 520), len: vfxRand(18, 50) }); }
    }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const t = this.elapsed, R = this.radius, cx = this.cx, cy = this.cy;
        // 바닥 격자: 0.15초에 확 켜졌다가 서서히 꺼짐
        const ga = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 1.0);
        const d = R * 2 * 128 / 125;
        hkGlow(ctx, HK_HEX_IMAGE, cx, cy, d, d, { angle: t * 0.2, alpha: 0.6 * ga, core: 0.2 });
        // 데이터 비: 원 안에서만 떨어지는 초록 줄
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        const ra = Math.min(1, t / 0.1) * Math.max(0, 1 - (t - 0.6) / 0.7);
        for (const r of this.rain) {
            const y = cy + r.y0 + r.sp * t;
            if (y - r.len > cy + R) continue;
            ctx.fillStyle = `rgba(92, 255, 138, ${0.5 * ra})`; ctx.fillRect(cx + r.x, y - r.len, 2, r.len);
            ctx.fillStyle = `rgba(220, 255, 230, ${0.9 * ra})`; ctx.fillRect(cx + r.x - 1, y - 3, 4, 4);  // 떨어지는 머리
        }
        ctx.restore();
        // 회로 고리 세 겹 (0초, 0.12초, 0.24초에 출발)
        for (let k = 0; k < 3; k++) {
            const u = (t - k * 0.12) / 0.55;
            if (u <= 0 || u >= 1) continue;
            const rr = R * (0.15 + 0.85 * dmxEaseOut(u)) * (k === 0 ? 1 : 0.92 - k * 0.08);
            hkGlow(ctx, HK_RING_IMAGE, cx, cy, rr * 2 * 128 / 124, rr * 2 * 128 / 124, { angle: (k % 2 ? -1 : 1) * u * 0.9, alpha: 1.2 * (1 - u) });
        }
    }
}

// 해커와 해킹된 상대를 잇는 지그재그 데이터 선 (궁극기 적중, 화면 전용)
class HackerLinkVFX {
    constructor(owner, target) { this.owner = owner; this.target = target; this.elapsed = 0; this.duration = 0.5; }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const a = this.owner.rect, b = this.target.rect, k = 1 - this.elapsed / this.duration;
        const dx = b.centerx - a.centerx, dy = b.centery - a.centery, len = Math.hypot(dx, dy) || 1, px = -dy / len, py = dx / len;
        const f = Math.floor(this.elapsed * 30);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'miter';
        for (const [w, col] of [[5, `rgba(92, 255, 138, ${0.35 * k})`], [2, `rgba(220, 255, 230, ${k})`]]) {
            ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.centerx, a.centery);
            for (let i = 1; i < 8; i++) { const u = i / 8, off = (((f + i * 7) % 5) - 2) * 6; ctx.lineTo(a.centerx + dx * u + px * off, a.centery + dy * u + py * off); }
            ctx.lineTo(b.centerx, b.centery); ctx.stroke();
        }
        ctx.restore();
    }
}

// 포털이 열렸다 닫히는 이펙트 (텔레포트 출발·도착, 화면 전용)
class HackerPortalVFX {
    constructor(x, y, opening) { this.x = x; this.y = y; this.opening = opening; this.elapsed = 0; this.duration = 0.35; }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const t = this.elapsed / this.duration;
        const size = this.opening ? 30 + 40 * dmxEaseOut(t) : 70 - 50 * t;   // 도착은 열리며 커짐, 출발은 닫히며 작아짐
        hkGlow(ctx, HK_PORTAL_IMAGE, this.x, this.y, size, size, { alpha: 1.2 * (1 - t * t) });
    }
}

// ==========================================
// 해킹 게이지: 상대 머리 옆의 초록 도넛. 100%가 되면 침묵·슬로우·화상 + "해킹 상태"
// ==========================================
const HACK_ULT_STEAL = 15;
function triggerFullHack(owner, target) {
    target.hackerGauge = 0.0;
    target.hackerTextTimer = Time.now;
    silence(target, 2.5);
    slow(target, 2.5, 50);
    burn(target, 6.0, owner.baseAtk * 0.25);
    target.hackedUntil = Time.now + 6000;
    // 궁극기 게이지 훔치기: 상대 15% 감소(모자라면 0%), 해커는 항상 15% 충전
    target.ultGauge = Math.max(0, target.ultGauge - HACK_ULT_STEAL);
    owner.addUltGauge(HACK_ULT_STEAL);
    Vfx.spawn(new HackerPixelVFX(target.rect.centerx, target.rect.centery, 18, 220, 0.6)); // 화면 전용: 해킹 순간 픽셀 폭발
    Vfx.spawn(new HackerPortalVFX(target.rect.centerx, target.rect.centery, true));
}

// 해킹 게이지: 12칸으로 나뉜 빛나는 고리가 시계 방향으로 차오르고, 바깥에 도는 점선 고리 + 가운데 숫자.
// 75% 넘으면 깜빡이며 경고 (화면 전용)
function drawClockwiseDonut(ctx, x, y, radius, percent) {
    const N = 12, gap = 0.12, seg = Math.PI * 2 / N, filled = percent / 100 * N, t = Time.now;
    const hot = percent >= 75 ? 0.6 + 0.4 * Math.sin(t * 0.025) : 1;
    ctx.save();
    ctx.fillStyle = 'rgba(8, 20, 14, 0.75)'; ctx.beginPath(); ctx.arc(x, y, radius - 4, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'butt';
    for (let i = 0; i < N; i++) {
        const a0 = -Math.PI / 2 + i * seg + gap / 2, full = a0 + seg - gap;
        ctx.strokeStyle = 'rgba(92, 255, 138, 0.18)'; ctx.lineWidth = 5;               // 빈 칸
        ctx.beginPath(); ctx.arc(x, y, radius - 6, a0, full); ctx.stroke();
        const f = Math.max(0, Math.min(1, filled - i));
        if (f > 0) {
            const a1 = a0 + (seg - gap) * f;
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = `rgba(92, 255, 138, ${0.35 * hot})`; ctx.lineWidth = 9;  // 번지는 빛
            ctx.beginPath(); ctx.arc(x, y, radius - 6, a0, a1); ctx.stroke();
            ctx.strokeStyle = `rgba(190, 255, 210, ${hot})`; ctx.lineWidth = 4;         // 찬 칸
            ctx.beginPath(); ctx.arc(x, y, radius - 6, a0, a1); ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
        }
    }
    ctx.setLineDash([2, 5]); ctx.lineDashOffset = -t * 0.03;                             // 바깥에서 도는 점선
    ctx.strokeStyle = 'rgba(92, 255, 138, 0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    drawText(ctx, String(Math.floor(percent)), x, y + 1, 11, `rgba(190, 255, 210, ${hot})`, { bold: true, align: 'center', baseline: 'middle' });
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

        // 해킹 상태: 몸에 초록 글리치 줄이 지직거림 (화면 전용, 코드로 줄 2개)
        if ((target.hackedUntil || 0) > Time.now && !target.hidden) {
            const f = Math.floor(Time.now / 70);
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 2; i++) {
                if ((f + i) % 3 === 0) continue;
                const y = r.top + ((f * 13 + i * 23) % r.h), dx = ((f * 7 + i * 11) % 10) - 5;
                ctx.fillStyle = 'rgba(92, 255, 138, 0.55)'; ctx.fillRect(r.x - 4 + dx, y, r.w + 8, 2);
            }
            ctx.restore();
        }

        // 해킹 상태: 몸 위에 해골이 지직거리며 뜨고, 발밑에 '해킹됨' (화면 전용)
        const hackLeft = (target.hackedUntil || 0) - Time.now;
        if (hackLeft > 0 && !target.hidden && isImageReady(HK_SKULL_IMAGE)) {
            const since = Time.now - target.hackerTextTimer;
            const pop = since < 250 ? 1.6 - 0.6 * (since / 250) : 1;                       // 처음엔 크게 떴다가 몸 크기로
            const fade = Math.min(1, hackLeft / 500);
            const glitch = Math.floor(Time.now / 90) % 7 === 0;                             // 가끔 가로로 어긋나는 글리치
            const size = Math.max(r.w, r.h) * 1.15 * pop, x0 = r.centerx - size / 2, y0 = r.centery - size / 2;
            ctx.save();
            ctx.globalAlpha = 0.85 * fade * (0.85 + 0.15 * Math.sin(Time.now * 0.02));
            if (glitch) {
                for (let i = 0; i < 3; i++) {
                    const sy = i * 128 / 3, dy = i * size / 3, off = (i - 1) * 5;
                    ctx.drawImage(HK_SKULL_IMAGE, 0, sy, 128, 128 / 3, x0 + off, y0 + dy, size, size / 3);
                }
            } else {
                ctx.drawImage(HK_SKULL_IMAGE, x0, y0, size, size);
            }
            ctx.restore();
            drawText(ctx, '해킹됨', r.centerx, r.bottom + 12, 14, `rgba(92, 255, 138, ${fade})`, { bold: true, align: 'center', baseline: 'middle' });
        }

        // 해킹 상태에서 큐브(바이러스)에 맞아 생긴 도트 피해 표시: 몸을 감싸고 도는 초록 점선 고리 + 깜빡이는 바이러스 픽셀
        const corruptUntil = target.hackerCorruptUntil || 0;
        if (corruptUntil > Time.now && !target.hidden) {
            const alpha = Math.min(1.0, (corruptUntil - Time.now) / 600);
            const radius = Math.max(r.w, r.h) * 0.68 + 3 * Math.sin(Time.now / 120);
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            ctx.setLineDash([6, 5]); ctx.lineDashOffset = -Time.now * 0.05;
            ctx.strokeStyle = `rgba(92, 255, 138, ${0.8 * alpha})`; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(r.centerx, r.centery, radius, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            const f = Math.floor(Time.now / 80);
            for (let i = 0; i < 8; i++) {                       // 몸 주위를 도는 바이러스 픽셀 (몇 개는 지직거리며 꺼짐)
                if ((f + i) % 5 === 0) continue;
                const ang = Time.now / 260 + i * (Math.PI * 2 / 8), d = radius - 4 + ((f * 3 + i) % 4) * 2;
                ctx.fillStyle = `rgba(${i % 3 ? '92, 255, 138' : '220, 255, 230'}, ${alpha})`;
                ctx.fillRect(Math.round(r.centerx + Math.cos(ang) * d) - 2, Math.round(r.centery + Math.sin(ang) * d) - 2, i % 2 ? 4 : 3, i % 2 ? 4 : 3);
            }
            ctx.restore();
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
        Vfx.spawn(new HackerPixelVFX(target.rect.centerx, target.rect.centery, 14, 200)); // 화면 전용: 큐브가 부서지며 픽셀 조각
    }

    // 돌아가는 홀로그램 큐브 + 뒤로 흩어지는 픽셀 꼬리 (판정 48보다 살짝 크게)
    draw(ctx) {
        const t = Time.now - this.createdTime;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 1; i <= 4; i++) {
            const d = i * 14, w = Math.sin(t * 0.03 + i * 2) * 8, s = 5 - i;
            ctx.fillStyle = `rgba(92, 255, 138, ${0.6 - i * 0.12})`;
            ctx.fillRect(Math.round(this.posX - this.direction[0] * d - this.direction[1] * w - s / 2), Math.round(this.posY - this.direction[1] * d + this.direction[0] * w - s / 2), s, s);
        }
        ctx.restore();
        const pulse = 1 + 0.06 * Math.sin(t * 0.02);
        hkGlow(ctx, HK_CUBE_IMAGE, this.posX, this.posY, 58 * pulse, 58 * pulse, { angle: -this.angle * Math.PI / 180 });
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
        // 화면 전용: 떠나는 자리는 포털이 닫히며 픽셀로 흩어짐
        Vfx.spawn(new HackerPortalVFX(r.centerx, r.centery, false));
        Vfx.spawn(new HackerPixelVFX(r.centerx, r.centery, 12, 140));
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
        // 화면 전용: 도착한 자리에 포털이 열리며 픽셀이 모임
        Vfx.spawn(new HackerPortalVFX(r.centerx, r.centery, true));
        Vfx.spawn(new HackerPixelVFX(r.centerx, r.centery, 12, 160));
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

    // 날아가는 작은 포털 (판정 28보다 살짝 크게) + 해커와 이어진 점선 데이터 줄
    draw(ctx) {
        const o = this.owner.rect;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.setLineDash([3, 6]); ctx.lineDashOffset = -(Time.now - this.createdTime) * 0.15;
        ctx.strokeStyle = 'rgba(92, 255, 138, 0.45)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(o.centerx, o.centery); ctx.lineTo(this.posX, this.posY); ctx.stroke();
        ctx.restore();
        hkGlow(ctx, HK_PORTAL_IMAGE, this.posX, this.posY, 36, 36, { angle: (Time.now - this.createdTime) * 0.006 });
    }
}

class HackerSkill2 extends Skill {
    constructor() { super('Teleport Square', 9000); } // 이동기 너프: 5 → 9초

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
        Vfx.spawn(new HackerLinkVFX(this.owner, target)); // 화면 전용
    }

    // 그림은 HackerUltVFX가 그린다 (판정 원이 퍼지는 동안 옅은 초록 바닥만)
    draw(ctx) {
        const t = Math.min(1, (Time.now - this.createdTime) / this.duration);
        ctx.save();
        ctx.fillStyle = `rgba(92, 255, 138, ${0.1 * (1 - t)})`;
        ctx.beginPath(); ctx.arc(this.owner.rect.centerx, this.owner.rect.centery, this.radius * t, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

class HackerUltimate extends Skill {
    constructor() { super('Cyber Overload', 500, ['ult'], -99999); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        const area = new HackerUltimateArea(owner);
        attacks.push(area);
        Vfx.spawn(new HackerUltVFX(owner, area.radius));                                  // 화면 전용
        Vfx.spawn(new HackerPixelVFX(owner.rect.centerx, owner.rect.centery, 24, 320, 0.6));
        Vfx.shake(6, 0.3);
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

        this.lockedOn = Time.now; // 화면 전용: 조준 표시
        attachHackerGauge(target);
        target.hackerGauge = Math.min(100.0, target.hackerGauge + 40.0 * (dt / 1000));
        target.lastGaugeIncreaseTime = Time.now;
        if (target.hackerGauge >= 100.0) triggerFullHack(this.owner, target);
    }

    isExpired() { return Time.now - this.createdTime >= this.duration; }

    collidesWith() { return false; }

    // 스캔 빔(그림)이 판정 부채꼴 그대로 뻗고, 밝은 스캔 파동이 바깥으로 계속 흘러감. 상대가 잡히면 조준 괄호 (화면 전용)
    draw(ctx) {
        const ox = this.owner.rect.centerx, oy = this.owner.rect.centery;
        const [ux, uy] = this.unitDirection();
        const base = Math.atan2(uy, ux), half = this.halfAngle * Math.PI / 180;
        const el = Time.now - this.createdTime;
        const alpha = Math.min(1, el / 120) * Math.min(1, (this.duration - el) / 200);
        const endW = 2 * this.range * Math.tan(half);
        hkGlow(ctx, HK_SCAN_IMAGE, ox, oy, this.range, endW, { angle: base, alpha: 0.85 * alpha * (0.9 + 0.1 * Math.sin(el * 0.05)), ax: 0, ay: 0.5, core: 0.3 });
        // 스캔 파동: 0.45초마다 하나씩 바깥으로
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 3;
        for (let k = 0; k < 2; k++) {
            const ph = ((el / 450) + k * 0.5) % 1, d = this.range * ph;
            ctx.strokeStyle = `rgba(160, 255, 190, ${alpha * (1 - ph)})`;
            ctx.beginPath(); ctx.arc(ox, oy, d, base - half, base + half); ctx.stroke();
        }
        ctx.restore();
        // 상대가 스캔에 잡혀 있으면 조준 괄호
        const tgt = this.owner.opponent;
        if (tgt && Time.now - (this.lockedOn || -9999) < 100 && !tgt.hidden) {
            const r = tgt.rect, g = 8, s = 10 + 3 * Math.sin(el * 0.02);
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(92, 255, 138, ${alpha})`; ctx.lineWidth = 2;
            for (const [x, y, dx, dy] of [[r.left - g, r.top - g, 1, 1], [r.right + g, r.top - g, -1, 1], [r.left - g, r.bottom + g, 1, -1], [r.right + g, r.bottom + g, -1, -1]]) {
                ctx.beginPath(); ctx.moveTo(x + dx * s, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * s); ctx.stroke();
            }
            ctx.restore();
        }
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
    player.maxHp = 260;
    player.maxUltGauge = 110; // 궁극기 게이지 통 (검사 100 기준)
    player.hp = player.maxHp;
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
    fxColor: '#5cff8a',
    name: '해커',
    desc: '평타(1.5초): 2초 동안 앞쪽 좁은 부채꼴을 스캔합니다(피해 없음, 사거리 520). 스캔에 잡힌 동안 상대 해킹 게이지가 초당 40% 찹니다, 스킬 1(4초): 회전하는 데이터 큐브를 던집니다(16.2). 맞으면 해킹 게이지 +50%, 2초 동안 공격력 30% 감소, 슬로우 50% 1.5초. 이미 해킹된 상대에겐 바이러스 도트 피해(초당 10.8, 4초), 스킬 2(9초): 포털을 날려 닿거나 막힌 곳(또는 사거리 끝)으로 순간이동합니다, 궁극기: 주변 큰 원(반경 280) 안의 상대를 즉시 해킹하고 3.5초 동안 혼란(이동 방향 반대)에 빠뜨립니다, 해킹: 게이지가 100%가 되면 2.5초 침묵 + 슬로우 50%, 6초 동안 화상(초당 4.5). 상대 궁극기 게이지를 15% 훔칩니다(상대 -15%, 나 +15%). 4초 동안 안 맞으면 게이지가 초당 15%씩 줄어듭니다',
    apply: applyHacker,
    thumbnail: HACKER_IMAGE,
};
