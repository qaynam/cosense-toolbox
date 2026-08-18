/**
 * fixtures/conformance.json がこのパーサーの記法仕様。
 * ここが緑でないものはリリースしない。
 */
import { describe, expect, it } from 'vitest'
import fixtures from './fixtures/conformance.json'
import { tokenizeInline } from './inline/tokenize'
import { parse } from './parse'
import { stripPositions } from './test-helpers'

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
