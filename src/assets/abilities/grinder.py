import sys
import pygame
import math
import random
from utils import check_polygon_collision
from wall import move_entity_with_walls
from status_effects import silence, slow, forced_move, defense_mod, bind, time_slow, speed_up

# ==========================================
# [분쇄자 - 스킬 1 연계] 넉백을 반대로 적용한 고속 풀(Pull) 이펙트 (벽 충돌 연동)
# ==========================================
class GrinderReverseKnockbackEffect:
    def __init__(self, owner, target):
        self.owner = owner
        self.target = target
        self.duration = 200  # 0.2초 동안 끌어당김
        self.created_time = pygame.time.get_ticks()
        self.damage = 0
        self.hit_players = []
        self.pull_speed = 28.0  
        
        # [수정] 기절 합성 공식 적용 (슬로우 100% + 침묵)
        slow(target, 0.3, 100)
        silence(target, 0.3)
        bind(target, 0.5)

    def update(self):
        if not self.target or not hasattr(self.target, 'rect'):
            return

        dx = self.owner.rect.centerx - self.target.rect.centerx
        dy = self.owner.rect.centery - self.target.rect.centery
        dist = math.hypot(dx, dy)
        
        if dist > 40:
            time_scale = getattr(self.owner, 'time_scale', 1.0)
            dir_x = (dx / dist)
            dir_y = (dy / dist)
            
            step_x = dir_x * self.pull_speed * time_scale
            step_y = dir_y * self.pull_speed * time_scale
            
            # [버그 수정] 벽에 끼이지 않도록 move_entity_with_walls로 안전하게 이동
            main_module = sys.modules.get('__main__')
            walls = getattr(main_module, 'walls', []) if main_module else []
            move_entity_with_walls(self.target, step_x, step_y, walls)
            
            slow(self.target, 0.1, 100)
            silence(self.target, 0.1)

    def is_expired(self):
        elapsed = pygame.time.get_ticks() - self.created_time
        if not self.target or not hasattr(self.target, 'rect'):
            return True
            
        dx = self.owner.rect.centerx - self.target.rect.centerx
        dy = self.owner.rect.centery - self.target.rect.centery
        return elapsed >= self.duration or math.hypot(dx, dy) <= 40

    def collides_with(self, target):
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        if self.target and hasattr(self.target, 'rect'):
            pygame.draw.line(surface, (160, 160, 160), 
                             self.owner.rect.center, 
                             self.target.rect.center, 4)


# ==========================================
# [분쇄자 - 스킬 1] 철제 그랩 투사체 (다각형 정밀 충돌 판정)
# ==========================================
class GrinderGrabBullet:
    def __init__(self, owner, direction, attacks_list):
        self.owner = owner
        self.direction = direction
        self.attacks_list = attacks_list
        self.damage = owner.base_atk * 1.2
        self.speed = 24.0  
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 400  
        self.hit_players = []
        
        self.width = 15
        self.height = 45
        
        self.pos_x = float(owner.rect.centerx + direction[0] * 25)
        self.pos_y = float(owner.rect.centery + direction[1] * 25)
        self.start_x = self.pos_x
        self.start_y = self.pos_y
        self.max_range = 350
        
        self.angle = math.degrees(math.atan2(-direction[1], direction[0]))

    def get_polygon_points(self):
        # [수정] 회전 각도에 맞춘 4꼭짓점 계산 (판정 일치)
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

    def is_expired(self):
        time_over = pygame.time.get_ticks() - self.created_time >= self.lifespan
        out_of_range = math.hypot(self.pos_x - self.start_x, self.pos_y - self.start_y) >= self.max_range
        return time_over or out_of_range

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        return check_polygon_collision(self.get_polygon_points(), target.rect)

    def apply_effect(self, target):
        if self.attacks_list is not None:
            self.attacks_list.append(GrinderReverseKnockbackEffect(self.owner, target))
        slow(target, 1.0, 100)
        silence(target, 0.5)
        self.lifespan = 0

    def draw(self, surface):
        if self.owner and hasattr(self.owner, 'rect'):
            pygame.draw.line(surface, (160, 160, 160), 
                             self.owner.rect.center, 
                             (int(self.pos_x), int(self.pos_y)), 4)

        pts = [(int(p[0]), int(p[1])) for p in self.get_polygon_points()]
        pygame.draw.polygon(surface, (180, 50, 50), pts)
        pygame.draw.polygon(surface, (255, 255, 255), pts, 1)


