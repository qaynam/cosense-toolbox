---
title: "トップ画面にグリッド線をいれるUserScript"
category: theme
tags: ["トップ画面", "グリッド", "罫線"]
status: disabled
summary: "ページ一覧のカード間に区切りの罫線を引く"
install:
  kind: module
  code: |
    const { applyGridLine } = await import('/api/code/cosense-toolbox/トップ画面にグリッド線をいれるUserScript/module.js');
    applyGridLine();
demoTier: A
source: "https://scrapbox.io/cosense-toolbox/トップ画面にグリッド線をいれるUserScript"
featured: false
order: 106
---

プロジェクトのトップ画面（ページ一覧）で、カードとカードの間に細い罫線が引かれます。一覧が方眼紙のような格子状になり、たくさんのページが並んでいても整理されて見え、目当てのページを探しやすくなります。ウィンドウの幅を変えても罫線が自動で引き直されます。

入れるだけでトップ画面の見た目が切り替わります。
