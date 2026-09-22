# Performance optimization: shrink Plotly payload, fix live-chart hot path, harden polling (v0.2.0)

## Context

`vue-legal-ml-builder` v0.1.0 is being prepared for wider consumption (embedded in the `reducing_digital_divide` SvelteKit host + published to npm). Two costs ship with every consumer today: a **4,739 KB raw / 1,430 KB gzipped Plotly bundle** (~75% of which this package never uses), and a live training monitor that **tears down and rebuilds the entire chart every 3 seconds** while running three overlapping, uninterruptible HTTP poll loops. End users of the BAIGLE workbench feel this as slow first-load and janky live charts; library consumers pay it as dependency weight. Both are worth fixing before release.

## Current State (verified 2026-09-22, branch `master`)

| Area | Location | Problem | Verified evidence |
|------|----------|---------|-------------------|
| Dead dependency | `package.json:53` | `lucide-vue-next` declared, never imported | grep across src/tests/demo: 0 hits |
| Plotly payload | `package.json:54`, `src/components/shared/PlotlyChart.vue:31` | Full `plotly.js-dist` (4,739 KB raw / 1,430 KB gzip in demo build) | measured via `npm run build:demo` |
| Chart rebuild | `PlotlyChart.vue:18` | `plotly.newPlot()` (full teardown) on every data change | fires every 3s during training |
| JSON re-parse | `PlotlyChart.vue:17` | string plotData re-parsed on every render | server chart JSON path |
| Array copy per poll | `src/composables/useTrainingCurves.ts:27` | `[...points, ...newPoints]` full copy; `byMetric` computed regroups all points; `plotData` remaps every point into new traces | grows unboundedly on dense LegalBERT runs |
| Overlapping polls | `useTrainingCurves.ts:35`, `src/composables/useTraining.ts:20` | `setInterval(async ...)` — requests overlap when slower than interval; rejected fetch = unhandled rejection; no pause when tab hidden | code inspection |
| Triple polling | `useTraining.ts:20` (5s), `useTrainingCurves.ts:35` (3s), `src/composables/useModels.ts:26` (10s) | three concurrent loops per training job | code inspection |
| Missing-adapter crash | `src/components/TrainingCurves.vue:11` | `adapter.value as MLAdapter` cast — null adapter throws TypeError instead of showing error state | other components guard this |
| Trace-type coverage | — | this package renders only **scatter** (`TrainingCurves.vue:17-22`, `ParameterPerformanceExplorer.vue:30-33`) + **bar** (`legal-ml-core visualization.py:38-45`, the only server figure, via `ModelDetail.vue:32-33`) | EDA pie/histogram/box figures never reach this package (`DatasetEda.vue` renders HTML only) |

**Working well (do not touch):** adapter-injection architecture, incremental `since_step` metrics fetch, composable separation, existing test suite (5 spec files + `tests/testAdapter.ts`), UMD+ESM dual build with plotly externalized.

## Proposed Change

Four phases, ordered by risk-adjusted value. Phase A is pure dependency hygiene (zero functional risk, biggest install-size win); B is the runtime hot path users feel; C is robustness; D locks all of it in.

### Phase A — Dependency hygiene

1. Remove `lucide-vue-next` from `dependencies`.
2. Swap `plotly.js-dist` ^2.26.0 → `plotly.js-basic-dist` ^2.26.0 (scatter+bar+pie partial, ~1,000 KB raw / ~350 KB gzip expected). Update: `PlotlyChart.vue:9` type shim, `PlotlyChart.vue:31` dynamic import path, `src/plotly.d.ts` module declaration, `vite.config.ts:25` external + `:27` globals mapping.
3. **Runtime verification in Vue contexts** (not just vitest/jsdom):
   - Demo dev app (`npm run dev`): all three chart types render — prop-adapter path.
   - Plugin path: switch `src/demo/main.ts` to install via `VueLegalMlBuilderPlugin` with the mock adapter, so the documented `app.use(...)` + provide/inject + global registration path is actually exercised with basic-dist (the demo currently never runs it — `src/demo/main.ts:4`).
   - Vue-in-Svelte bridge: manual smoke in the host's dev server (`reducing_digital_divide/frontend`) confirming charts render inside `VueMount.svelte` with basic-dist — **verification only, zero host code changes** (host stays out of scope).

### Phase B — Live-chart hot path

1. `PlotlyChart.vue`: use `Plotly.react()` for all renders (it diffs data/layout in place; handles first render too); keep `purge` on unmount.
2. Parse string plotData once per prop change (cached on prop reference), not per render.
3. `useTrainingCurves.ts`: append via `points.value.push(...newPoints)` instead of array copy; maintain `byMetric` grouping incrementally on append (points only ever append), exposed without full-regroup recompute.
4. `TrainingCurves.vue:11`: replace blind cast with an explicit "No adapter configured" error state (pattern from `ModelCreateWizard.vue:44-48`).

