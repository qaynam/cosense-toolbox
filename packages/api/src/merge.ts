import { type BaseLine, buildSegments } from "./changes"

/**
 * 両方が変えた行。合わせた結果 (`merged`) には、自分の書いたものを守る側の文を入れてある。
 *
 * `line` は `merged` の何行目か。`theirs` はほかの人がその行を消していれば `null`、
 * `ours` は自分がその行を消していれば `null`。
 */
export interface MergeConflict {
  readonly line: number
  readonly ours: string | null
  readonly theirs: string | null
  readonly base: string
}

export interface MergeResult {
  readonly merged: readonly string[]
  readonly conflicts: readonly MergeConflict[]
}

/**
 * 自分の書き換えと、そのあいだにほかの人がした書き換えを合わせる (3-way merge)。
 *
 * `base` は自分が読んだときのページの行、`ours` は自分が書き換えた後の文、`theirs` は今のページの行。
 * `base` と `theirs` は行の id で突き合わせるので、どちらも `getPage` で読んだ id 付きの行を渡す。
 *
 * **自分が書いた文は落とさない。** 両方が違う文にした行は自分の文を残してコンフリクトとして知らせ、
 * 自分が書き換えた行をほかの人が消していたら、書き戻す。ただ 1 つ、自分が消した行をほかの人が
 * 書き換えていたときだけは、ほかの人の文を残す (コンフリクトとして知らせる)。消すのはもう一度
 * 消せば戻せるが、消えた文は戻せないため。
 */
export const mergeThreeWay = (
  base: readonly BaseLine[],
  ours: readonly string[],
  theirs: readonly BaseLine[],
): MergeResult => {
  const baseText = new Map(base.map((line) => [line.id, line.text]))
  const baseOrder = new Map(base.map((line, index) => [line.id, index]))
  const survives = new Set(theirs.map((line) => line.id))

  // 自分が元の行それぞれに何をしたかと、足した行をどこに入れるか。書き換えの変更と同じ差分
  // (`buildSegments`) で元の行に対応させる。ほかの人の側は差分を取らない。行の id で、`theirs` に
  // 無い id はほかの人が消した行、`base` に無い id はほかの人が足した行と分かる。
  type Local = { readonly kind: "update" | "delete"; readonly text: string }
  const local = new Map<string, Local>()
  const insertsByAnchor = new Map<string, string[]>()
  const addInserts = (anchor: string, texts: readonly string[]) => {
    if (texts.length === 0) return
    const existing = insertsByAnchor.get(anchor)
    if (existing) existing.push(...texts)
    else insertsByAnchor.set(anchor, [...texts])
  }

  for (const segment of buildSegments(base, ours)) {
    if (segment.kind === "keep") continue
    for (const { line, text } of segment.updates) local.set(line.id, { kind: "update", text })
    for (const line of segment.deletes) local.set(line.id, { kind: "delete", text: line.text })
    addInserts(segment.anchor, segment.inserts)
  }

  // 足す位置の行をほかの人が消していたら、その後ろでまだ残っている最初の行の前に入れる。
  // 何も落とさず、書いた場所にできるだけ近いところに入れる。
  const resolveAnchor = (anchor: string): string => {
    if (anchor === "_end" || survives.has(anchor)) return anchor
    for (let i = (baseOrder.get(anchor) ?? base.length) + 1; i < base.length; i++) {
      const id = (base[i] as BaseLine).id
      if (survives.has(id)) return id
    }
    return "_end"
  }
  const pending = new Map<string, string[]>()
  for (const [anchor, texts] of [...insertsByAnchor].sort(
    (a, b) => (baseOrder.get(a[0]) ?? base.length) - (baseOrder.get(b[0]) ?? base.length),
  )) {
    const resolved = resolveAnchor(anchor)
    const existing = pending.get(resolved)
    if (existing) existing.push(...texts)
    else pending.set(resolved, [...texts])
  }

  // 自分が書き換えた行をほかの人が消していたら、そのままでは一緒に消える。
  // 消えた行の位置に書き戻し、黙って書くのではなくコンフリクトとして知らせる。
  const rescued = new Map<string, { readonly text: string; readonly base: string }[]>()
  for (const [id, edit] of local) {
    if (edit.kind !== "update" || survives.has(id)) continue
    const anchor = resolveAnchor(id)
    const entry = { text: edit.text, base: baseText.get(id) ?? "" }
    const existing = rescued.get(anchor)
    if (existing) existing.push(entry)
    else rescued.set(anchor, [entry])
  }

  const merged: string[] = []
  const conflicts: MergeConflict[] = []
  // 今入れようとしている位置の直前に、ほかの人が足した行。自分も同じ場所に同じ文を足していたら、
  // 同じ行を 2 回書いたもの (書いたのに応答を受け取れず、もう一度書いたときなど) なので 1 回だけ入れる。
  let remoteAdded: string[] = []
  const flush = (anchor: string) => {
    for (const { text, base: was } of rescued.get(anchor) ?? []) {
      conflicts.push({ line: merged.length, ours: text, theirs: null, base: was })
      merged.push(text)
    }
    let matched = 0
    for (const text of pending.get(anchor) ?? []) {
      if (remoteAdded[matched] === text) matched++
      else merged.push(text)
    }
  }

  for (const line of theirs) {
    flush(line.id)
    const was = baseText.get(line.id)
    if (was === undefined) {
      merged.push(line.text)
      remoteAdded.push(line.text)
      continue
    }
    remoteAdded = []
    const edit = local.get(line.id)
    const remoteChanged = line.text !== was
    if (edit === undefined) {
      merged.push(line.text)
      continue
    }
    if (edit.kind === "delete") {
      if (!remoteChanged) continue
      conflicts.push({ line: merged.length, ours: null, theirs: line.text, base: was })
      merged.push(line.text)
      continue
    }
    if (!remoteChanged || line.text === edit.text) {
      merged.push(edit.text)
      continue
    }
    conflicts.push({ line: merged.length, ours: edit.text, theirs: line.text, base: was })
    merged.push(edit.text)
  }
  flush("_end")

  return { merged, conflicts }
}
