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
			{ href: '/parser/demo/', label: '対応記法' },
		],
	},
	{
		label: '使い方',
		links: [
			{ href: '/parser/parse/', label: 'パース' },
			{ href: '/parser/ast/', label: 'AST と位置情報' },
			{ href: '/parser/utils/', label: 'AST の走査' },
			{ href: '/parser/html/', label: 'HTML への変換' },
			{ href: '/parser/compile/', label: '独自形式への変換' },
			{ href: '/parser/extend/', label: '記法の拡張' },
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
