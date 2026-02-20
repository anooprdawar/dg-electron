#!/bin/bash
set -euo pipefail

# Build universal macOS binaries (arm64 + x86_64)
# Output: ../../bin/dg-system-audio, ../../bin/dg-mic-audio

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NATIVE_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$(dirname "$NATIVE_DIR")/bin"

cd "$NATIVE_DIR"

echo "Building for arm64..."
swift build -c release --arch arm64

echo "Building for x86_64..."
swift build -c release --arch x86_64

# Create bin directory
mkdir -p "$BIN_DIR"

ARM64_DIR=".build/arm64-apple-macosx/release"
X86_DIR=".build/x86_64-apple-macosx/release"

for BINARY in dg-system-audio dg-mic-audio; do
    echo "Creating universal binary: $BINARY"
    lipo -create \
        "$ARM64_DIR/$BINARY" \
        "$X86_DIR/$BINARY" \
        -output "$BIN_DIR/$BINARY"

    chmod +x "$BIN_DIR/$BINARY"

    # Verify
    echo "  Architectures: $(lipo -archs "$BIN_DIR/$BINARY")"
    echo "  Size: $(du -h "$BIN_DIR/$BINARY" | cut -f1)"
done

echo ""
echo "Universal binaries built successfully in $BIN_DIR"
