import sys
import pygame
import math
import random
from utils import check_polygon_collision, get_character_sprite, get_character_thumbnail
from status_effects import silence, slow, forced_move, defense_mod, bind, time_slow, speed_up


# ==========================================
# [최적화] 색이 고정된 풀스크린 틴트/플래시/잔상 서피스를 매 프레임 새로 만들지 않고
# 한 번만 만들어 캐싱해두고, 투명도는 set_alpha()로만 바꿔서 블릿한다.
# ==========================================
_time_field_tint = None
def _get_time_field_tint():
    global _time_field_tint
    if _time_field_tint is None:
        _time_field_tint = pygame.Surface((1280, 720), pygame.SRCALPHA)
        _time_field_tint.fill((100, 200, 255, 12))
    return _time_field_tint


_ult_field_tint = None
def _get_ult_field_tint():
    global _ult_field_tint
    if _ult_field_tint is None:
        _ult_field_tint = pygame.Surface((1280, 720), pygame.SRCALPHA)
        _ult_field_tint.fill((40, 100, 200, 20))
    return _ult_field_tint


_ult_flash_template = None
def _get_ult_flash_template():
    global _ult_flash_template
    if _ult_flash_template is None:
        _ult_flash_template = pygame.Surface((1280, 720), pygame.SRCALPHA)
        _ult_flash_template.fill((255, 40, 40, 255))
    return _ult_flash_template


_ghost_template_cache = {}
def _get_ghost_template(size, color):
    key = (size, color)
    tpl = _ghost_template_cache.get(key)
    if tpl is None:
        tpl = pygame.Surface(size, pygame.SRCALPHA)
        tpl.fill((*color, 255))
        _ghost_template_cache[key] = tpl
    return tpl


# ==========================================
# [가속자 - 기본 공격 탄환] 15x7 크기 (우 -> 좌 순차 발사)
# ==========================================
class AcceleratorBullet:
    def __init__(self, owner, direction, side='left'):
        self.owner = owner
        self.direction = direction
        self.damage = owner.base_atk * 0.5  
        self.speed = 10.0
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 600
        self.hit_players = []
        
        self.width = 15
        self.height = 7
        
        perp_x, perp_y = -direction[1], direction[0]
        side_offset = 12 if side == 'right' else -12  
        
        forward_dist = 20
        self.pos_x = float(owner.rect.centerx + direction[0] * forward_dist + perp_x * side_offset)
        self.pos_y = float(owner.rect.centery + direction[1] * forward_dist + perp_y * side_offset)
        
        self.angle = math.degrees(math.atan2(-direction[1], direction[0]))
        self.start_x = self.pos_x
        self.start_y = self.pos_y
        self.max_range = 300  

    def get_polygon_points(self):
        rad = math.radians(self.angle)
        cos_a, sin_a = math.cos(rad), math.sin(rad)
        
        hw = self.width / 2
        hh = self.height / 2
        local_pts = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
        
        return [
            (self.pos_x + lx * cos_a - ly * sin_a, self.pos_y - (lx * sin_a + ly * cos_a))
            for lx, ly in local_pts
        ]

    def update(self):
        time_scale = getattr(self.owner, 'time_scale', 1.0)
        self.pos_x += self.direction[0] * self.speed * time_scale
        self.pos_y += self.direction[1] * self.speed * time_scale

    def is_expired(self):
        time_over = pygame.time.get_ticks() - self.created_time >= self.lifespan
        out_of_range = math.hypot(self.pos_x - self.start_x, self.pos_y - self.start_y) >= self.max_range
        return time_over or out_of_range

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        return check_polygon_collision(self.get_polygon_points(), target.rect)

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        pts = [(int(p[0]), int(p[1])) for p in self.get_polygon_points()]
        pygame.draw.polygon(surface, (100, 220, 255), pts)
        pygame.draw.polygon(surface, (255, 255, 255), pts, 1)


class AcceleratorBasicManager:
    def __init__(self, owner, direction, attacks_list):
        self.owner = owner
        self.direction = direction
        self.attacks_list = attacks_list
        self.start_time = pygame.time.get_ticks()
        self.left_spawned = False
        self.damage = 0  # [안정성 보완] 속성 누락 방지
        self.hit_players = []

        self.attacks_list.append(AcceleratorBullet(owner, direction, side='right'))

    def update(self):
        now = pygame.time.get_ticks()
        if not self.left_spawned and (now - self.start_time >= 70):
            self.attacks_list.append(AcceleratorBullet(self.owner, self.direction, side='left'))
            self.left_spawned = True

    def is_expired(self):
        return self.left_spawned and (pygame.time.get_ticks() - self.start_time >= 100)

    def collides_with(self, target):
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        pass


