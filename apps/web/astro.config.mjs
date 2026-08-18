// @ts-check
import { defineConfig } from "astro/config";

const SITE_URL = process.env.SITE_URL;

export default defineConfig({
	site: SITE_URL,
});