### Phase C — Polling hardening (public signatures unchanged)

Replace `setInterval(async ...)` in `useTrainingCurves.ts:32-39`, `useTraining.ts:18-32`, and `useModels.ts:23-36` with a shared self-scheduling `setTimeout` loop that: skips a tick while the previous request is in flight; catches errors (keep polling, zero unhandled rejections); pauses on `document.hidden` and resumes with an immediate tick on visible; stops cleanly on unmount (existing `onUnmounted` hooks stay).

### Phase D — Benchmarks and size gate

1. New `tests/PlotlyChart.spec.ts`: mocked plotly module — `newPlot`/`react` exactly once on mount, `react` (never `newPlot`) on subsequent updates, `purge` on unmount.
2. Extend `tests/useTrainingCurves.spec.ts` + new `tests/useModels.spec.ts`: fake-timers overlap test (adapter slower than interval → max 1 in-flight request); visibility-pause test; rejecting-adapter test (loop survives, 0 unhandled rejections); incremental accumulation test (3 polls × 100 points → 300 points, correct grouping).
3. New `scripts/check-bundle-size.mjs` + `npm run check:size`: builds demo, asserts plotly chunk **≤ 1,300 KB raw / ≤ 450 KB gzip** (baseline 4,739/1,430 — ~72% reduction).
4. Wire `check:size` into `.github/workflows/publish.yml` and add a push/PR `ci.yml` running `npm test` + `npm run check:size`.
5. README: dependency note (plotly basic-dist, trace coverage rationale).

## Acceptance Criteria

1. `npm ls lucide-vue-next` finds nothing; build + tests green.
2. `package.json` lists `plotly.js-basic-dist`, not `plotly.js-dist`; `npm run check:size` passes (≤1,300 KB / ≤450 KB gzip).
3. All three chart types render correctly in the demo with the mock adapter: training curves, parameter explorer, model performance bar chart.
4. `PlotlyChart` calls plotly's create fn exactly once per mount; every subsequent data change goes through `react` (unit-verified).
5. Under fake timers with an adapter 2× slower than the interval: no overlapping requests, no unhandled rejections, loop survives a rejecting call.
6. Polling makes zero HTTP calls while `document.hidden` is true (fake-timers verified).
7. Public API surface unchanged: `index.ts` exports, `MLAdapter` interface, composable signatures, component props — all identical to v0.1.0.
8. `npm test` green; version bumped to 0.2.0.
9. All three chart types render in the Vue demo via **both** the prop path and the plugin path (dev server), and a manual bridge smoke in the host dev server confirms charts render with `plotly.js-basic-dist` embedded through `VueMount.svelte`.

## Testing Plan

| Layer | What | Count |
|-------|------|-------|
| Unit | PlotlyChart react/purge lifecycle | +3 |
| Unit | polling overlap / visibility / error tolerance (3 composables) | +6 |
| Unit | incremental accumulation + grouping | +2 |
| Runtime smoke (Vue) | demo dev server: charts via prop + plugin paths; host bridge smoke | 3 checks |
| Integration | demo smoke: all chart types render | manual |
| CI | `check:size` bundle gate | +1 script |

## Rollback Plan

Single revert — no data or state migrations. Dependency swap restores by reverting `package.json` + the three import-path edits. Version bump 0.1.0 → 0.2.0 (minor; non-breaking).

## Effort Estimate

A: 2h · B: 3h · C: 4h · D: 4h · docs 1h → **~14h human / ~2.5h agent-assisted**.

## Files Reference

| File | Change |
|------|--------|
| `package.json:52-55` | remove lucide, swap plotly dist |
| `src/components/shared/PlotlyChart.vue:9,17-22,31,38` | react(), parse cache, import path |
| `src/composables/useTrainingCurves.ts:24-39` | push, incremental byMetric, harden loop |
| `src/composables/useTraining.ts:18-32` | harden loop |
| `src/composables/useModels.ts:23-36` | harden loop |
| `src/components/TrainingCurves.vue:11` | adapter null-guard |
| `src/plotly.d.ts`, `vite.config.ts:25,27` | basic-dist types + externals |
| `src/demo/main.ts:4` | plugin-install mount |
| `scripts/check-bundle-size.mjs`, `.github/workflows/ci.yml`, `publish.yml` | size gate + CI |
| `tests/PlotlyChart.spec.ts`, `tests/useTrainingCurves.spec.ts`, `tests/useModels.spec.ts` | new/extended tests |

## Out of Scope

- `legal-ml-core` backend changes; `reducing_digital_divide` host app changes (incl. its own plotly dep and `PlotlyChart.svelte`) — the bridge item in Phase A is verification only
- `MLAdapter` contract changes (so `explain()` polling gets no AbortSignal — deferred)
- Unifying status/metrics poll loops into one scheduler; demo redesign; visual/style changes
- Host-side plotly deduplication (cross-repo follow-up once this ships)
