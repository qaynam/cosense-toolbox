// Cosense のユーザーアイコンを、別オリジンからでも <img> に入れられる URL に解決する。
//
// https://scrapbox.io/api/pages/{project}/{user}/icon は
// `Cross-Origin-Resource-Policy: same-origin` を返すので、scrapbox.io 以外のページの
// <img> からは読めない（`Access-Control-Allow-Origin` も無いので crossorigin 属性でも回避できない）。
// ただし中身は Gyazo への 302 で、リダイレクト先の i.gyazo.com は CORP を持たない。
//
// CORP はブラウザが subresource の読み込みに課す規則なので、ビルド時のサーバー間 fetch には効かない。
// ここでリダイレクトを辿って直リンクに変えておけば、ブラウザは Gyazo だけを読みにいく。
// ネットワーク不可（サンドボックス等）では元の URL のまま返す。
// 同一プロセス内ではメモ化して重複フェッチを避ける。

const cache = new Map<string, string>();

/** `[/icons/name.icon]` は user が `/icons/name` の形で入っているので、その場合は project を足さない。 */
function iconApiUrl(project: string, user: string): string {
	const path = user.startsWith("/")
		? user.split("/").map(encodeURIComponent).join("/")
		: `/${encodeURIComponent(project)}/${encodeURIComponent(user)}`;
	return `https://scrapbox.io/api/pages${path}/icon`;
}

export async function resolveIconSrc(project: string, user: string): Promise<string> {
	const api = iconApiUrl(project, user);
	const cached = cache.get(api);
	if (cached) return cached;

	let resolved = api;
	try {
		// fetch は既定でリダイレクトを辿るので、res.url が最終的な画像 URL になる。
		const res = await fetch(api, { signal: AbortSignal.timeout(4000) });
		if (res.ok) resolved = res.url;
	} catch {
		// ネットワーク不可 → 元の URL のまま
	}
	cache.set(api, resolved);
	return resolved;
}
