# 0005: Data is read only on the server, already localized

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
Pages are server-rendered (TanStack Start on Netlify). The full dataset, all versions and all
locales, will be several MB. A page needs one entity in one locale.

## Decision
- **Bundling:** `src/data/load.server.ts` bundles `data/**/*.json` into the server build with
  `import.meta.glob` (eager), then parses and checks it once per server instance. If the data is
  invalid, it refuses to serve.
- **Access:** routes read data only through server functions in `src/data/queries.ts`. Those
  functions build plain view objects (`src/data/views.ts`) with the text already merged for the
  requested locale.
- **Locale:** the locale is an explicit input to each server function. Server-function requests
  don't carry the page URL, so the locale can't be read from there. On the server, the URL
  locale (`/fr/...`) comes from Paraglide's middleware (`src/server.ts`), and the router
  rewrites URLs so routes stay locale-agnostic.

## Alternatives passed over
- **Import the JSON in components:** the whole dataset, in every locale, would ship to the
  browser.
- **Static JSON fetched by the client:** needs a build step that splits files per page and
  locale, and gives up the server-rendered first paint.
- **Read files from disk at runtime:** fragile on serverless (the files must be copied next to
  the function), and slower on cold starts than bundled modules.

## Consequences
- The browser only receives what a page shows. A production build confirms no data reaches
  `dist/client`.
- A data change needs a redeploy. That's acceptable, since data changes go through git anyway
  (0001).
- Server cold starts parse the whole dataset. Revisit if that becomes noticeable, for example by
  switching to lazy globs per version.
