---
title: "insert-text"
category: core
tags: ["テキスト挿入", "エディタ", "module"]
status: active
summary: "現在のカーソル位置にテキストを差し込む最小ユーティリティ"
install:
  kind: module
  code: |
    import { insertText } from "/api/code/cosense-toolbox/insert-text/module.js";
demoTier: B
source: "https://scrapbox.io/cosense-toolbox/insert-text"
featured: false
order: 604
---

現在のカーソル位置にテキストを差し込むための最小の部品です。Cosenseが変更を正しく認識する形で挿入してくれるので、テンプレートやスニペットを書き込む自作スクリプトの土台として使えます。
