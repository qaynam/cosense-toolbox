/**
 * fixtures/conformance.json がこのパーサーの記法仕様。
 * ここが緑でないものはリリースしない。
 */
import { describe, expect, it } from 'vitest'

import fixtures from './fixtures/conformance.json'
import { tokenizeInline } from './inline/tokenize'
import { parse } from './parse'
import { stripPositions } from './test-helpers'
import type { TableBlock } from './types'

describe('インライン記法', () => {
  it.each(fixtures.inline)('$description', ({ input, expected }) => {
    expect(stripPositions(tokenizeInline(input))).toEqual(expected)
  })
})

describe('ブロック構造', () => {
  it.each(fixtures.page)('$description', ({ input, expected }) => {
    expect(parse(input).children.map((block) => block.type)).toEqual(expected)
  })
})

describe('テーブルのセル', () => {
  it.each(fixtures.tableCell)('$description', ({ input, expected }) => {
    const table = parse(`t\ntable:x\n ${input}`).children[1] as TableBlock
    expect(stripPositions(table.rows[0]?.cells[0]?.children)).toEqual(expected)
  })
})
