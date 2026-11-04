#!/bin/sh
# 피격 소리 web/assets/hit.ogg 의 앞 0.25초를 mono ogg로 줄여 base64로 → web/js/hit_sound_data.js
# (index.html을 파일로 직접 열어도 재생되게 소리를 JS 안에 넣는다). 실행: sh tools/hit_sound_build.sh
set -e
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
ffmpeg -v error -y -i web/assets/hit.ogg -ac 1 -t 0.25 -ar 32000 -c:a libvorbis -q:a 4 "$TMP/hit.ogg"
{
  echo "// 자동 생성: tools/hit_sound_build.sh (원본 web/assets/hit.ogg). 직접 고치지 말 것"
  echo "const HIT_SOUND_DATA = '$(base64 -w0 "$TMP/hit.ogg")';"
} > web/js/hit_sound_data.js
ls -la "$TMP/hit.ogg"; rm -rf "$TMP"
