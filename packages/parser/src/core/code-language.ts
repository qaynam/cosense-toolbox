/**
 * コードブロックのファイル名から言語名を推測する。拡張子があればそれ、無ければファイル名全体。
 * Cosense では `code:python` のように言語名だけを書くこともできるため。
 * `highlight` に渡る言語名はこれで決めている。
 */
export const codeLanguageOf = (filename: string): string => {
  const dot = filename.lastIndexOf(".")
  return (dot > 0 ? filename.slice(dot + 1) : filename).toLowerCase()
}
