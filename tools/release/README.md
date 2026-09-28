# @cosense-toolbox/release

`packages/` のパッケージを、すべて同じバージョンで一緒に npm に公開するための道具。公開はしない。

## 公開のしかた

1. バージョンを揃える。公開するすべてのパッケージの `package.json` と、`bun.lock` の版を書き換える。

   ```sh
   bun run release:version 0.1.0-beta.3
   ```

2. コミットして、`v<版>` のタグを push する。CI (`.github/workflows/publish.yml`) が全部を公開する。

   ```sh
   git tag v0.1.0-beta.3
   git push origin v0.1.0-beta.3
   ```

手元から公開するときは `bun run release:publish`。`--dry-run` を付けると、公開せずに中身だけ確かめる。

## release:publish がすること

1. 公開の前に直すことがあれば止める
   - すべてのパッケージのバージョンが揃っているか
   - ほかのパッケージへの依存が `workspace:*` か
   - `publishConfig` (`access: "public"` と dist-tag)、`repository.directory`、`LICENSE` があるか
   - `build` があるパッケージは `prepublishOnly` でビルドするか
   - `--expect <版>` を渡したときは、揃った版がそれか (タグから公開するとき)
2. 公開するパッケージをビルドする
3. 依存されるものから順に、`bun pm pack` で固めて `npm publish` する
   - `bun pm pack` が `workspace:*` を実際の版に書き換える。`npm publish` は書き換えない
   - 固めたあとの依存が公開する版を指していなければ止める
   - npm に同じ版があるパッケージは飛ばす。途中で失敗しても、もう一度流せば続きから公開する

## 対象

`packages/` の下の、`private` でないパッケージ。`apps/` (サイトとエディタの拡張) と `tools/` は公開しない。
