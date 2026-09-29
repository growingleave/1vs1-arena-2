import sys
import pygame
import math
from status_effects import slow
from fonts import get_font

# ==========================================
# 공통 상수 / 헬퍼
# ==========================================
ARROW_TYPES = ['iron', 'explosive', 'slow']
ARROW_COLORS = {
    'iron': (200, 200, 200),
    'explosive': (255, 120, 40),
    'slow': (100, 200, 255),
}
ARROW_LABELS = {
    'iron': '철 화살',
    'explosive': '폭파 화살',
    'slow': '감속 화살',
}

MAX_CHARGE_TIME = 900  # ms, 이 시간 이상 누르고 있으면 최대 충전(100%)

SCREEN_W, SCREEN_H = 1280, 720


def _hits_screen_edge(rect):
    """화면 밖을 벽으로 취급하기 위한 경계 판정"""
    return rect.left < 0 or rect.right > SCREEN_W or rect.top < 0 or rect.bottom > SCREEN_H


def scaled_damage(owner, charge_ratio):
    return owner.base_atk * (0.5 + 1.5 * charge_ratio)


def scaled_size(charge_ratio):
    width = 14 + 14 * charge_ratio
    height = 6 + 6 * charge_ratio
    return width, height


def _build_arrow_surface(length, color, thickness=3):
    """화살대+화살촉+깃 모양의 화살 스프라이트를 만든다 (+x 방향을 향하도록 그린 뒤 회전해서 사용)"""
    length = max(12, int(length))
    thickness = max(2, thickness)
    head_len = max(6, length * 0.3)
    fletch_len = max(5, length * 0.22)

    surf_h = max(10, int(thickness * 4))
    surf = pygame.Surface((length, surf_h), pygame.SRCALPHA)
    mid_y = surf_h / 2

    shaft_start = fletch_len * 0.6
    shaft_end = length - head_len

    # 화살대
    pygame.draw.line(surf, color, (shaft_start, mid_y), (shaft_end, mid_y), int(thickness))

    # 화살촉 (삼각형)
    head_pts = [(length, mid_y), (shaft_end, mid_y - thickness * 1.8), (shaft_end, mid_y + thickness * 1.8)]
    pygame.draw.polygon(surf, color, head_pts)
    pygame.draw.polygon(surf, (255, 255, 255), head_pts, 1)

    # 깃 (뒤쪽 V자 페더)
    pygame.draw.polygon(surf, color, [(0, mid_y - thickness * 1.6), (shaft_start, mid_y), (0, mid_y - 1)])
    pygame.draw.polygon(surf, color, [(0, mid_y + thickness * 1.6), (shaft_start, mid_y), (0, mid_y + 1)])

    return surf


def _draw_bow(surface, center, facing, draw_ratio, limb_color, string_color=(225, 225, 215),
              bow_half=32, forward_offset=18):
    """플레이어 앞쪽으로 내민 위치에 옆으로 넓은 활을 그리고, draw_ratio(0~1)만큼 시위를 당긴
    모습을 표현한다. 화살 노크 위치를 반환."""
    length = math.hypot(facing[0], facing[1])
    if length == 0:
        fx, fy = 1.0, 0.0
    else:
        fx, fy = facing[0] / length, facing[1] / length
    px, py = -fy, fx  # facing에 수직인 축 (활 몸통 방향)

    origin = (center[0] + fx * forward_offset, center[1] + fy * forward_offset)

    bulge = 10

    tip1 = (origin[0] + px * bow_half, origin[1] + py * bow_half)
    tip2 = (origin[0] - px * bow_half, origin[1] - py * bow_half)
    belly = (origin[0] + fx * bulge, origin[1] + fy * bulge)

    arc_points = []
    steps = 8
    for i in range(steps + 1):
        t = i / steps
        bx = (1 - t) ** 2 * tip1[0] + 2 * (1 - t) * t * belly[0] + t ** 2 * tip2[0]
        by = (1 - t) ** 2 * tip1[1] + 2 * (1 - t) * t * belly[1] + t ** 2 * tip2[1]
        arc_points.append((bx, by))
    pygame.draw.lines(surface, limb_color, False, arc_points, 3)

    pull_dist = 20 * draw_ratio
    nock = (origin[0] - fx * pull_dist, origin[1] - fy * pull_dist)
    pygame.draw.line(surface, string_color, tip1, nock, 2)
    pygame.draw.line(surface, string_color, tip2, nock, 2)

    return nock


