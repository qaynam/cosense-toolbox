// beaver.png から favicon と apple-touch-icon を生成する。
// 元画像を差し替えたら `bun run scripts/build-icons.mjs` で作り直す。
//
// 元は 400x400 の透過 PNG。favicon は小さく表示されるので、
// 余白を詰めてから縮小しないと絵が潰れる。
import sharp from 'sharp';

const SOURCE = 'public/beaver.png';

/** 透過部分を落として絵の実寸に切り詰めたバッファ。 */
const trimmed = await sharp(SOURCE).trim().toBuffer();

const icons = [
	// ブラウザのタブ用。16px でも見えるように少し大きめを渡す
	{ file: 'public/favicon.png', size: 64 },
	// iOS のホーム画面用。透過だと黒く出る端末があるので背景を敷く
	{ file: 'public/apple-touch-icon.png', size: 180, background: '#161616', padding: 18 },
];

for (const { file, size, background, padding = 0 } of icons) {
	const inner = size - padding * 2;
	let image = sharp(trimmed).resize(inner, inner, {
		fit: 'contain',
		background: { r: 0, g: 0, b: 0, alpha: 0 },
	});

	if (background !== undefined) {
		image = image
			.extend({ top: padding, bottom: padding, left: padding, right: padding, background })
			// extend は外周を足すだけなので、透過のままの中身も背景で埋める
			.flatten({ background });
	}

	await image.png().toFile(file);
	console.log(`wrote ${file}`);
}
