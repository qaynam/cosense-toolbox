# @cosense-toolbox/release

`packages/` の公開対象を同じバージョンで npm にリリースするためのツールです。このツール自体は npm に公開しません。

**手順 → <https://cosense-toolbox.qaynam.dev/release/>**

## 公開のしかた

1. 公開対象のパッケージのバージョンをそろえる。各 `package.json` と `bun.lock` が更新される。

   ```sh
   bun run release:version 0.1.0-beta.3
   ```

   変わったパッケージの README に `### <バージョン> の変更` を書く (ふつうは機能の PR で書いておく)。ここがリリースノートになる。

2. `release/v<バージョン>` のブランチで PR を作り、`main` に向ける。CI (`release-check`) が、マージしてよいかを確かめる。
3. PR をマージしたあと、`main` で `v<バージョン>` 形式のタグを push する。CI (`.github/workflows/publish.yml`) が対象パッケージを公開し、公開できたら GitHub のリリースを作る。

   ```sh
   git tag v0.1.0-beta.3
   git push origin v0.1.0-beta.3
   ```

手元から公開する場合は `bun run release:publish` を実行します。`--dry-run` を付けると、公開せずに処理内容を確認できます。

## リリースノート

GitHub のリリースノートは、公開するパッケージの README の `### <バージョン> の変更` の節を、パッケージ名の見出しを付けて集めたもの。
その下に、GitHub が作る PR の一覧が続く。

```md
### 0.1.0-beta.9 の変更

- **破壊的変更:** `asImageSrc(url)` を `imageSrcOf(node)` に替えた。…
- **不具合の修正:** …
- `isPage` を足した。…
```

- 節は、次の `#` / `##` / `###` の見出しの前で終わる。節の後に別の内容を続けるときは、見出しで区切る
- 使う人が書き換えないと動かなくなる変更は、`**破壊的変更:**` で始め、書き換え方も書く
- 集めた結果は手元で確かめられる

  ```sh
  bun run release:notes 0.1.0-beta.9
  ```

## release:check がすること

リリースの PR (`release/v<バージョン>`) を、マージする前に止める。`release-check` の CI から動かす。

- PR が `main` に向いているか。積んだ PR を順にマージすると、後の PR が `main` ではなく先の PR のブランチに入ることがある
- ブランチのバージョンと、パッケージのバージョンが揃っているか
- そのバージョンが npm にまだ無く、npm の一番新しいバージョンより新しいか
- 前のリリースのタグの後にマージした PR が、すべて入っているか。`main` に届かなかった PR を見つける。前のリリースの PR は数えない
- どれかのパッケージの README に、そのバージョンの変更 (`### <バージョン> の変更`) があるか

```sh
bun run release:check --base main --branch release/v0.1.0-beta.9
```

## release:publish がすること

1. 公開の前に直すことがあれば止める
   - すべてのパッケージのバージョンが揃っているか
   - ほかのパッケージへの依存が `workspace:*` か
   - `publishConfig` (`access: "public"` と dist-tag)、`repository.directory`、`LICENSE` があるか
   - `build` があるパッケージは `prepublishOnly` でビルドするか
   - `--expect <バージョン>` を渡したときは、揃ったバージョンがそれか (タグから公開するとき)
2. 公開するパッケージをビルドする
3. 依存されるものから順に、`bun pm pack` で固めて `npm publish` する
   - `bun pm pack` が `workspace:*` を実際のバージョンに書き換える。`npm publish` は書き換えない
   - 固めたあとの依存が公開するバージョンを指していなければ止める
   - npm に同じバージョンがあるパッケージは飛ばす。途中で失敗しても、もう一度流せば続きから公開する

## 対象

`packages/` の下の、`private` でないパッケージ。`apps/` (サイトとエディタの拡張) と `tools/` は公開しない。
