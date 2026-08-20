export type Category = 'theme' | 'tools-editor' | 'tools-page' | 'mods' | 'fun' | 'core';
export type Group = 'theme' | 'tools' | 'mods' | 'fun' | 'core';
export type Status = 'active' | 'disabled' | 'experimental';
export type DemoTier = 'A' | 'B' | 'C';

export const CATEGORY_META: Record<Category, { label: string; group: Group }> = {
	'theme': { label: 'テーマ変更', group: 'theme' },
	'tools-editor': { label: 'ツール・エディタ', group: 'tools' },
	'tools-page': { label: 'ツール・ページ', group: 'tools' },
	'mods': { label: '改造', group: 'mods' },
	'fun': { label: '飛び道具', group: 'fun' },
	'core': { label: '基盤', group: 'core' },
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
