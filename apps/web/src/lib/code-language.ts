import { codeLanguageOf, type RenderExtension } from "@cosense-toolbox/parser/html"
import { getIconData, iconToHTML, iconToSVG } from "@iconify/utils"
import icons from "@iconify-json/material-icon-theme/icons.json" with { type: "json" }
import type { Element, ElementContent } from "hast"

/** 言語ごとのアイコン (Material Icon Theme の名前) と、見出しに出す名前。 */
const LANGUAGES: Readonly<Record<string, { readonly icon: string; readonly name: string }>> = {
  ts: { icon: "typescript", name: "TypeScript" },
  js: { icon: "javascript", name: "JavaScript" },
  mjs: { icon: "javascript", name: "JavaScript" },
  sh: { icon: "console", name: "Shell" },
  json: { icon: "json", name: "JSON" },
  jsonc: { icon: "json", name: "JSON" },
  html: { icon: "html", name: "HTML" },
  css: { icon: "css", name: "CSS" },
  astro: { icon: "astro", name: "Astro" },
  yml: { icon: "yaml", name: "YAML" },
  yaml: { icon: "yaml", name: "YAML" },
  text: { icon: "document", name: "Text" },
}

/** Cosense 記法のブロック。Material Icon Theme には無いので、Cosense のロゴを使う (public/icons/cosense.svg) */
const COSENSE: Readonly<Record<string, string>> = { csn: "Cosense", csnx: "Cosense X" }

/**
 * アイコンの画像の URL。使ったアイコンだけを data URL にして HTML に書くので、
 * ブラウザにアイコンの一式やフォントを読ませずに済む。
 */
const iconUrl = (name: string): string | undefined => {
  const data = getIconData(icons, name)
  if (data === null) return undefined
  const { attributes, body } = iconToSVG(data, { height: 16 })
  return `data:image/svg+xml,${encodeURIComponent(iconToHTML(body, attributes))}`
}

const iconElement = (src: string): Element => ({
  type: "element",
  tagName: "img",
  properties: { className: ["code-lang-icon"], src, alt: "", width: 16, height: 16 },
  children: [],
})

/** ヘッダの中身: アイコンと、言語名だけのブロックなら言語の名前、ファイル名ならそのファイル名。 */
const headerContent = (filename: string): ElementContent[] => {
  const lang = codeLanguageOf(filename)
  const onlyLanguage = lang === filename.toLowerCase()
  const cosense = COSENSE[lang]
  const known = LANGUAGES[lang]
  const src = cosense !== undefined ? "/icons/cosense.svg" : known && iconUrl(known.icon)
  const label = onlyLanguage ? (cosense ?? known?.name ?? filename) : filename
  return [...(src === undefined ? [] : [iconElement(src)]), { type: "text", value: label }]
}

/** ヘッダ行 (div > code > span) の一番内側の span の中身を差し替える。 */
const withHeaderContent = (line: ElementContent, content: ElementContent[]): ElementContent => {
  if (line.type !== "element") return line
  const [code] = line.children
  if (code?.type !== "element") return line
  const [label] = code.children
  if (label?.type !== "element") return line
  return {
    ...line,
    children: [{ ...code, children: [{ ...label, children: content }] }],
  }
}

/**
 * コードブロックのヘッダ行に、言語のアイコンと名前を出す描画の拡張。
 * `code:ts` のように言語名だけのブロックは「TypeScript」と言語の名前を、
 * `code:astro.config.mjs` のようにファイル名のブロックはファイル名を出す。
 */
export const codeLanguage = (): RenderExtension => ({
  codeBlock: (output, { filename }) => {
    const [header, ...body] = output
    return header === undefined
      ? output
      : [withHeaderContent(header, headerContent(filename)), ...body]
  },
})
