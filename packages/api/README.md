# @cosense-toolbox/api

Cosense (旧 Scrapbox) の API を呼びます。ページの中身や本文を読み、検索し、関連ページや履歴を辿れます。ページを行の差分で書き換えたり、Cosense 上の画像やファイルを取ってきたりもできます。

> **beta**：公開 API はまだ変わりうる。

### 0.1.0-beta.10 の変更

- 最初のバージョン。`createCosenseApi` で、ページ・本文・検索・関連ページ・「AI 用にエクスポート」・履歴などを読み、
  `computeChanges` で作った行の差分でページを書き換える (`previewEdit` / `submitEdit`)。
- `@cosense-toolbox/cosense-x/fetch` にあった `fetchAsset` / `isCosenseAssetUrl` / `cosenseIconUrl` は、ここに移した。

## インストール

```sh
npm install @cosense-toolbox/api
```

## 使い方

```ts
import { createCosenseApi } from "@cosense-toolbox/api"

const api = createCosenseApi({ pat: process.env.COSENSE_PAT })

const page = await api.getPage("project", "title") // 無ければ null
const text = await api.getPageText("project", "title") // 本文のテキスト。1 行目がタイトル
const { pages } = await api.searchFullText("project", "検索する言葉")
```

- 公開プロジェクトは、`pat` を渡さなくても読める。
- 無いもの (無いページなど) は `null` で返す。
- 失敗は `CosenseApiError` で reject する。`status` に HTTP の status (応答が来なかったら `0`)、`code` に応答の `{"error": "..."}` の値が入る。

```ts
import { CosenseApiError } from "@cosense-toolbox/api"

try {
  await api.me()
} catch (error) {
  if (error instanceof CosenseApiError) console.error(error.status, error.code)
}
```

## オプション

| オプション | 意味                                                                                  |
| :--------- | :------------------------------------------------------------------------------------ |
| `pat`      | Cosense の Personal Access Token。非公開プロジェクトを読むときに渡す                  |
| `origin`   | API の origin。既定は `https://scrapbox.io`                                           |
| `fetch`    | 要求を送る fetch。テストや、キャッシュを挟みたいときに渡す。既定は `globalThis.fetch` |

## 呼べるもの

| 関数                                        | 返すもの                                                                      |
| :------------------------------------------ | :---------------------------------------------------------------------------- |
| `me()`                                      | 自分 (PAT の持ち主)                                                           |
| `projects()`                                | 自分の入っているプロジェクト                                                  |
| `projectDetail(project)`                    | プロジェクトの設定 (画像やファイルの送り先など)                               |
| `projectUsers(project)`                     | ページを書いた人として出てくる人全員 (今のメンバーと、抜けたメンバー)         |
| `listPages(project, options?)`              | ページの一覧と件数。`sort` / `limit` / `skip` と、保存した絞り込みを渡せる    |
| `getPage(project, title)`                   | ページの中身 (行ごとの id や書いた人を含む)。無ければ `null`                  |
| `getPageText(project, title)`               | ページの本文のテキスト。無ければ `null`                                       |
| `relatedPages(project, title)`              | 関連ページ (1 hop と 2 hop)                                                   |
| `exportForAi(project, title, hop, search?)` | 「AI 用にエクスポート」のテキスト。ページと `hop` 以内のリンク先              |
| `searchFullText(project, query)`            | 本文の全文検索。pageRank の順に 100 件まで                                    |
| `searchVector(project, query)`              | タイトルのベクトル検索。使えないプロジェクトでは空の結果                      |
| `searchTitles(project)`                     | すべてのページのタイトルと、そこから出ているリンク                            |
| `pageSnapshots(project, pageId)`            | ページの履歴。新しい順に、最新の 100 件まで                                   |
| `pageSnapshot(project, pageId, snapshotId)` | 履歴のある時点のページ                                                        |
| `previewEdit(project, body)`                | ページの書き換えを用意する (まだ書き換えない)                                 |
| `submitEdit(project, previewId)`            | 用意した書き換えをページに書く                                                |
| `replaceLinks(project, from, to)`           | プロジェクトの中の `from` へのリンクを、すべて `to` へのリンクにする          |
| `markAccessed(project, pageId)`             | ページを開いたことを記録する (未読でなくなる)。記録できなくても reject しない |

日時はどれも Unix 時間の秒。応答はゆるく読み、無い項目は空の値 (`""` や `0`、`[]`) にする。

