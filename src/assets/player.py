import math
import random
import pygame
from wall import move_entity_with_walls
from status_effects import update_status_effects, slow
from sound_manager import play_hit_sound
from fonts import get_font

# 렌더링 색상 상수
COLOR_WHITE = (255, 255, 255)
COLOR_RED = (230, 60, 60)
COLOR_GREEN = (80, 220, 100)
COLOR_GOLD = (255, 215, 0)


class Player:
    def __init__(self, x, y, color, controls, joystick=None, player_num=1, is_combined=False):
        self.color = color
        self.controls = controls
        
        # 조이스틱 관련 설정
        self.joystick = joystick
        self.player_num = player_num      
        self.is_combined = is_combined    
        
        self.rect = pygame.Rect(x, y, 40, 40)
        
        # 기본 스탯
        self.speed = 4.3
        self.max_hp = 100
        self.hp = 100
        self.base_atk = 10
        self.defense = 0.0          
        self.cooldown_rate = 1.0   
        self.time_scale = 1.0
        
        self.facing = (1, 0)
        self.abilities = []
        self.sprite_image = None  # 캐릭터별 커스텀 이미지 (없으면 기본 사각형으로 렌더링)
        self.sprite_image_flipped = None  # 왼쪽을 바라볼 때 쓸 좌우반전 이미지 (미리 캐싱)
        self.dot_color = COLOR_WHITE  # 방향 표시 점 색상 (캐릭터별로 커스텀 가능)
        self.dot_radius = 5  # 방향 표시 점 크기 (캐릭터별로 커스텀 가능)
        self.dot_template = None  # 기본 원 대신 쓸 커스텀 모양 (오른쪽 기준으로 그려진 서피스, 있으면 회전시켜 사용)
        self.dot_margin = 8  # 캐릭터 사각형 가장자리에서 방향 표시(점/템플릿)까지 추가로 띄우는 거리

        # 상태 이상 관련
        self.speed_multiplier = 1.0
        self.status_effects = {}  
        self.silenced = False
        self.bound = False          
        self.stunned = False        
        
        # 강제 이동(넉백 등) 관련
        self.is_forced_moving = False
        self.forced_move_vec = pygame.math.Vector2(0, 0)

        # 빙판 등 미끄러운 바닥 관련 (기본값 1.0 = 안 미끄러움, 지형에 의해 매 프레임 갱신됨)
        self.velocity = pygame.math.Vector2(0, 0)
        self.on_ice = False
        self.ice_friction = 1.0

        # "상대"로 취급할 대상. 배틀에서는 실제 상대 플레이어, 로드아웃 연습에서는
        # 자기 쪽 허수아비를 가리킨다. main.py가 상황에 맞게 설정해준다.
        self.opponent = None

        # 궁극기 게이지 관련
        self.ult_gauge = 0.0
        self.ult_charge_rate = 3.0  
        self.ult_charge_multiplier = 1.0  

        # 캐스팅 관련
        self.cast_timer = 0.0
        self.pending_action = None

        # 피격 이펙트 관련
        self.hit_flash_time = -99999
        self.hit_flash_intensity = 0.0
        self.damage_popups = []  # [{'value': int, 'time': ms, 'offset_x': int}]

    def reset(self, x, y):
        self.rect.x = x
        self.rect.y = y
        self.hp = self.max_hp
        self.defense = 0.0
        self.cooldown_rate = 1.0
        self.facing = (1, 0)
        self.speed_multiplier = 1.0
        self.status_effects.clear()
        self.silenced = False
        self.bound = False
        self.stunned = False
        self.is_forced_moving = False
        self.forced_move_vec = pygame.math.Vector2(0, 0)
        self.velocity = pygame.math.Vector2(0, 0)
        self.on_ice = False
        self.ice_friction = 1.0
        self.ult_gauge = 0.0
        self.cast_timer = 0.0
        self.pending_action = None
        self.hit_flash_time = -99999
        self.hit_flash_intensity = 0.0
        self.damage_popups.clear()
        if hasattr(self, 'custom_reset') and callable(self.custom_reset):
            self.custom_reset()

    def add_ult_gauge(self, amount):
        self.ult_gauge = min(100.0, self.ult_gauge + amount)

    def take_damage(self, raw_damage):
        effective_defense = min(self.defense, 100.0)
        final_damage = raw_damage * ((100.0 - effective_defense) / 100.0)
        self.hp = max(0.0, self.hp - final_damage)

        if final_damage > 0:
            self.hit_flash_time = pygame.time.get_ticks()
            # 최대 체력 대비 피해 비율이 클수록 이펙트가 강해짐
            self.hit_flash_intensity = min(1.0, (final_damage / self.max_hp) * 3.0)
            play_hit_sound(self.hit_flash_intensity)

            # 데미지를 정수로 띄워주는 팝업 텍스트
            self.damage_popups.append({
                'value': round(final_damage),
                'time': self.hit_flash_time,
                'offset_x': random.randint(-14, 14),
            })

            # 피격 시 아주 잠깐 이동속도 감소 (타격감). 이미 더 강하거나 긴 슬로우가
            # 걸려있다면 그걸 덮어써서 약화시키지 않도록 더 강한 쪽 값을 유지한다.
            existing_slow = self.status_effects.get('slow')
            stun_duration, stun_power = 0.12, 50.0
            if existing_slow:
                stun_duration = max(existing_slow['duration'], stun_duration)
                stun_power = max(existing_slow['power'], stun_power)
            slow(self, stun_duration, stun_power)

        return final_damage

    def get_status_text(self):
        texts = []
        enhance_cnt = getattr(self, 'slash_enhance_count', 0)
        if enhance_cnt > 0:
            texts.append(f"강화: {enhance_cnt}")

        charge_cnt = getattr(self, 'assassin_charge', 0)
        if charge_cnt > 0:
            texts.append(f"차지: {charge_cnt}")

        if getattr(self, 'stunned', False):
            texts.append("기절")
        else:
            if 'slow' in self.status_effects:
                texts.append("느려짐" if self.speed_multiplier > 0 else "이동 불가")
            if 'silence' in self.status_effects:
                texts.append("침묵")
                
        if 'speed_up' in self.status_effects:
            texts.append("속도증가")
        if 'bind' in self.status_effects:
            texts.append("속박")
        if 'time_slow' in self.status_effects:
            texts.append("시간 지연")
        if 'burn' in self.status_effects:
            texts.append("화상")
        if 'bleed' in self.status_effects:
            texts.append("출혈")
        if 'confuse' in self.status_effects:
            texts.append("혼란")
        if 'ghost' in self.status_effects:
            texts.append("망령화")
        if 'defense_mod' in self.status_effects:
            texts.append("방어력 증가" if self.defense < 100 else "무적")
            
        return texts

    def update(self, dt_sec, keys, attacks_list, color, walls):
        # 궁극기 자동 충전
        self.ult_gauge = min(100.0, self.ult_gauge + self.ult_charge_rate * dt_sec)

        # 상태이상 업데이트
        update_status_effects(self, dt_sec)

        # 쿨타임 가속/감속 처리
        if self.cooldown_rate != 1.0:
            dt_ms = dt_sec * 1000.0
            rate_diff = 1.0 - self.cooldown_rate
            now = pygame.time.get_ticks()
            for skill in self.abilities:
                if hasattr(skill, 'last_used') and hasattr(skill, 'cooldown'):
                    if now - skill.last_used < skill.cooldown:
                        skill.last_used += dt_ms * rate_diff

        # 스킬 캐스팅 중이면 이동 불가 처리
        if self.cast_timer > 0:
            self.cast_timer -= dt_sec
            if self.cast_timer <= 0:
                self.cast_timer = 0
                if self.pending_action:
                    self.pending_action()
                    self.pending_action = None
            return  

        # --- 이동 처리 (키보드 + 조이스틱 통합) ---
        if self.is_forced_moving:
            move_entity_with_walls(self, self.forced_move_vec.x * dt_sec, self.forced_move_vec.y * dt_sec, walls)
        elif not self.stunned and self.speed_multiplier != 0.0:
            current_speed = self.speed * self.speed_multiplier
            dx, dy = 0, 0
            
            # [1] 키보드 입력
            if keys[self.controls['up']]: dy -= 1
            if keys[self.controls['down']]: dy += 1
            if keys[self.controls['left']]: dx -= 1
            if keys[self.controls['right']]: dx += 1

            # [2] 조이스틱 입력
            if self.joystick:
                if self.is_combined:
                    if self.player_num == 1:
                        axis_x = self.joystick.get_axis(0)
                        axis_y = self.joystick.get_axis(1)
                    else:
                        axis_x = self.joystick.get_axis(2) if self.joystick.get_numaxes() > 2 else 0
                        axis_y = self.joystick.get_axis(3) if self.joystick.get_numaxes() > 3 else 0
                else:
                    axis_x = self.joystick.get_axis(0)
                    axis_y = self.joystick.get_axis(1)

                if abs(axis_x) > 0.2: dx = axis_x
                if abs(axis_y) > 0.2: dy = axis_y

            # 목표 속도 계산 (입력이 없으면 목표는 정지)
            if dx != 0 or dy != 0:
                length = (dx**2 + dy**2)**0.5
                self.facing = (dx / length, dy / length)
                target_vx = (dx / length) * current_speed
                target_vy = (dy / length) * current_speed
            else:
                target_vx, target_vy = 0.0, 0.0

            # 빙판이 아니면 ice_friction이 1.0이라 속도가 목표치로 즉시 스냅되어
            # 기존과 동일하게 반응하고, 빙판 위에서는 값이 작아 서서히 가속/감속하며 미끄러진다
            self.velocity.x += (target_vx - self.velocity.x) * self.ice_friction
            self.velocity.y += (target_vy - self.velocity.y) * self.ice_friction

            if self.velocity.length_squared() > 0.0001:
                # self.speed 등 이동 속도 값들은 60fps 기준 "프레임당 픽셀"로 튜닝되어
                # 있어서 dt_sec을 그대로 곱하면 안 되고, 60fps를 기준(배율 1.0)으로
                # 정규화해야 한다. 데스크탑은 clock.tick(60)이 실제로 60fps를 강제해서
                # 문제가 없었지만, 브라우저(emscripten)는 프레임 처리 속도가 고르지 않아
                # (몰아서 여러 프레임을 처리하는 구간이 생김) dt_sec 보정 없이는 실제
                # 이동 속도가 들쑥날쑥해진다.
                move_entity_with_walls(self, self.velocity.x * dt_sec * 60.0, self.velocity.y * dt_sec * 60.0, walls)
            else:
                self.velocity.x = 0.0
                self.velocity.y = 0.0

        # --- 스킬 입력 처리 (키보드 + 조이콘 L/R 매핑) ---
        if not self.stunned:
            for idx, ability in enumerate(self.abilities):
                if ability is None:
                    continue
                
                pressed = False
                
                # [1] 키보드 스킬 입력 확인
                if idx < len(self.controls['skills']):
                    if keys[self.controls['skills'][idx]]:
                        pressed = True
                        
                # [2] 조이스틱 스킬 입력 확인
                if self.joystick:
                    joy_name = self.joystick.get_name().lower()
                    
                    if self.is_combined:
                        if self.player_num == 1:
                            if self.joystick.get_numhats() > 0:
                                hx, hy = self.joystick.get_hat(0)
                                if idx == 0 and hy == 1: pressed = True     # 상
                                if idx == 1 and hy == -1: pressed = True    # 하
                                if idx == 2 and hx == -1: pressed = True    # 좌
                                if idx == 3 and hx == 1: pressed = True     # 우
                            else:
                                dpad = {0: 11, 1: 12, 2: 13, 3: 14}
                                btn = dpad.get(idx, -1)
                                if btn != -1 and btn < self.joystick.get_numbuttons() and self.joystick.get_button(btn):
                                    pressed = True
                        else:
                            if idx < self.joystick.get_numbuttons() and self.joystick.get_button(idx):
                                pressed = True
                    else:
                        if "(r)" in joy_name or "right" in joy_name:
                            if idx < self.joystick.get_numbuttons() and self.joystick.get_button(idx):
                                pressed = True
                        else:
                            left_mapping = {0: 4, 1: 5, 2: 14, 3: 15}
                            btn = left_mapping.get(idx, 4)
                            if btn < self.joystick.get_numbuttons() and self.joystick.get_button(btn):
                                pressed = True
                
                # 스킬 시전 실행
                if pressed:
                    if self.silenced:
                        continue
                    if self.bound and 'dash' in getattr(ability, 'keywords', []):
                        continue

                    if idx == 3:  # 궁극기
                        if self.ult_gauge >= 100.0 and ability.can_use():
                            ability.use(self, self.facing, attacks_list, color)
                            self.ult_gauge = 0.0  
                    else:  # 일반 스킬
                        if ability.can_use():
                            ability.use(self, self.facing, attacks_list, color)

    def draw(self, surface):
        if self.cast_timer > 0:
            pygame.draw.rect(surface, COLOR_GOLD, self.rect.inflate(8, 8), 2)

        if self.sprite_image is not None:
            # self.rect는 이동/충돌 판정용 히트박스로만 쓰고, 화면에는 캐릭터 이미지만 그린다
            facing_left = self.facing[0] < 0
            img = self.sprite_image_flipped if (facing_left and self.sprite_image_flipped is not None) else self.sprite_image
            img_rect = img.get_rect(center=self.rect.center)
            surface.blit(img, img_rect)
        else:
            pygame.draw.rect(surface, self.color, self.rect)
            pygame.draw.rect(surface, COLOR_WHITE, self.rect, 1)

        # 방향 표시용 점: 이미지가 몸체를 덮어도 보이도록 캐릭터 사각형 바깥(앞쪽)에 그린다
        fx, fy = self.facing
        max_comp = max(abs(fx), abs(fy), 0.0001)
        half_size = self.rect.width / 2
        dot_dist = (half_size / max_comp) + self.dot_margin
        dot_x = self.rect.centerx + fx * dot_dist
        dot_y = self.rect.centery + fy * dot_dist
        if self.dot_template is not None:
            angle_deg = math.degrees(math.atan2(-fy, fx))
            rotated = pygame.transform.rotate(self.dot_template, angle_deg)
            rotated_rect = rotated.get_rect(center=(int(dot_x), int(dot_y)))
            surface.blit(rotated, rotated_rect)
        else:
            pygame.draw.circle(surface, self.dot_color, (int(dot_x), int(dot_y)), self.dot_radius)
            pygame.draw.circle(surface, (40, 40, 40), (int(dot_x), int(dot_y)), self.dot_radius, 1)

        # 피격 이펙트: 데미지를 입으면 잠깐 붉게 번쩍이며, 피해량이 클수록 진하게
        flash_elapsed = pygame.time.get_ticks() - self.hit_flash_time
        flash_duration = 260
        if 0 <= flash_elapsed < flash_duration:
            fade = 1.0 - (flash_elapsed / flash_duration)
            strength = max(0.4, self.hit_flash_intensity)  # 작은 피해도 최소한 눈에 띄게
            alpha = int(235 * fade * strength)
            if alpha > 0:
                flash_surf = pygame.Surface((self.rect.width, self.rect.height), pygame.SRCALPHA)
                flash_surf.fill((255, 20, 20, alpha))
                surface.blit(flash_surf, self.rect.topleft)

                # 몸체 바깥으로 번지는 붉은 테두리로 강조
                glow_rect = self.rect.inflate(10, 10)
                glow_surf = pygame.Surface(glow_rect.size, pygame.SRCALPHA)
                pygame.draw.rect(glow_surf, (255, 60, 60, min(255, int(alpha * 1.2))),
                                  glow_surf.get_rect(), width=4, border_radius=4)
                surface.blit(glow_surf, glow_rect.topleft)

        bar_w, bar_h = 40, 5
        bar_x = self.rect.centerx - bar_w // 2
        bar_y = self.rect.top - 10
        
        hp_ratio = max(0, self.hp / self.max_hp)
        pygame.draw.rect(surface, (50, 50, 50), (bar_x, bar_y, bar_w, bar_h))
        pygame.draw.rect(surface, COLOR_GREEN if hp_ratio > 0.3 else COLOR_RED, (bar_x, bar_y, bar_w * hp_ratio, bar_h))

        # 데미지 숫자 팝업 (정수로 표시, 위로 떠오르며 서서히 사라짐)
        now = pygame.time.get_ticks()
        popup_duration = 700
        active_popups = []
        for popup in self.damage_popups:
            age = now - popup['time']
            if age >= popup_duration:
                continue
            active_popups.append(popup)

            progress = age / popup_duration
            rise = -28 * progress
            alpha = max(0, int(255 * (1.0 - progress)))

            font = get_font(20, bold=True)
            text_surf = font.render(str(popup['value']), True, (255, 220, 60))
            text_surf.set_alpha(alpha)
            text_rect = text_surf.get_rect(
                center=(self.rect.centerx + popup['offset_x'], bar_y - 12 + rise)
            )
            surface.blit(text_surf, text_rect)

        self.damage_popups = active_popups