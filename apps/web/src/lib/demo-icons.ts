import { parse } from "@cosense-toolbox/parser";
import { toHtml } from "@cosense-toolbox/parser/compile";
import { collect } from "@cosense-toolbox/parser/utils";
import style from "@cosense-toolbox/style/style.css?raw";

const project = "help-jp";

const source = [
  "リンクとアイコン",
  " 同じプロジェクトのページ",
  "  [ブラケティング]",
  "  #HashTag",
  " 別のプロジェクトのページ",
  "  [/icons/すごい]",
  " アイコン",
  "  [rakusai.icon]",
  "  [/icons/炎上.icon]",
].join("\n");

const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");

async function resolveIconSrc(user: string): Promise<string> {
  const path = user.startsWith("/")
    ? encodePath(user)
    : `/${encodeURIComponent(project)}/${encodeURIComponent(user)}`;
  const api = `https://scrapbox.io/api/pages${path}/icon`;

  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(4000) });
    return res.ok ? res.url : api;
  } catch {
    return api;
  }
}

const page = parse(source);

const iconSrcByUser = new Map(
  await Promise.all(
    collect(page, "icon").map(
      async (icon) => [icon.user, await resolveIconSrc(icon.user)] as const,
    ),
  ),
);

const body = toHtml(page, {
  pageUrl: (title) =>
    title.startsWith("/")
      ? `https://scrapbox.io${encodePath(title)}`
      : `https://scrapbox.io/${encodeURIComponent(project)}/${encodeURIComponent(title)}`,
  iconImageUrl: (icon) => iconSrcByUser.get(icon.user) ?? null,
});

export const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <style>${style}</style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
