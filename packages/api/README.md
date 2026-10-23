# @cosense-toolbox/api

Cosense (旧 Scrapbox) の API を呼びます。ページの中身や本文を読み、検索し、関連ページや履歴を辿れます。ページを行の差分で書き換えたり、Cosense 上の画像やファイルを取ってきたりもできます。

> **beta**：公開 API はまだ変わりうる。

### 1.0.0 の変更

- **破壊的変更:** プロジェクトの中のものは、`api.project(name)` でプロジェクトを決めてから呼ぶようにした (Promise と effect の両方の入口)。
  `api.getPage("my-project", "title")` と書いていたところは `api.project("my-project").getPage("title")` になる。
  プロジェクトの名前は `project` で 1 回だけエンコードし、空の名前と `.`、`..` は `TypeError` にする。
- **破壊的変更:** 名前を変えた。
  - `me()` → `getMe()`
  - `projects()` → `listProjects()`
  - `projectDetail(project)` → `project(project).getProject()`
  - `projectUsers(project)` → `project(project).listUsers()`
  - `relatedPages(project, title)` → `project(project).getRelatedPages(title)`
  - `searchTitles(project)` → `project(project).listTitles()`。探すのではなく、すべてのタイトルを返すため
  - `pageSnapshots(project, pageId)` → `project(project).listSnapshots(pageId)`
  - `pageSnapshot(project, pageId, snapshotId)` → `project(project).getSnapshot(pageId, snapshotId)`
- **破壊的変更:** `exportForAi(project, title, hop, search?)` を `project(project).exportForAi(title, { hop, search })` にした。`hop` を省くと 1 hop。
- **破壊的変更:** `origin` が http(s) の origin でなければ (URL として読めない文字列や、パスの付いたもの)、`createCosenseApi` と `isCosenseAssetUrl`、`cosenseIconUrl` が `TypeError` を投げるようにした。後ろの `/` は除いて使う。これまでは `https://scrapbox.io/` を渡すと `https://scrapbox.io//api/…` に送り、`isCosenseAssetUrl` はどの URL も Cosense 上のファイルとしなかった。
- Infobox を読めるようにした。`getPage` と `getRelatedPages` の結果に、Infobox の定義と本文から抜き出した値 (`infoboxDefinition` / `infoboxResult` / `infoboxDisableLinks`) を入れ、ページの Infobox だけを読む `getInfobox` を足した。`getProject` の結果には、Infobox を使うプロジェクトか (`infobox`) を入れた。
- ページの Infobox の抜き出しを止める `disableInfoboxExtraction` と戻す `enableInfoboxExtraction`、抜き出し直すよう頼む `requestInfoboxExtraction` を足した。
- 定義ページの表 (文芸的データベース) を返す `getLiterateDatabase` を足した。
- `fetchAsset` は、渡した URL もリダイレクト先も http(s) でなければ取りに行かず、`kind: "invalidUrl"` の `CosenseApiError` で失敗するようにした。これまでは `file:` の URL も `file:` へのリダイレクトも取りに行き、Bun では手元のファイルを読んでいた。URL として読めない文字列では、`CosenseApiError` でない例外になっていた。
- `listTitles` (これまでの `searchTitles`) が 20 万件で黙って途中までを返していたのを直した。件数で止めずに最後まで取り、Cosense が示す続きの位置が前に辿ったところへ戻ったときは `CosenseApiError` で失敗する。
- プロジェクト名を、どの要求でもエンコードしてパスに入れるようにした。これまでは `getProject` (これまでの `projectDetail`) などの一部だけで、ほかは `a/../b` のような名前だと、PAT を付けたまま別のパスへ送っていた。
- `createPage` は、1 行目が空か空白だけなら、何も送らずに `TypeError` で reject するようにした (effect の入口では defect)。これまでは空のタイトルで同じタイトルのページを探してから、ページを作ろうとしていた。
- Promise の入口で、Cloudflare Workers (workerd) が、`catch` した失敗も未処理の reject として報告していたのを直した。
- effect の入口の `httpClientOf` で、effect を中断すると (`Effect.timeout` など)、送っている要求も止めるようにした。これまでは中断しても fetch が続いていた。

### 0.1.0-beta.10 の変更

