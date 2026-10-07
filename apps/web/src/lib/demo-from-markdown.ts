import { toHtml } from "@cosense-toolbox/parser/html"
import { parseFromMarkdown } from "@cosense-toolbox/parser/markdown"
import style from "@cosense-toolbox/style/style.css?raw"

// ChatGPT の回答のような Markdown
const markdown = `## React の useEffect

**useEffect** は、副作用を扱うための *フック* です。詳しくは[公式ドキュメント](https://react.dev/reference/react/useEffect)にあります。

### 主なポイント

1. **依存配列**を指定する
   - 空配列なら初回だけ
   - 省略すると毎回
2. クリーンアップ関数を返せる

\`\`\`tsx
useEffect(() => {
  const id = setInterval(tick, 1000)
  return () => clearInterval(id)
}, [])
\`\`\`

> **注意:** 開発中の Strict Mode では 2 回呼ばれます。

| 書き方 | 実行のタイミング |
| --- | --- |
| \`useEffect(fn)\` | 毎回 |
| \`useEffect(fn, [])\` | 初回だけ |

- [x] 依存配列を確かめた
- [ ] テストを書く
`

const body = toHtml(parseFromMarkdown(markdown))

export const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <style>${style}</style>
  </head>
  <body>
    ${body}
  </body>
</html>`
