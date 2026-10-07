# parser-native

`@cosense-toolbox/parser` を、iOS や Android のネイティブのコードから使うための C のライブラリです。

パーサーは JS のまま持ちます。ビルドでパーサーを 1 つの JS にまとめ、小さな JS エンジン ([QuickJS](https://github.com/quickjs-ng/quickjs)、quickjs-ng のバージョン 0.17.0) と一緒に C のライブラリにします。パーサーを直したら、ここは作り直すだけで済みます。

- 結果は JS のパーサーと一字一句同じです。記法仕様 (`packages/parser/src/fixtures/conformance.json`) のすべての入力と、位置の数え方が分かれやすい行で確かめています (`bun run compare`)
- AST の位置 (`column`) は JS と同じく UTF-16 の単位で数えます。iOS の `NSString` や Android の `String` と同じ単位なので、そのまま使えます
- AST は JSON の文字列で受け渡します

npm には出しません。

## ビルド

先にパーサーをビルドし、1 つの JS にまとめます。

```sh
bunx turbo run build --filter=@cosense-toolbox/parser
cd apps/parser-native
bun run bundle      # generated/parser.js と generated/parser_js.c
```

| 向け先              | コマンド                                                                | 出力                                                    |
| :------------------ | :---------------------------------------------------------------------- | :------------------------------------------------------ |
| 手元 (試す、比べる) | `cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build` | `build/libcosense_parser.a`、`build/cosense_parser_cli` |
| iOS                 | `scripts/build-ios.sh` (macOS と Xcode が要る)                          | `dist/ios/CosenseParser.xcframework`                    |
| Android             | `ANDROID_NDK_HOME=<NDK の場所> scripts/build-android.sh`                | `dist/android/jniLibs/<ABI>/libcosense_parser.so`       |

QuickJS は CMake が取ってきます (バージョンとハッシュは `CMakeLists.txt` で決めています)。

手元でビルドしたら、JS のパーサーと結果を比べられます。

```sh
bun run compare
```

## C の API

`include/cosense_parser.h` にあります。

```c
CosenseParser *parser = cosense_parser_new();           // JS を読むので数ミリ秒かかる
char *json = cosense_parse_line(parser, text, length);  // UTF-8 を渡し、行の JSON を受け取る
// ページ全体なら cosense_parse(parser, text, length)
if (json == NULL) puts(cosense_parser_last_error(parser));
cosense_string_free(json);
cosense_parser_free(parser);
```

- iOS の xcframework は `import CosenseParser` で Swift から読めます。QuickJS も中に入っています
- Android の `.so` から見えるのは `cosense_*` の関数だけです。Kotlin から呼ぶには JNI の関数を別に書きます (このライブラリには入っていません)

## 使うときに気を付けること

- **パーサーはスレッドごとに 1 つ作ります。** JS エンジンはスレッドを跨いで使えません。入力欄の色付けなら、UI のスレッドに 1 つ持っておきます
- **スレッドのスタックは 1MB 以上にします。** QuickJS は 1MB までスタックを使ってよいものとして動きます。iOS のメインスレッド以外のスレッドは既定で 512KB しか無いので、`Thread` の `stackSize` を広げるか、メインスレッドで使います
- **大きさ**: Android の arm64 で、シンボルを落として約 1.1MB です (Android Gradle Plugin はアプリに入れるときに落とします)。ABI ごとに 1 つずつ入ります
- **速さ**: M シリーズの Mac で、パーサーを作るのに約 10ms、1 行の `cosense_parse_line` (JSON にするところまで) が約 0.16ms でした。スマートフォンではこれより遅くなります
- **記法の拡張** (`extensions`) を使うときは、`src/entry.ts` で `parseLine` / `parse` に渡してから束ねます

## 仕組み

1. `scripts/bundle.ts` が `src/entry.ts` を起点にパーサーを 1 つの JS (iife) にまとめ、C の配列として `generated/parser_js.c` に書きます。effect は使っている部分だけが入ります
2. `src/cosense_parser.c` が QuickJS のエンジンを作ってその JS を読み、`globalThis.cosenseParser` の関数を呼びます
3. JS はバイトコードにせず、そのまま埋め込んでいます。バイトコードにすると、iOS や Android へのクロスビルドの途中で、ビルドする機械向けの `qjsc` を別に作って動かす手間が増えるためです。JS を読むのはパーサーを作るときの 1 度だけです

## CI

`.github/workflows/native.yml` が、パーサーかここが変わったときに動きます。

- Linux で AddressSanitizer と UndefinedBehaviorSanitizer を付けてビルドし、JS のパーサーと結果を比べる
- Android の 3 つの ABI (arm64-v8a、armeabi-v7a、x86_64) でビルドし、`cosense_*` 以外の関数を見せていないことを確かめる
- iOS の xcframework を作り、Swift から import してリンクできることを確かめる

Android と iOS のビルドしたものは、CI の artifact から取れます。
