// @ts-check
import { defineConfig } from "astro/config"

import cosense from "@cosense-toolbox/astro"

const SITE_URL = process.env.SITE_URL ?? "https://cosense-toolbox.qaynam.dev"

export default defineConfig({
  site: SITE_URL,
  integrations: [cosense({ components: "./src/components/cosense-docs.ts", assets: false })],
})
