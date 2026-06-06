# React / TypeScript Best Practices Review

Review the React component, hook, or service file described in `$ARGUMENTS` against code quality standards and 1M-user performance targets.

## Project stack
- **React 18** + **TypeScript** (strict mode)
- **React Query v5** (`@tanstack/react-query`) for server state
- **React Router v6** for navigation
- **Tailwind CSS** + **shadcn/ui** components
- **Sonner** for toasts
- **Axios** via a shared `apiClient` (handles auth headers + 401 logout)
- API layer: `src/api/services/` → `src/api/hooks/` → pages/components
- **Scale target**: 1 million users — initial load, runtime performance, and API request volume all matter.

---

## Component design
- [ ] **Single responsibility**: one component does one thing. Split if the file exceeds ~200 lines or handles both data fetching and complex UI.
- [ ] **No business logic in JSX**: derived values, filters, and sorts computed above the `return` statement — not inline.
- [ ] **Props typed explicitly**: every component has a named `interface Props {}` — no `any`, no inline object types in function signatures.
- [ ] **Avoid prop drilling > 2 levels**: use a context or co-locate state closer to where it's needed.
- [ ] **Keys are stable identifiers** (`item.id`), never array index for lists that can reorder or mutate.

---

## State management
- [ ] **Server state in React Query** — never `useState` + `useEffect` + manual `fetch` for API data.
- [ ] **UI state local** (`useState`) — not pushed into a global context unless multiple unrelated components need it.
- [ ] **`useReducer`** instead of multiple related `useState` calls (> 3 booleans that change together).
- [ ] **No stale closure bugs**: `useEffect` dependency array includes every value read inside the effect.
- [ ] **No derived state in `useState`**: if a value can be computed from props or other state, compute it — don't sync it with an effect.

---

## React Query patterns
- [ ] Query keys follow the `xxxKeys` factory pattern (`cmsKeys`, `categoryKeys`, `taskKeys`) — no ad-hoc string arrays.
- [ ] `staleTime` set appropriately:
  - Search / live data → `0`
  - CMS item details → `30_000` (30 s)
  - Reference data (categories, groups, content types) → `300_000` (5 min) — changes rarely; save round-trips at scale
- [ ] `gcTime` (formerly `cacheTime`) extended for reference data (categories, groups) to avoid re-fetching on tab switch
- [ ] Mutations seed the cache with `queryClient.setQueryData` when the backend returns the updated object — avoids a redundant GET
- [ ] Mutations invalidate only the narrowest key covering the changed data — not `queryClient.invalidateQueries({ queryKey: ['cms'] })` for a single field update
- [ ] `enabled` guard on queries that depend on a resolved ID or slug — no accidental `id=0` fetch
- [ ] **Infinite / cursor pagination** for long lists: use `useInfiniteQuery` instead of page-number state for user-facing scrollable feeds; `useCmsList` is acceptable for admin paged tables
- [ ] **Prefetching**: `queryClient.prefetchQuery` called on hover or route transition for detail pages so data is ready before the user arrives

---

## TypeScript
- [ ] No `any` — use `unknown` + type guard, or the actual DTO from `src/api/types.ts`.
- [ ] No unchecked non-null assertion (`!`) unless provably non-null from surrounding logic.
- [ ] `as Type` cast only at the API transform boundary (`transformCmsItem`) — not scattered through components.
- [ ] Discriminated unions for multi-state UI (`{ status: 'loading' } | { status: 'error'; error: Error } | { status: 'success'; data: T }`) rather than multiple nullable booleans.
- [ ] Enums avoided in favour of `type Status = 'DRAFT' | 'REVIEW' | 'PUBLISHED'` string unions (consistent with backend DTOs and JSON serialization).
- [ ] `satisfies` operator used to validate object shapes without widening the type.

---

## Performance — bundle & load time
- [ ] **Code splitting**: heavy pages (CourseCreator, AdminContentOverview, ConfigurationPage) loaded via `React.lazy` + `<Suspense>` — not bundled into the main chunk
  ```tsx
  const CourseCreator = React.lazy(() => import('@/pages/CourseCreator'));
  ```
