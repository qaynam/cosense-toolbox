---
title: "scroll-cursor-line-to-center"
category: core
tags: ["スクロール", "カーソル", "module"]
status: active
summary: "カーソル行を画面中央までスクロールする（Vimのzz相当）関数"
install:
  kind: module
  code: |
    import { scrollCursorLineToCenter } from "/api/code/cosense-toolbox/scroll-cursor-line-to-center/module.js";
demoTier: B
source: "https://scrapbox.io/cosense-toolbox/scroll-cursor-line-to-center"
featured: false
order: 607
---

カーソルのある行を画面の中央までスクロールさせる最小の部品です（Vimの `zz` 相当）。Vim風のナビゲーションなど、画面表示を整える自作スクリプトを書くときに役立ちます。
