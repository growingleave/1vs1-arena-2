"""전투맵에 배치하는 지형 요소(용암 구덩이, 낙하 용암 이벤트, 빙판 등)를 한 곳에 모아둔다.

원래 hazards.py / events.py / ice.py로 나뉘어 있었는데, 서로 강하게 의존하고(events가
hazards의 헬퍼를 그대로 재사용) 같은 인터페이스를 공유하는 작은 클래스들이라 파일을 나누는
이점이 없었고, 오히려 인터페이스가 어긋나기 쉬웠다 (실제로 IcePatch에 draw_preview가 없어서
맵 선택 화면에서 AttributeError가 났었다). 파일 하나로 합쳐서 인터페이스를 한 곳에서 강제한다.

map.py의 build_hazards()/build_events()가 반환하는 모든 객체는 다음 4개 메서드를 갖춰야 한다:
- update(dt_sec)
- apply_damage(players, dt_sec)                : 피해/상태이상이 없으면 그냥 pass
- draw(surface)                                 : 실제 전투 화면에 그리기 (벽/캐릭터보다 먼저 그려짐)
- draw_preview(surface, preview_rect, scale)    : 맵 선택 화면 축소 미리보기에 그리기
새 지형을 추가할 때 이 중 하나라도 빠지면 main.py에서 바로 AttributeError가 나므로 주의.

경고 배너처럼 캐릭터/UI보다도 위에 그려야 하는 게 있으면 draw_overlay(surface)를 추가로
구현하면 된다 (선택 사항 - main.py가 hasattr로 확인해서 있으면 맨 마지막에 불러준다)."""

import math
import random
import pygame
from fonts import get_font, render_text_cached
from status_effects import burn, slow

# ==========================================
# 용암류 지형이 공유하는 상수/헬퍼
# ==========================================

# 화상(burn)을 매 프레임 재적용해도 되도록, 프레임 간격보다 넉넉히 긴 지속시간으로 계속 갱신한다.
# (덕분에 용암을 벗어난 뒤에도 이 시간만큼 화상이 남는 여운 효과가 생긴다)
LAVA_BURN_LINGER_DURATION = 3.0

# 맵이 직접 주는 효과(용암 화상, 빙판 미끄러짐 등)를 이 키워드로 표시해둔다. 이 키워드에
# 면역이 걸린 대상(예: 망령화 중인 마법사)에게는 아예 적용하지 않는다.
MAP_HAZARD_KEYWORDS = frozenset({'map'})


def generate_lava_bubbles(radius, seed):
    """반지름 안에 고르게 퍼진, 각자 다른 속도/위상으로 커졌다 작아졌다 할 노란 기포 목록을 만든다.
    seed가 같으면 항상 같은 배치가 나온다."""
    rng = random.Random(seed)
    bubbles = []
    bubble_count = max(6, int(radius / 11))
    for i in range(bubble_count):
        # 각도를 구간으로 나눠 하나씩 배정한 뒤 구간 안에서만 흔들어서, 순수 랜덤일 때
        # 흔히 생기는 뭉침/빈 공간 없이 고르게 퍼지도록 한다. 거리도 sqrt로 뽑아서
        # (원 면적은 반지름 제곱에 비례하므로) 중심 쏠림 없이 바깥쪽까지 고르게 채운다.
        sector = math.tau / bubble_count
        angle = sector * i + rng.uniform(-sector * 0.4, sector * 0.4)
        dist = radius * 0.8 * math.sqrt(rng.uniform(0.1, 1.0))
        bubbles.append({
            'offset': (math.cos(angle) * dist, math.sin(angle) * dist),
            'base_radius': rng.uniform(radius * 0.06, radius * 0.13),
            'phase': rng.uniform(0, math.tau),
            'speed': rng.uniform(2.0, 3.6),
        })
    return bubbles


