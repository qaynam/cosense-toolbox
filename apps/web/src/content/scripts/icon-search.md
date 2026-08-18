---
title: "icon検索するuserScript"
category: tools-editor
tags: ["icon", "検索", "Web Component", "beta"]
status: experimental
summary: "Ctrl+Lで開くicon検索モーダル。選択でアイコン記法を挿入（beta）"
install:
  kind: js
  code: |
    import "/api/code/cosense-toolbox/icon検索するuserScript/script.js";
demoTier: B
source: "https://scrapbox.io/cosense-toolbox/icon検索するuserScript"
featured: false
order: 210
---

使いたいアイコンをキーワード検索して、その場で挿入できます。プロジェクト内のアイコンを名前で絞り込めるので、どんなアイコンがあったか思い出せなくてもすぐ見つけられます。選んだアイコンは記法として挿入され、クリップボードにもコピーされます。

使い方：Ctrl+L で検索パネルを開きます。

beta版のため、日本語入力中のEnter確定やEscapeでの閉じる、前回入力が残るといった点はまだ調整中です。