class AcceleratorBasicSkill:
    def __init__(self):
        self.name = "Time Bullets"
        self.cooldown = 250
        self.last_used = 0

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(AcceleratorBasicManager(owner, direction, attacks_list))


# ==========================================
# [스킬 1 - 1스킬] 전 맵 시간 지연 필드 (온오프 토글)
# ==========================================
class AcceleratorTimeField:
    def __init__(self, owner, skill_ref):
        self.owner = owner
        self.skill_ref = skill_ref
        self.damage = 0
        self.hit_players = []
        self.force_expire = False
        
        self.afterimages = []
        self.last_afterimage_time = 0

    def update(self):
        now = pygame.time.get_ticks()

        if not self.skill_ref.is_active or getattr(self.owner, 'is_ult_active', False):
            self.force_expire = True
            return

        speed_up(self.owner, 0.3, 20)

        # [최적화] 잔상 생성 간격을 늘리고 유지시간을 줄여 렉 유발 요소인 동시 잔상 개수를 줄임
        if now - self.last_afterimage_time >= 80:
            self.afterimages.append({
                'rect': self.owner.rect.copy(),
                'time': now,
                'color': (100, 220, 255)
            })
            self.last_afterimage_time = now

        self.afterimages = [img for img in self.afterimages if now - img['time'] < 220]

    def is_expired(self):
        return self.force_expire

    def collides_with(self, target):
        # [구조 개선] sys.modules 대신 main.py 루프가 넘겨주는 target에 안전하게 오라 효과 적용
        if target and not getattr(target, 'invincible', False) and target.defense < 100.0:
            time_slow(target, 0.3, 40)
            slow(target, 0.3, 40)
        # 일반 타격 판정/궁극기 게이지 충전 방지를 위해 False 반환
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        surface.blit(_get_time_field_tint(), (0, 0))

        now = pygame.time.get_ticks()
        for img in self.afterimages:
            age = now - img['time']
            alpha = max(0, int(160 * (1.0 - age / 220.0)))
            if alpha <= 0:
                continue

            ghost = _get_ghost_template((img['rect'].width, img['rect'].height), img['color'])
            ghost.set_alpha(alpha)
            surface.blit(ghost, img['rect'].topleft)
            pygame.draw.rect(surface, (220, 245, 255, alpha), img['rect'], 1)


class AcceleratorTimeSkill:
    def __init__(self):
        self.name = "Global Time Dilation"
        self.is_active = False
        self.charge = 0.0       
        self.max_charge = 100.0
        self.cooldown = 400
        self.last_used = 0
        self.owner = None

    def update_charge(self, player, dt_sec):
        if getattr(player, 'is_ult_active', False):
            self.is_active = False

        if self.is_active:
            self.charge += 35.0 * dt_sec  
            if self.charge >= self.max_charge:
                self.charge = 0.0
                self.is_active = False
                player.take_damage(15.0)
                slow(player, 1.5, 100)
                silence(player, 1.5)
        else:
            self.charge -= 40.0 * dt_sec  
            
        self.charge = max(0.0, min(self.max_charge, self.charge))

    def can_use(self):
        if self.owner and getattr(self.owner, 'is_ult_active', False):
            return False
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.owner = owner
        if getattr(owner, 'is_ult_active', False):
            return
            
        self.last_used = pygame.time.get_ticks()
        self.is_active = not self.is_active

        if self.is_active:
            field = AcceleratorTimeField(owner, self)
            attacks_list.append(field)


# ==========================================
# [스킬 2 - 2스킬] 시간 안정화 (체력 회복, 차지 감소 및 궁극기 종료)
# ==========================================
class AcceleratorHealEffect:
    def __init__(self, owner):
        self.owner = owner
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 500  
        self.damage = 0  # [안정성 보완] 속성 누락 방지
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
        elapsed = now - self.created_time
        progress = elapsed / self.lifespan
        
        cx, cy = self.owner.rect.centerx, self.owner.rect.centery
        radius = int(25 + 45 * progress)
        alpha = max(0, int(220 * (1.0 - progress)))
        
        surf = pygame.Surface((radius * 2, radius * 2), pygame.SRCALPHA)
        pygame.draw.circle(surf, (50, 255, 120, alpha), (radius, radius), radius, 4)
        surface.blit(surf, (cx - radius, cy - radius))