def _is_skill_key_held(owner, idx):
    """평타(0번 슬롯) 키/버튼이 현재 눌려있는지 키보드+조이콘 모두 확인 (홀드-차징 판정용)"""
    keys = pygame.key.get_pressed()
    held = False

    if hasattr(owner, 'controls') and 'skills' in owner.controls and idx < len(owner.controls['skills']):
        if keys[owner.controls['skills'][idx]]:
            held = True

    if owner.joystick:
        joy = owner.joystick
        joy_name = joy.get_name().lower()
        if getattr(owner, 'is_combined', False):
            if owner.player_num == 1:
                if joy.get_numhats() > 0 and joy.get_hat(0)[1] == 1:
                    held = True
                elif joy.get_numbuttons() > 11 and joy.get_button(11):
                    held = True
            else:
                if idx < joy.get_numbuttons() and joy.get_button(idx):
                    held = True
        else:
            if "(r)" in joy_name or "right" in joy_name:
                if idx < joy.get_numbuttons() and joy.get_button(idx):
                    held = True
            else:
                left_mapping = {0: 4, 1: 5, 2: 14, 3: 15}
                btn = left_mapping.get(idx, 4)
                if joy.get_numbuttons() > btn and joy.get_button(btn):
                    held = True

    return held


# ==========================================
# [궁수 - 폭파 화살 전용] 폭발 이펙트 (직격 2중 데미지 방지용 분리 오브젝트)
# ==========================================
class ArcherExplosion:
    def __init__(self, owner, x, y, damage, radius):
        self.owner = owner
        self.pos_x = x
        self.pos_y = y
        self.damage = damage
        self.radius = radius
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 260
        self.hit_players = []
        self.can_penetrate_walls = True

    def update(self):
        pass

    def is_expired(self):
        return pygame.time.get_ticks() - self.created_time >= self.lifespan

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        dx = target.rect.centerx - self.pos_x
        dy = target.rect.centery - self.pos_y
        return math.hypot(dx, dy) <= self.radius

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        now = pygame.time.get_ticks()
        progress = min(1.0, max(0.0, (now - self.created_time) / self.lifespan))
        curr_radius = max(1, int(self.radius * progress))
        alpha = max(0, int(200 * (1.0 - progress)))

        surf = pygame.Surface((int(self.radius * 2), int(self.radius * 2)), pygame.SRCALPHA)
        pygame.draw.circle(surf, (255, 140, 40, alpha), (int(self.radius), int(self.radius)), curr_radius)
        surface.blit(surf, (int(self.pos_x - self.radius), int(self.pos_y - self.radius)))