class GrinderSkill1:
    def __init__(self):
        self.name = "Iron Grab"
        self.cooldown = 3500
        self.last_used = 0

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(GrinderGrabBullet(owner, direction, attacks_list))


# ==========================================
# [분쇄자 - 스킬 2] 전방 80x80 범위 제어타
# ==========================================
class GrinderSkill2Hitbox:
    def __init__(self, owner, direction):
        self.owner = owner
        self.damage = owner.base_atk * 1.6
        self.created_time = pygame.time.get_ticks()
        self.delay = 300  
        self.active_duration = 150  
        self.lifespan = self.delay + self.active_duration
        self.hit_players = []
        
        self.width = 80
        self.height = 80
        
        dist = 50
        dir_vec = pygame.math.Vector2(direction[0], direction[1])
        if dir_vec.length_squared() == 0:
            dir_vec = pygame.math.Vector2(1, 0)
        else:
            dir_vec = dir_vec.normalize()
            
        self.pos_x = owner.rect.centerx + dir_vec.x * dist
        self.pos_y = owner.rect.centery + dir_vec.y * dist
        self.rect = self.get_rect()

    def get_rect(self):
        return pygame.Rect(int(self.pos_x - self.width // 2), int(self.pos_y - self.height // 2), self.width, self.height)

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
        return self.rect.colliderect(target.rect)

    def apply_effect(self, target):
        slow(target, 1.0, 100)
        silence(target, 1.0)

    def draw(self, surface):
        now = pygame.time.get_ticks()
        elapsed = now - self.created_time
        rect = self.get_rect()
        
        surf = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        if elapsed < self.delay:
            pygame.draw.rect(surf, (200, 50, 50, 80), (0, 0, self.width, self.height), border_radius=6)
            pygame.draw.rect(surf, (255, 100, 100, 180), (0, 0, self.width, self.height), 2, border_radius=6)
        else:
            pygame.draw.rect(surf, (220, 50, 50, 210), (0, 0, self.width, self.height), border_radius=6)
            pygame.draw.rect(surf, (255, 255, 255, 255), (0, 0, self.width, self.height), 3, border_radius=6)
        
        surface.blit(surf, rect.topleft)


class GrinderSkill2:
    def __init__(self):
        self.name = "Ground Slam Control"
        self.cooldown = 6000
        self.last_used = 0

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        slow(owner, 0.3, 100) 
        attacks_list.append(GrinderSkill2Hitbox(owner, direction))


# ==========================================
# [분쇄자 - 궁극기] -15도~15도 사이 연사 (난사 탄환)
# ==========================================
class GrinderUltimateSquareBullet:
    def __init__(self, owner, direction):
        self.owner = owner
        self.damage = owner.base_atk * 0.25
        self.speed = 15.0
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 2000  
        self.hit_players = []
        
        self.width = 12
        self.height = 12
        
        base_angle = math.atan2(direction[1], direction[0])
        rand_offset = math.radians(random.uniform(-15, 15))
        final_angle = base_angle + rand_offset
        
        self.dir_x = math.cos(final_angle)
        self.dir_y = math.sin(final_angle)
        
        self.pos_x = float(owner.rect.centerx + self.dir_x * 45)
        self.pos_y = float(owner.rect.centery + self.dir_y * 45)
        self.start_x = self.pos_x
        self.start_y = self.pos_y
        self.max_range = 1200  
        self.angle = math.degrees(math.atan2(-self.dir_y, self.dir_x))
        self.rect = self.get_rect()

    def get_rect(self):
        return pygame.Rect(int(self.pos_x - self.width // 2), int(self.pos_y - self.height // 2), self.width, self.height)

    def update(self):
        time_scale = getattr(self.owner, 'time_scale', 1.0)
        old_x, old_y = self.pos_x, self.pos_y

        self.pos_x += self.dir_x * self.speed * time_scale
        self.pos_y += self.dir_y * self.speed * time_scale
        self.rect = self.get_rect()

        # [수정] 벽 충돌 판정 (닿자마자 막히지 않도록 실제 크기보다 작은 판정 범위 사용)
        main_module = sys.modules.get('__main__')
        walls = getattr(main_module, 'walls', []) if main_module else []
        collision_rect = pygame.Rect(int(self.pos_x - 4), int(self.pos_y - 4), 8, 8)
        for wall in walls:
            if collision_rect.colliderect(wall.rect):
                self.pos_x, self.pos_y = old_x, old_y
                self.rect = self.get_rect()
                self.created_time = pygame.time.get_ticks() - self.lifespan
                break

    def is_expired(self):
        time_over = pygame.time.get_ticks() - self.created_time >= self.lifespan
        out_of_range = math.hypot(self.pos_x - self.start_x, self.pos_y - self.start_y) >= self.max_range
        return time_over or out_of_range

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        return self.rect.colliderect(target.rect)

    def apply_effect(self, target):
        # [수정] 기절 및 넉백 벽 충돌 안전 연동
        slow(target, 0.2, 100)
        silence(target, 0.2)
        bind(target, 0.2)
        
        main_module = sys.modules.get('__main__')
        walls = getattr(main_module, 'walls', []) if main_module else []
        move_entity_with_walls(target, self.dir_x * 8.0, self.dir_y * 8.0, walls)
        
        self.lifespan = 0

    def draw(self, surface):
        surf = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        pygame.draw.rect(surf, (210, 100, 30), (0, 0, self.width, self.height))
        pygame.draw.rect(surf, (255, 255, 255), (0, 0, self.width, self.height), 1)
        
        rotated_surf = pygame.transform.rotate(surf, self.angle)
        rect = rotated_surf.get_rect(center=(int(self.pos_x), int(self.pos_y)))
        surface.blit(rotated_surf, rect.topleft)


class GrinderUltimateManager:
    def __init__(self, owner, direction, attacks_list):
        self.owner = owner
        self.direction = direction
        self.attacks_list = attacks_list
        self.total_bullets = 15
        self.fired_count = 0
        self.interval = 60 
        self.last_fire_time = 0
        self.damage = 0
        self.hit_players = []  

    def update(self):
        if self.fired_count < self.total_bullets:
            now = pygame.time.get_ticks()
            if self.fired_count == 0 or now - self.last_fire_time >= self.interval:
                self.last_fire_time = now
                self.attacks_list.append(GrinderUltimateSquareBullet(self.owner, self.direction))
                self.fired_count += 1

    def is_expired(self):
        return self.fired_count >= self.total_bullets

    def collides_with(self, target):
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        pass


class GrinderUltimate:
    def __init__(self):
        self.name = "Iron Barrage"
        self.cooldown = 500  # [수정] 궁극기 100% 즉시 발동
        self.last_used = -99999
        self.keywords = ['ult']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(GrinderUltimateManager(owner, direction, attacks_list))


# ==========================================
# [평타 - 꾹 누르기] 플레이어 전방 고정 회전 분쇄기
# ==========================================
class GrinderSpinAttack:
    def __init__(self, owner, direction):
        self.owner = owner
        self.damage = owner.base_atk * 0.45  
        self.created_time = pygame.time.get_ticks()
        self.hit_players = []  
        self.hit_players_time = {}
        
        self.owner.grinder_spin_active = True
        
        self.radius = 45  
        self.dist = 55  
        
        dir_vec = pygame.math.Vector2(direction[0], direction[1])
        if dir_vec.length_squared() == 0:
            dir_vec = pygame.math.Vector2(1, 0)
        else:
            dir_vec = dir_vec.normalize()
        self.dir_vec = dir_vec
            
        self.pos_x = owner.rect.centerx + self.dir_vec.x * self.dist
        self.pos_y = owner.rect.centery + self.dir_vec.y * self.dist
        self.effect_angle = 0.0  

    def get_rect(self):
        return pygame.Rect(int(self.pos_x - self.radius), int(self.pos_y - self.radius), self.radius * 2, self.radius * 2)

    def update(self):
        self.pos_x = self.owner.rect.centerx + self.dir_vec.x * self.dist
        self.pos_y = self.owner.rect.centery + self.dir_vec.y * self.dist

        self.effect_angle += 15.0
        if self.effect_angle >= 360:
            self.effect_angle -= 360

        now = pygame.time.get_ticks()
        to_remove = []
        for target, last_hit in self.hit_players_time.items():
            if now - last_hit >= 300:
                to_remove.append(target)
        for target in to_remove:
            if target in self.hit_players:
                self.hit_players.remove(target)

    def is_expired(self):
        keys = pygame.key.get_pressed()
        key_pressed = False
        
        # [버그 수정] 현재 설정된 1P/2P의 평타 키(0번 슬롯)를 동적으로 검사
        if hasattr(self.owner, 'controls') and 'skills' in self.owner.controls and len(self.owner.controls['skills']) > 0:
            skill_0_key = self.owner.controls['skills'][0]
            if keys[skill_0_key]:
                key_pressed = True

        # 조이스틱 입력 검사
        if self.owner.joystick:
            joy = self.owner.joystick
            joy_name = joy.get_name().lower()
            if getattr(self.owner, 'is_combined', False):
                if self.owner.player_num == 1:
                    if joy.get_numhats() > 0 and joy.get_hat(0)[1] == 1: key_pressed = True
                    elif joy.get_numbuttons() > 11 and joy.get_button(11): key_pressed = True
                else:
                    if joy.get_numbuttons() > 0 and joy.get_button(0): key_pressed = True
            else:
                if "(r)" in joy_name or "right" in joy_name:
                    if joy.get_numbuttons() > 0 and joy.get_button(0): key_pressed = True
                else:
                    left_mapping = {0: 4, 1: 5, 2: 14, 3: 15}
                    btn = left_mapping.get(0, 4)
                    if joy.get_numbuttons() > btn and joy.get_button(btn): key_pressed = True
            
        time_over = pygame.time.get_ticks() - self.created_time >= 3000
        
        if not key_pressed or time_over:
            self.owner.grinder_spin_active = False
            return True
        return False

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        dx = target.rect.centerx - self.pos_x
        dy = target.rect.centery - self.pos_y
        return math.hypot(dx, dy) <= self.radius + max(target.rect.width, target.rect.height) / 2

    def apply_effect(self, target):
        now = pygame.time.get_ticks()
        self.hit_players_time[target] = now

    def draw(self, surface):
        surf = pygame.Surface((self.radius * 2, self.radius * 2), pygame.SRCALPHA)
        pygame.draw.circle(surf, (200, 100, 50, 100), (self.radius, self.radius), self.radius)
        pygame.draw.circle(surf, (255, 255, 255, 200), (self.radius, self.radius), self.radius, 2)
        
        for i in range(4):
            ang = math.radians(self.effect_angle + i * 90)
            ex = self.radius + math.cos(ang) * (self.radius - 5)
            ey = self.radius + math.sin(ang) * (self.radius - 5)
            pygame.draw.line(surf, (255, 255, 255, 220), (self.radius, self.radius), (ex, ey), 3)

        surface.blit(surf, (int(self.pos_x - self.radius), int(self.pos_y - self.radius)))


class GrinderBasicAttack:
    def __init__(self, owner=None):
        self.owner = owner
        self.name = "Grinder Spin Smash"
        self.cooldown = 100  
        self.last_used = 0

    def can_use(self):
        if self.owner and getattr(self.owner, 'grinder_spin_active', False):
            return False
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.owner = owner
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(GrinderSpinAttack(owner, direction))


# ==========================================
# 분쇄자 캐릭터 데이터 등록 매핑
# ==========================================
def apply_grinder(player):
    player.base_atk = 20
    player.max_hp = 130
    player.hp = 130
    player.speed = 4.1
    player.is_grinder = True
    player.grinder_spin_active = False
    
    player.abilities = [
        GrinderBasicAttack(player), # 평타 (홀드형 회전 분쇄)
        GrinderSkill1(),             # 1스킬 (철제 그랩)
        GrinderSkill2(),             # 2스킬 (전방 제어 슬램)
        GrinderUltimate()            # 궁극기 (난사 포격)
    ]
    
    def custom_reset():
        player.is_grinder = False
        player.grinder_spin_active = False

    player.custom_reset = custom_reset

GRINDER_CHARACTER_DATA = {
    "name": "분쇄자",
    "desc": "평타: 톱을 돌려 범위 내에 대미지를 줍니다(9, 0.3초마다), 스킬 1: 그랩을 써 상대를 끌고 대미지를 줍니다(24), 약 1초간 이동불가+침묵, 스킬 2: 전방에 제어 슬램을 쓰고 대미지를 줍니다(32), 1초간 기절, 궁극기: 부채꼴로 투사체를 난사합니다(15발, 한발당 5)",
    "apply": apply_grinder
}