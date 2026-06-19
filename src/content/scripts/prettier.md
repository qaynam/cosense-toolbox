---
title: "cosense-prettier"
category: core
tags: ["Prettier", "整形", "コード", "module"]
status: active
summary: "Cosense上でPrettierを動かしコードを整形する共通部品"
install:
  kind: module
  code: |
    import { prettierLoader } from "/api/code/cosense-toolbox/cosense-prettier/module.js";
demoTier: B
source: "https://scrapbox.io/cosense-toolbox/cosense-prettier"
featured: false
order: 608
---

コードフォーマッタの Prettier を Cosense 上で動かせるようにした部品です。自作スクリプトから呼び出せば、ページ内のコードをきれいに整形できます（対応言語は TypeScript / JSX / JavaScript）。シンタックスハイライトの `suger-high-es` と組み合わせると、より快適なコード体験を作れます。
