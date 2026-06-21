# Workaround: recovering lazy-loaded `<picture>` images before Readability

## TL;DR

`hoistPictureSources()` in `lib/src/ingestion.ts` lifts the largest `<source srcset>`
URL onto a srcless `<img>` **before** Readability parses the document. Without it,
articles from Medium (and other sites using the same pattern) come through with **no
images at all**. If/when upstream Readability learns to recover these images, this
workaround can be removed.

## The symptom

Fetching e.g. <https://medium.com/airbnb-engineering/rethinking-text-resizing-on-web-1047b12d2881>
produced an article with the body images missing — only the author avatar survived.

## Why it happens

Medium (and similar sites) render every article image as a lazy-loaded `<picture>`:

```html
<figure>
  <picture>
    <source srcSet="https://miro.medium.com/v2/resize:fit:640/.../1*x.jpeg 640w,
                    https://miro.medium.com/v2/resize:fit:1400/.../1*x.jpeg 1400w" ...>
    <img alt="..." width="700" height="467" loading="eager">   <!-- NO src -->
  </picture>
</figure>
```

Two things combine to defeat extraction:

1. The `<img>` has **no `src` and no `srcset`** — Medium populates it via client-side
   JS on scroll. The real URL lives only in the sibling `<source srcSet>`.
2. **Readability runs before our image extraction.** It discards the "empty" `<img>`
   (and its `<picture>`/`<source>`) during the grab/clean pass because there's nothing
   to score. By the time `extractImageUrls` runs, the body images are already gone.

Verified directly against the live HTML (fetched through the app's CORS proxy):
Readability returned **0 body images**; after `hoistPictureSources` it preserves them.

## Why Readability doesn't handle it

This is a long-standing **gap**, not a deliberate choice.

- Readability has lazy-image handling — `_fixLazyImages` (added in
  [PR #590](https://github.com/mozilla/readability/pull/590), the "Kinja sites" fix,
  [commit 52ab9b5](https://github.com/mozilla/readability/commit/52ab9b5c8916c306a47b2119270dcdabebf9d203)).
  But it only inspects an **element's own attributes**, looking for `data-src` /
  `data-srcset`-style values. It **never reads the `srcset` off child `<source>`
  elements** inside a `<picture>`. The only `<source>` handling is `_fixRelativeUris`,
  which merely rewrites relative URLs to absolute — it does not hoist anything.
- `_fixLazyImages` was scoped to the convention common circa 2018: the real URL sits in
  a `data-*` attribute **on the `<img>` itself**. Medium's variant (empty `<img>` +
  real URL only on `<source>`, hydrated by JS) was never covered, and no upstream
  issue/PR addresses the source-only `<picture>` case specifically.
- The broader "srcset/lazy images dropped" problem has been **open and unassigned since
  2017**: [Bugzilla 1355164](https://bugzilla.mozilla.org/show_bug.cgi?id=1355164).
  Related issues: [#657](https://github.com/mozilla/readability/issues/657)
  (recognize `data-src`/`data-srcset` without image extensions),
  [#544](https://github.com/mozilla/readability/issues/544) (make lazy detection optional).

So the historically dominant lazyload convention (URL in a `data-*` attr on the `<img>`)
*is* handled; the source-only `<picture>` pattern is the unaddressed edge.

## How our fix works (two parts)

1. **`hoistPictureSources(doc)`** — runs in `readabilityToArticle` *before*
   `new Readability(...)`. For each `<picture>` whose `<img>` lacks a `src`, it copies
   the largest `<source>` srcset URL onto the `<img>`, so Readability keeps the image.
2. **`extractImageUrls(doc, url)`** — runs *after* Readability, during download. For
   images inside a `<picture>` it falls back to the `<source>` srcset when the `<img>`
   still has none, then **strips the `<source>` siblings** so the rendered article uses
   the downloaded local copy (the browser otherwise gives `<source>` precedence over
   `<img src>` and would re-fetch the remote original).

## When can this be removed?

If a future `@mozilla/readability` recovers source-only `<picture>` images on its own
(watch [Bugzilla 1355164](https://bugzilla.mozilla.org/show_bug.cgi?id=1355164) and
`_fixLazyImages`), `hoistPictureSources` becomes redundant and can be dropped. The
`<source>`-stripping in `extractImageUrls` should stay regardless, since it's about
making the browser use our downloaded copies rather than about Readability.

Tests: `lib/__tests__/ingestion-srcset.test.ts` (`hoistPictureSources` and the
`<picture>`/`<source>` extraction cases).
