---
title: "cosense-table-viewer"
category: mods
tags: ["テーブル", "CSV", "モジュール", "検索"]
status: active
summary: "CSVを取得しダークテーマのモーダルテーブルで表示する本体モジュール"
install:
  kind: module
  code: |
    const { CSVTableModal } = await import("/api/code/cosense-toolbox/cosense-table-viewer/module.js");
demoTier: C
source: "https://scrapbox.io/cosense-toolbox/cosense-table-viewer"
featured: false
order: 407
---

テーブルを画面いっぱいの大きなビューで表示してくれる本体です。表全体が落ち着いたダークテーマで広々と開き、検索ボックスで目的の行を絞り込んだり、見出しの列を固定したまま横スクロールしたりできます。列がたくさんある表でも、どの行が何の値かを見失わずに読めます。

行数・列数の多いデータをじっくり眺めたいときに力を発揮します。単体でも動きますが、ふだんは虫眼鏡ボタン（table-modal）から呼び出してセットで使うのがおすすめです。
