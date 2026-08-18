export type Category = 'theme' | 'tools-editor' | 'tools-page' | 'mods' | 'fun' | 'core';
export type Group = 'theme' | 'tools' | 'mods' | 'fun' | 'core';
export type Status = 'active' | 'disabled' | 'experimental';
export type DemoTier = 'A' | 'B' | 'C';

// モノトーン方針：色での区別はせず、ラベル(group)だけで分類する
export const CATEGORY_META: Record<Category, { label: string; group: Group; accent: string }> = {
	'theme': { label: 'テーマ変更', group: 'theme', accent: '#8c8c8c' },
	'tools-editor': { label: 'ツール・エディタ', group: 'tools', accent: '#8c8c8c' },
	'tools-page': { label: 'ツール・ページ', group: 'tools', accent: '#8c8c8c' },
	'mods': { label: '改造', group: 'mods', accent: '#8c8c8c' },
	'fun': { label: '飛び道具', group: 'fun', accent: '#8c8c8c' },
	'core': { label: '基盤', group: 'core', accent: '#8c8c8c' },
};

export const GROUPS: { id: Group | 'all'; label: string }[] = [
	{ id: 'all', label: 'すべて' },
	{ id: 'theme', label: 'テーマ' },
	{ id: 'tools', label: 'ツール' },
	{ id: 'mods', label: '改造' },
	{ id: 'fun', label: '飛び道具' },
	{ id: 'core', label: '基盤' },
];

export const STATUS_META: Record<Status, { label: string; color: string }> = {
	active: { label: '有効', color: '#8f8f8f' },
	experimental: { label: '実験的', color: '#8f8f8f' },
	disabled: { label: '無効', color: '#6a6a6a' },
};

export const DEMO_LABEL: Record<DemoTier, string> = {
	A: 'A層: モックに着せ替えて実演',
	B: 'B層: API/DOMをスタブして実物マウント',
	C: 'C層: GIF/動画',
};
