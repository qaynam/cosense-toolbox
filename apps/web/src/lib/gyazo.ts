// Gyazo の画像ページURL ( https://gyazo.com/XXXX ) を oEmbed で直リンク画像URL+サイズに解決する。
// ネットワーク不可（サンドボックス等）では i.gyazo.com/<id>.png にフォールバックする。
// 同一プロセス内ではメモ化して重複フェッチを避ける。

export interface GyazoMedia {
  id: string;
  url: string;
  width: number;
  height: number;
  /** oEmbed が rich/video のとき返る埋め込みHTML（iframe等）。あればこれを優先表示 */
  html?: string;
  /** oEmbed type: photo | video | rich | link */
  type?: string;
}

const cache = new Map<string, GyazoMedia>();

export function gyazoId(pageUrl: string): string | null {
  const m = pageUrl?.match(/gyazo\.com\/([0-9a-f]{20,})/i);
  return m ? m[1] : null;
}

export async function resolveGyazo(
  pageUrl: string,
): Promise<GyazoMedia | null> {
  const id = gyazoId(pageUrl);
  if (!id) return null;
  if (cache.has(id)) return cache.get(id)!;

  // oEmbed が取れなくても表示できるよう、先に直リンクを組み立てておく
  let media: GyazoMedia = {
    id,
    url: `https://i.gyazo.com/${id}.png`,
    width: 0,
    height: 0,
  };
  try {
    const endpoint = `https://api.gyazo.com/api/oembed?url=${encodeURIComponent(`https://gyazo.com/${id}`)}`;
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const j = (await res.json()) as {
        url?: string;
        width?: number;
        height?: number;
        html?: string;
        type?: string;
      };
      media = {
        id,
        url: j.url ?? media.url,
        width: j.width ?? 0,
        height: j.height ?? 0,
        html: j.html,
        type: j.type,
      };
    }
  } catch {
    // ネットワーク不可 → フォールバックURLのまま
  }
  cache.set(id, media);
  return media;
}