## ページを書き換える

書き換えは 2 段階で、`previewEdit` で用意してから `submitEdit` で書く。変更は行の id で指すので、今のページの行と書き換えた後の文から `computeChanges` で作る。

```ts
import { computeChanges, createCosenseApi } from "@cosense-toolbox/api"

const api = createCosenseApi({ pat: process.env.COSENSE_PAT })
const page = await api.getPage("project", "title")
const next = ["title", "書き換えた 1 行目", "足した行"]

if (page === null) {
  // 新しいページ。pageId を渡さず、1 行目がタイトルになる
  const preview = await api.previewEdit("project", { changes: computeChanges([], next) })
  await api.submitEdit("project", preview.previewId)
} else {
  const changes = computeChanges(page.lines, next)
  const preview = await api.previewEdit("project", { pageId: page.id, changes })
  // 読んでから書くまでに、ほかの人が書き換えていないか
  if (preview.pagePreview?.commitId !== page.commitId) throw new Error("ページが変わった")
  await api.submitEdit("project", preview.previewId)
}
```

- 変えていない行は送らない。書き換えた行は同じ id のまま文だけ変え (`_update`)、消した行は `_delete`、足した行は新しい id で `_insert` にする。
- 足す行の id は `createLineId` で作る (小文字の 16 進数 24 文字)。`computeChanges` の 3 つめの引数で差し替えられる。
- `pagePreview.commitId` を確かめずに送ると、読んでから書くまでにほかの人が書いた行を、`_update` が上書きすることがある。
- 失敗は `CosenseApiError` の `code` で見分ける。ほかの人が先に書き換えたら `"NotFastForward"`、同じタイトルのページがあれば `"DuplicateTitle"`。

## Cosense 上のファイル

Cosense にアップロードしたファイル (`https://scrapbox.io/files/…`) とアイコン (`/api/pages/…/icon`) を扱う。

```ts
import { cosenseIconUrl, fetchAsset, isCosenseAssetUrl } from "@cosense-toolbox/api"

cosenseIconUrl("help-jp", "cosense") // → https://scrapbox.io/api/pages/help-jp/cosense/icon
isCosenseAssetUrl("https://scrapbox.io/files/xxx.png") // → true
const { data, contentType } = await fetchAsset("https://scrapbox.io/files/xxx.png", { pat })
```

- これらのファイルは `Cross-Origin-Resource-Policy: same-origin` を返すので、別のサイトの `<img>` からは読めない。
- リダイレクト先の URL は期限付き (`/files/` は 5 分) なので、解決した URL を埋め込んでもすぐ表示されなくなる。静的なサイトでは中身を取ってきてサイトの中に置く ([`@cosense-toolbox/astro`](../astro-cosense) はこれを自動で行う)。
- `fetchAsset` はリダイレクトを 5 回まで自分で辿り、PAT は Cosense (`origin`) への要求にだけ付ける。リダイレクト先の Google Cloud Storage や Gyazo には送らない。取れなければ `CosenseApiError` で reject する。

## 気をつけること

### PAT は `origin` にだけ送る

リダイレクトは fetch に任せず、自分で辿る。同じ `origin` へのリダイレクト (名前を変えたページなど) は PAT を付けたまま 3 回まで辿り、別の origin へのリダイレクトは辿らずに失敗する。PAT を付けたまま別のサイトへ送らないため。

### `searchTitles` は何度も要求することがある

Cosense は 1 回に 10000 件までしか返さないので、大きいプロジェクトでは続きを順に取る。続きがあると言い続けても、20 回 (20 万件) で止める。

## effect で使う

effect を使っているなら、`@cosense-toolbox/api/effect` から effect の型のまま使える。無いものは `Option`、失敗は `CosenseApiError` (`_tag: "CosenseApiError"`) になる。

要求は `HttpClient` を通して送るので、`HttpClientLive` (`globalThis.fetch`) か、`httpClientOf(fetch)` で作ったものを渡す。テストでは `HttpClient` を差し替えられる。

```ts
import { createCosenseApi, HttpClientLive } from "@cosense-toolbox/api/effect"
import { Effect } from "effect"

const api = createCosenseApi({ pat: process.env.COSENSE_PAT })

const page = await Effect.runPromise(
  api.getPage("project", "title").pipe(Effect.provide(HttpClientLive)),
) // Option<PageDetail>
```

## ライセンス

MIT
