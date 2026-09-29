import os
import pygame
import math
from utils import check_polygon_collision
from status_effects import slow, speed_up, silence, ghost

# [최적화] 캐릭터 이미지(정방향/좌우반전)는 최초 1회만 로드/스케일링해서 캐싱 (매 프레임 로드/반전 시 렉 유발)
_MAGE_IMAGE_CACHE = None
_MAGE_IMAGE_FLIPPED_CACHE = None
def _get_mage_images(size=44):
    global _MAGE_IMAGE_CACHE, _MAGE_IMAGE_FLIPPED_CACHE
    if _MAGE_IMAGE_CACHE is None:
        img_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'images', 'mage.png')
        raw = pygame.image.load(img_path).convert_alpha()
        # 원본 캔버스에 투명 여백이 많고 배경 제거 과정에서 남은 미세한 알파 잔여물이
        # 있어 기본 임계값(1)으로는 크롭이 안 되므로, 임계값을 높여 실제 그림 영역만 잡는다
        bbox = raw.get_bounding_rect(16)
        cropped = raw.subsurface(bbox)
        _MAGE_IMAGE_CACHE = pygame.transform.smoothscale(cropped, (size, size))
        _MAGE_IMAGE_FLIPPED_CACHE = pygame.transform.flip(_MAGE_IMAGE_CACHE, True, False)
    return _MAGE_IMAGE_CACHE, _MAGE_IMAGE_FLIPPED_CACHE


# [최적화] 캐릭터 선택 화면 팻말/VS 화면용 썸네일도 크기별로 한 번만 만들어서 캐싱
# (크기를 키만으로 캐싱하면 이전에 다른 크기로 호출된 캐시가 그대로 반환되어 커지지 않으므로
# size별로 따로 캐싱한다)
_MAGE_THUMBNAIL_CACHE = {}
def get_mage_thumbnail(size=40):
    if size not in _MAGE_THUMBNAIL_CACHE:
        img_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'images', 'mage.png')
        raw = pygame.image.load(img_path).convert_alpha()
        bbox = raw.get_bounding_rect(16)
        cropped = raw.subsurface(bbox)
        _MAGE_THUMBNAIL_CACHE[size] = pygame.transform.smoothscale(cropped, (size, size))
    return _MAGE_THUMBNAIL_CACHE[size]

# ==========================================
# [마법사 - 투사체] 평타 & 관통 레이저 펄스
# ==========================================

# [최적화] 매 프레임 풀스크린 서피스를 새로 만들지 않고, 한 번 만든 버퍼를 지우고 재사용
_pulse_overlay = None
def _get_pulse_overlay(size):
    global _pulse_overlay
    if _pulse_overlay is None or _pulse_overlay.get_size() != size:
        _pulse_overlay = pygame.Surface(size, pygame.SRCALPHA)
    else:
        _pulse_overlay.fill((0, 0, 0, 0))
    return _pulse_overlay