def draw_lava_circle(surface, x, y, radius, anim_t, bubbles):
    """주황색 용암 바탕 + 안에서 맥동하는 노란 기포들을 그린다. LavaPit과 낙하 용암(LavaFallEvent)이
    같은 비주얼을 쓰도록 공통으로 뺀 함수."""
    cx, cy = int(x), int(y)

    pygame.draw.circle(surface, (50, 18, 10), (cx, cy), radius + 6)     # 그을린 테두리
    pygame.draw.circle(surface, (235, 95, 20), (cx, cy), radius)         # 주황색 용암 바탕
    pygame.draw.circle(surface, (255, 130, 35), (cx, cy), int(radius * 0.88))

    for bubble in bubbles:
        pulse = (math.sin(anim_t * bubble['speed'] + bubble['phase']) + 1.0) / 2.0  # 0~1
        r = max(2, int(bubble['base_radius'] * (0.5 + 0.9 * pulse)))
        bx = cx + int(bubble['offset'][0])
        by = cy + int(bubble['offset'][1])
        pygame.draw.circle(surface, (255, 225, 70), (bx, by), r)


def apply_lava_burn(x, y, radius, tick_damage, players):
    """반지름 안에 있는 플레이어들에게 화상을 걸거나 갱신한다. ('map' 키워드에 면역인
    대상에게는 완전히 무시된다 - 예: 마법사 2스킬)"""
    for player in players:
        if player is None or getattr(player, 'hp', 0) <= 0:
            continue
        if getattr(player, 'invincible', False):
            continue
        if getattr(player, 'immune_keywords', frozenset()) & MAP_HAZARD_KEYWORDS:
            continue

        dx = player.rect.centerx - x
        dy = player.rect.centery - y
        hit_radius = radius + max(player.rect.width, player.rect.height) / 3

        if math.hypot(dx, dy) <= hit_radius:
            burn(player, LAVA_BURN_LINGER_DURATION, tick_damage, immediate_tick=True)


def _scale_rect(rect, preview_rect, scale):
    """실제 좌표 기준 Rect를 맵 선택 미리보기 박스 안 좌표로 변환한다."""
    return pygame.Rect(
        preview_rect.left + rect.left * scale,
        preview_rect.top + rect.top * scale,
        rect.width * scale,
        rect.height * scale,
    )


# ==========================================
# 용암 구덩이 (고정 지형)
# ==========================================
class LavaPit:
    """닿는 즉시 화상(burn) 상태이상을 걸어 한 틱에 tick_damage만큼 피해를 주는 원형 용암 구덩이.
    벽과 달리 이동을 막지는 않아서, 위험을 감수하고 가로지르거나 상대를 밀어넣는 식으로 쓰인다."""

    def __init__(self, x, y, radius, tick_damage=4):
        self.x = x
        self.y = y
        self.radius = radius
        self.tick_damage = tick_damage
        self._anim_t = 0.0
        # 좌표 기반 고정 시드라 매번 같은 배치가 나오고, 다른 용암 구덩이와도 배치가 겹치지 않는다
        self._bubbles = generate_lava_bubbles(radius, f"lava_{int(x)}_{int(y)}_{int(radius)}")

    def update(self, dt_sec):
        self._anim_t += dt_sec

    def apply_damage(self, players, dt_sec):
        apply_lava_burn(self.x, self.y, self.radius, self.tick_damage, players)

    def draw(self, surface):
        draw_lava_circle(surface, self.x, self.y, self.radius, self._anim_t, self._bubbles)

    def draw_preview(self, surface, preview_rect, scale):
        center = (int(preview_rect.left + self.x * scale), int(preview_rect.top + self.y * scale))
        pygame.draw.circle(surface, (220, 90, 30), center, max(4, int(self.radius * scale)))


