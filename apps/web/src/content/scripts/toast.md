---
title: "toastを表示するuserScript"
category: core
tags: ["トースト", "通知", "UI"]
status: active
summary: "画面端に通知トーストを出す関数をwindowに登録する共通部品"
install:
  kind: js
  code: |
    import "/api/code/cosense-toolbox/toastを表示するuserScript/module.js";
demoTier: B
source: "https://scrapbox.io/cosense-toolbox/toastを表示するuserScript"
featured: false
order: 602
---

画面端に小さな通知（トースト）を出すための部品です。自作スクリプトから呼び出せば、処理の完了メッセージや、時間のかかる処理の進捗（スピナー付き）を手軽に表示できます。
