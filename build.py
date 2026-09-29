"""src/ 폴더의 게임 코드로 웹 배포용 web_src.tar.gz / web_src.apk 를 다시 만든다.

사용법: python build.py
"""
import gzip
import io
import os
import tarfile
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")


def collect_files():
    """assets/ 아래 파일 목록 (최상위 파일 먼저, 그다음 하위 폴더 순)."""
    files = []
    for dirpath, dirnames, filenames in os.walk(os.path.join(SRC, "assets")):
        dirnames.sort()
        for name in sorted(filenames):
            if name.endswith(".pyc") or name == ".DS_Store":
                continue
            full = os.path.join(dirpath, name)
            files.append(os.path.relpath(full, SRC).replace(os.sep, "/"))
    return files


def build_tar(files):
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w", format=tarfile.USTAR_FORMAT) as tar:
        for rel in files:
            with open(os.path.join(SRC, rel), "rb") as f:
                data = f.read()
            info = tarfile.TarInfo(rel)
            info.size = len(data)
            info.mode = 0o644
            info.mtime = 0
            tar.addfile(info, io.BytesIO(data))
    with open(os.path.join(ROOT, "web_src.tar.gz"), "wb") as out:
        out.write(gzip.compress(buf.getvalue(), compresslevel=9, mtime=0))


def build_apk(files):
    with zipfile.ZipFile(os.path.join(ROOT, "web_src.apk"), "w", zipfile.ZIP_DEFLATED) as zf:
        for rel in files:
            zf.write(os.path.join(SRC, rel), rel)


if __name__ == "__main__":
    files = collect_files()
    build_tar(files)
    build_apk(files)
    print(f"{len(files)}개 파일로 web_src.tar.gz, web_src.apk 생성 완료")
