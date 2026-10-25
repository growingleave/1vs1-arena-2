// 플레이어 (player.py를 옮김)
//
// pygame 버전과 다른 점: 키보드를 직접 읽지 않고, 매 틱 "입력" 객체를 받는다.
//   input = { up, down, left, right, skills: [평타, 스킬1, 스킬2, 궁극기] }  (모두 true/false)
// 이렇게 해두면 나중에 온라인 대전에서 상대 기기의 입력을 그대로 넣어줄 수 있다.

const EMPTY_INPUT = Object.freeze({
    up: false, down: false, left: false, right: false,
    skills: Object.freeze([false, false, false, false]),
});

class Player {
    constructor(x, y, color, playerNum = 1) {
        this.color = color;
        this.playerNum = playerNum;
        this.input = EMPTY_INPUT;

        this.rect = new Rect(x, y, 40, 40);

        // 기본 스탯
        this.speed = 4.3;
        this.maxHp = 100;
        this.hp = 100;
        this.baseAtk = 10;
        this.defense = 0.0;
        this.cooldownRate = 1.0;
        this.timeScale = 1.0;

        this.facing = [1, 0];
        this.abilities = [];
        this.spriteImage = null;   // 캐릭터 이미지 (없으면 색 사각형)
        this.spriteSize = 44;
        this.dotColor = COLOR_WHITE; // 방향 표시 점 색
        this.dotRadius = 5;
        this.drawDotTemplate = null; // 기본 점 대신 그릴 모양 (오른쪽을 바라보는 기준으로 그리는 함수)
        this.dotMargin = 8;
        this.hidden = false;         // true면 화면에 그리지 않음 (마법사 궁극기 중)

        // 상태 이상
        this.speedMultiplier = 1.0;
        this.statusEffects = {};
        this.silenced = false;
        this.bound = false;
        this.stunned = false;
        this.ignoreWalls = false;
        this.confused = false;
        this.invincible = false;
        this.immuneKeywords = new Set();

        // 강제 이동(넉백 등)
        this.isForcedMoving = false;
        this.forcedMoveVec = [0, 0];

        // 빙판 등 미끄러운 바닥 (1.0 = 안 미끄러움)
        this.velocity = [0, 0];
        this.onIce = false;
        this.iceFriction = 1.0;

        // 배틀에서는 실제 상대, 로드아웃 연습에서는 자기 쪽 허수아비
        this.opponent = null;

        // 궁극기 게이지
        this.ultGauge = 0.0;
        this.ultChargeRate = 3.0;
        this.ultChargeMultiplier = 1.0;

        // 캐스팅 (선딜레이)
        this.castTimer = 0.0;
        this.pendingAction = null;

        // 피격 이펙트
        this.hitFlashTime = -99999;
        this.hitFlashIntensity = 0.0;
        this.damagePopups = []; // { value, time, offsetX }
    }

    addUltGauge(amount) {
        this.ultGauge = Math.min(100.0, this.ultGauge + amount);
    }

    takeDamage(rawDamage) {
        const effectiveDefense = Math.min(this.defense, 100.0);
        const finalDamage = rawDamage * ((100.0 - effectiveDefense) / 100.0);
        this.hp = Math.max(0.0, this.hp - finalDamage);

        if (finalDamage > 0) {
            this.hitFlashTime = Time.now;
            // 최대 체력 대비 피해 비율이 클수록 이펙트가 강해짐
            this.hitFlashIntensity = Math.min(1.0, (finalDamage / this.maxHp) * 3.0);
            playHitSound(this.hitFlashIntensity);

            this.damagePopups.push({
                value: Math.round(finalDamage),
                time: this.hitFlashTime,
                offsetX: Math.floor(Math.random() * 29) - 14,
            });

            // 맞으면 아주 잠깐 느려짐 (타격감). 이미 더 강한 슬로우가 있으면 그걸 유지
            const existing = this.statusEffects.slow;
            let duration = 0.12;
            let power = 50.0;
            if (existing) {
                duration = Math.max(existing.duration, duration);
                power = Math.max(existing.power, power);
            }
            slow(this, duration, power);
        }
        return finalDamage;
    }

