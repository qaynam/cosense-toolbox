# パーサーの JS と QuickJS をまとめた C のライブラリ。
#
#   bun run bundle                                  # generated/parser_js.c を作る
#   cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
#   cmake --build build
#
# iOS と Android へのビルドは scripts/build-ios.sh と scripts/build-android.sh。
cmake_minimum_required(VERSION 3.28)
project(cosense_parser LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
# 共有ライブラリから見せるのは cosense_parser.h の関数だけ (COSENSE_PARSER_API)
set(CMAKE_C_VISIBILITY_PRESET hidden)

option(COSENSE_PARSER_SHARED "共有ライブラリ (.so / .dylib) にする。既定は静的ライブラリ" OFF)
option(COSENSE_PARSER_CLI "試すためのコマンド (cosense_parser_cli) も作る" ON)

set(GENERATED_JS "${CMAKE_CURRENT_SOURCE_DIR}/generated/parser_js.c")
if(NOT EXISTS "${GENERATED_JS}")
  message(FATAL_ERROR "generated/parser_js.c が無い。先に apps/parser-native で bun run bundle を動かす")
endif()

# QuickJS は quickjs-ng を、バージョンを決めて取ってくる。手元に置いたものを使うなら
# -DFETCHCONTENT_SOURCE_DIR_QUICKJS=<ディレクトリ> を渡す
include(FetchContent)
FetchContent_Declare(
  quickjs
  URL https://github.com/quickjs-ng/quickjs/archive/refs/tags/v0.17.0.tar.gz
  URL_HASH SHA256=559bc4c420475e55c7ab4510adbc562f55d7524d75e8e89d79ce4bb02f5687d9
  DOWNLOAD_EXTRACT_TIMESTAMP TRUE
  # QuickJS のコマンドやテストは要らない。リンクする qjs だけを作る
  EXCLUDE_FROM_ALL
)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(QJS_BUILD_LIBC OFF CACHE BOOL "" FORCE)
set(QJS_ENABLE_INSTALL OFF CACHE BOOL "" FORCE)
set(QJS_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(quickjs)

if(COSENSE_PARSER_SHARED)
  add_library(cosense_parser SHARED src/cosense_parser.c "${GENERATED_JS}")
else()
  add_library(cosense_parser STATIC src/cosense_parser.c "${GENERATED_JS}")
endif()
target_include_directories(cosense_parser PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/include")
target_link_libraries(cosense_parser PRIVATE qjs)

if(COSENSE_PARSER_CLI)
  add_executable(cosense_parser_cli test/cli.c)
  target_link_libraries(cosense_parser_cli PRIVATE cosense_parser)
endif()
