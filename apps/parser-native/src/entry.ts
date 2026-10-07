/**
 * QuickJS の中で読む入口。パーサーをそのまま束ね、C から呼べるよう `globalThis` に置く。
 *
 * C とのやり取りは文字列だけにする。AST は JSON にして返すので、C の側は JS の値を
 * 辿らずに済む。位置 (`column`) は JS の文字列と同じ UTF-16 の単位で数える。
 */
import { parse, parseLine } from "@cosense-toolbox/parser"

declare global {
  var cosenseParser: {
    /** 本文の 1 行を読み、行のノードを JSON で返す */
    readonly parseLine: (text: string) => string
    /** ページ全体を読み、AST を JSON で返す */
    readonly parse: (text: string) => string
  }
}

globalThis.cosenseParser = {
  parseLine: (text) => JSON.stringify(parseLine(text)),
  parse: (text) => JSON.stringify(parse(text)),
}