    getStatusText() {
        const texts = [];
        if ((this.slashEnhanceCount || 0) > 0) texts.push(`강화: ${this.slashEnhanceCount}`);

        if (this.stunned) {
            texts.push('기절');
        } else {
            if (this.statusEffects.slow) texts.push(this.speedMultiplier > 0 ? '느려짐' : '이동 불가');
            if (this.statusEffects.silence) texts.push('침묵');
        }
        if (this.statusEffects.speed_up) texts.push('속도증가');
        if (this.statusEffects.bind) texts.push('속박');
        if (this.statusEffects.time_slow) texts.push('시간 지연');
        if (this.statusEffects.burn) texts.push('화상');
        if (this.statusEffects.bleed) texts.push('출혈');
        if (this.statusEffects.confuse) texts.push('혼란');
        if (this.statusEffects.ghost) texts.push('망령화');
        if (this.statusEffects.defense_mod) texts.push(this.defense < 100 ? '방어력 증가' : '무적');
        return texts;
    }

    // dtSec: 이번 틱의 길이(초). 게임은 1/60초 고정 틱으로 돌아간다.
    update(dtSec, input, attacks, walls) {
        this.input = input;

        // 궁극기 자동 충전
        this.ultGauge = Math.min(100.0, this.ultGauge + this.ultChargeRate * dtSec);

        updateStatusEffects(this, dtSec);

        // 쿨타임 가속/감속
        if (this.cooldownRate !== 1.0) {
            const dtMs = dtSec * 1000.0;
            const rateDiff = 1.0 - this.cooldownRate;
            for (const skill of this.abilities) {
                if (skill && skill.cooldown !== undefined && Time.now - skill.lastUsed < skill.cooldown) {
                    skill.lastUsed += dtMs * rateDiff;
                }
            }
        }

        // 스킬 캐스팅 중이면 아무것도 못 함
        if (this.castTimer > 0) {
            this.castTimer -= dtSec;
            if (this.castTimer <= 0) {
                this.castTimer = 0;
                if (this.pendingAction) {
                    const action = this.pendingAction;
                    this.pendingAction = null;
                    action();
                }
            }
            return;
        }

        // --- 이동 ---
        if (this.isForcedMoving) {
            moveEntityWithWalls(this, this.forcedMoveVec[0] * dtSec, this.forcedMoveVec[1] * dtSec, walls);
        } else if (!this.stunned && this.speedMultiplier !== 0.0) {
            const currentSpeed = this.speed * this.speedMultiplier;
            let dx = 0;
            let dy = 0;
            if (input.up) dy -= 1;
            if (input.down) dy += 1;
            if (input.left) dx -= 1;
            if (input.right) dx += 1;

            let targetVx = 0;
            let targetVy = 0;
            if (dx !== 0 || dy !== 0) {
                const len = Math.hypot(dx, dy);
                this.facing = [dx / len, dy / len];
                targetVx = (dx / len) * currentSpeed;
                targetVy = (dy / len) * currentSpeed;
            }

            // 빙판이 아니면 iceFriction=1.0이라 즉시 목표 속도가 된다
            this.velocity[0] += (targetVx - this.velocity[0]) * this.iceFriction;
            this.velocity[1] += (targetVy - this.velocity[1]) * this.iceFriction;

            if (this.velocity[0] ** 2 + this.velocity[1] ** 2 > 0.0001) {
                // 속도 값들은 "60fps 기준 프레임당 픽셀"로 맞춰져 있다
                moveEntityWithWalls(this, this.velocity[0] * dtSec * 60.0, this.velocity[1] * dtSec * 60.0, walls);
            } else {
                this.velocity = [0, 0];
            }
        }

        // --- 스킬 ---
        if (this.stunned) return;
        for (let idx = 0; idx < this.abilities.length; idx++) {
            const ability = this.abilities[idx];
            if (!ability || !input.skills[idx]) continue;
            if (this.silenced) continue;
            if (this.bound && ability.keywords.includes('dash')) continue;

            if (idx === 3) { // 궁극기
                if (this.ultGauge >= 100.0 && ability.canUse()) {
                    ability.use(this, this.facing, attacks, this.color);
                    this.ultGauge = 0.0;
                }
            } else if (ability.canUse()) {
                ability.use(this, this.facing, attacks, this.color);
            }
        }
    }

