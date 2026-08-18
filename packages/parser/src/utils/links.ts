/**
 * links.ts — AST からリンクと画像を抜き出す。
 */
import type { AnyNode, ImageNode, ProjectLink } from '../types'
import { collect, visit } from './visit'

export interface CollectLinksOptions {
  /** `[/project/title]` も含めるか (既定: false)。同一プロジェクト内の被リンクだけが要るなら false */
  readonly includeProjectLinks?: boolean
}

/**
 * 同じプロジェクト内のページを指すリンクを、出現順・重複なしで集める。
 * `[title]` と `#tag` は同じページを指すので同じ 1 件として扱う。
 */
export const collectLinks = (tree: AnyNode, options?: CollectLinksOptions): string[] => {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (value: string) => {
    if (value === '' || seen.has(value)) return
    seen.add(value)
    out.push(value)
  }

  visit(tree, (node) => {
    if (node.type === 'internalLink') add(node.target)
    else if (node.type === 'hashtag') add(node.value)
    else if (node.type === 'projectLink' && options?.includeProjectLinks) add(node.target)
  })

  return out
}

/** ページが参照している外部プロジェクトのリンクを、出現順に集める。 */
export const collectProjectLinks = (tree: AnyNode): ProjectLink[] => collect(tree, 'projectLink')

/** 最初に現れる画像ノード。無ければ null。 */
export const firstImage = (tree: AnyNode): ImageNode | null => {
  let found: ImageNode | null = null
  visit(tree, 'image', (node) => {
    found = node
    return 'exit'
  })
  return found
}
