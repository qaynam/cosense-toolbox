#!/usr/bin/env bash
# iOS の CosenseParser.xcframework を作る。実機 (arm64) とシミュレーター (arm64 と x86_64)。
#
#   scripts/build-ios.sh
#
# 出力は dist/ios/CosenseParser.xcframework。Swift からは `import CosenseParser` で読める。
# QuickJS も中に入っているので、ほかにリンクするものは無い。
# 先に bun run bundle で generated/parser_js.c を作っておく。macOS と Xcode が要る。
set -euo pipefail
cd "$(dirname "$0")/.."

deployment_target="${IOS_DEPLOYMENT_TARGET:-13.0}"

build() {
  local name="$1" sysroot="$2" architectures="$3"
  local dir="build/ios-$name"
  cmake -S . -B "$dir" \
    -DCMAKE_SYSTEM_NAME=iOS \
    -DCMAKE_OSX_SYSROOT="$sysroot" \
    -DCMAKE_OSX_ARCHITECTURES="$architectures" \
    -DCMAKE_OSX_DEPLOYMENT_TARGET="$deployment_target" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCOSENSE_PARSER_CLI=OFF
  cmake --build "$dir" --parallel
  # 使う側が QuickJS を別にリンクしなくて済むよう、2 つの静的ライブラリを 1 つにまとめる
  libtool -static -o "$dir/libCosenseParser.a" \
    "$dir/libcosense_parser.a" "$dir/_deps/quickjs-build/libqjs.a"
}

build device iphoneos arm64
build simulator iphonesimulator "arm64;x86_64"

rm -rf dist/ios/CosenseParser.xcframework
mkdir -p dist/ios
xcodebuild -create-xcframework \
  -library build/ios-device/libCosenseParser.a -headers include \
  -library build/ios-simulator/libCosenseParser.a -headers include \
  -output dist/ios/CosenseParser.xcframework
echo "dist/ios/CosenseParser.xcframework に書いた"
