# @cosense-toolbox/public-types

パッケージの公開の型 (ビルドした `dist` の `.d.ts`) に effect の型が出ていないかを調べる。

このリポジトリのパッケージは中を effect で書いているが、使う人に effect を求めない。見つからないものは `null`、
時間のかかるものは `Promise` で返し、effect の型は入口で包む。包み忘れると、使う人は effect を入れてその型を扱わないといけなくなるので、CI で止める。

```sh
bun run check:public-types   # リポジトリの根元から。各パッケージをビルドしてから調べる
```

各パッケージの `check:public-types` は、パッケージのディレクトリで `src/check.ts` を動かす。

- 出ているかは、`.d.ts` が effect から import した名前を、import の行の外で使っているかで決める。
  import が残っているだけで使っていないものは、使う人に何も求めないので見逃す
- effect を使う人のために effect の型のまま出すと決めた入口は、`--allow <入口>` で外す (parser の `schema`)