# ==========================================
# [궁수 - 평타 화살] 철/폭파/감속 3종 + 벽 튕김(2스킬 연계) 지원
# ==========================================
class ArcherArrow:
    def __init__(self, owner, direction, attacks_list, charge_ratio, arrow_type, bounces=0):
        self.owner = owner
        self.direction = direction
        self.attacks_list = attacks_list
        self.arrow_type = arrow_type
        self.charge_ratio = charge_ratio
        self.bounces_remaining = bounces
        self.hit_players = []
        self.exploded = False

        self.speed = 16.0
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 2000
        # 짧게 차지할수록 사거리도 짧아짐 (풀차지 시 기존 최대 사거리 750 유지)
        self.max_range = 250 + 500 * charge_ratio

        self.width, self.height = scaled_size(charge_ratio)

        # 폭파 화살은 직격 데미지가 없고, 폭발 오브젝트가 데미지를 전담 (2중 데미지 방지)
        self.damage = 0.0 if arrow_type == 'explosive' else scaled_damage(owner, charge_ratio)
        self.explosion_damage = scaled_damage(owner, charge_ratio) * 1.3
        # 폭파 범위: 풀차지 시 기존 최대값(90)을 그대로 최댓값으로 유지, 저차지일수록 더 작게
        self.explosion_radius = 40 + 50 * charge_ratio

        self.pos_x = float(owner.rect.centerx + direction[0] * 22)
        self.pos_y = float(owner.rect.centery + direction[1] * 22)
        self.start_x = self.pos_x
        self.start_y = self.pos_y
        self.angle = math.degrees(math.atan2(-direction[1], direction[0]))

        # 벽 충돌은 이 클래스가 직접 처리(튕김/최종 폭발)하므로 공용 벽 충돌 시스템은 건너뜀
        self.can_penetrate_walls = True

    def get_rect(self):
        return pygame.Rect(int(self.pos_x - self.width / 2), int(self.pos_y - self.height / 2),
                            max(1, int(self.width)), max(1, int(self.height)))

    def explode(self):
        if self.exploded:
            return
        self.exploded = True
        self.lifespan = 0
        if self.attacks_list is not None:
            self.attacks_list.append(ArcherExplosion(self.owner, self.pos_x, self.pos_y,
                                                       self.explosion_damage, self.explosion_radius))

    def _register_wall_hit(self):
        if self.arrow_type == 'explosive':
            # [핵심] 튕길 차례가 남아있지 않은, 최종으로 벽에 맞았을 때만 폭발
            if self.bounces_remaining > 0:
                self.bounces_remaining -= 1
            else:
                self.explode()
        else:
            if self.bounces_remaining > 0:
                self.bounces_remaining -= 1
            else:
                self.lifespan = 0

    def update(self):
        if self.exploded:
            return

        time_scale = getattr(self.owner, 'time_scale', 1.0)
        dx = self.direction[0] * self.speed * time_scale
        dy = self.direction[1] * self.speed * time_scale

        main_module = sys.modules.get('__main__')
        walls = getattr(main_module, 'walls', []) if main_module else []

        hit_wall = False

        self.pos_x += dx
        rect = self.get_rect()
        if _hits_screen_edge(rect) or any(rect.colliderect(wall.rect) for wall in walls):
            self.pos_x -= dx
            self.direction = (-self.direction[0], self.direction[1])
            hit_wall = True

        self.pos_y += dy
        rect = self.get_rect()
        if _hits_screen_edge(rect) or any(rect.colliderect(wall.rect) for wall in walls):
            self.pos_y -= dy
            self.direction = (self.direction[0], -self.direction[1])
            hit_wall = True

        self.angle = math.degrees(math.atan2(-self.direction[1], self.direction[0]))

        if hit_wall:
            self._register_wall_hit()

    def is_expired(self):
        if self.exploded:
            return True

        time_over = pygame.time.get_ticks() - self.created_time >= self.lifespan
        out_of_range = math.hypot(self.pos_x - self.start_x, self.pos_y - self.start_y) >= self.max_range

        if out_of_range and self.arrow_type == 'explosive' and not self.exploded:
            self.explode()
            return True

        return time_over or out_of_range

    def collides_with(self, target):
        if self.exploded:
            return False
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        if not self.get_rect().colliderect(target.rect):
            return False

        if self.arrow_type == 'explosive':
            # 플레이어 직격 시에도 폭발로 처리 (직접 데미지는 0)
            self.explode()
            return False

        return True

    def apply_effect(self, target):
        if self.arrow_type == 'slow':
            # 기존 고정 40%보다 최댓값을 끌어올려, 풀차지 시 훨씬 강하게 감속
            slow(target, 1.6, 20 + 45 * self.charge_ratio)
        self.lifespan = 0  # 단발 화살(철/감속)은 적중 시 소멸

    def draw(self, surface):
        if self.exploded:
            return
        color = ARROW_COLORS.get(self.arrow_type, (200, 200, 200))
        visual_len = 22 + 18 * self.charge_ratio
        thickness = 2 + 2 * self.charge_ratio

        arrow_surf = _build_arrow_surface(visual_len, color, thickness)
        rotated = pygame.transform.rotate(arrow_surf, self.angle)
        rect = rotated.get_rect(center=(int(self.pos_x), int(self.pos_y)))
        surface.blit(rotated, rect.topleft)


