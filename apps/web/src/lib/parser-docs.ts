/**
 * parser ドキュメントのサイドバー。ページの並び順もここで決まる。
 * ページを足したら、Markdown ファイルの作成とここへの登録を必ず揃える。
 */
export interface DocLink {
	href: string;
	label: string;
}

export interface DocGroup {
	label: string;
	links: DocLink[];
}

export const PARSER_DOCS: DocGroup[] = [
	{
		label: 'はじめに',
		links: [
			{ href: '/parser/', label: '概要' },
			{ href: '/parser/demo/', label: '記法ギャラリー' },
		],
	},
	{
		label: 'ガイド',
		links: [
			{ href: '/parser/parse/', label: 'パースする' },
			{ href: '/parser/ast/', label: 'AST と位置情報' },
			{ href: '/parser/utils/', label: 'AST を調べる' },
			{ href: '/parser/html/', label: 'HTML に変換する' },
			{ href: '/parser/compile/', label: '独自の形式に変換する' },
			{ href: '/parser/extend/', label: '記法を拡張する' },
		],
	},
];

/** サイドバーの並び順での前後。ページ末尾の「前へ / 次へ」に使う。 */
export const adjacentDocs = (pathname: string): { prev?: DocLink; next?: DocLink } => {
	const flat = PARSER_DOCS.flatMap((group) => group.links);
	const index = flat.findIndex((link) => link.href === pathname);
	if (index < 0) return {};
	return { prev: flat[index - 1], next: flat[index + 1] };
};
