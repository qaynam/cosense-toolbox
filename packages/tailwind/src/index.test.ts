import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import postcss, { type Rule } from 'postcss'
import { compile } from 'tailwindcss'
import { describe, expect, it } from 'vitest'
import { extractStyles } from './extract'
import cosense from './index'
import { MODIFIERS } from './modifiers'
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

/** `.page .x::before` を、プラグインが出す `.cosense :where(.x):not(…)::before` の形にする。 */
const flattened = (selector: string): string => {
  if (selector === '.page') return '.cosense'
  const [, body, pseudo = ''] = /^\.page (.+?)(::[a-z-]+)?$/.exec(selector) ?? []
  return normalize(`.cosense :where(${body})${NOT}${pseudo}`)
}

/** 並びを無視して比べるための、並べ替えた写し。 */
const sorted = (rules: [string, string[]][]): string[] =>
  rules.map((rule) => JSON.stringify(rule)).sort()

describe('生成したデータ', () => {
  it('style.css から作り直したものと一致する (style.css を直したら bun run generate)', async () => {
    const css = await readFile(STYLE_CSS, 'utf8')
    expect(styles).toEqual(extractStyles(css))
  })
})

describe('cosense プラグイン', () => {
  it('style.css のすべてのルールを、:where() で包んで .cosense の下に同じ宣言で出す', async () => {
    const expected = rulesOf(await readFile(STYLE_CSS, 'utf8')).map(
      ([selector, declarations]): [string, string[]] => [flattened(selector), declarations],
    )
    expect(sorted(rulesOf(await build(['cosense'])))).toEqual(sorted(expected))
  })

  it('ルールは生成したデータの順、つまり元の詳細度の低い順に出す', async () => {
    const selectors = rulesOf(await build(['cosense'])).map(([selector]) => selector)
    expect(selectors).toEqual([
      '.cosense',
      ...styles.rules.map(({ selector }) => flattened(`.page ${selector.body}${selector.pseudo}`)),
    ])
  })

  it('擬似要素のあるセレクタでは、not-cosense の除外を擬似要素より前に入れる', async () => {
    const selectors = rulesOf(await build(['cosense'])).map(([selector]) => selector)
    expect(selectors).toContain(normalize(`.cosense :where(.line[data-indent])${NOT}::before`))
  })

  it('className を渡すと、class 名と除外の class 名が変わる', async () => {
    const css = await build(['article'], cosense({ className: 'article' }))
    const selectors = rulesOf(css).map(([selector]) => selector)
    expect(selectors).toContain(
      normalize(
        '.article :where(.line):not(:where([class~="not-article"],[class~="not-article"] *))',
      ),
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

describe('modifier', () => {
  it('cosense-link:{utility} は、.cosense の中のリンクだけに utility を当てる', async () => {
    const rules = rulesOf(await build(['cosense', 'cosense-link:[color:red]']))
    expect(rules).toContainEqual([
      normalize(`.cosense-link\\:\\[color\\:red\\] :is(:where(.link)${NOT})`),
      ['color:red'],
    ])
  })

  it('modifier のルールは既定のスタイルより後ろに出る。詳細度が同じなので後ろのものが勝つ', async () => {
    const selectors = rulesOf(await build(['cosense', 'cosense-link:[color:red]'])).map(
      ([selector]) => selector,
    )
    const modifier = selectors.findIndex((selector) => selector.startsWith('.cosense-link'))
    expect(modifier).toBeGreaterThan(0)
    expect(
      selectors.slice(modifier).filter((selector) => selector.startsWith('.cosense ')),
    ).toEqual([])
  })

  it('すべての modifier を使える', async () => {
    const candidates = MODIFIERS.map(({ name }) => `cosense-${name}:[color:red]`)
    const selectors = rulesOf(await build(candidates)).map(([selector]) => selector)
    expect(selectors).toHaveLength(MODIFIERS.length)
  })

  it('className を渡すと modifier の名前も変わる', async () => {
    const css = await build(['article-link:[color:red]'], cosense({ className: 'article' }))
    expect(css).toContain('.article-link\\:\\[color\\:red\\]')
    expect(css).toContain('not-article')
  })

  it('README の modifier の表に、すべての modifier と対象が載っている', async () => {
    const readme = await readFile(join(import.meta.dirname, '..', 'README.md'), 'utf8')
    for (const { name, target } of MODIFIERS) {
      expect(readme).toContain(`| \`cosense-${name}:{utility}\` | \`${target}\` |`)
    }
  })
})
