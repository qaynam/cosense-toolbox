/** `href` に入れると script が動くスキーム。`data:text/html` があるので data: も拒む。 */
const UNSAFE_HREF_RE = /^(?:javascript|vbscript|data):/

/** `src` に入れると script が動くスキーム。`data:` 画像は正当な使い道があるので許す。 */
const UNSAFE_SRC_RE = /^(?:javascript|vbscript):/

/**
 * スキームだけを見るために空白と制御文字を落とす。
 * ブラウザは途中にタブや改行が挟まった `javascript:` もスキームとして解釈するため。
 */
const schemeOf = (url: string): string => url.replace(/[\s\p{Cc}]/gu, "").toLowerCase()

const safeUrl = (url: string, unsafe: RegExp): string | null =>
  unsafe.test(schemeOf(url)) ? null : url

/** `href` に入れて安全な URL だけを返す。script が動くスキームなら null。 */
export const safeHref = (url: string): string | null => safeUrl(url, UNSAFE_HREF_RE)

/** `src` に入れて安全な URL だけを返す。script が動くスキームなら null。 */
export const safeSrc = (url: string): string | null => safeUrl(url, UNSAFE_SRC_RE)
