#!/usr/bin/env bash
# Android の共有ライブラリ (libcosense_parser.so) を ABI ごとに作る。
#
#   ANDROID_NDK_HOME=<NDK の場所> scripts/build-android.sh
#
# 出力は dist/android/。jniLibs/<ABI>/libcosense_parser.so と cosense_parser.h。
# 先に bun run bundle で generated/parser_js.c を作っておく。
set -euo pipefail
cd "$(dirname "$0")/.."

ndk="${ANDROID_NDK_HOME:-${ANDROID_NDK_ROOT:-}}"
if [ -z "$ndk" ]; then
  echo "ANDROID_NDK_HOME に NDK の場所を入れる" >&2
  exit 1
fi
api="${ANDROID_API:-24}"
abis="${ANDROID_ABIS:-arm64-v8a armeabi-v7a x86_64}"

for abi in $abis; do
  cmake -S . -B "build/android-$abi" \
    -DCMAKE_TOOLCHAIN_FILE="$ndk/build/cmake/android.toolchain.cmake" \
    -DANDROID_ABI="$abi" \
    -DANDROID_PLATFORM="android-$api" \
    -DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON \
    -DCMAKE_BUILD_TYPE=Release \
    -DCOSENSE_PARSER_SHARED=ON \
    -DCOSENSE_PARSER_CLI=OFF
  cmake --build "build/android-$abi" --parallel
  mkdir -p "dist/android/jniLibs/$abi"
  cp "build/android-$abi/libcosense_parser.so" "dist/android/jniLibs/$abi/"
done
cp include/cosense_parser.h dist/android/
echo "dist/android に書いた"
