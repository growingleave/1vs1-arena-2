import sys
import pygame
import math
import random
from utils import check_polygon_collision, get_character_sprite, get_character_thumbnail
from wall import move_entity_with_walls
from status_effects import silence, slow, forced_move, defense_mod, bind, time_slow, speed_up, burn, confuse
from fonts import get_font

# ==========================================
# [샌즈 - 평타] 회전 직사각형 막대 투사체 (다각형 정밀 판정)
# ==========================================
class SansSpinningBarBullet:
    def __init__(self, owner, direction):
        self.owner = owner
        self.direction = direction
        self.damage = owner.base_atk * 0.9
        self.speed = 11.0  
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 1400  
        self.hit_players = []
        
        self.width = 42
        self.height = 12
        self.pos_x = float(owner.rect.centerx + direction[0] * 20)
        self.pos_y = float(owner.rect.centery + direction[1] * 20)
        self.start_x = self.pos_x
        self.start_y = self.pos_y
        self.max_range = 500
        self.angle = 0.0  

    def get_polygon_points(self):
        rad = math.radians(self.angle)
        cos_a, sin_a = math.cos(rad), math.sin(rad)
        hw, hh = self.width / 2, self.height / 2
        local_pts = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
        return [
            (self.pos_x + lx * cos_a - ly * sin_a, self.pos_y - (lx * sin_a + ly * cos_a))
            for lx, ly in local_pts
        ]

    def update(self):
        time_scale = getattr(self.owner, 'time_scale', 1.0)
        self.pos_x += self.direction[0] * self.speed * time_scale
        self.pos_y += self.direction[1] * self.speed * time_scale
        self.angle += 15.0  

    def is_expired(self):
        time_over = pygame.time.get_ticks() - self.created_time >= self.lifespan
        out_of_range = math.hypot(self.pos_x - self.start_x, self.pos_y - self.start_y) >= self.max_range
        return time_over or out_of_range

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        return check_polygon_collision(self.get_polygon_points(), target.rect)

    def apply_effect(self, target):
        slow(target, 0.4, 50)
        self.lifespan = 0

    def draw(self, surface):
        pts = [(int(p[0]), int(p[1])) for p in self.get_polygon_points()]
        pygame.draw.polygon(surface, (255, 255, 255), pts)
        pygame.draw.polygon(surface, (150, 150, 150), pts, 1)


class SansBasicAttack:
    def __init__(self):
        self.name = "Spinning Bar"
        self.cooldown = 350
        self.last_used = 0

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(SansSpinningBarBullet(owner, direction))


