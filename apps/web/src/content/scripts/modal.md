---
title: "modal-for-userscript"
category: core
tags: ["モーダル", "ダイアログ", "UI", "module"]
status: active
summary: "userscript用の汎用モーダルダイアログをクラスで提供する共通部品"
install:
  kind: module
  code: |
    import { Modal } from "/api/code/cosense-toolbox/modal-for-userscript/module.js";
demoTier: B
source: "https://scrapbox.io/cosense-toolbox/modal-for-userscript"
featured: false
order: 603
---

確認・入力ダイアログのUIを使い回せる汎用モーダルダイアログの部品です。自作スクリプトで「実行してよいか確認したい」「値を入力してもらいたい」といったときに、自前でダイアログを組まずに済みます。
