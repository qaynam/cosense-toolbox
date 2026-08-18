// OGP画像 public/og.png を生成する（sharp で SVG → PNG）。
// 文言を変えたらこの SVG を編集して `bun run scripts/build-og.mjs` で再生成。
import sharp from 'sharp';

const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="logo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#454545"/>
      <stop offset="1" stop-color="#1c1c1c"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0f0f0f"/>
  <rect x="48" y="48" width="1104" height="534" rx="28" fill="#161616" stroke="#2c2c2c" stroke-width="2"/>
  <rect x="100" y="96" width="56" height="56" rx="14" fill="url(#logo)" stroke="#3a3a3a" stroke-width="1"/>
  <text x="172" y="135" font-family="Helvetica, Arial, sans-serif" font-size="28" font-weight="600" fill="#9a9a9a">Cosense Toolbox</text>
  <text x="98" y="300" font-family="Helvetica, Arial, sans-serif" font-size="86" font-weight="800" fill="#f2f2f2">Customize Cosense.</text>
  <text x="98" y="396" font-family="Helvetica, Arial, sans-serif" font-size="86" font-weight="800" fill="#f2f2f2">Copy &amp; paste.</text>
  <text x="102" y="505" font-family="ui-monospace, Menlo, monospace" font-size="27" fill="#7a7a7a">userscript / userCSS gallery for Cosense (Scrapbox)</text>
</svg>`;

await sharp(Buffer.from(svg)).resize(1200, 630).png().toFile('public/og.png');
console.log('wrote public/og.png');
