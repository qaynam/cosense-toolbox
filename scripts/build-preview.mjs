// テーマビルダーのプレビュー用に、Cosense本体CSS(index.css)とダミーDOM(article/page-list)を
// public/builder/ に書き出す。knowledge(Cosenseのスナップショット)はリポジトリに含めない方針なので、
// 手元に無い場合は生成をスキップする（/builder のプレビューだけ無効、サイト本体はビルド可）。
// 使い方: bun scripts/build-preview.mjs （dev/build から自動実行）
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const KN = "src/styles/knowledge";
const OUT = "public/builder";

const needed = [`${KN}/index.css`, `${KN}/article.html`, `${KN}/page-list.html`];
if (!needed.every((f) => existsSync(f))) {
  console.warn(
    `[build-preview] skip: ${KN}/ が見つからないためテーマビルダーのプレビューは生成しません。`,
  );
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });

// 1) Cosense本体CSS。
//    .line / code 系の white-space:(pre系) はプレビューで行が崩れるため除去する。
//    （white-space:nowrap / normal は "pre" を含まないので残る）
const cosenseCss = readFileSync(`${KN}/index.css`, "utf8").replace(
  /white-space:\s*[^;{}]*pre[^;{}]*;?/gi,
  "",
);
writeFileSync(`${OUT}/cosense.css`, cosenseCss);

const listener =
  '<script>window.addEventListener("message",function(e){if(e&&e.data&&e.data.type==="userCss"){var u=document.getElementById("user");if(u)u.textContent=e.data.css||"";}});<\/script>';
const head =
  '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css">' +
  '<link rel="stylesheet" href="/builder/cosense.css"><style id="user"></style>' +
  "<style>html,body{margin:0}a{pointer-events:none!important;cursor:default}</style>";

function transform(raw) {
  const htmlOpen = (raw.match(/<html[\s\S]*?>/i) || [
    '<html lang="ja" data-project-theme="default-minimal">',
  ])[0];
  const bodyAttrs = (raw.match(/<body([^>]*)>/i) || ["", ""])[1];
  let body = (raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [null, raw])[1];
  body = body
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
  return `<!doctype html>${htmlOpen}<head>${head}</head><body${bodyAttrs}>${body}${listener}</body></html>`;
}

writeFileSync(
  `${OUT}/preview-article.html`,
  transform(readFileSync(`${KN}/article.html`, "utf8")),
);
writeFileSync(
  `${OUT}/preview-list.html`,
  transform(readFileSync(`${KN}/page-list.html`, "utf8")),
);

console.log(
  "wrote public/builder/{cosense.css,preview-article.html,preview-list.html}",
);
