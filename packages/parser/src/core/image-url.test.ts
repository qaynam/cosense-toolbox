import { describe, expect, it } from 'vitest'
import { asImageSrc, isImageUrl } from './image-url'

describe('isImageUrl', () => {
  it('パス末尾が画像拡張子なら画像として扱う', () => {
    expect(isImageUrl('https://x.com/a.png')).toBe(true)
    expect(isImageUrl('https://x.com/a.jpeg?w=100&h=50')).toBe(true)
    expect(isImageUrl('https://x.com/a.svg#foo')).toBe(true)
  })

  it('拡張子を持たない URL に #.svg を足すと画像として扱う', () => {
    // 配信 URL に「これは画像」と教える Cosense の慣習。
    expect(isImageUrl('https://kanban.example.dev/api/status/abc?userId=xyz#.svg')).toBe(true)
    expect(isImageUrl('https://x.com/chart?id=1#.png')).toBe(true)
  })

  it('クエリの中にだけ拡張子がある URL は画像として扱わない', () => {
    expect(isImageUrl('https://x.com/img?url=https://y.com/a.png')).toBe(false)
  })

  it('拡張子が無ければ画像として扱わない', () => {
    expect(isImageUrl('https://x.com/page')).toBe(false)
  })

  it('Gyazo のページ URL は拡張子が無くても画像として扱う', () => {
    expect(isImageUrl('https://gyazo.com/503a911fea542532aa5aba0a88eb7b60')).toBe(true)
  })
})

describe('asImageSrc', () => {
  it('画像でない URL には null を返す', () => {
    expect(asImageSrc('https://x.com/page')).toBeNull()
  })

  it('画像 URL はそのまま返す', () => {
    expect(asImageSrc('https://x.com/a.png')).toBe('https://x.com/a.png')
    expect(asImageSrc('https://x.com/a.jpeg?w=100&h=50')).toBe('https://x.com/a.jpeg?w=100&h=50')
  })

  it('Gyazo の URL だけは表示用の i.gyazo.com の png に変換する', () => {
    // これは表示のための変換なので parse() は行わない。使う側が明示的に呼ぶ。
    const hash = '503a911fea542532aa5aba0a88eb7b60'
    expect(asImageSrc(`https://gyazo.com/${hash}`)).toBe(`https://i.gyazo.com/${hash}.png`)
    expect(asImageSrc(`https://i.gyazo.com/${hash}`)).toBe(`https://i.gyazo.com/${hash}.png`)
    expect(asImageSrc(`https://i.gyazo.com/${hash}.png`)).toBe(`https://i.gyazo.com/${hash}.png`)
  })
})
