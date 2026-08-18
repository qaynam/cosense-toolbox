import { Option, pipe } from 'effect'
import { shiftOrigin } from '../../core/position'
import { findClosingBracket } from '../../core/scan'
import { bracketRules, simpleTargetRules } from '../bracket-rules'
import type { BracketRule, BracketRuleContext, InlineConstruct } from '../types'

/** ルールを順に試す。ジェネレータにしているのは最初に成立した時点で残りを評価しないため。 */
function* attempts(rules: readonly BracketRule[], inner: string, ctx: BracketRuleContext) {
  for (const rule of rules) yield rule(inner, ctx)
}

const parseInner = (inner: string, ctx: BracketRuleContext) =>
  pipe(
    // 拡張のルールが最優先。既定の記法を上書きできるようにするため。
    Option.firstSomeOf(attempts(ctx.bracketRules, inner, ctx)),
    Option.orElse(() => Option.firstSomeOf(attempts(bracketRules, inner, ctx))),
    Option.orElse(() =>
      // 中に角括弧を含む中身は単純ターゲットではないので、記法として成立させない。
      inner.includes('[') || inner.includes(']')
        ? Option.none()
        : Option.firstSomeOf(attempts(simpleTargetRules, inner, ctx)),
    ),
  )

/**
 * `[...]` 全般。閉じ括弧は深さを数えて探すので `[* a [b] c]` でも外側で閉じる。
 *
 * 中身が空 (`[]` / `[ ]`) のときと、どのルールにも当たらなかったときは None を返す。
 * 呼び出し側は先頭の `[` を素の文字として 1 文字進めるので、内側が改めて走査される。
 */
export const bracketConstruct: InlineConstruct = (source, index, ctx) => {
  if (source[index] !== '[') return Option.none()

  return pipe(
    findClosingBracket(source, index),
    Option.flatMap((end) => {
      const inner = source.slice(index + 1, end)
      if (inner.trim() === '') return Option.none()

      const innerCtx: BracketRuleContext = {
        ...ctx,
        innerOrigin: shiftOrigin(ctx.origin, index + 1),
      }
      return pipe(
        parseInner(inner, innerCtx),
        Option.map((node) => ({ node, length: end + 1 - index })),
      )
    }),
  )
}
