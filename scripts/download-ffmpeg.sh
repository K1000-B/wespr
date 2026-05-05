#!/bin/bash
set -e
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BINARIES="$PROJECT_ROOT/resources/binaries"
mkdir -p "$BINARIES"

FFMPEG_VERSION="7.1"
BASE="https://evermeet.cx/ffmpeg"

echo "→ Téléchargement ffmpeg $FFMPEG_VERSION..."
curl -L "$BASE/ffmpeg-$FFMPEG_VERSION.7z" -o /tmp/wespr-ffmpeg.7z
7z x /tmp/wespr-ffmpeg.7z -o/tmp/wespr-ffmpeg/ -y
cp /tmp/wespr-ffmpeg/ffmpeg "$BINARIES/ffmpeg"

echo "→ Téléchargement ffprobe..."
curl -L "$BASE/ffprobe-$FFMPEG_VERSION.7z" -o /tmp/wespr-ffprobe.7z
7z x /tmp/wespr-ffprobe.7z -o/tmp/wespr-ffprobe/ -y
cp /tmp/wespr-ffprobe/ffprobe "$BINARIES/ffprobe"

chmod +x "$BINARIES/ffmpeg" "$BINARIES/ffprobe"
rm -rf /tmp/wespr-ffmpeg* /tmp/wespr-ffprobe*
echo "✓ ffmpeg + ffprobe dans $BINARIES"

