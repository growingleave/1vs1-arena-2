"""전투맵 정의를 한 곳에서 관리한다.

새 맵을 추가하려면:
1. build_walls(벽 목록)와 build_pickups(회복/궁극기 구슬 목록) 함수를 만들고
2. 필요하면 build_hazards(용암 구덩이·빙판 등 고정 지형 목록) 함수도 만들고
3. 필요하면 build_events(경고 후 발동하는 반복 이벤트 목록) 함수도 만들고
4. MAPS 리스트에 {'name', 'build_walls', 'build_pickups', 'build_hazards'(선택),
   'build_events'(선택), 'bg_color'(선택)} 딕셔너리로 등록한다.

build_hazards/build_events가 반환하는 객체는 terrain.py에 정의된 4개 메서드
(update/apply_damage/draw/draw_preview)를 모두 갖춰야 한다 - terrain.py 모듈 docstring 참고.

좌표는 게임 내부 해상도인 1280x720 기준이다.
"""

import pygame
from wall import Wall
from pickup import Pickup
from terrain import LavaPit, LavaFallEvent, IcePatch, BlizzardEvent


def _classic_arena_walls():
    return [
        # 좌상단 ㄴ자 (모서리 우하단)
        Wall(260, 90, 50, 220),
        Wall(110, 270, 200, 50),

        # 우상단 ㄱ자 (모서리 우상단)
        Wall(850, 90, 220, 50),
        Wall(1020, 90, 50, 220),

        # 중앙 세로 벽
        Wall(615, 260, 50, 200),

        # 좌하단 ㄴ자 (모서리 좌하단) - 우상단과 점대칭
        Wall(210, 410, 50, 220),
        Wall(210, 580, 220, 50),

        # 우하단 ㄱ자 (모서리 좌상단) - 좌상단과 점대칭
        Wall(970, 410, 50, 220),
        Wall(970, 400, 200, 50),

        # 화면 상/하단 중앙의 엄폐용 기둥
        Wall(590, 30, 100, 30),
        Wall(590, 660, 100, 30),

        # 좌우 측면 엄폐 기둥 (교전 우회 경로 제공)
        Wall(40, 340, 40, 40),
        Wall(1200, 340, 40, 40),

        # 중앙 십자 교차로의 대각선 엄폐 블록
        Wall(430, 330, 60, 60),
        Wall(790, 330, 60, 60),
    ]


def _classic_arena_pickups():
    return [
        Pickup(200, 200, 'heal'),
        Pickup(960, 175, 'ult'),
        Pickup(320, 550, 'ult'),
        Pickup(1080, 520, 'heal'),
    ]


def _lava_pit_walls():
    walls = [
        # 모서리 화산암 (덩어리형 엄폐물)
        Wall(100, 100, 160, 40),
        Wall(1020, 100, 160, 40),
        Wall(100, 580, 160, 40),
        Wall(1020, 580, 160, 40),

        # 좌우 측면 통로 엄폐 바위
        Wall(40, 320, 40, 80),
        Wall(1200, 320, 40, 80),

        # 상/하단 중앙 진입로 엄폐 바위
        Wall(600, 40, 80, 30),
        Wall(600, 650, 80, 30),

        # 중앙 용암 구덩이를 감싸는 4개의 바위 무더기 (각 2칸씩, 완전히 막지 않고 우회로 제공)
        Wall(430, 170, 50, 50), Wall(480, 220, 50, 50),  # 좌상단
        Wall(800, 170, 50, 50), Wall(750, 220, 50, 50),  # 우상단
        Wall(430, 500, 50, 50), Wall(480, 450, 50, 50),  # 좌하단
        Wall(800, 500, 50, 50), Wall(750, 450, 50, 50),  # 우하단
    ]
    for wall in walls:
        wall.color = (60, 35, 30)  # 그을린 화산암 (붉은 분위기에 맞춰 어두운 적갈색으로)
    return walls


def _lava_pit_pickups():
    return [
        Pickup(150, 150, 'heal'),
        Pickup(1130, 150, 'ult'),
        Pickup(150, 570, 'ult'),
        Pickup(1130, 570, 'heal'),
    ]


def _lava_pit_hazards():
    return [
        LavaPit(640, 360, radius=90, tick_damage=4),
    ]