# ==========================================
# [궁수 - 평타] 홀드 차징 매니저 (놓는 순간 발사)
# ==========================================
class ArcherChargeManager:
    def __init__(self, owner, attacks_list, color):
        self.owner = owner
        self.attacks_list = attacks_list
        self.color = color
        self.start_time = pygame.time.get_ticks()
        self.damage = 0
        self.hit_players = []

        owner.archer_charging = True
        owner.archer_charge_ratio = 0.0

    def update(self):
        elapsed = pygame.time.get_ticks() - self.start_time
        ratio = min(1.0, elapsed / MAX_CHARGE_TIME)
        self.owner.archer_charge_ratio = ratio

        # 차징이 진행될수록 셀프 슬로우가 점점 강해짐 (최대 60%), 놓으면 곧 풀림
        slow(self.owner, 0.15, 60.0 * ratio)

    def _fire(self):
        charge_ratio = getattr(self.owner, 'archer_charge_ratio', 0.0)
        arrow_type = getattr(self.owner, 'archer_arrow_type', 'iron')
        direction = self.owner.facing

        if getattr(self.owner, 'archer_triple_shot_pending', False):
            self.owner.archer_triple_shot_pending = False
            base_angle = math.atan2(direction[1], direction[0])
            for offset_deg in (-12, 0, 12):
                angle = base_angle + math.radians(offset_deg)
                d = (math.cos(angle), math.sin(angle))
                self.attacks_list.append(ArcherArrow(self.owner, d, self.attacks_list, charge_ratio, arrow_type, bounces=3))
        else:
            self.attacks_list.append(ArcherArrow(self.owner, direction, self.attacks_list, charge_ratio, arrow_type, bounces=0))

    def is_expired(self):
        if _is_skill_key_held(self.owner, 0):
            return False

        self._fire()
        self.owner.archer_charging = False
        self.owner.archer_charge_ratio = 0.0
        return True

    def collides_with(self, target):
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        pass


class ArcherBasicSkill:
    def __init__(self, owner=None):
        self.owner = owner
        self.name = "Charged Shot"
        self.cooldown = 400
        self.last_used = 0
        self.keywords = ['projectile']

    def can_use(self):
        if self.owner and getattr(self.owner, 'archer_charging', False):
            return False
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.owner = owner
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(ArcherChargeManager(owner, attacks_list, color))


# ==========================================
# [궁수 - 1스킬] 화살 종류 전환 (철 -> 폭파 -> 감속 순환)
# ==========================================
class ArcherSwitchArrowSkill:
    def __init__(self):
        self.name = "Switch Arrow"
        self.cooldown = 350
        self.last_used = 0
        self.keywords = ['buff']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        current = getattr(owner, 'archer_arrow_type', 'iron')
        idx = ARROW_TYPES.index(current)
        owner.archer_arrow_type = ARROW_TYPES[(idx + 1) % len(ARROW_TYPES)]
        owner.archer_switch_timer = pygame.time.get_ticks()


# ==========================================
# [궁수 - 2스킬] 다음 평타 3연사 + 벽 튕김(3회) 부여
# ==========================================
class ArcherTripleShotSkill:
    def __init__(self):
        self.name = "Triple Volley"
        self.cooldown = 6000
        self.last_used = 0
        self.keywords = ['buff']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        owner.archer_triple_shot_pending = True


