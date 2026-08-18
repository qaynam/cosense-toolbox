import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const scripts = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/scripts' }),
	schema: z.object({
		/** 表示名（日本語可） */
		title: z.string(),
		/** カテゴリ */
		category: z.enum(['theme', 'tools-editor', 'tools-page', 'mods', 'fun', 'core']),
		/** 絞り込み・検索用のタグ */
		tags: z.array(z.string()).default([]),
		/** 動作状況 */
		status: z.enum(['active', 'disabled', 'experimental']).default('active'),
		/** カードに出る1行説明 */
		summary: z.string(),
		/** コピペ用のインストールスニペット */
		install: z.object({
			kind: z.enum(['js', 'css', 'module']),
			code: z.string(),
		}),
		/** ライブデモの実現方針: A=モック着せ替え / B=実物マウント / C=GIF動画 */
		demoTier: z.enum(['A', 'B', 'C']).optional(),
		/** 元のCosenseページURL */
		source: z.string(),
		/** カードのサムネ画像パス（任意） */
		media: z.string().optional(),
		/** デモのGyazo画像ページURL ( https://gyazo.com/XXXX )（任意。未指定はダミー） */
		demo: z.string().optional(),
		/** トップで優先表示 */
		featured: z.boolean().default(false),
		/** 並び順（小さいほど先） */
		order: z.number().default(999),
	}),
});

export const collections = { scripts };