- 最初のバージョン。`createCosenseApi` で、ページ・本文・検索・関連ページ・「AI 用にエクスポート」・履歴などを読み、
  `updatePage` でページを書き換える。読んでから書くまでにほかの人が書き換えていたら 3-way merge し、
  同じ行のコンフリクトは既定では `PageConflictError` で止める (`whenConflict: "overwrite"` で上書き)。
- `createPage` で新しいページを作る。同じタイトルのページがもうあれば、作らずに `PageExistsError` で止める。
- 失敗は `CosenseApiError` の `kind` で見分ける (`"unauthorized"`、`"tooLarge"` など)。
- `@cosense-toolbox/cosense-x/fetch` にあった `isCosenseAssetUrl` / `cosenseIconUrl` はここに移し、`fetchAsset` は `createCosenseApi` が返すものに入れた (`api.fetchAsset(url)`)。

## インストール

```sh
npm install @cosense-toolbox/api
```

## 使い方

```ts
import { createCosenseApi } from "@cosense-toolbox/api"

const api = createCosenseApi({ pat: process.env.COSENSE_PAT })
const project = api.project("my-project")

const page = await project.getPage("title") // 無ければ null
const text = await project.getPageText("title") // 本文のテキスト。1 行目がタイトル
const { pages } = await project.searchFullText("検索する言葉")
```

- プロジェクトの中のものは、`api.project(name)` が返すものから呼ぶ。プロジェクトの名前はエンコードしてパスに入れるので、`/` などを含んでいても別のパスへは送らない。空の名前と `.`、`..` は `TypeError` を投げる。
- 公開プロジェクトは、`pat` を渡さなくても読める。
- 無いもの (無いページなど) は `null` で返す。
- 失敗は `CosenseApiError` で reject する。何が起きたかは `kind` で見分ける。

```ts
import { CosenseApiError } from "@cosense-toolbox/api"

try {
  await api.getMe()
} catch (error) {
  if (!(error instanceof CosenseApiError)) throw error
  if (error.kind === "unauthorized") console.error("PAT が無いか、違う")
  else console.error(error.kind, error.status, error.code, error.message)
}
```

| `kind`             | いつ                                                                          |
| :----------------- | :---------------------------------------------------------------------------- |
| `"unauthorized"`   | 401。PAT が無いか、違う                                                       |
| `"forbidden"`      | 403。プロジェクトのメンバーでないなど、権限が無い                             |
| `"notFound"`       | 404。ページやプロジェクトが無い。用意した書き換えの期限 (5 分) が切れたときも |
| `"tooLarge"`       | 1 回の要求の本文が大きすぎる (下の「1 回に送れるのは 100 KiB まで」)          |
| `"notFastForward"` | 409。書く前に、ほかの人がページを書き換えた                                   |
| `"duplicateTitle"` | 409。新しいページを用意してから書くまでに、同じタイトルのページができた       |
| `"invalidChanges"` | 422。もう無い行を指しているなど、変更を受け付けられない                       |
| `"rateLimited"`    | 429。要求が多すぎる                                                           |
| `"serverError"`    | 5xx                                                                           |
| `"network"`        | 応答が来なかった (DNS や接続の失敗)                                           |
| `"decode"`         | 2xx だが、本文を読めなかったか、形が合わなかった                              |
| `"invalidUrl"`     | `fetchAsset` に渡した URL かリダイレクト先が、http(s) の URL でない           |
| `"unknown"`        | どれでもない                                                                  |

`status` には HTTP の status (応答が来なかったか、要求を送らなかったら `0`)、`code` には応答の本文の `error` か `name` の値 (`"NotFastForward"` や `"NotLoggedInError"` など) が入る。`message` には、Cosense が返した説明も入る。

## オプション

| オプション | 意味                                                                                  |
| :--------- | :------------------------------------------------------------------------------------ |
| `pat`      | Cosense の Personal Access Token。非公開プロジェクトを読むときに渡す                  |
| `origin`   | API の origin。既定は `https://scrapbox.io`。下の「`origin` には origin だけを渡す」  |
| `fetch`    | 要求を送る fetch。テストや、キャッシュを挟みたいときに渡す。既定は `globalThis.fetch` |

## 呼べるもの

`createCosenseApi` が返すもの (`api`):