# ==========================================
# [샌즈 - 스킬 1] 가스터 블래스터 (벽 관통 & 다각형 충돌 판정)
# ==========================================
class SansGasterLaser:
    def __init__(self, owner, direction):
        self.owner = owner
        self.damage = owner.base_atk * 2.2
        self.created_time = pygame.time.get_ticks()
        self.delay = 180  
        self.active_duration = 200  
        self.lifespan = self.delay + self.active_duration
        self.hit_players = []
        self.can_penetrate_walls = True  # [수정] 벽 관통 (벽 충돌로 인한 스킵/가속 방지)
        
        self.width = 40
        self.length = 550  
        
        dir_vec = pygame.math.Vector2(direction[0], direction[1])
        if dir_vec.length_squared() == 0:
            dir_vec = pygame.math.Vector2(1, 0)
        else:
            dir_vec = dir_vec.normalize()
        self.dir_vec = dir_vec
        
        self.pos_x = owner.rect.centerx + dir_vec.x * (self.length // 2 + 30)
        self.pos_y = owner.rect.centery + dir_vec.y * (self.length // 2 + 30)
        self.perp_vec = pygame.math.Vector2(-dir_vec.y, dir_vec.x)

    def get_polygon_points(self):
        half_l = self.length / 2
        half_w = self.width / 2
        center = pygame.math.Vector2(self.pos_x, self.pos_y)
        
        p1 = center + self.dir_vec * half_l + self.perp_vec * half_w
        p2 = center + self.dir_vec * half_l - self.perp_vec * half_w
        p3 = center - self.dir_vec * half_l - self.perp_vec * half_w
        p4 = center - self.dir_vec * half_l + self.perp_vec * half_w
        return [(p1.x, p1.y), (p2.x, p2.y), (p3.x, p3.y), (p4.x, p4.y)]

    def update(self):
        pass

    def is_expired(self):
        return pygame.time.get_ticks() - self.created_time >= self.lifespan

    def collides_with(self, target):
        now = pygame.time.get_ticks()
        if now - self.created_time < self.delay:
            return False  
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        return check_polygon_collision(self.get_polygon_points(), target.rect)

    def apply_effect(self, target):
        bind(target, 0.4)

    def draw(self, surface):
        now = pygame.time.get_ticks()
        elapsed = now - self.created_time
        pts = self.get_polygon_points()
        
        surf = pygame.Surface(surface.get_size(), pygame.SRCALPHA)
        if elapsed < self.delay:
            # 경고선
            center = pygame.math.Vector2(self.pos_x, self.pos_y)
            start_pt = center - self.dir_vec * (self.length / 2)
            end_pt = center + self.dir_vec * (self.length / 2)
            pygame.draw.line(surf, (100, 200, 255, 120), (start_pt.x, start_pt.y), (end_pt.x, end_pt.y), 4)
        else:
            # 발사 레이저
            pygame.draw.polygon(surf, (150, 220, 255, 220), pts)
            
            # 중심 코어
            half_w = self.width / 4
            half_l = self.length / 2
            center = pygame.math.Vector2(self.pos_x, self.pos_y)
            c1 = center + self.dir_vec * half_l + self.perp_vec * half_w
            c2 = center + self.dir_vec * half_l - self.perp_vec * half_w
            c3 = center - self.dir_vec * half_l - self.perp_vec * half_w
            c4 = center - self.dir_vec * half_l + self.perp_vec * half_w
            pygame.draw.polygon(surf, (255, 255, 255, 255), [(c1.x, c1.y), (c2.x, c2.y), (c3.x, c3.y), (c4.x, c4.y)])
            
        surface.blit(surf, (0, 0))


class SansSkill1:
    def __init__(self):
        self.name = "Gaster Blaster"
        self.cooldown = 4000
        self.last_used = 0

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(SansGasterLaser(owner, direction))


# ==========================================
# [샌즈 - 스킬 2] 뼈다귀 벽 돌진 (벽 뚫림 방지 밀어내기)
# ==========================================
class SansMovingWallBullet:
    def __init__(self, owner, direction):
        self.owner = owner
        self.direction = direction
        self.damage = owner.base_atk * 0.6  
        self.speed = 8.0
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 1200  
        self.hit_players = []  
        
        dir_vec = pygame.math.Vector2(direction[0], direction[1])
        if dir_vec.length_squared() == 0:
            dir_vec = pygame.math.Vector2(1, 0)
        else:
            dir_vec = dir_vec.normalize()
        self.dir_vec = dir_vec

        if abs(dir_vec.x) >= abs(dir_vec.y):
            self.width = 15
            self.height = 100
        else:
            self.width = 100
            self.height = 15

        self.pos_x = float(owner.rect.centerx + dir_vec.x * 40)
        self.pos_y = float(owner.rect.centery + dir_vec.y * 40)
        self.start_x = self.pos_x
        self.start_y = self.pos_y
        self.max_range = 350
        self.rect = self.get_rect()

    def get_rect(self):
        return pygame.Rect(int(self.pos_x - self.width // 2), int(self.pos_y - self.height // 2), self.width, self.height)

    def get_map_collision_rect(self):
        return pygame.Rect(int(self.pos_x - 7), int(self.pos_y - 7), 14, 14)

    def update(self):
        time_scale = getattr(self.owner, 'time_scale', 1.0)
        old_x, old_y = self.pos_x, self.pos_y

        self.pos_x += self.dir_vec.x * self.speed * time_scale
        self.pos_y += self.dir_vec.y * self.speed * time_scale
        self.rect = self.get_rect()

        main_module = sys.modules.get('__main__')
        walls = getattr(main_module, 'walls', []) if main_module else []

        # [수정] 벽 충돌 판정 (넓은 시각적 크기 대신 작은 판정 범위 사용, 너무 일찍 막히는 것 방지)
        collision_rect = self.get_map_collision_rect()
        for wall in walls:
            if collision_rect.colliderect(wall.rect):
                self.pos_x, self.pos_y = old_x, old_y
                self.rect = self.get_rect()
                self.created_time = pygame.time.get_ticks() - self.lifespan
                return

        dx = self.pos_x - old_x
        dy = self.pos_y - old_y

        for target in self.hit_players:
            if target and hasattr(target, 'rect'):
                move_entity_with_walls(target, dx, dy, walls)
                slow(target, 0.2, 100)

    def is_expired(self):
        time_over = pygame.time.get_ticks() - self.created_time >= self.lifespan
        out_of_range = math.hypot(self.pos_x - self.start_x, self.pos_y - self.start_y) >= self.max_range
        return time_over or out_of_range

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        return self.rect.colliderect(target.rect)

    def apply_effect(self, target):
        slow(target, 1.5, 100)

    def draw(self, surface):
        surf = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        pygame.draw.rect(surf, (240, 240, 240), (0, 0, self.width, self.height), border_radius=3)
        pygame.draw.rect(surf, (100, 100, 100), (0, 0, self.width, self.height), 2, border_radius=3)
        surface.blit(surf, self.rect.topleft)


class SansSkill2:
    def __init__(self):
        self.name = "Bone Wall Push"
        self.cooldown = 5000
        self.last_used = 0

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(SansMovingWallBullet(owner, direction))


# ==========================================
# [샌즈 - 궁극기] 메가 가스터 블래스터 (벽 관통 레이저 빔)
# ==========================================
class SansMegaLaserBeam:
    def __init__(self, owner, direction):
        self.owner = owner
        self.damage = owner.base_atk * 0.5  
        self.created_time = pygame.time.get_ticks()
        self.delay = 1  # 1초 경고 페이즈
        self.active_duration = 3000  # 3초 발사 유지
        self.lifespan = self.delay + self.active_duration
        self.interval = 100  # 0.1초마다 틱 판정
        self.last_damage_tick = 0
        self.hit_players = []
        self.can_penetrate_walls = True  # 벽 관통
        
        self.width = 400  
        self.length = 1500  
        
        dir_vec = pygame.math.Vector2(direction[0], direction[1])
        if dir_vec.length_squared() == 0:
            dir_vec = pygame.math.Vector2(1, 0)
        else:
            dir_vec = dir_vec.normalize()
        self.dir_vec = dir_vec
        
        self.pos_x = owner.rect.centerx + dir_vec.x * (self.length // 2 + 30)
        self.pos_y = owner.rect.centery + dir_vec.y * (self.length // 2 + 30)
        self.perp_vec = pygame.math.Vector2(-dir_vec.y, dir_vec.x)

        # 시전 중 본인에게 침묵, 이동 불가 부여
        silence(self.owner, 3.6)
        slow(self.owner, 3.6, 100)

    def get_polygon_points(self):
        half_l = self.length / 2
        half_w = self.width / 2
        center = pygame.math.Vector2(self.pos_x, self.pos_y)
        
        p1 = center + self.dir_vec * half_l + self.perp_vec * half_w
        p2 = center + self.dir_vec * half_l - self.perp_vec * half_w
        p3 = center - self.dir_vec * half_l - self.perp_vec * half_w
        p4 = center - self.dir_vec * half_l + self.perp_vec * half_w
        return [(p1.x, p1.y), (p2.x, p2.y), (p3.x, p3.y), (p4.x, p4.y)]

    def update(self):
        # 시전 지속 중 샌즈 무적 유지
        defense_mod(self.owner, 0.2, 100)
        
        now = pygame.time.get_ticks()
        elapsed = now - self.created_time
        
        if elapsed >= self.delay:
            if now - self.last_damage_tick >= self.interval:
                self.last_damage_tick = now
                self.hit_players.clear()

    def is_expired(self):
        return pygame.time.get_ticks() - self.created_time >= self.lifespan

    def collides_with(self, target):
        now = pygame.time.get_ticks()
        if now - self.created_time < self.delay:
            return False  
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        return check_polygon_collision(self.get_polygon_points(), target.rect)

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        now = pygame.time.get_ticks()
        elapsed = now - self.created_time
        pts = self.get_polygon_points()
        
        surf = pygame.Surface(surface.get_size(), pygame.SRCALPHA)
        if elapsed < self.delay:
            # 경고 범위
            pygame.draw.polygon(surf, (100, 200, 255, 60), pts)
            pygame.draw.polygon(surf, (100, 200, 255, 200), pts, 3)
        else:
            # 3초간 발사되는 거대 빔
            flash = ((now // 60) % 2) == 0
            laser_color = (100, 200, 255, 220) if flash else (140, 230, 255, 240)
            pygame.draw.polygon(surf, laser_color, pts)
            
            # 메인 중심 코어
            half_w = self.width / 4
            half_l = self.length / 2
            center = pygame.math.Vector2(self.pos_x, self.pos_y)
            c1 = center + self.dir_vec * half_l + self.perp_vec * half_w
            c2 = center + self.dir_vec * half_l - self.perp_vec * half_w
            c3 = center - self.dir_vec * half_l - self.perp_vec * half_w
            c4 = center - self.dir_vec * half_l + self.perp_vec * half_w
            pygame.draw.polygon(surf, (255, 255, 255, 255), [(c1.x, c1.y), (c2.x, c2.y), (c3.x, c3.y), (c4.x, c4.y)])
            
        surface.blit(surf, (0, 0))


class SansUltimate:
    def __init__(self):
        self.name = "Mega Judgment"
        self.cooldown = 500  
        self.last_used = -99999
        self.keywords = ['ult']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(SansMegaLaserBeam(owner, direction))


# ==========================================
# 샌즈 캐릭터 데이터 등록 매핑
# ==========================================
def apply_sans(player):
    player.base_atk = 15  
    player.max_hp = 100
    player.hp = 100
    player.speed = 4.4
    player.is_sans = True
    player.dodge_text_timer = 0
    player.last_dodge_time = 0
    player.sprite_image, player.sprite_image_flipped = get_character_sprite('sans.png')
    
    # [피격 시 30% 즉각 회피 시스템]
    original_take_damage = player.take_damage
    def sans_take_damage(raw_damage):
        if raw_damage <= 0:
            return 0.0

        # 20% 확률로 완전 회피
        if random.random() < 0.2:
            now = pygame.time.get_ticks()
            player.dodge_text_timer = now
            player.last_dodge_time = now

            # [수정] 슬로우와 침묵 즉시 완전 정화
            if hasattr(player, 'status_effects'):
                player.status_effects.pop('slow', None)
                player.status_effects.pop('silence', None)
            player.silenced = False
            player.speed_multiplier = 1.0

            # 0.2초 완전 무적 부여
            defense_mod(player, 0.2, 100)
            player.defense = 100.0
            return 0.0

        return original_take_damage(raw_damage)
    player.take_damage = sans_take_damage

    # [수정] 회피 후 0.2초 동안 CC기가 덮어씌워지는 것을 지속적으로 차단
    original_update = player.update
    def custom_update(dt_sec, keys, attacks_list, color, walls):
        now = pygame.time.get_ticks()
        if now - getattr(player, 'last_dodge_time', 0) < 200:
            if hasattr(player, 'status_effects'):
                player.status_effects.pop('slow', None)
                player.status_effects.pop('silence', None)
            player.silenced = False
            if player.speed_multiplier < 1.0:
                player.speed_multiplier = 1.0
                
        original_update(dt_sec, keys, attacks_list, color, walls)
    player.update = custom_update

    # [회피 텍스트 출력 UI]
    original_draw = player.draw
    def custom_draw(surface):
        original_draw(surface)
        if pygame.time.get_ticks() - getattr(player, 'dodge_text_timer', 0) < 600:
            font = get_font(20, bold=True)
            text_surf = font.render("회피함!", True, (255, 255, 0))
            text_rect = text_surf.get_rect(center=(player.rect.centerx, player.rect.top - 22))
            surface.blit(text_surf, text_rect)
    player.draw = custom_draw

    player.abilities = [
        SansBasicAttack(),    # 평타
        SansSkill1(),         # 1스킬 (가스터 블래스터)
        SansSkill2(),         # 2스킬 (뼈 벽 밀치기)
        SansUltimate()        # 궁극기 (메가 가스터 블래스터)
    ]
    
    def custom_reset():
        player.is_sans = False
        player.dodge_text_timer = 0
        player.last_dodge_time = 0

    player.custom_reset = custom_reset

SANS_CHARACTER_DATA = {
    "name": "샌즈",
    "desc": "평타: 뼈다귀를 던집니다(14, 슬로우 50% 0.4초), 스킬 1: 에너지 블라스트를 쏩니다(33), 0.4초간 속박, 스킬 2: 뼈다귀 벽을 던져 대미지를 주고 상대를 넉백 시킵니다(9), 1.5초간 이동 불가, 궁극기: 기를 모아 큰 에너지 블라스트를 쏴 주변 지형을 삭제시킵니다(11X30), 특성: 30% 확률로 공격을 회피하고 상태이상을 정화합니다",
    "apply": apply_sans,
    "get_thumbnail": lambda size=40: get_character_thumbnail('sans.png', size)
}