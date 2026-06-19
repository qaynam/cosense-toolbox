---
title: "alpine-js-for-user-script"
category: core
tags: ["Alpine.js", "DOM", "module"]
status: active
summary: "userscript内でDOM操作を宣言的に書くためのalpine.js土台"
install:
  kind: module
  code: |
    import { loadAlpine } from "/api/code/cosense-toolbox/alpine-js-for-user-script/module.js";
demoTier: B
source: "https://scrapbox.io/cosense-toolbox/alpine-js-for-user-script"
featured: false
order: 601
---

軽量フレームワーク alpine.js を取り込んだ土台です。自分でuserscriptを書くときに、手書きのDOM操作の代わりに宣言的なUIを組めるようになります。Cosenseでは必須ではなく、UIを楽に作りたいときに使うオプションの部品です。