| 関数              | 返すもの                                                                                         |
| :---------------- | :----------------------------------------------------------------------------------------------- |
| `getMe()`         | 自分 (PAT の持ち主)                                                                              |
| `listProjects()`  | 自分の入っているプロジェクト                                                                     |
| `fetchAsset(url)` | Cosense 上のファイル (`/files/…` やアイコン) の中身と Content-Type。下の「Cosense 上のファイル」 |
| `project(name)`   | プロジェクト `name` の中のものを呼ぶ関数 (下の表)。`name` に渡した名前を持つ                     |

`api.project(name)` が返すもの:

| 関数                                                | 返すもの                                                                                  |
| :-------------------------------------------------- | :---------------------------------------------------------------------------------------- |
| `getProject()`                                      | プロジェクトの設定 (画像やファイルの送り先など)                                           |
| `listUsers()`                                       | ページを書いた人として出てくる人全員 (今のメンバーと、抜けたメンバー)                     |
| `listPages(options?)`                               | ページの一覧と件数。`sort` / `limit` / `skip` と、保存した絞り込みを渡せる                |
| `getPage(title)`                                    | ページの中身 (行ごとの id や書いた人を含む)。無ければ `null`                              |
| `getPageText(title)`                                | ページの本文のテキスト。無ければ `null`                                                   |
| `getRelatedPages(title)`                            | 関連ページ (1 hop と 2 hop)                                                               |
| `getInfobox(pageId)`                                | ページの Infobox。`getPage` の結果にも入っている。下の「Infobox」                         |
| `getLiterateDatabase(title)`                        | 定義ページの表 (文芸的データベース)。定義ページでなければ `null`                          |
| `exportForAi(title, { hop?, search? })`             | 「AI 用にエクスポート」のテキスト。ページと `hop` (既定は 1) 以内のリンク先               |
| `searchFullText(query)`                             | 本文の全文検索。pageRank の順に 100 件まで                                                |
| `searchVector(query)`                               | タイトルのベクトル検索。使えないプロジェクトでは空の結果                                  |
| `listTitles()`                                      | すべてのページのタイトルと、そこから出ているリンク                                        |
| `listSnapshots(pageId)`                             | ページの履歴。新しい順に、最新の 100 件まで                                               |
| `getSnapshot(pageId, snapshotId)`                   | 履歴のある時点のページ                                                                    |
| `updatePage(base, lines, options?)`                 | 読んだときのページ `base` を `lines` の文にする。ほかの人の書き換えは合わせる             |
| `createPage(lines)`                                 | 1 行目をタイトルにして新しいページを作る。同じタイトルのページがあれば作らない            |
| `previewEdit(body)`                                 | ページの書き換えを用意する (まだ書き換えない)                                             |
| `submitEdit(previewId)`                             | 用意した書き換えをページに書く                                                            |
| `replaceLinks(from, to)`                            | プロジェクトの中の `from` へのリンクを、すべて `to` へのリンクにする                      |
| `markAccessed(pageId)`                              | ページを開いたことを記録する (未読でなくなる)。記録できなくても reject しない             |
| `disableInfoboxExtraction(pageId, definitionTitle)` | このページで、定義ページ `definitionTitle` の項目を抜き出すのを止める。止めた後の Infobox |
| `enableInfoboxExtraction(pageId, definitionTitle)`  | 止めた抜き出しを戻す。戻した後の Infobox                                                  |
| `requestInfoboxExtraction(pageId)`                  | このページの Infobox を抜き出し直すよう頼む                                               |

日時はどれも Unix 時間の秒。応答はゆるく読み、無い項目は空の値 (`""` や `0`、`[]`) にする。

## ページを書き換える

`getPage` で読んだページと、書き換えた後の文を `updatePage` に渡す。行の差分を作り、用意して (`previewEdit`) 書く (`submitEdit`) までをまとめて行う。

```ts
import { createCosenseApi, PageConflictError } from "@cosense-toolbox/api"

const project = createCosenseApi({ pat: process.env.COSENSE_PAT }).project("my-project")
const page = await project.getPage("title")
if (page === null) throw new Error("ページが無い")

const lines = [...page.lines.map((line) => line.text), "足した行"]
try {
  const { commitId } = await project.updatePage(page, lines)
} catch (error) {
  if (error instanceof PageConflictError) {
    // ほかの人が同じ行を書き換えていた。何も書いていない
    console.log(error.conflicts) // [{ line, ours, theirs, base }]
  }
}
```

