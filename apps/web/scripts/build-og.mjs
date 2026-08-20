// OGP画像を生成する（sharp で SVG → PNG）。
// 文言を変えたらここを編集して `bun run scripts/build-og.mjs` で再生成する。
//
// 日本語を含むので、CJK のグリフを持つフォントが要る。
// 描画は sharp (librsvg) 任せなので、生成後は実際に画像を開いて字化けしていないか見ること。
import sharp from "sharp";

// SVG の属性は " で囲むので、フォント名の引用符は ' を使う。
const SANS =
  "'Hiragino Sans', 'Noto Sans CJK JP', 'Yu Gothic', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";

/**
 * @param {{ headline: string[]; sub: string; headlineSize?: number; headlineFont?: string }} content
 */
function card({ headline, sub, headlineSize = 72, headlineFont = SANS }) {
  const lines = headline
    .map(
      (text, i) =>
        `<text x="98" y="${292 + i * (headlineSize + 20)}" font-family="${headlineFont}" font-size="${headlineSize}" font-weight="800" fill="#f2f2f2">${text}</text>`,
    )
    .join("\n  ");

  return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="logo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#454545"/>
      <stop offset="1" stop-color="#1c1c1c"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0f0f0f"/>
  <rect x="48" y="48" width="1104" height="534" rx="28" fill="#161616" stroke="#2c2c2c" stroke-width="2"/>
  <rect x="100" y="96" width="56" height="56" rx="14" fill="url(#logo)" stroke="#3a3a3a" stroke-width="1"/>
  <text x="172" y="135" font-family="${SANS}" font-size="28" font-weight="600" fill="#9a9a9a">Cosense Toolbox</text>
  ${lines}
  <text x="102" y="512" font-family="${MONO}" font-size="26" fill="#7a7a7a">${sub}</text>
</svg>`;
}

const cards = {
  "public/og.png": card({
    headline: ["Cosense をもっと面白く、", "もっと強力に"],
    sub: "userscript / userCSS  ·  theme builder  ·  syntax parser",
  }),
  "public/og-parser.png": card({
    headline: ["@cosense-toolbox", "/parser"],
    headlineSize: 68,
    headlineFont: MONO,
    sub: "Cosense syntax → position-aware AST → HTML",
  }),
};

// 右側にマスコットを置く。余白を詰めてから縮小しないと小さく写る。
// 見出しは 2 行目が短いので、その右下の空きに収める。
const mascot = await sharp("public/beaver.png")
  .trim()
  .resize(224, 224, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .toBuffer();

for (const [file, svg] of Object.entries(cards)) {
  await sharp(Buffer.from(svg))
    .resize(1200, 630)
    .composite([{ input: mascot, top: 322, left: 918 }])
    .png()
    .toFile(file);
  console.log(`wrote ${file}`);
}