def _lava_pit_events():
    # 화면 가장자리는 피하고, 가운데 고정 용암 구덩이 근처에도 겹쳐 떨어지지 않게 한다
    drop_area = pygame.Rect(140, 140, 1280 - 280, 720 - 280)
    avoid_center_pit = [(640, 360, 170)]
    return [
        LavaFallEvent(drop_area, radius=70, tick_damage=4,
                      interval_range=(2.0, 4.0), warning_duration=1.3, active_duration=6.0,
                      avoid_zones=avoid_center_pit, drops_per_wave=2),
    ]


def _snowfield_walls():
    walls = [
        # 모서리 얼음 무더기 (ㄴ자/ㄱ자, 클래식 아레나와는 다른 비율의 청빙 덩어리)
        Wall(80, 80, 160, 50), Wall(80, 80, 50, 160),      # 좌상단
        Wall(1040, 80, 160, 50), Wall(1150, 80, 50, 160),  # 우상단
        Wall(80, 590, 160, 50), Wall(80, 480, 50, 160),    # 좌하단
        Wall(1040, 590, 160, 50), Wall(1150, 480, 50, 160),  # 우하단

        # 가운데 얼어붙은 호수를 사이에 둔 얼음 기둥 (호수 자체는 뚫려있어 가로지를 수 있다)
        Wall(520, 310, 40, 100),
        Wall(720, 310, 40, 100),

        # 좌우 측면 얼음벽 (우회 경로 제공)
        Wall(40, 310, 40, 100),
        Wall(1200, 310, 40, 100),

        # 상/하단 중앙 진입로 엄폐 얼음
        Wall(600, 40, 80, 30),
        Wall(600, 650, 80, 30),
    ]
    for wall in walls:
        wall.color = (180, 205, 220)  # 옅은 청빙색
    return walls


def _snowfield_pickups():
    return [
        Pickup(200, 360, 'heal'),
        Pickup(1080, 360, 'ult'),
        Pickup(640, 140, 'ult'),
        Pickup(640, 580, 'heal'),
    ]


def _snowfield_hazards():
    # 가운데 두 얼음 기둥(x520~560, x720~760) 기준으로 왼쪽 벽의 왼쪽/오른쪽 벽의 오른쪽에
    # 세로로 긴 큰 빙판을 하나씩 둔다 - 밟으면 서서히 미끄러진다 (피해는 없음)
    return [
        IcePatch(pygame.Rect(280, 120, 240, 480), friction=0.05),  # 왼쪽 기둥의 왼쪽
        IcePatch(pygame.Rect(760, 120, 240, 480), friction=0.05),  # 오른쪽 기둥의 오른쪽
    ]


# 화톳불 위치: 벽이 없는 네 모서리의 빈 공간 + 중앙 두 얼음 기둥 사이의 빈 틈
_SNOWFIELD_TORCH_POSITIONS = [
    (200, 200), (1080, 200),   # 좌상단, 우상단
    (200, 520), (1080, 520),   # 좌하단, 우하단
    (640, 360),                # 중앙
]


def _snowfield_events():
    return [
        BlizzardEvent(_SNOWFIELD_TORCH_POSITIONS, safe_radius=130,
                       storm_tick_damage=6, storm_slow_power=35,
                       interval_range=(10.0, 15.0), announce_duration=2.5,
                       prepare_duration=4.0, storm_duration=7.0),
    ]


MAPS = [
    {
        'name': '클래식 아레나',
        'build_walls': _classic_arena_walls,
        'build_pickups': _classic_arena_pickups,
    },
    {
        'name': '용암 구덩이',
        'build_walls': _lava_pit_walls,
        'build_pickups': _lava_pit_pickups,
        'build_hazards': _lava_pit_hazards,
        'build_events': _lava_pit_events,
        'bg_color': (35, 14, 12),
    },
    {
        'name': '설원',
        'build_walls': _snowfield_walls,
        'build_pickups': _snowfield_pickups,
        'build_hazards': _snowfield_hazards,
        'build_events': _snowfield_events,
        'bg_color': (18, 26, 38),
    },
]


def get_map(index):
    if 0 <= index < len(MAPS):
        return MAPS[index]
    return MAPS[0]