# ==========================================
# [최적화] 유도 화살은 모양이 항상 동일(길이/색/두께 고정)하므로 매 프레임 새로 그리지 않고
# 기본 스프라이트 1장만 만들어 두고, 회전 각도는 6도 단위로 캐싱해서 재사용한다.
# ==========================================
_ult_arrow_base = None
def _get_ult_arrow_base():
    global _ult_arrow_base
    if _ult_arrow_base is None:
        _ult_arrow_base = _build_arrow_surface(26, (255, 215, 0), 3)
    return _ult_arrow_base


_ult_arrow_glow = None
def _get_ult_arrow_glow():
    global _ult_arrow_glow
    if _ult_arrow_glow is None:
        _ult_arrow_glow = pygame.Surface((28, 28), pygame.SRCALPHA)
        pygame.draw.circle(_ult_arrow_glow, (255, 215, 0, 70), (14, 14), 14)
    return _ult_arrow_glow


_ult_arrow_rotated_cache = {}
def _get_ult_arrow_rotated(angle):
    bucket = round(angle / 6) * 6 % 360
    rotated = _ult_arrow_rotated_cache.get(bucket)
    if rotated is None:
        rotated = pygame.transform.rotate(_get_ult_arrow_base(), bucket)
        _ult_arrow_rotated_cache[bucket] = rotated
    return rotated


# ==========================================
# [궁수 - 궁극기] 전방 120도 부채꼴 유도 화살
# ==========================================
class ArcherHomingArrow:
    def __init__(self, owner, direction, damage):
        self.owner = owner
        self.direction = direction
        self.damage = damage
        self.speed = 8.5
        self.turn_rate = 3.0  # 프레임당 최대 회전각(도)
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 2500
        self.hit_players = []

        self.width = 16
        self.height = 8
        self.pos_x = float(owner.rect.centerx + direction[0] * 25)
        self.pos_y = float(owner.rect.centery + direction[1] * 25)
        self.angle = math.degrees(math.atan2(-direction[1], direction[0]))

        # 벽 충돌은 직접 처리(공용 시스템 건너뜀) - 튕기지 않고 즉시 소멸
        self.can_penetrate_walls = True

        self.target = getattr(owner, 'opponent', None)

    def get_rect(self):
        return pygame.Rect(int(self.pos_x - self.width / 2), int(self.pos_y - self.height / 2), self.width, self.height)

    def update(self):
        if self.target and getattr(self.target, 'hp', 0) > 0:
            to_x = self.target.rect.centerx - self.pos_x
            to_y = self.target.rect.centery - self.pos_y
            if to_x != 0 or to_y != 0:
                desired_angle = math.degrees(math.atan2(to_y, to_x))
                cur_angle = math.degrees(math.atan2(self.direction[1], self.direction[0]))
                diff = (desired_angle - cur_angle + 180) % 360 - 180
                turn = max(-self.turn_rate, min(self.turn_rate, diff))
                new_angle = math.radians(cur_angle + turn)
                self.direction = (math.cos(new_angle), math.sin(new_angle))

        time_scale = getattr(self.owner, 'time_scale', 1.0)
        self.pos_x += self.direction[0] * self.speed * time_scale
        self.pos_y += self.direction[1] * self.speed * time_scale
        self.angle = math.degrees(math.atan2(-self.direction[1], self.direction[0]))

        main_module = sys.modules.get('__main__')
        walls = getattr(main_module, 'walls', []) if main_module else []
        rect = self.get_rect()
        if _hits_screen_edge(rect) or any(rect.colliderect(wall.rect) for wall in walls):
            self.lifespan = 0  # 벽(화면 밖 포함)에 막히면 즉시 소멸 (튕기지 않음)

    def is_expired(self):
        return pygame.time.get_ticks() - self.created_time >= self.lifespan

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        return self.get_rect().colliderect(target.rect)

    def apply_effect(self, target):
        self.lifespan = 0

    def draw(self, surface):
        surface.blit(_get_ult_arrow_glow(), (int(self.pos_x - 14), int(self.pos_y - 14)))

        rotated = _get_ult_arrow_rotated(self.angle)
        rect = rotated.get_rect(center=(int(self.pos_x), int(self.pos_y)))
        surface.blit(rotated, rect.topleft)


