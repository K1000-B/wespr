#!/bin/bash
set -e
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BINARIES="$PROJECT_ROOT/resources/binaries"
mkdir -p "$BINARIES"

echo "→ Clonage whisper.cpp..."
rm -rf /tmp/wespr-whisper-src
git clone --depth=1 https://github.com/ggml-org/whisper.cpp.git /tmp/wespr-whisper-src
cd /tmp/wespr-whisper-src

echo "→ Build arm64..."
cmake -B build-arm64 -DCMAKE_OSX_ARCHITECTURES=arm64 -DWHISPER_NO_METAL=OFF -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF
cmake --build build-arm64 --target whisper-cli -j$(sysctl -n hw.logicalcpu)
cp build-arm64/bin/whisper-cli "$BINARIES/whisper-cli-arm64"

echo "→ Build x86_64..."
cmake -B build-x64 -DCMAKE_OSX_ARCHITECTURES=x86_64 -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF
cmake --build build-x64 --target whisper-cli -j$(sysctl -n hw.logicalcpu)
cp build-x64/bin/whisper-cli "$BINARIES/whisper-cli-x64"

echo "→ Universal binary..."
lipo -create -output "$BINARIES/whisper-cli" \
  "$BINARIES/whisper-cli-arm64" \
  "$BINARIES/whisper-cli-x64"

rm -rf /tmp/wespr-whisper-src
echo "✓ whisper-cli buildé dans $BINARIES"

