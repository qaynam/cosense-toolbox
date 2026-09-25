/**
 * server.ts — `astro:jsx` レンダラ。
 *
 * `.csn` / `.csnx` のモジュールは `astro/jsx-runtime` で要素を組み立てるので、
 * Astro にはそれを描画するレンダラが要る。`@astrojs/mdx` が登録するものと同じ役割で、
 * Astro は `astro:jsx` を 1 つしか持たないので、両方入っていてもぶつからない。
 */
import { AstroJSX, jsx } from "astro/jsx-runtime"
import { chunkToString, renderStreaming } from "astro/runtime/server/index.js"

type Component = ((props: Record<string, unknown>) => unknown) & {
  readonly [key: symbol]: unknown
}
type Slots = Record<string, unknown> & { default?: unknown }

/** Astro のスロット名 (`my-slot`) を props 名 (`mySlot`) にする。 */
const slotName = (name: string): string =>
  name.trim().replace(/[-_]([a-z])/g, (_, char: string) => char.toUpperCase())

const slotProps = (slotted: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(slotted).map(([key, value]) => [slotName(key), value]))

async function check(
  Component: Component,
  props: Record<string, unknown>,
  { default: children = null, ...slotted }: Slots = {},
): Promise<boolean> {
  if (typeof Component !== "function") return false
  try {
    const result = (await Component({ ...props, ...slotProps(slotted), children })) as Record<
      string,
      unknown
    >
    return Boolean(result?.[AstroJSX as unknown as string])
  } catch {
    return false
  }
}

async function renderToStaticMarkup(
  this: { result: Parameters<typeof chunkToString>[0] },
  Component: Component,
  props: Record<string, unknown> = {},
  { default: children = null, ...slotted }: Slots = {},
): Promise<{ html: string }> {
  const { result } = this
  let html = ""
  const destination = {
    write(chunk: unknown) {
      if (chunk instanceof Response) return
      html += chunkToString(result, chunk as Parameters<typeof chunkToString>[1])
    },
  }
  await renderStreaming(
    jsx(Component, { ...props, ...slotProps(slotted), children }),
    result,
    destination as Parameters<typeof renderStreaming>[2],
  )
  return { html }
}

export default { name: "astro:jsx", check, renderToStaticMarkup }
