#include "cosense_parser.h"

#include <stdlib.h>
#include <string.h>

#include "quickjs.h"

/* bun run bundle が generated/parser_js.c に書く、パーサーの JS */
extern const unsigned char cosense_parser_js[];
extern const size_t cosense_parser_js_length;

struct CosenseParser {
  JSRuntime *runtime;
  JSContext *context;
  /* globalThis.cosenseParser の 2 つの関数。作るときに 1 度だけ引いておく */
  JSValue parse_line;
  JSValue parse;
  char *last_error;
};

static void set_error(CosenseParser *parser, const char *message) {
  free(parser->last_error);
  parser->last_error = NULL;
  if (message == NULL) return;
  size_t length = strlen(message);
  parser->last_error = malloc(length + 1);
  if (parser->last_error != NULL) memcpy(parser->last_error, message, length + 1);
}

/* 投げられた例外を文字列にして、last_error に残す */
static void keep_exception(CosenseParser *parser) {
  JSValue exception = JS_GetException(parser->context);
  const char *message = JS_ToCString(parser->context, exception);
  set_error(parser, message != NULL ? message : "JS の例外を文字列にできなかった");
  JS_FreeCString(parser->context, message);
  JS_FreeValue(parser->context, exception);
}

static JSValue function_of(JSContext *context, JSValue object, const char *name) {
  JSValue value = JS_GetPropertyStr(context, object, name);
  if (!JS_IsFunction(context, value)) {
    JS_FreeValue(context, value);
    return JS_UNDEFINED;
  }
  return value;
}

CosenseParser *cosense_parser_new(void) {
  CosenseParser *parser = calloc(1, sizeof(CosenseParser));
  if (parser == NULL) return NULL;
  parser->parse_line = JS_UNDEFINED;
  parser->parse = JS_UNDEFINED;
  parser->runtime = JS_NewRuntime();
  if (parser->runtime == NULL) goto fail;
  parser->context = JS_NewContext(parser->runtime);
  if (parser->context == NULL) goto fail;

  JSValue loaded = JS_Eval(parser->context, (const char *)cosense_parser_js,
                           cosense_parser_js_length, "parser.js", JS_EVAL_TYPE_GLOBAL);
  if (JS_IsException(loaded)) goto fail;
  JS_FreeValue(parser->context, loaded);

  JSValue global = JS_GetGlobalObject(parser->context);
  JSValue api = JS_GetPropertyStr(parser->context, global, "cosenseParser");
  parser->parse_line = function_of(parser->context, api, "parseLine");
  parser->parse = function_of(parser->context, api, "parse");
  JS_FreeValue(parser->context, api);
  JS_FreeValue(parser->context, global);
  if (JS_IsUndefined(parser->parse_line) || JS_IsUndefined(parser->parse)) goto fail;
  return parser;

fail:
  cosense_parser_free(parser);
  return NULL;
}

void cosense_parser_free(CosenseParser *parser) {
  if (parser == NULL) return;
  if (parser->context != NULL) {
    JS_FreeValue(parser->context, parser->parse_line);
    JS_FreeValue(parser->context, parser->parse);
    JS_FreeContext(parser->context);
  }
  if (parser->runtime != NULL) JS_FreeRuntime(parser->runtime);
  free(parser->last_error);
  free(parser);
}

/* `function` に `text` を渡し、返ってきた JSON の文字列を、呼んだ側が捨てられる形で返す */
static char *call(CosenseParser *parser, JSValue function, const char *text, size_t length) {
  if (parser == NULL || text == NULL) return NULL;
  set_error(parser, NULL);
  JSValue argument = JS_NewStringLen(parser->context, text, length);
  JSValue result = JS_Call(parser->context, function, JS_UNDEFINED, 1, &argument);
  JS_FreeValue(parser->context, argument);
  if (JS_IsException(result)) {
    keep_exception(parser);
    return NULL;
  }

  size_t json_length = 0;
  const char *json = JS_ToCStringLen(parser->context, &json_length, result);
  JS_FreeValue(parser->context, result);
  if (json == NULL) {
    keep_exception(parser);
    return NULL;
  }
  /* QuickJS の文字列はエンジンが持つので、エンジンの外で捨てられるよう写す */
  char *copy = malloc(json_length + 1);
  if (copy != NULL) memcpy(copy, json, json_length + 1);
  JS_FreeCString(parser->context, json);
  if (copy == NULL) set_error(parser, "JSON を写すメモリが無い");
  return copy;
}

char *cosense_parse_line(CosenseParser *parser, const char *text, size_t length) {
  return parser == NULL ? NULL : call(parser, parser->parse_line, text, length);
}

char *cosense_parse(CosenseParser *parser, const char *text, size_t length) {
  return parser == NULL ? NULL : call(parser, parser->parse, text, length);
}

void cosense_string_free(char *string) { free(string); }

const char *cosense_parser_last_error(const CosenseParser *parser) {
  return parser != NULL && parser->last_error != NULL ? parser->last_error : "";
}
