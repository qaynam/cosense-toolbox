---
title: "1hope linkと2hope linkをclipboardにコピーするUserScript"
category: tools-page
tags: ["page", "clipboard", "links", "llm"]
status: active
summary: "1hop/2hopリンクをまとめてクリップボードへコピーしLLMへの文脈渡しに使う"
install:
  kind: js
  code: |
    import "/api/code/cosense-toolbox/1hope linkと2hope linkをclipboardにコピーするUserScript/script.js";
demoTier: C
source: "https://scrapbox.io/cosense-toolbox/1hope%20linkと2hope%20linkをclipboardにコピーするUserScript"
featured: false
order: 303
---

今見ているページとつながっている関連ページの内容を、まとめてクリップボードにコピーできます。1hop（直接つながったページ）と2hop（その先までたどったページ）の2段階を選べるので、関連する情報を一気に集められます。集めたテキストをそのままChatGPTなどのLLMに貼れば、ページの周辺情報込みで相談できて便利です。

使い方：ページメニューの「Copy 1 Hope」または「Copy 2 Hope」を選びます。