読んでから書くまでにほかの人がページを書き換えていたら、今のページを読み直して 3-way merge する。

- **違う行の書き換え:** 両方とも入れて書く。
- **同じ行の書き換え (コンフリクト):** `whenConflict` に従う。
  - `"error"` (既定): 何も書かずに `PageConflictError` で止める。`conflicts` に両方の文、`merged` に自分の文を残して合わせた結果、`latest` に合わせた先の今のページ (`commitId` と id 付きの行) が入る。
  - `"overwrite"`: 自分の文で上書きする。自分が消した行は、ほかの人が書き換えていても消す。上書きした行は、結果の `overwritten` に入る。
- 書き換えが続いて書けなければ、3 回試して諦める (`CosenseApiError`、`kind: "notFastForward"`)。

```ts
await project.updatePage(page, lines, { whenConflict: "overwrite" })
```

コンフリクトを自分で解くなら、`PageConflictError` を受けて解いた文を作り、`latest` を元にもう一度 `updatePage` を呼ぶ。

```ts
try {
  await project.updatePage(page, lines)
} catch (error) {
  if (!(error instanceof PageConflictError)) throw error
  const resolved = [...error.merged] // conflicts を見て、行ごとに自分の文かほかの人の文かを選ぶ
  for (const { line, theirs } of error.conflicts) if (theirs !== null) resolved[line] = theirs
  await project.updatePage(error.latest, resolved)
}
```

### 新しいページを作る

`createPage` に、1 行目がタイトルの文を渡す。

```ts
import { createCosenseApi, PageExistsError } from "@cosense-toolbox/api"

const project = createCosenseApi({ pat: process.env.COSENSE_PAT }).project("my-project")
try {
  const { title } = await project.createPage(["title", "本文"])
} catch (error) {
  if (error instanceof PageExistsError) {
    // 同じタイトルのページがもうあった。何も書いていない。書き足すなら error.page を base にする
    await project.updatePage(error.page, [...error.page.lines.map((line) => line.text), "本文"])
  }
}
```

- 同じタイトルかは、Cosense と同じく大文字と小文字、空白と `_` を区別せずに比べる。名前を変えたページの古いタイトルは、もうあるものとしない。
- Cosense 自体は同じタイトルを断らず、後ろに番号を付けて作る。`createPage` は先に確かめるが、確かめてから作るまでのあいだにほかの人が同じタイトルで作ると、番号の付いたタイトルで作ることがある。作ったタイトルは結果の `title` で分かる。
- 1 行目が空か空白だけなら、何も送らずに `TypeError` で reject する (effect の入口では defect)。Cosense Web は前後の空白を除いてタイトルにするので、1 行目がタイトルにならない。
- 続けて書き換えるときは、`getPage` で読んでから `updatePage` に渡す (行の id と `commitId` が要るため)。

### タイトルを変える

1 行目を変えると、ページの名前が変わる。変わったことは、結果の `titleChanged` (`{ from, to }`) で分かる。

- 同じタイトルのページがもうあると、Cosense は断らずに、後ろに番号を付けたタイトルで書く。そのときは `titleChanged.to` と結果の `lines` の 1 行目が、番号の付いたタイトルになる。
- ほかのページにある `[from]` へのリンクは書き換えない。Cosense Web はタイトルを変えたときにリンクも書き換えるかを聞く。書き換えるなら `replaceLinks` を呼ぶ。

```ts
const result = await project.updatePage(page, lines)
if (result.titleChanged) {
  await project.replaceLinks(result.titleChanged.from, result.titleChanged.to)
}
```

### 自分で差分を作って書く

用意した書き換えを見てから書きたいときや、同じタイトルのページがあっても番号を付けて作りたいときは、`computeChanges` で作った差分を `previewEdit` に渡し、`submitEdit` で書く。

```ts
import { computeChanges, createCosenseApi } from "@cosense-toolbox/api"

const project = createCosenseApi({ pat: process.env.COSENSE_PAT }).project("my-project")

// 新しいページ。pageId を渡さず、1 行目がタイトルになる
const preview = await project.previewEdit({ changes: computeChanges([], ["title", "本文"]) })
await project.submitEdit(preview.previewId)
```

