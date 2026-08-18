---
title: "pageIDからpage titleを取得するuserScript"
category: tools-page
tags: ["page", "pageid", "redirect", "clipboard"]
status: disabled
summary: "pageID付きURLからタイトルを解決してリダイレクトしpageIDコピーも追加"
install:
  kind: js
  code: |
    import "/api/code/cosense-toolbox/pageIDからpage titleを取得するuserScript/script.js";
demoTier: C
source: "https://scrapbox.io/cosense-toolbox/pageIDからpage titleを取得するuserScript"
featured: false
order: 307
---

pageIDだけがわかっているURLから、そのページの本当のタイトルを調べて該当ページへ移動できます。あわせて、開いているページのpageIDをコピーする機能も使えます。

なお、Cosense自体が古いタイトルのURLでも正しいページへ案内してくれるようになったため、リダイレクト目的ではこの機能は不要になっています。
