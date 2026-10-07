# CLAUDE.md

## 公開の型に effect を出さない

中は effect + FP で書く (`Option` / `Effect` / `Schema` / `Match` / `pipe`)。ただし、使う人に見える型には effect を出さない。
使う人が effect を知らなくても使えるようにするため (parser と cosense-x と同じ決まり)。

- サブパス (`./link` `./completion` `./tokens` `./media` `./check` `./suggest`) の入口は `src/public/*.ts`。
  中のモジュールを `export *` し、effect の型を返す関数だけを同じ名前で包み直す
  - `Option<A>` は `Option.getOrNull` で `A | null` にする
  - `Effect<A>` は `Effect.runPromise` で `Promise<A>` にする
  - `Schema.Literal(...)` の値は出さず、素の配列 (`TOKEN_NAMES`) とその要素の型にする。`Schema` は中でその配列から作る
- 中のモジュール (`src/*.ts`) とサーバー (`server.ts`) は effect の型のまま使う。公開の関数を呼んで effect に戻すことはしない
- 中のモジュールに effect の型を返す関数を足して、それを入口からそのまま出してしまうと、`check:public-types` が CI で止める:

  ```sh
  bun run build && bun run check:public-types
  ```
