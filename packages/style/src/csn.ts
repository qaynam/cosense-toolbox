/**
 * csn.ts — style.css から csn.css (class 名すべてに `csn-` を付けたもの) を作る。
 * 生成スクリプトとテストの両方から呼ぶ。
 */
import { prefixClasses } from "./prefix-classes"

const NOTICE = `/*
 * 生成物。編集しない。
 * style.css の class 名すべてに csn- を付けたもの。toHtml に classPrefix: "csn-" を渡したときに使う。
 * style.css から \`bun run generate\` で作る。
 */
`

export const csnCssOf = (styleCss: string): string => NOTICE + prefixClasses(styleCss, "csn-")