# ==========================================
# [최적화] 화면 전체가 아니라 시전자 주변의 작은 영역만 그리는 캐시 서피스 재사용
# ==========================================
_CAST_EFFECT_BOX = 240

_cast_effect_overlay = None
def _get_cast_effect_overlay():
    global _cast_effect_overlay
    if _cast_effect_overlay is None:
        _cast_effect_overlay = pygame.Surface((_CAST_EFFECT_BOX, _CAST_EFFECT_BOX), pygame.SRCALPHA)
    else:
        _cast_effect_overlay.fill((0, 0, 0, 0))
    return _cast_effect_overlay


# ==========================================
# [궁수 - 궁극기 연출] 대형 활 시전 이펙트 (피해 없음, 순수 시각효과)
# ==========================================
class ArcherUltCastEffect:
    def __init__(self, owner, direction):
        self.owner = owner
        self.direction = direction
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 350
        self.damage = 0
        self.hit_players = []

    def update(self):
        pass

    def is_expired(self):
        return pygame.time.get_ticks() - self.created_time >= self.lifespan

    def collides_with(self, target):
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        now = pygame.time.get_ticks()
        progress = min(1.0, (now - self.created_time) / self.lifespan)
        draw_ratio = max(0.0, 1.0 - progress * 1.6)  # 최대로 당겼다가 빠르게 놓는 연출
        alpha = max(0, int(255 * (1.0 - progress)))

        fx = max(-1.0, min(1.0, self.direction[0]))
        fy = max(-1.0, min(1.0, self.direction[1]))
        center = self.owner.rect.center

        half = _CAST_EFFECT_BOX // 2
        local_center = (half, half)
        overlay = _get_cast_effect_overlay()

        glow_r = int(34 * (1.0 - progress * 0.5))
        pygame.draw.circle(overlay, (255, 215, 0, int(90 * (1.0 - progress))), local_center, glow_r)

        _draw_bow(overlay, local_center, (fx, fy), draw_ratio,
                  (255, 215, 0, alpha), string_color=(255, 255, 255, alpha))

        surface.blit(overlay, (center[0] - half, center[1] - half))


class ArcherUltSkill:
    def __init__(self):
        self.name = "Arrow Storm"
        self.cooldown = 500  # 궁극기 100% 게이지 즉시 발동
        self.last_used = -99999
        self.ult_charge_rate = 3.0
        self.keywords = ['ult', 'projectile']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()

        attacks_list.append(ArcherUltCastEffect(owner, direction))

        base_angle = math.atan2(direction[1], direction[0])
        spread_deg = [-60, -30, 0, 30, 60]  # 전방 120도에 균등 분산
        damage = owner.base_atk * 0.6

        for offset_deg in spread_deg:
            angle = base_angle + math.radians(offset_deg)
            d = (math.cos(angle), math.sin(angle))
            attacks_list.append(ArcherHomingArrow(owner, d, damage))


