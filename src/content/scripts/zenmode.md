---
title: "zenmode"
category: mods
tags: ["集中モード", "トグル", "フルスクリーン", "モジュール"]
status: active
summary: "ナビバーや関連ページを隠し本文だけに集中する表示をトグルする"
install:
  kind: module
  code: |
    const { toggleZenMode } = await import("/api/code/cosense-toolbox/zenmode/module.js");
demoTier: C
source: "https://scrapbox.io/cosense-toolbox/zenmode"
featured: false
order: 408
---

上部のメニューや関連ページ一覧、各種バッジといった周辺の表示をまとめて隠し、本文だけが残るすっきりした集中モードに切り替えます。余計なものが目に入らなくなるので、読書や執筆に没頭したいときにぴったりです。設定によってはブラウザのフルスクリーンも一緒に使えます。

もう一度呼べば元の表示に戻るトグル式です。お好みのキーやボタンに割り当てて、ワンアクションで集中モードに入れるようにしておくと快適です。
