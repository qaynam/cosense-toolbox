/**
 * タイトルを比べるときの形 (Cosense の `titleLc`)。Cosense は、大文字と小文字、空白と `_` だけが違う
 * タイトルを、同じページのものとして扱う。
 */
export const toTitleLc = (title: string): string => title.toLowerCase().replace(/ /g, "_")
