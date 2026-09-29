import os
import pygame

# main.py가 pygame.init()을 부르기 전에 이 모듈이 먼저 import될 수 있으므로,
# 사운드는 여기서 즉시 로드하지 않고 실제로 재생을 시도하는 시점에 지연 로드한다.
_SOUND_DIR = os.path.join(os.path.dirname(__file__), 'sounds')

_SOUND_PATHS = {
    # ogg 사용: 브라우저(WASM) 빌드에서 mp3는 안정적으로 지원되지 않아 ogg로 변환해둠.
    # 파일명에 공백이 있으면 웹 빌드 패키징이 거부하기 때문에 공백 없는 이름을 사용한다.
    'hit': os.path.join(_SOUND_DIR, 'hit.ogg'),
}

_sounds = {}


def _get_sound(name):
    if name in _sounds:
        return _sounds[name]

    sound = None
    path = _SOUND_PATHS.get(name)
    if path and os.path.exists(path):
        try:
            sound = pygame.mixer.Sound(path)
        except Exception as e:
            print(f"사운드 로드 실패: {path} ({e})")

    _sounds[name] = sound
    return sound


def play_sound(name, max_ms=None, volume=1.0):
    sound = _get_sound(name)
    if sound is None:
        return
    try:
        sound.set_volume(volume)
        if max_ms is not None:
            sound.play(maxtime=max_ms)
        else:
            sound.play()
    except Exception as e:
        print(f"사운드 재생 실패: {name} ({e})")


def play_hit_sound(intensity=1.0):
    """피격 사운드의 0~0.18초 구간만 재생. 사운드 자체가 강한 공격 기준으로 만들어져
    있어서, intensity(0~1, 데미지가 클수록 1에 가까움)에 비례해 볼륨을 낮춘다."""
    volume = max(0.25, min(1.0, intensity))
    play_sound('hit', max_ms=180, volume=volume)