- 変えていない行は送らない。書き換えた行は同じ id のまま文だけ変え (`_update`)、消した行は `_delete`、足した行は新しい id で `_insert` にする。
- 足す行の id は `createLineId` で作る (小文字の 16 進数 24 文字)。`computeChanges` の 3 つめの引数で差し替えられる。
- 既存のページに書くときは、`pagePreview.commitId` が読んだときの `commitId` と同じかを確かめてから `submitEdit` する。確かめずに送ると、読んでから書くまでにほかの人が書いた行を `_update` が上書きすることがある。
- 新しいページを用意するときに同じタイトルのページがもうあると、Cosense は断らずに、後ろに番号を付けたタイトルで作る。作ったタイトルは `submitEdit` の結果の `page.title` で分かる。
- 失敗は `CosenseApiError` の `kind` で見分ける。ほかの人が先に書き換えたら `"notFastForward"`、新しいページを用意してから書くまでのあいだに同じタイトルのページができたら `"duplicateTitle"`。

## Infobox

定義ページ (本文に `table:infobox` か `table:cosense` の表があるページ) にリンクしたページから、Cosense がその表の項目を AI で抜き出す。`getPage` と `getRelatedPages` の結果に、次の 3 つが入っている。

| 項目                  | 中身                                                                                                        |
| :-------------------- | :---------------------------------------------------------------------------------------------------------- |
| `infoboxDefinition`   | 定義ページなら、表の行の文。タブで区切った最初のセルが項目の名前で、残りは抜き出すときの指示                |
| `infoboxResult`       | 本文から抜き出した値。リンクしている定義ページごとに、そのタイトル (`title`) と `{ 項目の名前: 値 }` を持つ |
| `infoboxDisableLinks` | このページで抜き出すのを止めた定義ページ。タイトルを小文字にし、空白を `_` にしたもの                       |

```ts
const page = await project.getPage("Tomato soup")
for (const { title, infobox } of page?.infoboxResult ?? []) {
  console.log(title, infobox) // 定義ページのタイトルと、{ 項目の名前: 抜き出した値 }
}
```

- 値は Cosense の記法のままで、改行を含むことがある。Cosense Web と同じく、文字列でない値は空文字にする。
- `hallucination` は、Cosense が値を AI の作り話と判定したとき、`truncated` は、ページが長すぎて終わりのほうから抜き出せなかったときに `true`。Cosense Web はどちらでも値を出す。
- 定義の表で、最初のセルが `ExcludeTitleLine` の行は項目ではなく、タイトルの行から抜き出さないという設定。
- 2 hop の関連ページには、抜き出した値 (`infoboxResult`) が入っていない。

### 定義ページの表 (文芸的データベース)

Cosense Web が定義ページの下に出す表を、同じ行と列で返す。行は、定義ページにリンクしていて抜き出しを止めていないページで、列は定義の表の項目。

```ts
const table = await project.getLiterateDatabase("Recipe") // 定義ページでなければ null
for (const { page, infobox } of table?.rows ?? []) {
  console.log(
    page.title,
    table?.fields.map((field) => infobox[field] ?? ""),
  )
}
```

- 並びは関連ページ (1 hop) の応答のまま。並べ替えは使う側で行う。
- まだ抜き出していないページも行に入り、値は空。

### 抜き出しを止める・抜き出し直す

定義ページにリンクしたいが、その項目に沿って書いたページではないときは、そのページでの抜き出しを止める (Cosense Web の「disable extraction」)。リンクはそのままで、定義ページの表 (文芸的データベース) からそのページが外れる。

```ts
const page = await project.getPage("Tomato soup")
if (page) {
  await project.disableInfoboxExtraction(page.id, "Recipe") // 止める
  await project.enableInfoboxExtraction(page.id, "Recipe") // 戻す
  await project.requestInfoboxExtraction(page.id) // 抜き出し直す
  const { infoboxResult } = await project.getInfobox(page.id)
}
```

- 止める・戻すは、その後のページの Infobox を返す。Cosense Web は、戻した後に `requestInfoboxExtraction` で抜き出し直す。
- Cosense Web は、定義ページの表を書き換えると、関連ページ (1 hop) のそれぞれに `requestInfoboxExtraction` を頼む。`updatePage` で定義ページの表を書き換えたときは、要るなら自分で頼む。

