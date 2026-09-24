/**
 * .csn / .csnx のすべてのページに渡すコンポーネント。
 * astro.config.mjs の `components` にこのファイルを指定している。
 */
import Callout from "./Callout.svelte";
import CounterIsland from "./CounterIsland.astro";
import AnchorLink from "./AnchorLink.astro";

export default {
  Callout,
  Counter: CounterIsland,
  a: AnchorLink,
};
