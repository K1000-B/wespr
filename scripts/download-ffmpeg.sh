#!/bin/bash
set -e
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BINARIES="$PROJECT_ROOT/resources/binaries"
mkdir -p "$BINARIES"

FFMPEG_VERSION="7.1"
BASE="https://evermeet.cx/ffmpeg"

echo "→ Téléchargement ffmpeg $FFMPEG_VERSION..."
curl -L "$BASE/ffmpeg-$FFMPEG_VERSION.zip" -o /tmp/wespr-ffmpeg.zip
unzip -oq /tmp/wespr-ffmpeg.zip -d /tmp/wespr-ffmpeg/
cp /tmp/wespr-ffmpeg/ffmpeg "$BINARIES/ffmpeg"

echo "→ Téléchargement ffprobe..."
curl -L "$BASE/ffprobe-$FFMPEG_VERSION.zip" -o /tmp/wespr-ffprobe.zip
unzip -oq /tmp/wespr-ffprobe.zip -d /tmp/wespr-ffprobe/
cp /tmp/wespr-ffprobe/ffprobe "$BINARIES/ffprobe"

chmod +x "$BINARIES/ffmpeg" "$BINARIES/ffprobe"
rm -rf /tmp/wespr-ffmpeg* /tmp/wespr-ffprobe*
echo "✓ ffmpeg + ffprobe dans $BINARIES"
