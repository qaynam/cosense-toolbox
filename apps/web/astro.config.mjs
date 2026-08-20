// @ts-check
import { defineConfig } from "astro/config";

const SITE_URL = process.env.SITE_URL ?? "https://cosense-toolbox.qaynam.dev";

export default defineConfig({
  site: SITE_URL,
});
