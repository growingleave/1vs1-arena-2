#!/bin/sh
# 효과음 파일 → web/js/sfx_data.js (짧은 mono ogg를 base64로 넣음. index.html을 파일로 직접 열어도 재생되게)
# 원본: tools/sfx_src/<이름>_src.mp3 (사용자가 준 파일). 실행: sh tools/sfx_build.sh
set -e
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
# 이름 | ffmpeg 필터 (배속은 asetrate로 → 피치도 같이 올라감)
build() {
  ffmpeg -v error -y -i "tools/sfx_src/$1_src.mp3" -ac 1 -af "$2" -ar 32000 -c:a libvorbis -q:a 3 "$TMP/$1.ogg"
}
build mg_basic  "asetrate=44100*1.35,aresample=44100,afade=t=out:st=0.42:d=0.12"      # 마법사 평타: 1.35배속 (피치 올림)
build mg_skill1 "atrim=0.25,asetpts=PTS-STARTPTS,asetrate=44100*1.35,aresample=44100,afade=t=in:d=0.02,afade=t=out:st=1.0:d=0.33" # 마법사 스킬1 레이저: 앞 0.25초 잘라 가장 큰 순간을 발사(0.45초)에 맞춤 + 1.35배속
build mg_skill2 "atrim=0:2.2,afade=t=out:st=1.8:d=0.4"                                # 마법사 스킬2 (2초 망령화): 원래 속도, 끝만 부드럽게
{
  echo "// 자동 생성: tools/sfx_build.sh (원본 tools/sfx_src). 직접 고치지 말 것"
  echo "const SFX_FILES = {"
  for f in "$TMP"/*.ogg; do n=$(basename "$f" .ogg); echo "    $n: '$(base64 -w0 "$f")',"; done
  echo "};"
} > web/js/sfx_data.js
ls -la "$TMP"; rm -rf "$TMP"
