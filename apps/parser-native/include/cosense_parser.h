/*
 * Cosense の記法のパーサーを、C から使うための入口。
 *
 * 中身は @cosense-toolbox/parser の JS そのもので、埋め込んだ QuickJS が動かす。
 * 文字列は UTF-8 で渡し、AST は JSON (UTF-8) で受け取る。AST の位置 (`column`) は
 * JS の文字列と同じく UTF-16 の単位で数える。iOS の NSString や Android の String と同じ単位。
 *
 * パーサー (CosenseParser) は 1 つの JS エンジンを持つ。エンジンはスレッドを跨いで
 * 使えないので、パーサーは作ったスレッドの中だけで使う。
 */
#ifndef COSENSE_PARSER_H
#define COSENSE_PARSER_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* 共有ライブラリから外に見せるのは、この宣言の関数だけにする (QuickJS の関数は見せない) */
#if defined(_WIN32)
#define COSENSE_PARSER_API __declspec(dllexport)
#else
#define COSENSE_PARSER_API __attribute__((visibility("default")))
#endif

typedef struct CosenseParser CosenseParser;

/* パーサーを作る。JS を読むので、数ミリ秒かかる。作れなければ NULL。 */
COSENSE_PARSER_API CosenseParser *cosense_parser_new(void);

/* パーサーとそのエンジンを捨てる。NULL を渡してもよい。 */
COSENSE_PARSER_API void cosense_parser_free(CosenseParser *parser);

/*
 * 本文の 1 行 `text` (UTF-8、`length` バイト) を読み、行のノードを JSON で返す。
 * 返した文字列は cosense_string_free で捨てる。失敗すれば NULL で、
 * 理由は cosense_parser_last_error で読める。
 */
COSENSE_PARSER_API char *cosense_parse_line(CosenseParser *parser, const char *text, size_t length);

/* ページ全体 `text` を読み、AST を JSON で返す。返り値の扱いは cosense_parse_line と同じ。 */
COSENSE_PARSER_API char *cosense_parse(CosenseParser *parser, const char *text, size_t length);

/* cosense_parse_line と cosense_parse が返した文字列を捨てる。NULL を渡してもよい。 */
COSENSE_PARSER_API void cosense_string_free(char *string);

/*
 * 最後に失敗した理由。失敗していなければ空の文字列。
 * 文字列はパーサーが持つので、次に呼ぶまでのあいだだけ読める。
 */
COSENSE_PARSER_API const char *cosense_parser_last_error(const CosenseParser *parser);

#ifdef __cplusplus
}
#endif

#endif