## Cosense 上のファイル

Cosense にアップロードしたファイル (`https://scrapbox.io/files/…`) とアイコン (`/api/pages/…/icon`) を扱う。

```ts
import { cosenseIconUrl, createCosenseApi, isCosenseAssetUrl } from "@cosense-toolbox/api"

cosenseIconUrl("help-jp", "cosense") // → https://scrapbox.io/api/pages/help-jp/cosense/icon
isCosenseAssetUrl("https://scrapbox.io/files/xxx.png") // → true
const api = createCosenseApi({ pat: process.env.COSENSE_PAT })
const { data, contentType } = await api.fetchAsset("https://scrapbox.io/files/xxx.png")
```

- これらのファイルは `Cross-Origin-Resource-Policy: same-origin` を返すので、別のサイトの `<img>` からは読めない。
- リダイレクト先の URL は期限付き (`/files/` は 5 分) なので、解決した URL を埋め込んでもすぐ表示されなくなる。静的なサイトでは中身を取ってきてサイトの中に置く ([`@cosense-toolbox/astro`](../astro-cosense) はこれを自動で行う)。
- URL を作る・見分けるだけの `cosenseIconUrl` と `isCosenseAssetUrl` は通信しないので、`createCosenseApi` を作らずに使える。
- `api.fetchAsset` はリダイレクトを 5 回まで自分で辿り、PAT は Cosense (`origin`) への要求にだけ付ける。リダイレクト先の Google Cloud Storage や Gyazo には送らない。取れなければ `CosenseApiError` で reject する。
- 渡した URL もリダイレクト先も、http(s) でなければ取りに行かない (`kind: "invalidUrl"`)。Bun の fetch は `file:` の URL も読むので、ページに書かれた画像の URL から手元のファイルを読まないように。

## 気をつけること

### `origin` には origin だけを渡す

`origin` は `https://scrapbox.io` のような http(s) の origin で、後ろの `/` は付けても付けなくてもよい。URL として読めない文字列や、http(s) でないもの、パスやクエリの付いたものを渡すと、`createCosenseApi` は作るときに `TypeError` を投げる (`isCosenseAssetUrl` と `cosenseIconUrl` も同じ)。

### PAT は `origin` にだけ送る

リダイレクトは fetch に任せず、自分で辿る。同じ `origin` へのリダイレクト (名前を変えたページなど) は PAT を付けたまま 3 回まで辿り、別の origin へのリダイレクトは辿らずに失敗する。PAT を付けたまま別のサイトへ送らないため。

### 1 回に送れるのは 100 KiB まで

scrapbox.io は、要求の本文が 100 KiB (102,400 バイト) を超えると断る (`kind: "tooLarge"`)。

- 書き換えでは、変わった行ごとに行の id と文を JSON で送る。1 行ごとに 65 バイトほど上乗せされ、日本語は 1 文字 3 バイトなので、長い行の多いページでは 700 行ほどで超えることがある。
- `updatePage` と `createPage` は、変更を分けずに 1 回で送る。大きすぎて断られたら、何も書いていない。

### `listTitles` は何度も要求することがある

Cosense は 1 回に 10000 件までしか返さないので、大きいプロジェクトでは続きが無くなるまで順に取る。件数の上限は設けず、途中までを返すことはない。Cosense が示す続きの位置が前に辿ったところへ戻ったら、終わらないので `CosenseApiError` で失敗する。

## effect で使う

effect を使っているなら、`@cosense-toolbox/api/effect` から effect の型のまま使える。無いものは `Option`、失敗は `CosenseApiError` (`_tag: "CosenseApiError"`) になる。

要求は `HttpClient` を通して送るので、`HttpClientLive` (`globalThis.fetch`) か、`httpClientOf(fetch)` で作ったものを渡す。テストでは `HttpClient` を差し替えられる。effect を中断すると (`Effect.timeout` など)、送っている要求も止める。

```ts
import { createCosenseApi, HttpClientLive } from "@cosense-toolbox/api/effect"
import { Effect } from "effect"

const project = createCosenseApi({ pat: process.env.COSENSE_PAT }).project("my-project")

const page = await Effect.runPromise(project.getPage("title").pipe(Effect.provide(HttpClientLive))) // Option<PageDetail>
```

## ライセンス

MIT
