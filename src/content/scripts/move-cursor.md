---
title: "move-cursor"
category: core
tags: ["カーソル", "エディタ", "module"]
status: active
summary: "Ctrl+B相当のキーイベントでカーソルを左へ動かす最小関数"
install:
  kind: module
  code: |
    import { moveCursorToLeft } from "/api/code/cosense-toolbox/move-cursor/module.js";
demoTier: B
source: "https://scrapbox.io/cosense-toolbox/move-cursor"
featured: false
order: 606
---

カーソルを指定した回数だけ左へ動かすための最小の部品です。たとえば括弧を挿入したあとカーソルを括弧の内側へ戻す、といった細かな操作を自作スクリプトで実現したいときに使えます。
