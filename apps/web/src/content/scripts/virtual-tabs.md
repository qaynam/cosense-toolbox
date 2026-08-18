---
title: "cosenseのリンクをiframe内で開くuserScript"
category: mods
tags: ["仮想タブ", "iframe", "画面分割", "モーダル"]
status: active
summary: "リンクを同一オリジンのiframeで開き複数ページを並べて見られる"
install:
  kind: module
  code: |
    const { initVirtualTabs } = await import("/api/code/cosense-toolbox/cosenseのリンクをiframe内で開くuserScript/module.js");
    initVirtualTabs();
demoTier: C
source: "https://scrapbox.io/cosense-toolbox/cosense%E3%81%AE%E3%83%AA%E3%83%B3%E3%82%AF%E3%82%92iframe%E5%86%85%E3%81%A7%E9%96%8B%E3%81%8FuserScript"
featured: false
order: 403
---

リンクをクリックすると、別タブに飛ばずに今の画面の上に小窓でページが開きます。元のページを見失わずにリンク先を確認できるので、リンクを辿っては戻る作業がぐっと楽になります。画面を分割すれば複数ページを横に並べて読み比べることもでき、参照しながらの執筆にも便利です。

小窓の中でも戻る・進む・再読み込みができ、Escキーで素早く閉じられます。
