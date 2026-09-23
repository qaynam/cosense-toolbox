import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

/**
 * `.csn` / `.csnx` の記事。title / slug / description / image / tags / draft は
 * frontmatter に書かなくても、本文から入る (1 行目がタイトル、#タグ がタグ)。
 */
const posts = defineCollection({
  loader: glob({ pattern: '**/*.{csn,csnx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    description: z.string(),
    image: z.string().nullable(),
    tags: z.array(z.string()),
    draft: z.boolean(),
    date: z.coerce.date().optional(),
  }),
})

export const collections = { posts }