    draw(ctx) {
        if (this.hidden) return;
        const r = this.rect;

        // 캐스팅 중 금색 테두리
        if (this.castTimer > 0) {
            const g = r.inflate(8, 8);
            ctx.strokeStyle = COLOR_GOLD;
            ctx.lineWidth = 2;
            ctx.strokeRect(g.x + 1, g.y + 1, g.w - 2, g.h - 2);
        }

        if (isImageReady(this.spriteImage)) {
            // rect는 충돌 판정용이고, 화면에는 이미지만 그린다 (왼쪽을 보면 좌우반전)
            const s = this.spriteSize;
            ctx.save();
            ctx.translate(r.centerx, r.centery);
            if (this.facing[0] < 0) ctx.scale(-1, 1);
            ctx.drawImage(this.spriteImage, -s / 2, -s / 2, s, s);
            ctx.restore();
        } else {
            ctx.fillStyle = this.color;
            ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.strokeStyle = COLOR_WHITE;
            ctx.lineWidth = 1;
            ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        }

        // 방향 표시: 사각형 바깥(앞쪽)에 그린다
        const [fx, fy] = this.facing;
        const maxComp = Math.max(Math.abs(fx), Math.abs(fy), 0.0001);
        const dotDist = (r.w / 2) / maxComp + this.dotMargin;
        const dotX = r.centerx + fx * dotDist;
        const dotY = r.centery + fy * dotDist;
        if (this.drawDotTemplate) {
            ctx.save();
            ctx.translate(Math.trunc(dotX), Math.trunc(dotY));
            ctx.rotate(Math.atan2(fy, fx));
            this.drawDotTemplate(ctx);
            ctx.restore();
        } else {
            ctx.beginPath();
            ctx.arc(Math.trunc(dotX), Math.trunc(dotY), this.dotRadius, 0, Math.PI * 2);
            ctx.fillStyle = this.dotColor;
            ctx.fill();
            ctx.strokeStyle = '#282828';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // 피격 이펙트: 잠깐 붉게 번쩍, 피해가 클수록 진하게
        const flashElapsed = Time.now - this.hitFlashTime;
        const flashDuration = 260;
        if (flashElapsed >= 0 && flashElapsed < flashDuration) {
            const fade = 1.0 - flashElapsed / flashDuration;
            const strength = Math.max(0.4, this.hitFlashIntensity);
            const alpha = (235 / 255) * fade * strength;
            if (alpha > 0) {
                ctx.fillStyle = `rgba(255, 20, 20, ${alpha})`;
                ctx.fillRect(r.x, r.y, r.w, r.h);

                const g = r.inflate(10, 10);
                ctx.strokeStyle = `rgba(255, 60, 60, ${Math.min(1, alpha * 1.2)})`;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.roundRect(g.x + 2, g.y + 2, g.w - 4, g.h - 4, 4);
                ctx.stroke();
            }
        }

        // 체력바
        const barW = 40;
        const barH = 5;
        const barX = r.centerx - barW / 2;
        const barY = r.top - 10;
        const hpRatio = Math.max(0, this.hp / this.maxHp);
        ctx.fillStyle = '#323232';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = hpRatio > 0.3 ? COLOR_GREEN : COLOR_RED;
        ctx.fillRect(barX, barY, barW * hpRatio, barH);

        // 데미지 숫자 팝업 (위로 떠오르며 사라짐)
        const popupDuration = 700;
        this.damagePopups = this.damagePopups.filter(p => Time.now - p.time < popupDuration);
        for (const popup of this.damagePopups) {
            const progress = (Time.now - popup.time) / popupDuration;
            drawText(ctx, String(popup.value), r.centerx + popup.offsetX, barY - 12 - 28 * progress, 20, '#ffdc3c',
                     { bold: true, align: 'center', baseline: 'middle', alpha: Math.max(0, 1 - progress) });
        }
    }
}

// 캐릭터를 입힌 새 플레이어를 만든다
function spawnCharacterPlayer(x, y, color, charIdx, playerNum) {
    const p = new Player(x, y, color, playerNum);
    getCharacterData(charIdx).apply(p);
    return p;
}

// 능력 시험용 허수아비: 움직이지 않고 사실상 죽지 않는다
function createPracticeDummy(x, y) {
    const dummy = new Player(x, y, '#8c8c96', 0);
    dummy.maxHp = 99999;
    dummy.hp = dummy.maxHp;
    dummy.baseAtk = 0;
    dummy.speed = 0;
    dummy.abilities = [];
    return dummy;
}
