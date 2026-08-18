---
title: "suger-high-es"
category: core
tags: ["シンタックスハイライト", "トークナイザ", "コード"]
status: active
summary: "SugarHighベースの軽量シンタックスハイライタをCosense向けに移植"
install:
  kind: js
  code: |
    import { highlight, tokenize } from "/api/code/cosense-toolbox/suger-high-es/main.js";
demoTier: B
source: "https://scrapbox.io/cosense-toolbox/suger-high-es"
featured: false
order: 610
---

軽量なシンタックスハイライタ SugarHigh を Cosense 向けに移植した土台です。コード文字列を色付きの表示に変換してくれるので、ページ内のコードを見やすく表示する自作スクリプトに使えます（JS / TS / JSX / Rust / Go など対応）。整形の `cosense-prettier` と並んでコード体験を構成します。
