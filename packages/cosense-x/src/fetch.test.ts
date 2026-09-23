import { describe, expect, it } from 'vitest'
import { fetchPage, fetchPageText } from './fetch'

const TEXT = 'タイトル\n本文\n 二行目'

/** 呼ばれた URL を記録し、決まった応答を返す fetch。 */
const fakeFetch = (response: () => Response) => {
  const calls: string[] = []
  const fetch = (async (input: string | URL | Request) => {
    calls.push(String(input))
    return response()
  }) as typeof globalThis.fetch
  return { calls, fetch }
}

describe('fetchPageText', () => {
  it('/text の本文をそのまま返し、プロジェクト名とタイトルを URL エンコードする', async () => {
    const { calls, fetch } = fakeFetch(() => new Response(TEXT))
    expect(await fetchPageText('my project', 'a/b c', { fetch })).toBe(TEXT)
    expect(calls).toEqual(['https://scrapbox.io/api/pages/my%20project/a%2Fb%20c/text'])
  })

  it('2xx 以外ならステータスを含めてエラーにする', async () => {
    const { fetch } = fakeFetch(() => new Response('not found', { status: 404 }))
    await expect(fetchPageText('p', 't', { fetch })).rejects.toThrow(/404/)
  })
})

describe('fetchPage', () => {
  it('JSON の lines をつないだ本文が /text と一致し、日時を ISO 8601 にする', async () => {
    const body = {
      title: 'タイトル',
      created: 1_700_000_000,
      updated: 1_700_000_060,
      lines: TEXT.split('\n').map((text) => ({ text })),
    }
    const { calls, fetch } = fakeFetch(() => Response.json(body))
    expect(await fetchPage('p', 'タイトル', { fetch })).toEqual({
      title: 'タイトル',
      text: TEXT,
      created: '2023-11-14T22:13:20.000Z',
      updated: '2023-11-14T22:14:20.000Z',
    })
    expect(calls).toEqual(['https://scrapbox.io/api/pages/p/%E3%82%BF%E3%82%A4%E3%83%88%E3%83%AB'])
  })
})
