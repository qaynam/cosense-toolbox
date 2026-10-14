import { toTitleLc } from "./title"
import type { Infobox, LiterateDatabase, RelatedPage } from "./types"

/** 定義の表で、項目ではなく設定を書く行の、最初のセル。 */
const OPTION_ROWS = ["ExcludeTitleLine"]

/**
 * 定義ページの表 (文芸的データベース) を、定義ページと、その関連ページ (1 hop) から組み立てる。
 * 行と列の選び方は Cosense Web と同じ。
 */
export const literateDatabaseOf = (
  definition: Pick<Infobox, "infoboxDefinition"> & { readonly title: string },
  links1hop: readonly RelatedPage[],
): LiterateDatabase => {
  const definitionLc = toTitleLc(definition.title)
  // 抜き出した値の名前は、最初のセルを trim せずに付いている。設定の行かどうかだけは trim して見る。
  const fields = definition.infoboxDefinition
    .map((row) => row.split("\t")[0] ?? "")
    .filter((name) => !OPTION_ROWS.includes(name.trim()))
  const rows = links1hop
    .filter(
      (page) =>
        page.linksLc.includes(definitionLc) && !page.infoboxDisableLinks.includes(definitionLc),
    )
    .map((page) => ({
      page,
      infobox:
        page.infoboxResult.find((result) => toTitleLc(result.title) === definitionLc)?.infobox ??
        {},
    }))
  return { fields, rows }
}
