---
title: "cosense-keyboard-events"
category: core
tags: ["キーボード", "キーバインド", "エディタ", "module"]
status: active
summary: "Cosenseの内部キーバインドを擬似イベントで発火させる関数集"
install:
  kind: module
  code: |
    import { moveLineIndentTo } from "/api/code/cosense-toolbox/cosense-keyboard-events/module.js";
demoTier: B
source: "https://scrapbox.io/cosense-toolbox/cosense-keyboard-events"
featured: false
order: 605
---

Cosense既存のキーボードショートカット（インデント移動、行末での改行、ページ先頭・末尾への移動など）を、プログラムから呼び出せるようにまとめた部品です。Vim風キーバインドのような独自のキー操作スクリプトを書くときの土台になります。