# ==========================================
# 낙하 용암 이벤트 (반복 이벤트)
# ==========================================
class LavaFallEvent:
    """몇 초마다 무작위 위치 여러 곳(drops_per_wave)에 동시에 원형 경고를 띄운 뒤, 그 자리들에
    용암이 떨어져 잠깐 동안 장판(지속 피해 구역)이 생겼다 사라지는 반복 이벤트.

    idle(대기) -> warning(경고 원 표시) -> active(장판으로 피해) -> idle ... 순으로 순환하며,
    피해/비주얼은 중앙 고정 용암 구덩이(LavaPit)와 동일한 방식을 재사용한다."""

    STATE_IDLE = 'idle'
    STATE_WARNING = 'warning'
    STATE_ACTIVE = 'active'

    def __init__(self, area_rect, radius=70, tick_damage=4,
                 interval_range=(2.0, 4.0), warning_duration=1.3, active_duration=6.0,
                 avoid_zones=None, drops_per_wave=2, min_drop_spacing=160):
        self.area_rect = area_rect          # 이벤트가 떨어질 수 있는 범위 (pygame.Rect)
        self.radius = radius
        self.tick_damage = tick_damage
        self.interval_range = interval_range
        self.warning_duration = warning_duration
        self.active_duration = active_duration
        self.avoid_zones = avoid_zones or []  # [(x, y, min_dist), ...] 이 지점들과는 겹치지 않게 뽑는다
        self.drops_per_wave = drops_per_wave
        self.min_drop_spacing = min_drop_spacing  # 한 웨이브 안에서 낙하 지점들끼리 최소 이만큼은 떨어뜨린다

        self.state = self.STATE_IDLE
        self.timer = random.uniform(*interval_range)
        self._anim_t = 0.0
        self.drops = []  # 현재 웨이브의 낙하 지점들: [{'x', 'y', 'bubbles'}, ...]

        # 경고 링을 매 프레임 새 Surface로 만들지 않고 재사용 (반지름이 고정이라 크기도 고정)
        self._warn_surf = pygame.Surface((radius * 2 + 8, radius * 2 + 8), pygame.SRCALPHA)

    def _pick_positions(self):
        picked = []
        for _ in range(self.drops_per_wave):
            x, y = self.area_rect.centerx, self.area_rect.centery
            for _try in range(20):
                cx = random.uniform(self.area_rect.left, self.area_rect.right)
                cy = random.uniform(self.area_rect.top, self.area_rect.bottom)
                if not all(math.hypot(cx - ax, cy - ay) >= min_dist for ax, ay, min_dist in self.avoid_zones):
                    continue
                if not all(math.hypot(cx - ox, cy - oy) >= self.min_drop_spacing for ox, oy in picked):
                    continue
                x, y = cx, cy
                break
            picked.append((x, y))
        return picked

    def update(self, dt_sec):
        self._anim_t += dt_sec
        self.timer -= dt_sec
        if self.timer > 0:
            return

        if self.state == self.STATE_IDLE:
            self.drops = [{'x': x, 'y': y, 'bubbles': []} for x, y in self._pick_positions()]
            self.state = self.STATE_WARNING
            self.timer = self.warning_duration
        elif self.state == self.STATE_WARNING:
            self.state = self.STATE_ACTIVE
            self.timer = self.active_duration
            # 떨어질 때마다 매번 다른 위치인 만큼, 기포 배치도 그때그때 새로 뽑아서
            # 중앙 용암 구덩이나 다른 낙하 지점과도 겹치지 않는 모양으로 나타나게 한다
            for drop in self.drops:
                seed = f"lavafall_{drop['x']:.1f}_{drop['y']:.1f}_{self._anim_t:.2f}"
                drop['bubbles'] = generate_lava_bubbles(self.radius, seed)
        elif self.state == self.STATE_ACTIVE:
            self.state = self.STATE_IDLE
            self.timer = random.uniform(*self.interval_range)
            self.drops = []

    def apply_damage(self, players, dt_sec):
        if self.state != self.STATE_ACTIVE:
            return
        for drop in self.drops:
            apply_lava_burn(drop['x'], drop['y'], self.radius, self.tick_damage, players)

    def draw(self, surface):
        if self.state == self.STATE_WARNING:
            # 경고 진행도가 올라갈수록(곧 떨어질수록) 더 선명하고 빠르게 깜빡인다
            progress = 1.0 - max(0.0, self.timer) / self.warning_duration
            pulse = (math.sin(self._anim_t * (8.0 + 6.0 * progress)) + 1.0) / 2.0
            alpha = int(90 + 130 * progress)
            ring_color = (255, 70 + int(80 * pulse), 30, alpha)
            center = (self.radius + 4, self.radius + 4)

            for drop in self.drops:
                self._warn_surf.fill((0, 0, 0, 0))  # 재사용 전에 투명하게 지운다
                pygame.draw.circle(self._warn_surf, (255, 60, 20, int(alpha * 0.3)), center, self.radius)
                pygame.draw.circle(self._warn_surf, ring_color, center, self.radius, 4)
                surface.blit(self._warn_surf, (int(drop['x'] - self.radius - 4), int(drop['y'] - self.radius - 4)))

        elif self.state == self.STATE_ACTIVE:
            for drop in self.drops:
                draw_lava_circle(surface, drop['x'], drop['y'], self.radius, self._anim_t, drop['bubbles'])

    def draw_preview(self, surface, preview_rect, scale):
        # 실제 낙하 위치는 매번 무작위라, 미리보기에서는 "이 범위 안에서 떨어진다"는
        # 점선풍 테두리로만 표시한다
        mini_rect = _scale_rect(self.area_rect, preview_rect, scale)
        pygame.draw.rect(surface, (230, 110, 40), mini_rect, 2)


