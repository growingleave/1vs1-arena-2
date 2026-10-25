// 상태이상 (status_effects.py를 그대로 옮김)

// ==========================================
// 1. 상태이상 부여 함수들
// ==========================================

// 슬로우: power 만큼 이동속도 비율 감소 (power가 100 이상이면 이동 불가)
function slow(target, duration, power) {
    target.statusEffects.slow = { duration, power };
}

// 속도 증가: power 만큼 이동속도 비율 증가
function speedUp(target, duration, power) {
    target.statusEffects.speed_up = { duration, power };
}

// 속박: 돌진 키워드 스킬 사용 불가
function bind(target, duration) {
    target.statusEffects.bind = { duration };
}

// 침묵: 모든 스킬 사용 불가
function silence(target, duration) {
    target.statusEffects.silence = { duration };
}

// 시간 감속: 쿨타임 속도 지연 및 timeScale 감소
function timeSlow(target, duration, power) {
    target.statusEffects.time_slow = { duration, power };
}

// 화상: 초당 power 고정 피해 (중첩 없음, 이미 화상 중이면 틱 타이머는 유지)
function burn(target, duration, power, immediateTick = false) {
    const existing = target.statusEffects.burn;
    const tickTimer = existing ? existing.tickTimer : (immediateTick ? 1.0 : 0.0);
    target.statusEffects.burn = { duration, power, tickTimer };
}

// 출혈: 초당 power 고정 피해 (burn과 동일하게 틱 타이머 보존)
function bleed(target, duration, power) {
    const existing = target.statusEffects.bleed;
    const tickTimer = existing ? existing.tickTimer : 0.0;
    target.statusEffects.bleed = { duration, power, tickTimer };
}

// 피해 감소 / 무적: power만큼 방어력 증가 (무적은 power=100)
function defenseMod(target, duration, power) {
    target.statusEffects.defense_mod = { duration, power };
}

// 강제 이동 (밀치기/그랩)
function forcedMove(target, duration, power, direction) {
    target.statusEffects.forced_move = {
        duration, power,
        direction: direction ? [direction[0], direction[1]] : [0, 0],
    };
}

// 망령화: 벽 무시 이동 + 맵 지형 효과('map' 키워드) 무시
function ghost(target, duration) {
    target.statusEffects.ghost = { duration };
}

// 혼란: 이동 방향 반전
function confuse(target, duration) {
    target.statusEffects.confuse = { duration };
}

// ==========================================
// 2. 매 프레임 상태이상 및 스탯 통합 계산
// ==========================================
function updateStatusEffects(target, dtSec) {
    target.speedMultiplier = 1.0;
    target.defense = 0.0;
    target.cooldownRate = 1.0;
    target.timeScale = 1.0;
    target.silenced = false;
    target.bound = false;
    target.ignoreWalls = false;
    target.confused = false;
    target.stunned = false;
    target.isForcedMoving = false;
    target.forcedMoveVec = [0, 0];
    target.immuneKeywords = new Set();

    let hasMaxSlow = false;

    for (const key of Object.keys(target.statusEffects)) {
        const eff = target.statusEffects[key];
        eff.duration -= dtSec;
        if (eff.duration <= 0) {
            delete target.statusEffects[key];
            continue;
        }

        if (key === 'slow') {
            target.speedMultiplier -= eff.power / 100.0;
            if (eff.power >= 100) hasMaxSlow = true;
        } else if (key === 'speed_up') {
            target.speedMultiplier += eff.power / 100.0;
        } else if (key === 'bind') {
            target.bound = true;
        } else if (key === 'silence') {
            target.silenced = true;
        } else if (key === 'time_slow') {
            target.cooldownRate -= eff.power / 100.0;
            target.timeScale -= eff.power / 100.0;
        } else if (key === 'burn' || key === 'bleed') {
            eff.tickTimer += dtSec;
            if (eff.tickTimer >= 1.0) {
                target.takeDamage(eff.power);
                eff.tickTimer -= 1.0;
            }
        } else if (key === 'defense_mod') {
            target.defense += eff.power;
        } else if (key === 'ghost') {
            target.ignoreWalls = true;
            target.immuneKeywords.add('map');
        } else if (key === 'confuse') {
            target.confused = true;
        } else if (key === 'forced_move') {
            target.isForcedMoving = true;
            const [dx, dy] = eff.direction;
            const len = Math.hypot(dx, dy);
            if (len > 0) {
                target.forcedMoveVec[0] += dx / len * eff.power;
                target.forcedMoveVec[1] += dy / len * eff.power;
            }
        }
    }

    // 슬로우 100 이상이면 이동 불가
    if (hasMaxSlow || target.speedMultiplier <= 0.0) {
        target.speedMultiplier = 0.0;
    }

    const speedMagnitude = Math.max(0.0, Math.abs(target.speedMultiplier));
    target.speedMultiplier = target.confused ? -speedMagnitude : speedMagnitude;

    // 이동 불가 + 침묵이면 기절
    if (hasMaxSlow && target.silenced) {
        target.stunned = true;
    }

    target.cooldownRate = Math.max(0.0, target.cooldownRate);
    target.timeScale = Math.min(1.0, Math.max(0.0, target.timeScale));
    target.defense = Math.min(100.0, Math.max(0.0, target.defense));
}
