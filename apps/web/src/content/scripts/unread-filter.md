---
title: "未読一覧だけフィルターするuserScript"
category: tools-page
tags: ["list", "filter", "unread"]
status: experimental
summary: "一覧のソートメニューに未読だけ表示する項目を追加する"
install:
  kind: js
  code: |
    import "/api/code/cosense-toolbox/未読一覧だけフィルターするuserScript/code.js";
demoTier: C
source: "https://scrapbox.io/cosense-toolbox/未読一覧だけフィルターするuserScript"
featured: false
order: 308
---

ページ一覧から、まだ読んでいないページだけを絞り込んで表示できます。読んだものを画面から消せるので、たくさんあるページの中から未読を確認するのに役立ちます。なお、先にプロジェクトの絞り込みをかけておく必要があります。

使い方：一覧のソートメニューから「未読だけ表示」を選びます。

既読かどうかの判定がカードの見た目に頼った仕組みのため、Cosense側のデザインが変わると正しく動かなくなることがある実験的な機能です。