class AcceleratorHealSkill:
    def __init__(self):
        self.name = "Time Stabilization"
        self.cooldown = 3000  
        self.last_used = 0
        self.owner = None

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.owner = owner
        self.last_used = pygame.time.get_ticks()
        
        if getattr(owner, 'is_ult_active', False) and hasattr(owner, 'active_ult_field') and owner.active_ult_field:
            owner.active_ult_field.force_expire = True

        time_skill = owner.abilities[1]
        if time_skill and hasattr(time_skill, 'charge'):
            time_skill.charge = max(0.0, time_skill.charge - 45.0)
            
        owner.hp = min(owner.max_hp, owner.hp + 25.0)
        attacks_list.append(AcceleratorHealEffect(owner))


# ==========================================
# [궁극기] 산데비스탄 오버드라이브
# ==========================================
class AcceleratorUltField:
    def __init__(self, owner):
        self.owner = owner
        self.damage = 0
        self.hit_players = []
        self.force_expire = False
        
        self.lifespan = 16000  
        self.start_time = pygame.time.get_ticks()
        self.last_damage_tick = self.start_time
        
        self.damage_interval = 1500  
        self.delay_before_damage = 2500  
        
        self.afterimages = []
        self.last_afterimage_time = 0
        self.flash_timer = 0  

        self.blue_palette = [
            (100, 220, 255),
            (0, 255, 200),
            (50, 150, 255),
            (140, 120, 255),
            (200, 240, 255),
            (0, 120, 255)
        ]

    def update(self):
        if self.force_expire:
            return

        now = pygame.time.get_ticks()
        elapsed = now - self.start_time

        speed_up(self.owner, 0.3, 30)

        # [최적화] 잔상 생성 간격을 늘리고 유지시간을 줄여 렉 유발 요소인 동시 잔상 개수를 줄임
        if now - self.last_afterimage_time >= 50:
            self.afterimages.append({
                'rect': self.owner.rect.copy(),
                'time': now,
                'color': random.choice(self.blue_palette)
            })
            self.last_afterimage_time = now

        self.afterimages = [img for img in self.afterimages if now - img['time'] < 240]

        if elapsed >= self.delay_before_damage:
            if now - self.last_damage_tick >= self.damage_interval:
                self.owner.take_damage(4.0)
                self.last_damage_tick = now
                self.flash_timer = 180  
                self.damage_interval = max(200, self.damage_interval - 150)

        if self.flash_timer > 0:
            self.flash_timer -= 16

    def is_expired(self):
        now = pygame.time.get_ticks()
        if self.force_expire or (now - self.start_time >= self.lifespan):
            self.owner.is_ult_active = False
            if hasattr(self.owner, 'original_base_atk'):
                self.owner.base_atk = self.owner.original_base_atk
            if hasattr(self.owner, 'active_ult_field'):
                delattr(self.owner, 'active_ult_field')
            return True
        return False

    def collides_with(self, target):
        # [구조 개선] 궁극기 오라 감속 효과 적용
        if target and not getattr(target, 'invincible', False) and target.defense < 100.0:
            time_slow(target, 0.3, 50)
            slow(target, 0.3, 50)
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        surface.blit(_get_ult_field_tint(), (0, 0))

        if self.flash_timer > 0:
            flash_alpha = int(100 * (self.flash_timer / 180.0))
            flash_template = _get_ult_flash_template()
            flash_template.set_alpha(flash_alpha)
            surface.blit(flash_template, (0, 0))

        now = pygame.time.get_ticks()
        for img in self.afterimages:
            age = now - img['time']
            alpha = max(0, int(180 * (1.0 - age / 240.0)))
            if alpha <= 0:
                continue

            ghost = _get_ghost_template((img['rect'].width, img['rect'].height), img['color'])
            ghost.set_alpha(alpha)
            surface.blit(ghost, img['rect'].topleft)
            pygame.draw.rect(surface, (255, 255, 255, alpha), img['rect'], 1)


