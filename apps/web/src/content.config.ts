import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const scripts = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/scripts' }),
	schema: z.object({
		title: z.string(),
		category: z.enum(['theme', 'tools-editor', 'tools-page', 'mods', 'fun', 'core']),
		/** 詳細ページにチップとして出し、検索の対象にもなる */
		tags: z.array(z.string()).default([]),
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
		/** カードのサムネイル。未指定なら共通のダミー画像 */
		media: z.string().optional(),
		/** Gyazo の画像ページ URL ( https://gyazo.com/XXXX )。未指定なら共通のダミー */
		demo: z.string().optional(),
		/** トップで優先表示 */
		featured: z.boolean().default(false),
		/** 並び順（小さいほど先） */
		order: z.number().default(999),
	}),
});

export const collections = { scripts };
