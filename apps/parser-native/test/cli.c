/*
 * 試すための小さなコマンド。標準入力の文字列を、それぞれの終わりの NUL で切り分けて 1 つずつ読み、
 * 結果の JSON を 1 行ずつ書く (JSON の中の改行はエスケープされるので、行で区切れる)。
 * 空の文字列も読めるよう、区切りではなく終わりの印にしている。最後の NUL は省いてもよい。
 *
 *   cosense_parser_cli line < 入力   本文の 1 行として読む (parseLine)
 *   cosense_parser_cli page < 入力   ページとして読む (parse)
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cosense_parser.h"

static char *read_all(FILE *file, size_t *length) {
  size_t capacity = 1 << 16;
  char *buffer = malloc(capacity);
  *length = 0;
  while (buffer != NULL) {
    size_t read = fread(buffer + *length, 1, capacity - *length, file);
    *length += read;
    if (read == 0) break;
    if (*length == capacity) {
      capacity *= 2;
      char *grown = realloc(buffer, capacity);
      if (grown == NULL) free(buffer);
      buffer = grown;
    }
  }
  return buffer;
}

int main(int argc, char **argv) {
  if (argc != 2 || (strcmp(argv[1], "line") != 0 && strcmp(argv[1], "page") != 0)) {
    fprintf(stderr, "使い方: %s line|page < 入力\n", argv[0]);
    return 2;
  }
  int page = strcmp(argv[1], "page") == 0;

  size_t length = 0;
  char *input = read_all(stdin, &length);
  if (input == NULL) return 1;

  CosenseParser *parser = cosense_parser_new();
  if (parser == NULL) {
    fprintf(stderr, "パーサーを作れなかった\n");
    return 1;
  }

  int status = 0;
  size_t start = 0;
  while (start < length) {
    const char *end = memchr(input + start, '\0', length - start);
    size_t size = end != NULL ? (size_t)(end - (input + start)) : length - start;
    char *json = page ? cosense_parse(parser, input + start, size)
                      : cosense_parse_line(parser, input + start, size);
    if (json == NULL) {
      fprintf(stderr, "読めなかった: %s\n", cosense_parser_last_error(parser));
      status = 1;
      puts("null");
    } else {
      puts(json);
      cosense_string_free(json);
    }
    start += size + 1;
  }

  cosense_parser_free(parser);
  free(input);
  return status;
}