- [ ] **Route-level splitting**: each route's page component is a separate lazy chunk in the router definition
- [ ] **Bundle analysis**: `vite-bundle-visualizer` run periodically; no single chunk > 300 KB gzipped
- [ ] **Tree-shakeable imports**: named imports from shadcn/ui and lucide-react — no barrel `import * as Icons from 'lucide-react'`
- [ ] **Third-party scripts** (analytics, chat widgets) loaded asynchronously via `<script defer>` — never block render
- [ ] **Font loading**: Google Fonts loaded with `display=swap`; subsets specified to cut payload

---

## Performance — runtime
- [ ] **Virtualised lists** for admin tables with > 100 rows: use `@tanstack/react-virtual` — rendering 1000 DOM rows blocks the main thread
- [ ] **`useMemo`** for expensive computations: `parseBodyToBlocks`, category tree flattening, filtered/sorted item arrays
- [ ] **`useCallback`** for handlers passed to `React.memo`'d child components (e.g. `CourseChapterManager` callbacks)
- [ ] **Image optimisation**: thumbnails served via CDN URL from `cmsService.buildMediaUrl`; `loading="lazy"` on images below the fold; `srcSet` for responsive sizes
- [ ] **Debounce** search inputs (≥ 300 ms) before updating query params — prevents a query per keystroke at 1M users' worth of concurrent typing
  ```ts
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data } = useCmsList({ search: debouncedSearch });
  ```
- [ ] **Optimistic updates** on mutations that users repeat frequently (reaction, favourite, note save) — update cache immediately, roll back on error

---

## Performance — network & caching
- [ ] Static assets (JS, CSS, images) served from a CDN with `Cache-Control: public, max-age=31536000, immutable` (Vite fingerprints file names)
- [ ] API responses for published content include `Cache-Control: public, s-maxage=60` — CDN / proxy caches absorb repeat reads
- [ ] `apiClient` configured with `Accept-Encoding: gzip` (Axios default) — ensure Nginx/Go server sends `gzip` responses
- [ ] **No polling** on admin pages — use React Query's `refetchOnWindowFocus` (enabled by default) and manual invalidation after mutations instead of `refetchInterval`

---

## Accessibility
- [ ] Interactive elements are `<button>` or `<a>` — not `<div onClick>` or `<span onClick>`
- [ ] Form inputs have an associated `<Label htmlFor>` or `aria-label`
- [ ] Loading states expose `aria-busy="true"` or a visible spinner with `aria-label="Loading"`
- [ ] Color contrast ≥ 4.5:1 for body text (Tailwind defaults are safe; custom brand colors must be verified)
- [ ] Dialogs (`AlertDialog`, `Dialog`) trap focus and close on Escape — shadcn/ui provides this; don't override `onKeyDown` in a way that breaks it
- [ ] Keyboard navigation works for all interactive controls (tab order logical, no focus traps outside modals)
- [ ] `<img>` elements have meaningful `alt` text — not `alt=""` unless purely decorative

---

## Error handling & UX
- [ ] Every mutation has `onError` → `toast.error(...)` — silent failures are not acceptable at any scale
- [ ] **Retry logic**: React Query retries failed queries 3× with exponential back-off by default; verify `retry: false` is not set on queries that should retry (e.g. network hiccups)
- [ ] **Error boundaries**: `<ErrorBoundary>` wraps each route/page to catch render errors without crashing the full app
- [ ] Loading skeletons (`<Skeleton>`) shown while data fetches — not blank white space
- [ ] Empty states have a helpful message and a call-to-action
- [ ] Form fields show inline validation errors (not only a toast after failed submission)
- [ ] **Offline / degraded state**: if the API is unreachable, show a user-facing "Unable to connect" banner rather than a blank screen

---

## File / module conventions
- [ ] Pages live in `src/pages/`, shared components in `src/components/<domain>/`, UI primitives in `src/components/ui/`
- [ ] Hooks that call API services live in `src/api/hooks/` — no inline `apiClient.get(...)` inside a component
- [ ] New API types added to `src/api/types.ts`, not defined locally in a component file
- [ ] Route paths consistent with the `/{resource}/{slug}/edit` pattern; no hardcoded `/articles/123/edit` numeric IDs

---

## Output format
For each finding:
1. **File + line number**
2. **Rule violated**
3. **Before** (current code)
4. **After** (corrected code)

Group by: Correctness → Scalability/Performance → Type Safety → Accessibility → Style.
End with a **Top 3 Performance Wins** — the changes that would most reduce load time or API call volume at 1M active users.
