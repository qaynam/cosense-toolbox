/**
 * The TextMate scope each Cosense notation is drawn as.
 *
 * Keys are the token names @cosense-toolbox/language-server reasons in, so the two
 * highlighters describe the same things; the parity test holds them to it. Each scope
 * starts with a name themes already colour (`markup.bold`, `string.other.link`, ...), so
 * any Shiki or VS Code theme draws Cosense without knowing about it.
 */
export const SCOPES = {
  title: 'markup.heading.cosense',
  link: 'string.other.link.internal.cosense',
  projectLink: 'string.other.link.project.cosense',
  externalLink: 'markup.underline.link.external.cosense',
  hashtag: 'entity.name.tag.hashtag.cosense',
  code: 'markup.inline.raw.cosense',
  codeBlock: 'markup.raw.block.cosense',
  formula: 'constant.other.formula.cosense',
  icon: 'string.other.link.icon.cosense',
  // Only the `>` marker, as the language server marks it. The whole line also carries
  // `markup.quote.cosense` so themes can tint it.
  quote: 'punctuation.definition.quote.begin.cosense',
  bold: 'markup.bold.cosense',
  italic: 'markup.italic.cosense',
  strike: 'markup.strikethrough.cosense',
  underline: 'markup.underline.cosense',
  image: 'markup.underline.link.image.cosense',
  table: 'markup.other.table.cosense',
  // `[** x]` and louder: still bold to a theme, but a level apart for anyone who wants it.
  bold2: 'markup.bold.level2.cosense',
  bold3: 'markup.bold.level3.cosense',
  // `.csnx` only.
  component: 'meta.tag.component.cosense',
  frontmatter: 'comment.block.frontmatter.cosense',
} as const

export type Notation = keyof typeof SCOPES