# ==========================================
# 궁수(Archer) 캐릭터 데이터 등록 매핑
# ==========================================
def apply_archer(player):
    player.max_hp = 95
    player.hp = player.max_hp
    player.base_atk = 13
    player.speed = 4.5
    player.is_archer = True

    player.archer_arrow_type = 'iron'
    player.archer_charging = False
    player.archer_charge_ratio = 0.0
    player.archer_triple_shot_pending = False
    player.archer_switch_timer = 0

    basic_skill = ArcherBasicSkill(player)

    player.abilities = [
        basic_skill,               # 평타 (홀드 차징 사격)
        ArcherSwitchArrowSkill(),  # 1스킬 (화살 전환)
        ArcherTripleShotSkill(),   # 2스킬 (3연사 + 벽 튕김 부여)
        ArcherUltSkill(),          # 궁극기 (부채꼴 유도 화살)
    ]

    if len(player.abilities) >= 4 and hasattr(player.abilities[3], 'ult_charge_rate'):
        player.ult_charge_rate = player.abilities[3].ult_charge_rate

    original_draw = player.draw

    def custom_draw(surface):
        original_draw(surface)

        # 차징 게이지: 플레이어 옆에 세로 바로 표시, 화살 종류 색으로 채워짐
        if getattr(player, 'archer_charging', False):
            ratio = getattr(player, 'archer_charge_ratio', 0.0)
            bar_w, bar_h = 8, 44
            gauge_x = player.rect.right + 8
            gauge_y = player.rect.centery - bar_h // 2

            gauge_rect = pygame.Rect(gauge_x, gauge_y, bar_w, bar_h)
            pygame.draw.rect(surface, (30, 30, 35), gauge_rect)
            pygame.draw.rect(surface, (200, 200, 200), gauge_rect, 1)

            fill_h = int(bar_h * ratio)
            if fill_h > 0:
                fill_rect = pygame.Rect(gauge_x, gauge_y + bar_h - fill_h, bar_w, fill_h)
                gauge_color = ARROW_COLORS.get(getattr(player, 'archer_arrow_type', 'iron'), (200, 200, 200))
                pygame.draw.rect(surface, gauge_color, fill_rect)

            # 활 시각 효과: 차징 비율만큼 시위를 당기고, 시위에 걸린 화살을 보여줌
            arrow_color = ARROW_COLORS.get(getattr(player, 'archer_arrow_type', 'iron'), (200, 200, 200))
            nock = _draw_bow(surface, player.rect.center, player.facing, ratio, (120, 80, 40))
            fx, fy = player.facing
            tip_dist = 16 + 10 * ratio

            if getattr(player, 'archer_triple_shot_pending', False):
                # 2스킬(3연사) 대기 중: 시위에 화살 3발이 걸린 모습으로 예고
                base_angle = math.atan2(fy, fx)
                for offset_deg in (-12, 0, 12):
                    angle = base_angle + math.radians(offset_deg)
                    adx, ady = math.cos(angle), math.sin(angle)
                    arrow_tip = (nock[0] + adx * tip_dist, nock[1] + ady * tip_dist)
                    pygame.draw.line(surface, arrow_color, nock, arrow_tip, 3)
            else:
                arrow_tip = (nock[0] + fx * tip_dist, nock[1] + fy * tip_dist)
                pygame.draw.line(surface, arrow_color, nock, arrow_tip, 3)

        # 화살 전환 피드백 텍스트
        if pygame.time.get_ticks() - getattr(player, 'archer_switch_timer', 0) < 700:
            font = get_font(18, bold=True)
            label = ARROW_LABELS.get(getattr(player, 'archer_arrow_type', 'iron'), '')
            text_surf = font.render(label, True, (255, 255, 255))
            text_rect = text_surf.get_rect(center=(player.rect.centerx, player.rect.top - 20))
            surface.blit(text_surf, text_rect)

    player.draw = custom_draw

    def custom_reset():
        player.is_archer = False
        player.archer_arrow_type = 'iron'
        player.archer_charging = False
        player.archer_charge_ratio = 0.0
        player.archer_triple_shot_pending = False
        player.archer_switch_timer = 0

    player.custom_reset = custom_reset


ARCHER_CHARACTER_DATA = {
    "name": "궁수",
    "desc": "평타: 활을 쏩니다(최대 26, 최소 7), 스킬 1: 화살 종류를 바꿀 수 있습니다(감속 화살, 폭발 화살, 철 화살), 스킬 2: 화살을 3개로 바꿔주고 벽에 닿으면 3번 튕깁니다, 궁극기: 부채꼴로 유도 화살 5개를 쏩니다(한발당 8)",
    "apply": apply_archer
}
