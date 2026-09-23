import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import postcss, { type Rule } from 'postcss'
import { compile } from 'tailwindcss'
import { describe, expect, it } from 'vitest'
import { extractStyles } from './extract'
import cosense from './index'
import { styles } from './styles.generated'

const STYLE_CSS = join(import.meta.dirname, '..', '..', 'style', 'style.css')

/** `@plugin` で読み込んだときと同じ経路で Tailwind に通し、使った class の CSS を返す。 */
const build = async (
  candidates: string[],
  plugin: unknown = cosense,
  pluginCss = '@plugin "cosense";',
): Promise<string> => {
  const compiler = await compile(`${pluginCss} @tailwind utilities;`, {
    base: '/',
    loadModule: async () => ({ path: '/cosense.js', base: '/', module: plugin as never }),
  })
  return compiler.build(candidates)
}

/** 空白の書き方の違い (`, ` と `,`、`( >` と `(>`) を消す。 */
const normalize = (selector: string): string =>
  selector.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/,\s+/g, ',').trim()

/**
 * ルールの完全なセレクタ。Tailwind の build はネストしたまま返すので (平らにするのは
 * 後段の最適化)、親のルールのセレクタを子孫として前に付けて展開する。
 */
const fullSelectors = (rule: Rule): string[] => {
  const parent = rule.parent
  if (parent?.type !== 'rule') return rule.selectors
  return fullSelectors(parent as Rule).flatMap((outer) =>
    rule.selectors.map((inner) =>
      inner.includes('&') ? inner.replace(/&/g, outer) : `${outer} ${inner}`,
    ),
  )
}

/**
 * 「セレクタ → 宣言の並び」を出てきた順に並べる。同じセレクタが複数のルールに出ても
 * 取りこぼさないよう、Map ではなく配列にする。
 */
const rulesOf = (css: string): [string, string[]][] => {
  const out: [string, string[]][] = []
  postcss.parse(css).walkRules((rule: Rule) => {
    const declarations: string[] = []
    rule.each((node) => {
      if (node.type === 'decl') {
        declarations.push(`${node.prop}:${node.value}${node.important ? ' !important' : ''}`)
      }
    })
    if (declarations.length === 0) return
    for (const selector of fullSelectors(rule)) out.push([normalize(selector), declarations])
  })
  return out
}

const NOT = ':not(:where([class~="not-cosense"],[class~="not-cosense"] *))'

describe('生成したデータ', () => {
  it('style.css から作り直したものと一致する (style.css を直したら bun run generate)', async () => {
    const css = await readFile(STYLE_CSS, 'utf8')
    expect(styles).toEqual(extractStyles(css))
  })
})

describe('cosense プラグイン', () => {
  it('style.css のすべてのルールを、.cosense の下に同じ宣言で出す', async () => {
    const expected = rulesOf(await readFile(STYLE_CSS, 'utf8')).map(
      ([selector, declarations]): [string, string[]] => [
        normalize(
          selector === '.page'
            ? '.cosense'
            : selector
                .replace(/^\.page /, '.cosense ')
                .replace(/(::[a-z-]+)?$/, (pseudo) => `${NOT}${pseudo}`),
        ),
        declarations,
      ],
    )
    // 順序も含めて一致させる。詳細度が同じルールどうしは、書いた順で勝ち負けが決まるため。
    expect(rulesOf(await build(['cosense']))).toEqual(expected)
  })

  it('擬似要素のあるセレクタでは、not-cosense の除外を擬似要素より前に入れる', async () => {
    const selectors = rulesOf(await build(['cosense'])).map(([selector]) => selector)
    expect(selectors).toContain(normalize(`.cosense .line[data-indent]${NOT}::before`))
  })

  it('className を渡すと、class 名と除外の class 名が変わる', async () => {
    const css = await build(['article'], cosense({ className: 'article' }))
    const selectors = rulesOf(css).map(([selector]) => selector)
    expect(selectors).toContain(
      normalize('.article .line:not(:where([class~="not-article"],[class~="not-article"] *))'),
    )
    expect(selectors.some((selector) => selector.includes('cosense'))).toBe(false)
  })

  it('CSS の @plugin のブロックでも className を渡せる', async () => {
    const css = await build(['article'], cosense, '@plugin "cosense" { className: article; }')
    const selectors = rulesOf(css).map(([selector]) => selector)
    expect(selectors).toContain('.article')
  })

  it('class に cosense が無ければ何も出さない', async () => {
    expect((await build(['flex'])).trim()).not.toContain('.line')
  })
})
