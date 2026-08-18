/**
 * A層ライブデモ用の userCSS。
 * 疑似Cosenseページ(iframe)に適用してトグルで効果を見せる。
 * プレビュー幅が狭いと効かないため、元CSSの @media(min-width:768px) ラッパーは外している。
 * （配布される本体はメディアクエリ付き。詳細ページの「コピー」は本物を渡す）
 */
export const CSS_DEMOS: Record<string, string> = {
	'line-numbers': `
.lines { counter-reset: line }
.line:not(.line-title) { counter-increment: line }
.app:not(.presentation) .line:not(.line-title)::before {
	content: counter(line);
	position: absolute; display: inline-block; left: -110px; z-index: 10;
	min-width: 50px; text-align: right; vertical-align: middle;
	font-family: monospace; color: grey;
}
.line:not(.line-title)::before { opacity: .5 }
.line.cursor-line:not(.line-title)::before { opacity: 1; font-weight: bolder }
`,

	'section-numbers': `
.app { counter-reset: section }
.app:not(.presentation) .line.section-title:not(.line-title) { position: relative }
.app:not(.presentation) .line.section-title:not(.line-title)::after {
	z-index: 1000;
	counter-increment: section;
	content: counter(section);
	display: inline-block;
	width: 1.6em; height: 1.6em;
	position: absolute; top: -2px; left: -55px;
	background-color: #52ba68;
	border-radius: 50%;
	color: #fff;
	font: 600 normal 90%/1.6 'Century Gothic', Arial, sans-serif;
	text-align: center; white-space: nowrap;
}
`,

	'code-block-line-numbers': `
body *::before { --code-number-color: #1C2B27; --code-accent-color: #C9E6DE }
.section-title { counter-reset: codeline }
.code-block span.indent code.code-body {
	counter-increment: codeline;
	margin-left: -1.5em;
	padding-left: 2.3em;
}
.code-block span.indent code.code-body::before {
	content: counter(codeline, decimal-leading-zero);
	position: absolute; display: inline-block; z-index: 10;
	margin-left: -2.4em; padding-right: 0.2em;
	text-align: right; vertical-align: bottom;
	border-right: solid 1px #ccc;
	color: var(--code-number-color);
	opacity: .5;
}
.cursor-line .code-block span.indent code.code-body::before,
.code-block .cursor-line span.indent code.code-body::before {
	opacity: 1; font-weight: bolder; background-color: var(--code-accent-color);
}
`,

	'indent-rainbow': `
.indent-mark { height: 100% !important }
.indent-mark .pad { height: 100% !important; overflow: unset !important }
.indent-mark span:nth-child(4n+1) .pad { background: lightblue !important; opacity: 0.5 }
.indent-mark span:nth-child(4n+2) .pad { background: lightpink; opacity: 0.5 }
.indent-mark span:nth-child(4n+3) .pad { background: lightyellow; opacity: 0.5 }
.indent-mark span:nth-child(4n+4) .pad { background: lightgreen; opacity: 0.5 }
`,
};
