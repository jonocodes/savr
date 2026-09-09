// `?bookmarklet` imports are resolved by the minify-bookmarklet Vite plugin in
// vite.config.ts: the referenced file is minified at build time and exported as
// a string.
declare module "*?bookmarklet" {
  const source: string;
  export default source;
}
