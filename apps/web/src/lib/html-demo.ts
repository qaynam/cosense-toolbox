import { parse } from "@cosense-toolbox/parser";
import { toHtml } from "@cosense-toolbox/parser/compile";
import { collect } from "@cosense-toolbox/parser/utils";
import defaultStyle from "@cosense-toolbox/style/style.css?raw";
import { resolveIconSrc } from "./cosense-icon";

/** 例に使っている本家のページが置かれているプロジェクト。 */
const PROJECT = "help-jp";

/** オプションを何も渡さない、既定の出力。 */
export function htmlDemo() {
  const page = parse(SOURCE);
  const html = toHtml(page);

  return wrapInDocument(html);
}

/**
 * リンク先を本家のページへ向け、アイコンを画像として出す。
 *
 * どちらも記法には書かれていない情報なので、`toHtml` に外から渡して補う。
 */
export async function htmlDemoWithResolvedLinks() {
  const page = parse(LINK_SOURCE);

  // iconImageUrl は同期に呼ばれるので、先にアイコンを集めて URL を解決しておく。
  const iconSrcByUser = new Map(
    await Promise.all(
      collect(page, "icon").map(
        async (icon) =>
          [icon.user, await resolveIconSrc(PROJECT, icon.user)] as const,
      ),
    ),
  );

  const html = toHtml(page, {
    // [title] は同じプロジェクトのページ、[/proj/page] は別プロジェクトを指す。
    // 後者だけ先頭が / なので、そこで振り分ける。
    pageUrl: (title) =>
      title.startsWith("/")
        ? `https://scrapbox.io${encodePath(title)}`
        : `https://scrapbox.io/${PROJECT}/${encodeURIComponent(title)}`,
    // 解決できなかったアイコンは null を返して、ユーザー名のテキストリンクに戻す。
    iconImageUrl: (node) => iconSrcByUser.get(node.user) ?? null,
  });

  return wrapInDocument(html);
}

/** `/` は区切りとして残し、各段だけを encode する。 */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** 周りの CSS から切り離すため、iframe に入れる 1 枚の HTML にする。 */
function wrapInDocument(body: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${defaultStyle}</style></head><body>${body}</body></html>`;
}

/** リンクとアイコンだけを並べた短い例。オプションの効きめを見るために使う。 */
const LINK_SOURCE = [
  "リンクとアイコン",
  " 同じプロジェクトのページ",
  "  [ブラケティング]",
  "  #HashTag",
  " 別のプロジェクトのページ",
  "  [/icons/すごい]",
  " アイコン",
  "  [rakusai.icon]",
  "  [/icons/炎上.icon]",
].join("\n");

/** 本家の「その他の書き方」ページの内容。記法をひととおり含んでいる。 */
const SOURCE = [
  "その他の書き方",
  "基本的な[ブラケティング]の他にも、色々な[記法]があります",
  "",
  "外部リンク (一般のWebページへのリンク)",
  " URLを書くとリンクになる",
  "  https://yahoo.co.jp",
  "	`[URL タイトル]`",
  "	 [https://yahoo.com Yahoo!]",
  " `[タイトル URL]`逆順でもok",
  "  [Yahoo! https://yahoo.com]",
  "",
  "画像",
  "	`[画像URL]`",
  "  [https://i.gyazo.com/da78df293f9e83a74b5402411e2f2e01.png]",
  " `[[画像URL]]`",
  "  横幅いっぱい、高さ制限無しで大きな画像を表示",
  "",
  "リンク付き画像",
  "	`[リンク先URL 画像URL]`",
  "  [http://yahoo.co.jp https://i.gyazo.com/da78df293f9e83a74b5402411e2f2e01.png]",
  "",
  "別プロジェクトへのリンク",
  " `/プロジェクト名/ページ名`",
  " [/icons]",
  " [/icons/すごい]",
  "",
  "アイコン",
  " [rakusai.icon]",
  " [/icons/炎上.icon]",
  "",
  "[数式]",
  " [$ \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}]",
  "",
  "[HashTag]",
  " #HashTag",
  "",
  "引用",
  " > 行頭に`>`を書くと引用になります",
  "",
  "コード",
  " バッククオート`\\``で囲む",
  "  `function() {  return \\`hello\\` }`",
  "",
  "[コードブロック]",
  " code:hello.js",
  "  function () {",
  "    alert(document.location.href)",
  '    console.log("hello")',
  "    // コメントも書けるぞ",
  "  }",
  "",
  "[テーブル]",
  " `table:テーブル名` の後、インデントしてtab区切り",
  " table:テーブルの例",
  "  abc	def",
  "  12345	6789",
  "  長い長い文字列	短い文字列",
  "",
  "コマンドライン",
  " 行頭に`$`もしくは`%`",
  " $ git reset --hard HEAD^",
  " % cp a.txt b.txt",
  "",
  "[[強調]]と[*** 大きな文字]",
  "	`[[強調]]` ⇒ [[強調]]",
  " `[* 強調]` ⇒ [* 強調]",
  " `[**** もっと大きな文字]` => [**** もっと大きな文字]",
  "",
  "[/ 斜体]",
  " `[/ 斜体文字]` ⇒ [/ 斜体文字]",
  " `[/* 太字斜体文字]` => [/* 太字斜体文字]",
  "",
  "[- 打ち消し線]",
  " `[- 打ち消し]` ⇒ [- 打ち消し]",
].join("\n");
