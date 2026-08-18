---
title: "cosenseのtableをmodalできれいにみるuserScript"
category: mods
tags: ["テーブル", "モーダル", "起動係", "ボタン注入"]
status: active
summary: "テーブルリンク横に虫眼鏡ボタンを生やしモーダル表示を起動する"
install:
  kind: js
  code: |
    import "/api/code/cosense-toolbox/cosenseのtableをmodalできれいにみるuserScript/script.js";
demoTier: C
source: "https://scrapbox.io/cosense-toolbox/cosense%E3%81%AEtable%E3%82%92modal%E3%81%A7%E3%81%8D%E3%82%8C%E3%81%84%E3%81%AB%E3%81%BF%E3%82%8BuserScript"
featured: false
order: 406
---

ページ内のテーブルの横に虫眼鏡ボタンが付き、押すとそのテーブルを画面いっぱいの大きなビューでじっくり見られます。Cosense上では窮屈になりがちな大きな表も、これなら全体を広々と確認できます。

行が多い表や列の多いデータを扱うときに、毎回スクロールに苦労せずに済むのが便利です。ボタンを押すと「テーブルを大きく見るビュー」（table-viewer）が呼び出されて開く仕組みなので、この2つはセットで使います。
