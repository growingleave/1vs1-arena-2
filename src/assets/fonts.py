import os
import pygame

_FONT_DIR = os.path.join(os.path.dirname(__file__), 'font', 'fonts')

_FONT_FILES = {
    False: 'NotoSansKR-Regular.ttf',
    True: 'NotoSansKR-Bold.ttf',
}

_cache = {}


def get_font(size, bold=False):
    """한글이 포함된 번들 폰트를 크기/굵기별로 캐싱해서 반환한다.
    시스템 폰트(SysFont)에 의존하지 않으므로 브라우저(WASM) 환경에서도 동일하게 동작하고,
    매 프레임 새로 만들지 않아 렌더링 비용도 줄어든다."""
    key = (size, bold)
    cached = _cache.get(key)
    if cached is not None:
        return cached

    path = os.path.join(_FONT_DIR, _FONT_FILES[bold])
    font = pygame.font.Font(path, size)
    _cache[key] = font
    return font


_render_cache = {}


def render_text_cached(font, text, color):
    """폰트별 텍스트 렌더링 결과를 캐싱한다. 같은 문자열/색상이면 매 프레임 다시
    래스터라이즈하지 않고 이전에 만든 Surface를 그대로 재사용한다."""
    key = (id(font), text, color)
    cached = _render_cache.get(key)
    if cached is not None:
        return cached
    surf = font.render(text, True, color)
    _render_cache[key] = surf
    return surf