class MageEnergyPulse:
    def __init__(self, owner, direction, owner_color, can_penetrate_walls=False, damage_mult=1.3, speed=60, color=(100, 220, 255), max_trail=45, apply_slow=False, max_range=None):
        self.owner = owner
        self.direction = direction
        self.color = color
        self.damage = owner.base_atk * damage_mult
        self.speed = speed
        
        self.width = 40 if can_penetrate_walls else 14
        self.height = self.width
        self.angle = math.degrees(math.atan2(-direction[1], direction[0]))

        self.pos_x = float(owner.rect.centerx)
        self.pos_y = float(owner.rect.centery)
        
        self.start_x = self.pos_x
        self.start_y = self.pos_y
        self.max_range = max_range  
        
        self.hit_players = []
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 2000  
        
        self.can_penetrate_walls = can_penetrate_walls  
        self.apply_slow = apply_slow

        self.positions = []
        self.max_trail = max_trail  
        for _ in range(self.max_trail):
            self.positions.append((self.pos_x, self.pos_y))

    def get_polygon_points(self):
        rad = math.radians(self.angle)
        cos_a = math.cos(rad)
        sin_a = math.sin(rad)

        hw = self.width / 2
        hh = self.height / 2

        local_pts = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
        world_pts = []
        for lx, ly in local_pts:
            rx = lx * cos_a - ly * sin_a
            ry = -(lx * sin_a + ly * cos_a)
            world_pts.append((self.pos_x + rx, self.pos_y + ry))
        return world_pts

    def update(self):
        # [수정] time_scale 연동 (시간 지연 / 가속 정상 반영)
        time_scale = getattr(self.owner, 'time_scale', 1.0)
        self.pos_x += self.direction[0] * self.speed * time_scale
        self.pos_y += self.direction[1] * self.speed * time_scale
        
        if hasattr(self, 'positions') and len(self.positions) > 0:
            self.positions.pop(0)
            self.positions.append((self.pos_x, self.pos_y))

    def is_expired(self):
        out_of_bounds = (self.pos_x < -100 or self.pos_x > 1380 or self.pos_y < -100 or self.pos_y > 820)
        time_over = (pygame.time.get_ticks() - self.created_time >= self.lifespan)
        
        range_over = False
        if self.max_range is not None:
            dist_sq = (self.pos_x - self.start_x)**2 + (self.pos_y - self.start_y)**2
            if dist_sq >= self.max_range**2:
                range_over = True

        return out_of_bounds or time_over or range_over

    def collides_with(self, target_player):
        if target_player == self.owner or getattr(target_player, 'invincible', False) or target_player.defense >= 100.0:
            return False

        hit_box_size = 32 if self.can_penetrate_walls else 16
        # [최적화] 궤적 점들이 촘촘히 붙어 있으므로 한 칸씩 건너뛰어 검사해도 판정 정확도는 거의 그대로 유지됨
        step = 2 if len(self.positions) > 20 else 1
        for px, py in self.positions[::step]:
            point_rect = pygame.Rect(px - hit_box_size // 2, py - hit_box_size // 2, hit_box_size, hit_box_size)
            if point_rect.colliderect(target_player.rect):
                return True
        return False

    def apply_effect(self, target):
        if self.apply_slow:
            slow(target, 1.5, 25)
        # [수정] 관통기가 아닌 일반 평타 투사체는 적중 시 소멸
        if not self.can_penetrate_walls:
            self.lifespan = 0

    def draw(self, surface):
        if len(self.positions) < 2:
            return

        streak_surf = _get_pulse_overlay(surface.get_size())

        n = len(self.positions)
        # [최적화] 궤적 점 2개씩 건너뛰며 선을 이어 그려서 draw.line 호출 수를 절반으로 줄임
        # (점 간격이 촘촘해서 결과물은 기존과 거의 동일하게 보임)
        step = 2 if n > 20 else 1
        for i in range(0, n - step, step):
            p1 = self.positions[i]
            p2 = self.positions[i + step]

            alpha = int(255 * ((i + step) / n))
            line_color = (*self.color[:3], alpha)

            base_w = 10 if self.can_penetrate_walls else 3
            line_width = int(base_w + (12 if self.can_penetrate_walls else 3) * ((i + step) / n))

            pygame.draw.line(streak_surf, line_color, p1, p2, line_width)
            
        head_radius = 18 if self.can_penetrate_walls else 6
        pygame.draw.circle(streak_surf, (255, 255, 255, 255), (int(self.pos_x), int(self.pos_y)), head_radius)
        surface.blit(streak_surf, (0, 0))


# ==========================================
# [마법사 - 궁극기 매니저] 3연속 조준 저격 & 망령화
# ==========================================
class SniperUltManager:
    def __init__(self, owner, color):
        self.owner = owner
        self.color = color
        self.shots_remaining = 3  
        self.phase = 1            
        self.phase_start_time = pygame.time.get_ticks()
        self.expired = False
        self.can_penetrate_walls = True
        self.hit_players = []
        self.damage = 0  # [수정] 초기 damage 선언 (AttributeError 방지)
        
        self.radius = 85  
        self.last_key_down = True  # 초기 시전 키 눌림 중복 방지

        self.original_charge_rate = getattr(owner, 'ult_charge_rate', 8.0)
        owner.ult_charge_rate = 0.0

        self.owner.invincible = True
        self.owner.is_sniper_form = True
        
        silence(self.owner, 15.0)
        ghost(self.owner, 15.0)

    def trigger_shot(self):
        if self.phase == 1:
            self.phase = 2
            self.phase_start_time = pygame.time.get_ticks()
            slow(self.owner, 0.5, 100)

    def update(self):
        if getattr(self.owner, 'hp', 1) <= 0:
            self.finish()
            return

        # [수정] 궁극기 상태 중 수동 즉시 발사(궁극기 키 재입력) 감지
        keys = pygame.key.get_pressed()
        ult_key = None
        if hasattr(self.owner, 'controls') and 'skills' in self.owner.controls and len(self.owner.controls['skills']) > 3:
            ult_key = self.owner.controls['skills'][3]

        key_down = False
        if ult_key is not None and keys[ult_key]:
            key_down = True

        # 조이스틱 궁극기 입력 확인
        if self.owner.joystick:
            joy = self.owner.joystick
            joy_name = joy.get_name().lower()
            if getattr(self.owner, 'is_combined', False):
                if self.owner.player_num == 1:
                    if joy.get_numhats() > 0 and joy.get_hat(0)[0] == 1: key_down = True
                    elif joy.get_numbuttons() > 14 and joy.get_button(14): key_down = True
                else:
                    if joy.get_numbuttons() > 3 and joy.get_button(3): key_down = True
            else:
                if "(r)" in joy_name or "right" in joy_name:
                    if joy.get_numbuttons() > 3 and joy.get_button(3): key_down = True
                else:
                    if joy.get_numbuttons() > 15 and joy.get_button(15): key_down = True

        if not self.last_key_down and key_down:
            self.trigger_shot()
        self.last_key_down = key_down

        current_time = pygame.time.get_ticks()
        elapsed = current_time - self.phase_start_time

        if self.phase == 1:
            self.damage = 0
            if elapsed >= 3000:  
                self.phase = 2
                self.phase_start_time = current_time
                slow(self.owner, 0.5, 100)
        elif self.phase == 2:
            self.damage = 0
            if elapsed >= 500:   
                self.phase = 3
                self.damage = self.owner.base_atk * 2.0  
                self.phase_start_time = current_time
        elif self.phase == 3:
            if elapsed >= 200:   
                self.shots_remaining -= 1
                if self.shots_remaining > 0:
                    self.phase = 1
                    self.damage = 0
                    self.phase_start_time = current_time
                    self.hit_players = []  
                else:
                    self.finish()

    def finish(self):
        self.owner.invincible = False
        self.owner.is_sniper_form = False
        self.owner.ult_charge_rate = self.original_charge_rate  
        
        if hasattr(self.owner, 'status_effects'):
            self.owner.status_effects.pop('silence', None)
            self.owner.status_effects.pop('ghost', None)
        self.owner.silenced = False
            
        self.expired = True

    def is_expired(self):
        return self.expired

    def collides_with(self, target_player):
        if self.phase != 3 or target_player == self.owner:
            return False
        if getattr(target_player, 'invincible', False) or target_player.defense >= 100.0:
            return False
        cx, cy = self.owner.rect.center
        dist_sq = (target_player.rect.centerx - cx)**2 + (target_player.rect.centery - cy)**2
        return dist_sq <= self.radius**2

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        if self.expired:
            return

        cx, cy = self.owner.rect.center
        current_time = pygame.time.get_ticks()
        ind_surf = pygame.Surface((surface.get_width(), surface.get_height()), pygame.SRCALPHA)

        if self.phase == 2:
            pulse_val = (math.sin(current_time * 0.02) + 1) * 0.5
            warn_alpha = int(180 + 75 * pulse_val)
            pygame.draw.circle(ind_surf, (140, 100, 255, warn_alpha), (cx, cy), self.radius)
            pygame.draw.circle(ind_surf, (100, 220, 255, 220), (cx, cy), int(self.radius * 0.5))
            pygame.draw.circle(ind_surf, (200, 150, 255, 255), (cx, cy), self.radius, 4)
        elif self.phase == 3:
            pygame.draw.circle(ind_surf, (180, 120, 255, 200), (cx, cy), self.radius)
            pygame.draw.circle(ind_surf, (100, 220, 255, 220), (cx, cy), int(self.radius * 0.7))
            pygame.draw.circle(ind_surf, (255, 255, 255, 255), (cx, cy), int(self.radius * 0.35))
        else:
            pulse = (math.sin(current_time * 0.015) + 1) * 0.5
            current_r = int(self.radius * (0.9 + 0.1 * pulse))
            pygame.draw.circle(ind_surf, (100, 220, 255, 180), (cx, cy), current_r, 2)
            pygame.draw.circle(ind_surf, (180, 120, 255, 120), (cx, cy), int(current_r * 0.4), 1)
            length = current_r + 8
            pygame.draw.line(ind_surf, (100, 220, 255, 220), (cx - length, cy), (cx + length, cy), 2)
            pygame.draw.line(ind_surf, (100, 220, 255, 220), (cx, cy - length), (cx, cy + length), 2)

        surface.blit(ind_surf, (0, 0))


# ==========================================
# 스킬 클래스들
# ==========================================
class MageGhostSkill:
    def __init__(self):
        self.name = "Aether Walk"
        self.cooldown = 5000
        self.last_used = 0
        self.keywords = ['buff']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        if self.can_use():
            self.last_used = pygame.time.get_ticks()
            ghost(owner, 2.0)  # 망령화 자체에 맵 지형 효과 면역이 포함되어 있다
            speed_up(owner, 2.0, 30)


class MageUltSkill:
    def __init__(self):
        self.name = "Triple Sniper"
        self.cooldown = 500  # 궁극기 즉시 발동
        self.last_used = -99999
        self.ult_charge_rate = 8.0
        self.keywords = ['ult', 'projectile']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        manager = SniperUltManager(owner, color)
        attacks_list.append(manager)


class MageBasicSkillRunner:
    def __init__(self):
        self.name = "Tracer Beam"
        self.cooldown = 500
        self.last_used = 0
        self.keywords = ['projectile']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        if self.can_use():
            owner.cast_timer = 0.1  
            
            def execute_pulse():
                self.last_used = pygame.time.get_ticks()
                pulse = MageEnergyPulse(
                    owner, direction, color, 
                    can_penetrate_walls=False, damage_mult=1.0, speed=45, 
                    color=(100, 220, 255), max_trail=40, apply_slow=False,
                    max_range=800  
                )
                attacks_list.append(pulse)

            owner.pending_action = execute_pulse


class MageLaserSkillRunner:
    def __init__(self):
        self.name = "Penetrating Pulse"
        self.cooldown = 2200
        self.last_used = 0
        self.keywords = ['projectile']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        if self.can_use():
            owner.cast_timer = 0.4  
            
            def execute_pulse():
                self.last_used = pygame.time.get_ticks()
                pulse = MageEnergyPulse(
                    owner, direction, color, 
                    can_penetrate_walls=True, damage_mult=2.0, speed=55, 
                    color=(180, 120, 255), max_trail=55, apply_slow=True,
                    max_range=None  
                )
                attacks_list.append(pulse)

            owner.pending_action = execute_pulse


# [최적화] 방향 표시용 막대 모양도 최초 1회만 그려서 캐싱 (매 프레임 다시 그리면 렉 유발).
# 오른쪽(각도 0)을 기준으로 그려두고, 실제 사용 시 player.facing 각도만큼 회전시켜 붙인다.
_MAGE_DOT_TEMPLATE = None
def _get_mage_dot_template():
    global _MAGE_DOT_TEMPLATE
    if _MAGE_DOT_TEMPLATE is None:
        rod_length = 26
        candy_radius = 9
        half_w = rod_length + 3
        half_h = candy_radius + 2
        w, h = half_w * 2, half_h * 2
        cx, cy = half_w, half_h  # 사탕(=플레이어 기준 가장 먼 지점)을 서피스 정중앙에 둔다

        raw = pygame.Surface((w, h), pygame.SRCALPHA)

        # 막대 (갈색): 사탕에서 캐릭터 쪽(왼쪽)으로 뻗는다
        pygame.draw.line(raw, (120, 70, 35), (cx, cy), (cx - rod_length, cy), 5)

        # 막대 끝(플레이어와 먼 쪽)의 작은 갈색 사탕 모양
        pygame.draw.circle(raw, (120, 70, 35), (cx, cy), candy_radius)

        # 사탕 안의 더 작은 보라색 점
        pygame.draw.circle(raw, (170, 45, 190), (cx, cy), 4)

        _MAGE_DOT_TEMPLATE = raw
    return _MAGE_DOT_TEMPLATE


# ==========================================
# 마법사(Mage) 캐릭터 데이터 등록 매핑
# ==========================================
def apply_mage_to_player(player):
    player.max_hp = 150
    player.hp = player.max_hp
    player.base_atk = 15
    player.speed = 3.6
    player.sprite_image, player.sprite_image_flipped = _get_mage_images()
    player.dot_template = _get_mage_dot_template()  # 기본 원형 점 대신 사탕 막대형 방향 표시
    player.dot_margin = 32  # 캐릭터 이미지(44px, 히트박스보다 큼)와 겹치지 않도록 충분히 띄움

    b_skill = MageBasicSkillRunner()
    b_skill.owner = player
    l_skill = MageLaserSkillRunner()
    l_skill.owner = player
    g_skill = MageGhostSkill()
    g_skill.owner = player
    u_skill = MageUltSkill()
    u_skill.owner = player

    player.abilities = [b_skill, l_skill, g_skill, u_skill]
    
    if len(player.abilities) >= 4 and hasattr(player.abilities[3], 'ult_charge_rate'):
        player.ult_charge_rate = player.abilities[3].ult_charge_rate

    original_draw = player.draw
    def custom_draw(surface):
        if getattr(player, 'is_sniper_form', False):
            pass
        else:
            original_draw(surface)
    player.draw = custom_draw


MAGE_CHARACTER_DATA = {
    "id": "MAGE",
    "name": "마법사",
    "desc": "평타: 마법빔을 멀리 쏩니다(15), 스킬 1: 강한 마법빔을 쏩니다(슬로우 25% 1.5초, 30), 스킬 2: 2초간 벽을 뚫고 이동속도가 30% 증가합니다, 궁극기: 하늘로 날아가 강하게 마법빔을 아래로 쏩니다(30, 3연발)",
    "apply": apply_mage_to_player,
    "get_thumbnail": get_mage_thumbnail
}