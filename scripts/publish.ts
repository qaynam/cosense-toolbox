#!/usr/bin/env bun
/**
 * packages/<name> を npm に公開する。
 *
 * dist-tag は package.json の `publishConfig.tag` から取る。
 * npm 11.17 は `publishConfig.tag` を読まず `latest` で公開してしまうため、
 * ここで読み出して `--tag` に渡している。
 *
 *   bun run npm:publish parser
 *   bun run npm:publish parser --dry-run
 */
import { $ } from 'bun'

const [name, ...rest] = Bun.argv.slice(2)
const dryRun = rest.includes('--dry-run')

if (name === undefined || name.startsWith('-')) {
  console.error('使い方: bun run npm:publish <packages 配下のディレクトリ名> [--dry-run]')
  process.exit(1)
}

const dir = `packages/${name}`
const manifest = Bun.file(`${dir}/package.json`)

if (!(await manifest.exists())) {
  console.error(`${dir}/package.json が無い`)
  process.exit(1)
}

const { name: packageName, version, publishConfig } = await manifest.json()
const tag: string = publishConfig?.tag ?? 'latest'

console.log(`${packageName}@${version} を dist-tag "${tag}" で公開する`)

// prepublishOnly でも走るが、公開物が最新のソースから作られていることを先に確かめておく。
await $`bun run build`

await $`npm publish --tag ${tag} ${dryRun ? ['--dry-run'] : []}`.cwd(dir)
