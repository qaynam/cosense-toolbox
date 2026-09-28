# @cosense-toolbox/release

`packages/` の公開対象を同じバージョンで npm にリリースするためのツールです。このツール自体は npm に公開しません。

**手順 → <https://cosense-toolbox.qaynam.dev/release/>**

## 公開のしかた

1. 公開対象のパッケージのバージョンをそろえる。各 `package.json` と `bun.lock` が更新される。

   ```sh
   bun run release:version 0.1.0-beta.3
   ```

2. 変更をコミットし、`v<version>` 形式のタグを push する。CI (`.github/workflows/publish.yml`) が対象パッケージを公開する。

   ```sh
   git tag v0.1.0-beta.3
   git push origin v0.1.0-beta.3
   ```

手元から公開する場合は `bun run release:publish` を実行します。`--dry-run` を付けると、公開せずに処理内容を確認できます。

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
