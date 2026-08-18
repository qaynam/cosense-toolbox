// テーマビルダーで操作する Cosense の CSS 変数。
// 既定値は html[data-project-theme=blue]（クラシックな既定テーマ）の値に合わせている。
// ビルダーは変更されたものだけ :root{ --x: 値 !important } として出力する。

export interface ThemeToken {
	/** CSS変数名 */
	var: string;
	/** 表示ラベル */
	label: string;
	/** 既定値（カラーピッカー用の16進） */
	default: string;
}

export interface ThemeGroup {
	title: string;
	tokens: ThemeToken[];
}

export const THEME_GROUPS: ThemeGroup[] = [
	{
		title: 'ページ',
		tokens: [
			{ var: '--page-bg', label: '背景', default: '#ffffff' },
			{ var: '--page-text-color', label: '本文', default: '#444444' },
			{ var: '--line-title-color', label: 'タイトル', default: '#444444' },
			{ var: '--cursor-color', label: 'カーソル', default: '#555555' },
		],
	},
	{
		title: 'リンク',
		tokens: [
			{ var: '--page-link-color', label: 'リンク', default: '#6e8af3' },
			{ var: '--page-link-hover-color', label: 'リンク(hover)', default: '#3f57b1' },
			{ var: '--empty-page-link-color', label: '未作成リンク', default: '#fb7476' },
		],
	},
	{
		title: 'コードブロック',
		tokens: [
			{ var: '--code-bg', label: '背景', default: '#f2f2f2' },
			{ var: '--code-color', label: '文字', default: '#555555' },
			{ var: '--quote-bg-color', label: '引用の背景', default: '#f5f5f5' },
		],
	},
	{
		title: 'ナビバー（上部）',
		tokens: [
			{ var: '--navbar-bg', label: '背景', default: '#c4c6cc' },
			{ var: '--navbar-icon-color', label: 'アイコン', default: '#363c49' },
			{ var: '--navbar-title-color', label: 'タイトル文字', default: '#363c49' },
			{ var: '--new-button-bg', label: '新規ボタン', default: '#3d72f5' },
			{ var: '--search-form-bg', label: '検索窓', default: '#ffffff' },
		],
	},
	{
		title: 'ページ一覧（カード）',
		tokens: [
			{ var: '--body-bg', label: '一覧の背景', default: '#efefef' },
			{ var: '--card-bg', label: 'カード背景', default: '#ffffff' },
			{ var: '--card-title-bg', label: 'カード見出し', default: '#f2f2f3' },
			{ var: '--card-title-color', label: '見出し文字', default: '#444444' },
			{ var: '--card-description-color', label: '本文プレビュー', default: '#7a7a7a' },
			{ var: '--card-description-link-color', label: 'プレビュー内リンク', default: '#6e8af3' },
		],
	},
	{
		title: 'テロメア / 未読',
		tokens: [
			{ var: '--telomere-border', label: '編集履歴バー', default: '#e2e2e2' },
			{ var: '--telomere-unread', label: '未読バー', default: '#89a3ff' },
			{ var: '--telomere-updated', label: '更新バー', default: '#6b8cff' },
			{ var: '--unread-color', label: '未読の色', default: '#41b059' },
		],
	},
	{
		title: '関連ページ',
		tokens: [
			{ var: '--relation-label-bg', label: 'ラベル背景', default: '#edeeee' },
			{ var: '--relation-label-text', label: 'ラベル文字', default: '#444444' },
		],
	},
];
