import pygame

# ==========================================
# 1. 상태이상 부여 함수들 (외부에서 호출용)
# ==========================================

def slow(target, duration, power):
    """슬로우: power 만큼 이동속도 비율 감소 (power가 100 이상이면 이동 불가)"""
    target.status_effects['slow'] = {'duration': duration, 'power': power}

def speed_up(target, duration, power):
    """속도 증가: power 만큼 이동속도 비율 증가"""
    target.status_effects['speed_up'] = {'duration': duration, 'power': power}

def bind(target, duration):
    """속박: 돌진 키워드 스킬 사용 불가"""
    target.status_effects['bind'] = {'duration': duration}

def silence(target, duration):
    """침묵: 모든 스킬 사용 불가"""
    target.status_effects['silence'] = {'duration': duration}

def time_slow(target, duration, power):
    """시간 감속: 쿨타임 속도 지연 및 time_scale 감소"""
    target.status_effects['time_slow'] = {'duration': duration, 'power': power}

def burn(target, duration, power, immediate_tick=False):
    """화상: 지속시간 동안 초당 power만큼 고정 피해 (중첩 없음 - 이미 화상 중이면 틱 진행은
    유지한 채 지속시간/위력만 갱신한다. 매 프레임 재적용해도 틱 타이머가 계속 리셋되어
    데미지가 아예 안 들어가는 문제를 막기 위함).
    immediate_tick=True면 새로 걸리는 화상의 첫 틱이 1초를 기다리지 않고 즉시 들어간다
    (이미 화상 중이던 걸 갱신할 때는 적용되지 않는다)."""
    existing = target.status_effects.get('burn')
    if existing:
        tick_timer = existing['tick_timer']
    else:
        tick_timer = 1.0 if immediate_tick else 0.0
    target.status_effects['burn'] = {'duration': duration, 'power': power, 'tick_timer': tick_timer}

def bleed(target, duration, power):
    """출혈: 지속시간 동안 초당 power만큼 고정 피해 (중첩 없음, burn과 동일하게 틱 타이머 보존)"""
    existing = target.status_effects.get('bleed')
    tick_timer = existing['tick_timer'] if existing else 0.0
    target.status_effects['bleed'] = {'duration': duration, 'power': power, 'tick_timer': tick_timer}

def defense_mod(target, duration, power):
    """피해 감소 / 무적: power만큼 방어력 증가 (무적 시 power=100)"""
    target.status_effects['defense_mod'] = {'duration': duration, 'power': power}

def forced_move(target, duration, power, direction):
    """강제 이동 (밀치기/그랩)"""
    target.status_effects['forced_move'] = {
        'duration': duration, 
        'power': power, 
        'direction': pygame.math.Vector2(direction) if direction else pygame.math.Vector2(0, 0)
    }

def ghost(target, duration):
    """망령화: 벽 무시 이동. 몸이 반쯔 비물질화된 상태라는 개념이라, 용암/빙판 같은 맵의
    지형 효과('map' 키워드)도 함께 무시한다."""
    target.status_effects['ghost'] = {'duration': duration}

def confuse(target, duration):
    """혼란: 이동 속도와 방향 반전"""
    target.status_effects['confuse'] = {'duration': duration}


# ==========================================
# 2. 매 프레임 상태이상 및 스탯 통합 계산 로직
# ==========================================

def update_status_effects(target, dt_sec):
    if not hasattr(target, 'status_effects'):
        target.status_effects = {}

    # 1. 매 프레임 시작 시 기본값 초기화
    target.speed_multiplier = 1.0
    target.defense = 0.0
    target.cooldown_rate = 1.0
    target.time_scale = 1.0  # 기본 시간 배율 1.0으로 초기화
    target.silenced = False
    target.bound = False
    target.ignore_walls = False 
    target.confused = False
    target.stunned = False  # 기절 플래그 추가
    target.is_forced_moving = False
    target.forced_move_vec = pygame.math.Vector2(0, 0)
    target.immune_keywords = frozenset()

    expired_keys = []
    has_max_slow = False

    # 2. 적용 중인 모든 상태이상 순회 및 연산
    for key, eff in list(target.status_effects.items()):
        eff['duration'] -= dt_sec
        if eff['duration'] <= 0:
            expired_keys.append(key)
            continue

        if key == 'slow':
            target.speed_multiplier -= (eff['power'] / 100.0)
            if eff['power'] >= 100:
                has_max_slow = True
        elif key == 'speed_up':
            target.speed_multiplier += (eff['power'] / 100.0)
        elif key == 'bind':
            target.bound = True
        elif key == 'silence':
            target.silenced = True
        elif key == 'time_slow':
            target.cooldown_rate -= (eff['power'] / 100.0)
            target.time_scale -= (eff['power'] / 100.0)  # 위력만큼 time_scale 감소 반영
        elif key == 'burn' or key == 'bleed':
            eff['tick_timer'] += dt_sec
            if eff['tick_timer'] >= 1.0:
                target.take_damage(eff['power'])
                eff['tick_timer'] -= 1.0
        elif key == 'defense_mod':
            target.defense += eff['power']
        elif key == 'ghost':
            target.ignore_walls = True
            target.immune_keywords |= frozenset({'map'})
        elif key == 'confuse':
            target.confused = True
        elif key == 'forced_move':
            target.is_forced_moving = True
            if eff['direction'].length() > 0:
                target.forced_move_vec += eff['direction'].normalize() * eff['power']

    # 3. 만료된 상태이상 제거
    for key in expired_keys:
        del target.status_effects[key]

    # 4. 슬로우 100 이상일 경우 이동 불가 (속도 배율을 정확히 0으로 고정)
    if has_max_slow or target.speed_multiplier <= 0.0:
        target.speed_multiplier = 0.0

    speed_magnitude = max(0.0, abs(target.speed_multiplier))
    target.speed_multiplier = -speed_magnitude if target.confused else speed_magnitude

    # 5. 슬로우 100(이동 불가)이면서 침묵 상태일 경우 '기절(Stun)' 판정 활성화
    if has_max_slow and target.silenced:
        target.stunned = True

    target.cooldown_rate = max(0.0, target.cooldown_rate)
    target.time_scale = min(1.0, max(0.0, target.time_scale))  # time_scale 범위 제한 (0.0 ~ 1.0)
    target.defense = min(100.0, max(0.0, target.defense))