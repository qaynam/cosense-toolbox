// テーマビルダーのプレビュー用に、Cosense本体CSS(index.css)と
// ダミーDOM(article/page-list)を public/builder/ に書き出す。
// knowledge は完全なHTMLスナップショット（<html data-project-theme="...">付き）。
// 元の <html> 開始タグ（=テーマ属性）は保持し、head/script/外部cssだけ差し替える。
// 使い方: bun run scripts/build-preview.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const KN = 'src/styles/knowledge';
const OUT = 'public/builder';
mkdirSync(OUT, { recursive: true });

// 1) Cosense本体CSS
writeFileSync(`${OUT}/cosense.css`, readFileSync(`${KN}/index.css`, 'utf8'));

const listener =
	'<script>window.addEventListener("message",function(e){if(e&&e.data&&e.data.type==="userCss"){var u=document.getElementById("user");if(u)u.textContent=e.data.css||"";}});<\/script>';
const head =
	'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
	// Cosenseが使う Font Awesome（アイコン表示用）
	'<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css">' +
	'<link rel="stylesheet" href="/builder/cosense.css"><style id="user"></style>' +
	// iframe内の全リンクはプレビューなので無効化（クリックで遷移させない）
	'<style>html,body{margin:0}a{pointer-events:none!important;cursor:default}</style>';

function transform(raw) {
	// 元の <html ...> 開始タグを保持（data-project-theme 等のテーマ情報を残す）
	const htmlOpen = (raw.match(/<html[\s\S]*?>/i) || ['<html lang="ja" data-project-theme="default-minimal">'])[0];
	const bodyAttrs = (raw.match(/<body([^>]*)>/i) || ['', ''])[1];
	let body = (raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [null, raw])[1];
	// 個人のuserCSS/inline style/scriptはプレビューから除去（vanillaなCosenseにする）
	body = body
		.replace(/<link\b[^>]*>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<script[\s\S]*?<\/script>/gi, '');
	return `<!doctype html>${htmlOpen}<head>${head}</head><body${bodyAttrs}>${body}${listener}</body></html>`;
}

writeFileSync(`${OUT}/preview-article.html`, transform(readFileSync(`${KN}/article.html`, 'utf8')));
writeFileSync(`${OUT}/preview-list.html`, transform(readFileSync(`${KN}/page-list.html`, 'utf8')));

console.log('wrote public/builder/{cosense.css,preview-article.html,preview-list.html}');