class AcceleratorUltSkill:
    def __init__(self):
        self.name = "Sandevistan Overdrive"
        self.cooldown = 500  # [수정] 100% 게이지 즉시 발동을 위해 이중 잠금 해제
        self.last_used = -99999
        self.keywords = ['ult']
        self.owner = None

    def can_use(self):
        if self.owner and getattr(self.owner, 'is_ult_active', False):
            return False
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.owner = owner
        if getattr(owner, 'is_ult_active', False):
            return
            
        self.last_used = pygame.time.get_ticks()

        time_skill = owner.abilities[1]
        if time_skill:
            time_skill.is_active = False

        owner.is_ult_active = True
        if not hasattr(owner, 'original_base_atk'):
            owner.original_base_atk = owner.base_atk
        owner.base_atk = owner.original_base_atk * 1.3

        ult_field = AcceleratorUltField(owner)
        owner.active_ult_field = ult_field
        attacks_list.append(ult_field)


# ==========================================
# 가속자(Accelerator) 캐릭터 데이터 등록 매핑
# ==========================================
def apply_accelerator(player):
    player.base_atk = 12
    player.max_hp = 100
    player.hp = 100
    player.speed = 4.7
    player.is_accelerator = True
    player.is_ult_active = False
    player.sprite_image, player.sprite_image_flipped = get_character_sprite('accelerator.png')

    time_skill = AcceleratorTimeSkill()
    time_skill.owner = player

    heal_skill = AcceleratorHealSkill()
    heal_skill.owner = player

    ult_skill = AcceleratorUltSkill()
    ult_skill.owner = player
    
    player.abilities = [
        AcceleratorBasicSkill(),    # 평타
        time_skill,                 # 1스킬
        heal_skill,                 # 2스킬
        ult_skill                   # 궁극기
    ]
    
    # [로직/렌더링 분리] update() 단계에서 차지와 과열 상태이상 계산
    original_update = player.update
    def custom_update(dt_sec, keys, attacks_list, color, walls):
        ts = player.abilities[1]
        if ts:
            ts.update_charge(player, dt_sec)
        original_update(dt_sec, keys, attacks_list, color, walls)
    player.update = custom_update

    # [렌더링 전용] UI 바 출력 (player_num 기반 좌표 지정)
    original_draw = player.draw
    def custom_draw(surface):
        original_draw(surface)
        
        ts = player.abilities[1]
        percent = (ts.charge / ts.max_charge) * 100.0 if ts else 0.0
        
        width, height = 20, 200
        y = 100
        x = 20 if getattr(player, 'player_num', 1) == 1 else 1280 - 40
        
        gauge_rect = pygame.Rect(x, y, width, height)
        pygame.draw.rect(surface, (30, 30, 35), gauge_rect)
        pygame.draw.rect(surface, (100, 100, 110), gauge_rect, 1)
        
        pct = max(0.0, min(100.0, percent))
        fill_h = int(height * (pct / 100.0))
        if fill_h > 0:
            fill_rect = pygame.Rect(x + 1, y + height - 1 - fill_h, width - 2, fill_h)
            bar_color = (100, 220, 255) if pct < 80 else (255, 80, 80)
            pygame.draw.rect(surface, bar_color, fill_rect)
            
    player.draw = custom_draw

    def custom_reset():
        player.is_ult_active = False
        if hasattr(player, 'original_base_atk'):
            player.base_atk = player.original_base_atk
        ts = player.abilities[1]
        if ts:
            ts.is_active = False
            ts.charge = 0.0
    player.custom_reset = custom_reset

ACCELERATOR_CHARACTER_DATA = {
    "name": "가속자",
    "desc": "평타: 투사체를 빠르게 쏩니다(6, 2발 연속), 스킬 1: 가속을 하며 상대보다 이동속도가 증가합니다(상대 슬로우/쿨타임 지연 40%), 스킬 2: 체력을 일정 채워주며 가속을 멈출 수 있습니다(25%), 궁극기: 폭주를 하며 대미지와 속도가 증가합니다(각 30%, 상대 슬로우/쿨타임 지연 50%), 스킬 2를 눌러 취소할 수 있습니다",
    "apply": apply_accelerator,
    "get_thumbnail": lambda size=40: get_character_thumbnail('accelerator.png', size)
}