/**
 * style.css とプラグインの出力で、見た目が同じになるかを確かめる。
 *
 * parser の記法仕様 (conformance.json) のページをすべて `toHtml` で描画し、
 * 一方は style.css、もう一方はプラグインを Tailwind に通した CSS で表示する。
 * 全要素と `::before` / `::after` の計算済みスタイルを、hover していない状態と
 * している状態の両方で突き合わせる。
 * あわせて、`cosense-link:` などの modifier で当てた utility が、対象の要素で既定のスタイルに勝つかを確かめる。
 *
 * ブラウザが要るのでテストには入れていない。style.css やプラグインの組み立て方を
 * 変えたら `bun run compare` で確かめる。Chromium は `npx playwright install chromium` で入れるか、
手元のものを `CHROMIUM_PATH` で渡す。
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from '@cosense-toolbox/parser'
import { type HtmlOptions, toHtml } from '@cosense-toolbox/parser/compile'
import { optimize } from '@tailwindcss/node'
import { type Page, chromium } from 'playwright-core'
import { compile } from 'tailwindcss'
import cosense from '../src/index'
import { MODIFIERS } from '../src/modifiers'

const packagesDir = join(import.meta.dirname, '..', '..')

interface Fixtures {
  readonly inline: readonly { readonly input: string }[]
  readonly page: readonly { readonly input: string }[]
}

const fixtures = JSON.parse(
  await readFile(join(packagesDir, 'parser', 'src', 'fixtures', 'conformance.json'), 'utf8'),
) as Fixtures

/** 記法仕様に無い、行の単位の記法を組み合わせたページ。 */
const SAMPLE = [
  '行の記法',
  '>引用 [リンク] `コード` [* 太字] #タグ',
  ' >字下げした引用',
  '[** 見出し]',
  '  [*** 大きな見出し] と [[太字]]',
].join('\n')

/** 行の途中の記法はまとめて 1 ページにする。 */
const sources = [
  ...fixtures.page.map(({ input }) => input),
  ['インライン記法', ...fixtures.inline.map(({ input }) => input)].join('\n'),
  SAMPLE,
]

const options: HtmlOptions[] = [
  {},
  // インデントの印と、画像のアイコンにも当たるルールがあるので、それらを出す形でも描画する。
  { showPads: true, iconImageUrl: () => 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
]

const bodies = options.flatMap((option) => sources.map((source) => toHtml(parse(source), option)))

/** Tailwind に class 名を渡して、`@tailwindcss/vite` と同じく平らにした CSS。 */
const pluginCss = async (candidates: string[]): Promise<string> => {
  const compiler = await compile('@plugin "cosense"; @tailwind utilities;', {
    base: '/',
    loadModule: async () => ({ path: '/cosense.js', base: '/', module: cosense as never }),
  })
  return optimize(compiler.build(candidates)).code
}

const documentOf = (css: string, body: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`

/** 全要素の計算済みスタイル。要素の並びは 2 つの文書で同じなので、添字で突き合わせる。 */
const computedStyles = (page: Page): Promise<string[][]> =>
  page.evaluate(() =>
    [...document.body.querySelectorAll('*')].flatMap((element) =>
      [null, '::before', '::after'].map((pseudo) => {
        const style = getComputedStyle(element, pseudo)
        const path = `${element.tagName.toLowerCase()}.${element.className}${pseudo ?? ''}`
        return [path, ...[...style].map((name) => `${name}: ${style.getPropertyValue(name)}`)]
      }),
    ),
  )

/** すべての要素を hover した状態にする。 */
const forceHover = async (page: Page): Promise<void> => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
  const ids: number[] = []
  const walk = (node: typeof root) => {
    if (node.nodeType === 1) ids.push(node.nodeId)
    for (const child of node.children ?? []) walk(child)
  }
  walk(root)
  for (const nodeId of ids) {
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] })
  }
}

// Playwright の版に合う Chromium が無い環境では、手元の Chromium を CHROMIUM_PATH で渡す。
const executablePath = process.env.CHROMIUM_PATH
const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
try {
  const styleCss = await readFile(join(packagesDir, 'style', 'style.css'), 'utf8')
  const tailwindCss = await pluginCss(['cosense'])
  const body = bodies.join('\n')

  const render = async (css: string, html: string, hover: boolean) => {
    const page = await browser.newPage()
    await page.setContent(documentOf(css, html), { waitUntil: 'domcontentloaded' })
    if (hover) await forceHover(page)
    return computedStyles(page)
  }

  const differences: string[] = []
  for (const hover of [false, true]) {
    const expected = await render(styleCss, body, hover)
    // ルートの class だけを `page` から `cosense` に替える。
    const actual = await render(
      tailwindCss,
      body.replaceAll('<div class="page">', '<div class="cosense">'),
      hover,
    )
    expected.forEach((expectedStyle, i) => {
      const actualStyle = actual[i] ?? []
      const [path, ...properties] = expectedStyle
      properties.forEach((property, j) => {
        if (actualStyle[j + 1] !== property) {
          differences.push(`${hover ? '[hover] ' : ''}${path}: ${property} → ${actualStyle[j + 1]}`)
        }
      })
    })
  }

  // modifier で当てた utility が、対象のすべての要素で既定のスタイルに勝つか。
  // 既定のスタイルが色を決めている要素が多いので、color で確かめる。
  const MARK = 'rgb(1, 2, 3)'
  for (const modifier of MODIFIERS) {
    const utility = `cosense-${modifier.name}:[color:${MARK.replaceAll(' ', '')}]`
    const page = await browser.newPage()
    await page.setContent(
      documentOf(
        await pluginCss(['cosense', utility]),
        body.replaceAll('<div class="page">', `<div class="cosense ${utility}">`),
      ),
      { waitUntil: 'domcontentloaded' },
    )
    const colors = await page.evaluate(
      (target) =>
        [...document.querySelectorAll(`.cosense :is(${target})`)].map(
          (element) => getComputedStyle(element).color,
        ),
      modifier.target,
    )
    await page.close()
    if (colors.length === 0) differences.push(`${utility}: 当たる要素が描画した中に無い`)
    const missed = colors.filter((color) => color !== MARK).length
    if (missed > 0)
      differences.push(`${utility}: ${colors.length} 要素のうち ${missed} 要素で負けた`)
  }

  const elements = bodies.join('').match(/<[a-z]/g)?.length ?? 0
  if (differences.length > 0) {
    console.error(`${differences.length} 件の違いがある:`)
    for (const difference of differences.slice(0, 50)) console.error(`  ${difference}`)
    process.exitCode = 1
  } else {
    console.log(
      `${sources.length * options.length} ページ・${elements} 要素で、計算済みスタイルが一致した。` +
        `modifier ${MODIFIERS.length} 個が、どれも対象の要素で既定のスタイルに勝った`,
    )
  }
} finally {
  await browser.close()
}