# ==========================================
# 빙판 (고정 지형, 피해 없음)
# ==========================================
class IcePatch:
    """미끄러운 빙판. 그 위에 있는 플레이어의 이동에 관성을 줘서, 방향을 바꾸거나
    멈출 때 서서히 미끄러지는 느낌을 준다. 피해는 없다.

    실제 미끄러짐은 player.py의 이동 로직이 player.ice_friction 값을 읽어서 처리한다
    (여기서는 겹친 플레이어에게 그 값을 걸어주기만 하고, 판정 자체는 사각형 충돌 한 번뿐이라
    가볍다)."""

    def __init__(self, rect, friction=0.08):
        self.rect = pygame.Rect(rect)
        self.friction = friction  # 1.0에 가까울수록 안 미끄러움, 낮을수록 오래 미끄러진다

        # 반투명 얼음 표시를 매 프레임 새 Surface로 만들지 않고 한 번만 만들어 재사용
        self._surf = pygame.Surface(self.rect.size, pygame.SRCALPHA)
        self._surf.fill((190, 225, 245, 90))

    def update(self, dt_sec):
        pass

    def apply_damage(self, players, dt_sec):
        for player in players:
            if player is None:
                continue
            if getattr(player, 'immune_keywords', frozenset()) & MAP_HAZARD_KEYWORDS:
                continue  # 예: 마법사 2스킬 - 맵이 주는 효과(용암/빙판)를 이 동안 무시
            if self.rect.colliderect(player.rect):
                player.on_ice = True
                player.ice_friction = min(getattr(player, 'ice_friction', 1.0), self.friction)

    def draw(self, surface):
        surface.blit(self._surf, self.rect.topleft)
        pygame.draw.rect(surface, (225, 245, 255, 170), self.rect, 2)

    def draw_preview(self, surface, preview_rect, scale):
        mini_rect = _scale_rect(self.rect, preview_rect, scale)
        pygame.draw.rect(surface, (190, 225, 245), mini_rect)


