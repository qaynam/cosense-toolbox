import { describe, expect, it } from 'vitest'
import { asImageSrc } from './image'

describe('asImageSrc', () => {
  it('パス末尾が画像拡張子なら画像として扱う', () => {
    expect(asImageSrc('https://x.com/a.png')).toBe('https://x.com/a.png')
    expect(asImageSrc('https://x.com/a.jpeg?w=100&h=50')).toBe('https://x.com/a.jpeg?w=100&h=50')
    expect(asImageSrc('https://x.com/a.svg#foo')).toBe('https://x.com/a.svg#foo')
  })

  it('拡張子を持たない URL に #.svg を足すと画像として扱う', () => {
    // 配信 URL に「これは画像」と教える Cosense の慣習。
    const badge = 'https://kanban.example.dev/api/status/abc?userId=xyz#.svg'
    expect(asImageSrc(badge)).toBe(badge)
    expect(asImageSrc('https://x.com/chart?id=1#.png')).toBe('https://x.com/chart?id=1#.png')
  })

  it('クエリの中にだけ拡張子がある URL は画像として扱わない', () => {
    expect(asImageSrc('https://x.com/img?url=https://y.com/a.png')).toBeNull()
  })

  it('拡張子が無ければ画像として扱わない', () => {
    expect(asImageSrc('https://x.com/page')).toBeNull()
  })

  it('Gyazo の URL は i.gyazo.com の png に正規化する', () => {
    const hash = '503a911fea542532aa5aba0a88eb7b60'
    expect(asImageSrc(`https://gyazo.com/${hash}`)).toBe(`https://i.gyazo.com/${hash}.png`)
    expect(asImageSrc(`https://i.gyazo.com/${hash}`)).toBe(`https://i.gyazo.com/${hash}.png`)
    expect(asImageSrc(`https://i.gyazo.com/${hash}.png`)).toBe(`https://i.gyazo.com/${hash}.png`)
  })
})
