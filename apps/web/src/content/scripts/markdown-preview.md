---
title: "cosenseのcode-blockのマークダウンをパースしてみるuserScript"
category: mods
tags: ["Markdown", "ShadowDOM", "marked", "シンタックスハイライト"]
status: active
summary: "code:markdownブロックの中身をドロワーで整形プレビューする"
install:
  kind: js
  code: |
    import "/api/code/cosense-toolbox/cosenseのcode-blockのマークダウンをパースしてみるuserScript/script.js";
demoTier: C
source: "https://scrapbox.io/cosense-toolbox/cosense%E3%81%AEcode-block%E3%81%AE%E3%83%9E%E3%83%BC%E3%82%AF%E3%83%80%E3%82%A6%E3%83%B3%E3%82%92%E3%83%91%E3%83%BC%E3%82%B9%E3%81%97%E3%81%A6%E3%81%BF%E3%82%8BuserScript"
featured: false
order: 405
---

Cosenseにそのまま貼ったMarkdownを、ちゃんと整形された見た目で読めるようにします。コードブロックの横のアイコンを押すと右からパネルが開き、見出しや箇条書き、表などが本来のレイアウトで表示されます。冒頭のfront matterはNotion風のプロパティ一覧に、コードは言語ごとに色分けされて見やすくなります。

他で書いたMarkdownをCosenseに保管しつつ、読むときは整った形で確認したい人にぴったりです。パネルの幅は好みに調整でき、編集に追従してプレビューも更新されます。
