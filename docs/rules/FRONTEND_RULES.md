# Frontend Implementation Rules

These rules govern React code in projects built on this kit — routes, views, components and
services alike. They are project-agnostic: the UI kit, locales and other per-project choices are
declared in the **Project profile** in `AGENTS.md`.

## 1. No `useEffect`, by default

Treat `useEffect` as a last resort. Before reaching for it, look for an alternative:
- Deriving a value during render instead of syncing it in an effect.
- An event handler, instead of reacting to a state change after the fact.
- TanStack Query for data fetching/caching instead of a manual fetch-in-effect.
- TanStack Router `beforeLoad`/loaders for data needed before a route renders.
- `key`-based remounting instead of an effect that resets state.
- `useSyncExternalStore` for subscribing to external stores.

Auth bootstrapping — the classic hard case — is already solved: `@vp-auth/react`'s store starts its
session check on first subscription, and routes await `authStore.ready()` in `beforeLoad`. If none
of the above fit, **stop and ask before adding a `useEffect`**.

## 2. Use the project's UI kit first

Before hand-building a component, check whether the UI kit named in the project profile already
has it, and adapt that. Only build fully custom markup when nothing suitable exists.

## 3. Custom component folder structure

Every custom component gets its own folder under `src/components/`, with an `index.tsx` that
re-exports from the sibling implementation file(s):

```
src/components/Product/
  index.tsx         # export { Product } from "./Product"
  Product.tsx       # the actual component
  Product.types.ts  # (if needed) prop/type definitions
```

Further siblings (subcomponents, local hooks) are re-exported through `index.tsx`. Consumers import
`~/components/Product`, never the folder's internal files.

## 4. Test user flows, not every component

Write tests for user flows ("signed-in user adds a note and reads it back") — not a unit test per
component. A component gets its own test only if it has meaningfully complex logic. Encryption
paths are tested with real keys (`createTestSession` in `src/test/`), not stubbed crypto.

## 5. Routes are thin; views hold the actual page

Route files in `src/routes/` (TanStack Router file-based routing) contain only params, guards
(`beforeLoad`), loaders and rendering the matching view. The page itself lives in `src/views/`.

```
src/routes/app.tsx        # thin: guard + <DashboardView />
src/views/dashboard/      # the real page
```

## 6. Views are organized by folder

Same folder-per-feature shape as components, under `src/views/`, with an `index.ts` re-export.

## 7. External services live under `src/services/`

Anything that calls the network (HTTP, query, mutation) is declared under
`src/services/<ServiceName>/`. Its `index.ts` is the service's only public surface and contains no
logic: it re-exports the query file, the hook file and the types.

```ts
export * from "./Notes.query";
export * from "./Notes.hook";
export type * from "./Notes.types";
```

Consumers import from `~/services/Notes`, never from the inner files.

## 8. Every service ships the same files

| File | Purpose |
|---|---|
| `index.ts` | Public surface (rule 7) — no logic |
| `XX.query.ts` | TanStack Query `queryOptions`/`mutationOptions`. Queries are named `get*` (`getNoteList`), mutations `set*` for create/update (`setNote`) and `delete*` for removal (`deleteNote`) |
| `XX.hook.ts` | React hooks wrapping them for components, plus the mock switch (rule 10) |
| `XX.test.ts` | Tests for the query/mutation behaviour |
| `XX.mock.ts` | Faker-based mocks (rule 9) |
| `XX.types.ts` | (optional) Types, when there are enough to pull out of `XX.query.ts` |

A real function and its mock return the same type, so the hook can switch between them freely.

## 9. Mocks mirror the real function name, and use Faker.js, kept simple

Every mock is named after the function it replaces with `Mock` appended (`getNoteList` →
`getNoteListMock`). `XX.mock.ts` produces plausible values with `@faker-js/faker`, shaped like the
real (decrypted) result — no elaborate scenario logic.

## 10. Services fall back to mocks via an env flag

Each service checks one flag, `VITE_<SERVICE>_SERVICE_ENABLED`, computed once as a module-level
constant in `XX.hook.ts`. Unset or anything but `"true"` → the hook uses the mock, so the UI can be
built before the endpoint exists. Commit the flags in `.env.development`, `.env.production` and
`.env.test`, and list them in `.env.example`. Auth itself is never mocked: it is provided by the
kit and always talks to the real API.

## 11. Translate every user-facing string into every project locale

Every new user-facing string gets a message in each locale listed in the project profile, through
the project's i18n setup — no hard-coded UI text. For `fr-CA`, write Canadian French (OQLF
terminology: « courriel », « ouvrir une session », « code de récupération »), not `fr-FR`. Error
messages map from the API's `code`, never from server-provided text.

## 12. Minimal comments; diagram what's genuinely complex

Don't comment self-explanatory code; keep comments for "why". For something genuinely
non-obvious (key exchange, a new ceremony), write a Mermaid diagram plus a short explanation under
`/docs` instead of a wall of inline comments.

## 13. One package manager

Always use the package manager named in the project profile for installs and scripts.

## 14. Prefer `type` over `interface`

Default to `type` for object shapes. Mixing both is confusing on its own, and `type` also covers
unions/intersections/mapped types. (Module augmentation, e.g. TanStack Router's `Register`, is
the one place `interface` is required.)

## 15. Arrow functions by default

Declare functions as arrow functions — utilities, handlers, hooks, components, test helpers. The
one carve-out is what TanStack Router's file-based routing expects as a plain `function`: a
route's `component`/`errorComponent`/`notFoundComponent` in `src/routes/*.tsx`.

## 16. React components: named `export const`, never `export default`

Every component is `export const ComponentName = (props: Props) => {}`. Keeps every import named,
consistent with the folder re-exports in rules 3 and 6.