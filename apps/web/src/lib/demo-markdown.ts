import { parse } from "@cosense-toolbox/parser"
import { toMarkdown } from "@cosense-toolbox/parser/markdown"

// 「HTML に変換する」と同じ /help-jp/その他の書き方 のテキスト
import { source } from "./demo-basic"

const project = "help-jp"

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/")

export const markdown = toMarkdown(parse(source), {
  pageUrl: (title) =>
    title.startsWith("/")
      ? `https://scrapbox.io${encodePath(title)}`
      : `https://scrapbox.io/${encodeURIComponent(project)}/${encodeURIComponent(title)}`,
})
