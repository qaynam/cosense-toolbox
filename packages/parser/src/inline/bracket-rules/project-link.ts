import { Option } from 'effect'
import type { BracketRule } from '../types'

/**
 * `[/project/title]` — 別プロジェクトのページへのリンク。
 *
 * タイトルは `/` を含みうるので最初の `/` だけで分割する。
 * `[/project]` のようにタイトルが無い書き方も記法としては成立するので、
 * その場合は title を空文字にする (利用側が「プロジェクトそのものへのリンク」と判断できる)。
 */
export const projectLinkRule: BracketRule = (inner) => {
  if (!inner.startsWith('/')) return Option.none()

  const rest = inner.slice(1)
  const slash = rest.indexOf('/')
  const project = slash < 0 ? rest : rest.slice(0, slash)
  const title = slash < 0 ? '' : rest.slice(slash + 1)

  return Option.some({ type: 'projectLink', label: inner, target: inner, project, title })
}