# ==========================================
# 눈보라 이벤트 (횃불 구조물 + 안전 범위, 반복 이벤트)
# ==========================================
class BlizzardEvent:
    """설원 맵용 반복 이벤트. announce(경고 문구가 뜨며 횃불이 즉시 켜짐) -> prepare(주황색
    안전 범위가 표시되는 준비 시간) -> storm(눈보라 - 안전 범위 밖에 있으면 피해) -> idle
    순으로 순환한다. 횃불 위치는 항상 고정이고, 상태에 따라 불이 켜졌다 꺼졌다만 한다.

    용암의 화상(burn)처럼 벗어난 뒤에도 몇 초간 남는 지속피해 개념이 아니라, storm 동안
    안전 범위 밖에 있는 그 순간에만 슬로우+피해가 걸리고 안전지대로 돌아오면 바로 풀린다."""

    STATE_IDLE = 'idle'
    STATE_ANNOUNCE = 'announce'
    STATE_PREPARE = 'prepare'
    STATE_STORM = 'storm'

    # 범위 밖에 있는 동안 이 간격으로 묶어서 피해를 넣는다 (매 프레임 넣으면 데미지 팝업이 도배됨)
    TICK_INTERVAL = 0.4
    # 슬로우는 매 프레임 이 짧은 지속시간으로 다시 걸어서, 범위 밖에 있는 동안만 유지되고
    # 안전지대로 돌아오면(더 이상 갱신되지 않으므로) 금방 풀리게 한다
    SLOW_REFRESH_DURATION = 0.25

    def __init__(self, torch_positions, safe_radius=130, storm_tick_damage=6, storm_slow_power=35,
                 interval_range=(18.0, 26.0), announce_duration=2.5, prepare_duration=4.0, storm_duration=7.0):
        self.torch_positions = list(torch_positions)
        self.safe_radius = safe_radius
        self.storm_tick_damage = storm_tick_damage
        self.storm_slow_power = storm_slow_power
        self.interval_range = interval_range
        self.announce_duration = announce_duration
        self.prepare_duration = prepare_duration
        self.storm_duration = storm_duration

        self.state = self.STATE_IDLE
        self.timer = random.uniform(*interval_range)
        self._anim_t = 0.0
        self._tick_timers = {}  # id(player) -> 다음 피해 틱까지 누적된 시간

        # 안전 범위 표시는 반지름이 고정이라 내용이 항상 같으므로, 매 프레임 새로 그리지 않고
        # 한 번만 만들어서 매 프레임 블릿만 한다 (횃불 5개 x 60fps로 반복 생성하면 낭비가 크다)
        d = self.safe_radius * 2
        self._zone_surf = pygame.Surface((d, d), pygame.SRCALPHA)
        pygame.draw.circle(self._zone_surf, (255, 170, 60, 55), (self.safe_radius, self.safe_radius), self.safe_radius)
        pygame.draw.circle(self._zone_surf, (255, 190, 90, 130), (self.safe_radius, self.safe_radius), self.safe_radius, 3)

        # 눈보라 화면 효과도 마찬가지로 매번 새로 만들지 않고 최초 draw 때 한 번만 만들어 재사용
        # (전체화면 틴트 서피스를 만들려면 화면 크기를 알아야 해서 draw에서 지연 생성한다)
        self._snow_tint = None
        self._snow_particles = None
        self._snow_size = None

    def update(self, dt_sec):
        self._anim_t += dt_sec

        # 눈발 입자는 storm일 때만 움직여서, 다른 상태일 때는 그 비용조차 안 쓰게 한다
        if self.state == self.STATE_STORM and self._snow_particles:
            w, h = self._snow_size
            for flake in self._snow_particles:
                flake['x'] += flake['vx'] * dt_sec
                flake['y'] += flake['vy'] * dt_sec
                if flake['y'] > h:
                    flake['y'] -= h
                if flake['x'] < 0:
                    flake['x'] += w

        self.timer -= dt_sec
        if self.timer > 0:
            return

        if self.state == self.STATE_IDLE:
            self.state = self.STATE_ANNOUNCE
            self.timer = self.announce_duration
        elif self.state == self.STATE_ANNOUNCE:
            self.state = self.STATE_PREPARE
            self.timer = self.prepare_duration
        elif self.state == self.STATE_PREPARE:
            self.state = self.STATE_STORM
            self.timer = self.storm_duration
        elif self.state == self.STATE_STORM:
            self.state = self.STATE_IDLE
            self.timer = random.uniform(*self.interval_range)

    def _in_safe_zone(self, player):
        for tx, ty in self.torch_positions:
            if math.hypot(player.rect.centerx - tx, player.rect.centery - ty) <= self.safe_radius:
                return True
        return False

    def apply_damage(self, players, dt_sec):
        if self.state != self.STATE_STORM:
            return
        for player in players:
            if player is None or getattr(player, 'hp', 0) <= 0:
                continue
            if getattr(player, 'invincible', False):
                continue
            if getattr(player, 'immune_keywords', frozenset()) & MAP_HAZARD_KEYWORDS:
                continue

            pid = id(player)
            if self._in_safe_zone(player):
                self._tick_timers[pid] = 0.0  # 안전지대로 돌아오면 다음에 나갔을 때 바로 한 번 맞도록 리셋
                continue

            # 지속피해가 아니라 "범위 밖에 있는 그 순간"에만 슬로우+피해를 준다.
            # 슬로우는 매 프레임 짧게 다시 걸어서, 안전지대에 들어가는 즉시(더 갱신되지
            # 않으니) 금방 풀리게 한다.
            slow(player, self.SLOW_REFRESH_DURATION, self.storm_slow_power)

            timer = self._tick_timers.get(pid, 0.0) + dt_sec
            if timer >= self.TICK_INTERVAL:
                player.take_damage(self.storm_tick_damage)
                timer -= self.TICK_INTERVAL
            self._tick_timers[pid] = timer

    def _ensure_snow_effect(self, surface):
        if self._snow_tint is not None:
            return
        w, h = surface.get_size()
        self._snow_size = (w, h)

        self._snow_tint = pygame.Surface((w, h), pygame.SRCALPHA)
        self._snow_tint.fill((215, 230, 245, 35))  # 눈보라 특유의 희끄무레한 화면 틴트

        rng = random.Random("blizzard_snow")
        self._snow_particles = [
            {
                'x': rng.uniform(0, w), 'y': rng.uniform(0, h),
                'vx': rng.uniform(-70, -30), 'vy': rng.uniform(160, 240),
                'len': rng.uniform(6, 12),
            }
            for _ in range(24)  # 개수를 적게 유지해서 계산량을 낮게 유지
        ]

    def draw(self, surface):
        lit = self.state in (self.STATE_ANNOUNCE, self.STATE_PREPARE, self.STATE_STORM)

        for tx, ty in self.torch_positions:
            if self.state in (self.STATE_PREPARE, self.STATE_STORM):
                # 안전 범위를 옅은 주황 반투명 원으로 표시 (미리 만들어둔 서피스를 블릿만 함)
                surface.blit(self._zone_surf, (int(tx - self.safe_radius), int(ty - self.safe_radius)))

            # 화톳불 기둥: 꺼져있으면 그냥 그을린 돌더미, 켜지면 흔들리는 불꽃이 붙는다
            base_rect = pygame.Rect(0, 0, 20, 20)
            base_rect.center = (int(tx), int(ty))
            pygame.draw.rect(surface, (70, 60, 55), base_rect)
            pygame.draw.rect(surface, (40, 35, 32), base_rect, 2)

            if lit:
                flicker = (math.sin(self._anim_t * 9.0) + 1.0) / 2.0
                flame_h = 20 + flicker * 8
                pygame.draw.polygon(surface, (255, 140, 30), [
                    (tx - 8, ty - 6), (tx + 8, ty - 6), (tx, ty - 6 - flame_h),
                ])
                pygame.draw.polygon(surface, (255, 220, 90), [
                    (tx - 4, ty - 8), (tx + 4, ty - 8), (tx, ty - 8 - flame_h * 0.55),
                ])

        # 눈보라 화면 효과: 옅은 전체 틴트 + 적은 수의 눈발 선 (계산량을 낮게 유지)
        if self.state == self.STATE_STORM:
            self._ensure_snow_effect(surface)
            surface.blit(self._snow_tint, (0, 0))
            for flake in self._snow_particles:
                x, y = flake['x'], flake['y']
                pygame.draw.line(surface, (245, 250, 255), (x, y), (x + 5, y - flake['len']), 2)

    def draw_overlay(self, surface):
        if self.state != self.STATE_ANNOUNCE:
            return
        width, height = surface.get_size()
        pulse = (math.sin(self._anim_t * 6.0) + 1.0) / 2.0

        font = get_font(34, bold=True)
        text_surf = render_text_cached(font, "눈보라가 곧 다가옵니다!", (170, 225, 255)).copy()
        text_surf.set_alpha(int(180 + 75 * pulse))

        bg_rect = text_surf.get_rect(center=(width // 2, 110)).inflate(28, 16)
        bg_surf = pygame.Surface(bg_rect.size, pygame.SRCALPHA)
        bg_surf.fill((10, 15, 25, 150))
        surface.blit(bg_surf, bg_rect.topleft)
        surface.blit(text_surf, text_surf.get_rect(center=(width // 2, 110)))

    def draw_preview(self, surface, preview_rect, scale):
        for tx, ty in self.torch_positions:
            center = (int(preview_rect.left + tx * scale), int(preview_rect.top + ty * scale))
            pygame.draw.circle(surface, (255, 170, 60), center, max(3, int(self.safe_radius * scale * 0.4)))
