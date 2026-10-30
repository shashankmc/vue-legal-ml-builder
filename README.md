# vue-legal-ml-builder

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/shashankmc/vue-legal-ml-builder/actions/workflows/ci.yml/badge.svg)](https://github.com/shashankmc/vue-legal-ml-builder/actions/workflows/ci.yml)

Vue 3 component library for the BAIGLE legal-ML workbench — dataset
management, model configuration/training/prediction, visualization,
annotation, and experiment monitoring. Extracted from the
`reducing_digital_divide` monorepo's SvelteKit frontend, and embedded back
into it via a manual Vue-in-Svelte mount bridge (`VueMount.svelte`).

Follows the same architecture as the sibling package
[`vue-legal-summarizer`](../vue-legal-summarizer): components never call an
API directly — a single pluggable `MLAdapter` object, provided via the Vue
plugin or passed as an explicit prop, is the entire backend contract.

## Install

```bash
npm install vue-legal-ml-builder vue plotly.js-basic-dist
```

Published to the public npm registry (no token needed to install). Pin an exact
version (`vue-legal-ml-builder@x.y.z`) in host apps.

**Host requirements.** `vue` (^3.4) is a peer dependency. `plotly.js-basic-dist`
(^2.35) is externalized from the library build and loaded with a dynamic
`import('plotly.js-basic-dist')` the first time a chart renders, so the host's
bundler must be able to resolve it. Add it as a direct dependency of the host
(Legal Blocks does this; strict installers such as pnpm and Nuxt/Vite
pre-bundling otherwise may not see the transitive copy). Without it the chart
components either break the host build (unresolved import) or render empty.

```ts
import { createApp } from 'vue'
import { VueLegalMlBuilderPlugin, createSelfHostedAdapter } from 'vue-legal-ml-builder'
import 'vue-legal-ml-builder/style.css'

const app = createApp(RootComponent)
app.use(VueLegalMlBuilderPlugin, {
  adapter: createSelfHostedAdapter({ apiUrl: '/api', getAuthToken: () => localStorage.getItem('token') }),
})
```

Or use components directly without the plugin, passing `adapter` explicitly:

```vue
<ModelCreateWizard :adapter="adapter" :dataset-id="datasetId" @created="onCreated" />
```

## Hiding annotation

Hosts with their own annotation (Legal Blocks) can hide the builder's annotation
view. `AnnotationWorkspace` is the one component that reads the flag: hidden, it
renders nothing and never calls the adapter's annotation operations
(`getNextAnnotationTask`, `saveAnnotation`, `skipAnnotation`), so a host need
not implement or proxy them. Default: shown (BAIGLE is unchanged).

```ts
app.use(VueLegalMlBuilderPlugin, { adapter, hideAnnotation: true })
```

Or per component, for direct (non-plugin) usage; the prop overrides the plugin option:

```vue
<AnnotationWorkspace :adapter="adapter" :project-id="id" :hide-annotation="true" />
```

## Components

`DatasetManager`, `DatasetEda`, `ModelList`, `ModelCreateWizard`, `ModelDetail`,
`TrainingMonitor` (composes `TrainingCurves`), `ParameterPerformanceExplorer`,
`AnnotationWorkspace` (composes `ActiveLearningPanel` when the adapter has the
optional active learning methods and the task is single-label classification),
plus shared primitives `ConfusionMatrix`/`PlotlyChart`/`ModelLens`/
`MlBuilderThemeProvider`.

`TrainingCurves` and `ParameterPerformanceExplorer` are the experiment-monitoring
pieces (mlop.ai-inspired): live per-training-job metric curves and cross-run
hyperparameter-vs-performance comparison. Live curves are dense only for the
LegalBERT/RoBERTa training path — classical sklearn algorithms only produce a
few coarse phase-marker points (see `legal-ml-core`'s README for why).

## Theming

Styling is driven entirely by `--vmlb-*` CSS custom properties, so the package
ships a curated set of named presets and lets hosts override any semantic token.

| id | label | mode |
| --- | --- | --- |
| `ink` | Ink — warm paper, deep teal (default) | light |
| `paper` | Paper — neutral white, graphite | light |
| `sepia` | Sepia — aged parchment, burnt sienna | light |
| `oxblood` | Oxblood — cool ivory, burgundy | light |
| `forest` | Forest — soft paper, deep green | light |
| `midnight` | Midnight — deep navy, steel cyan | dark |
| `dark` | Charcoal — warm charcoal, teal | dark |
| `contrast` | High contrast — accessibility | light |

Four ways to configure it.

**1. Plugin option** — a preset id, token overrides, or both:

```ts
app.use(VueLegalMlBuilderPlugin, {
  adapter,
  theme: 'midnight',
  // or: theme: { accent: '#7a2e2e', 'radius-md': '3px' },
  // or: theme: { preset: 'midnight', overrides: { accent: '#7ad1c4' } },
})
```

**2. Let the user pick** — drop in the `ThemeSwitcher` (v-model of a preset id),
or build your own picker from the exported `THEME_PRESETS` registry:

```vue
<ThemeSwitcher v-model="theme" />
```

```ts
import { THEME_PRESETS, type ThemeId } from 'vue-legal-ml-builder'
// THEME_PRESETS: { id, label, description, mode, swatches }[]
```

**3. Wrapper element** — scope a theme to a subtree (two themes on one page, no JS):

```html
<div class="vmlb-theme" data-vmlb-theme="midnight">
  <ModelList :adapter="adapter" />
</div>
```

**4. Plain CSS** — override the semantic tokens anywhere they cascade:

```css
:root {
  --vmlb-accent: #7a2e2e;
  --vmlb-font-display: "Fraunces", serif;
}
```

For direct (non-plugin) imports use `<MlBuilderThemeProvider :theme="…">` or the
`applyTheme(el, theme)` / `clearTheme(el)` / `createTheme(overrides)` helpers.
Preset styles are emitted automatically; `ensurePresetStyles()` is exported if you
need to inject them manually.

**Token contract.** Override the semantic tokens — never the internal `--vmlb-raw-*`
palette. The public keys (also exported as `themeTokens`, typed `ThemeToken`) are
`canvas`, `surface`, `surface-sunken`, `border`, `border-strong`, `text`,
`text-muted`, `text-subtle`, `accent`, `accent-strong`, `accent-soft`, `on-accent`,
`success`/`warning`/`error` (+ `-soft`), `font-display`/`font-sans`/`font-mono`,
`radius-sm`/`md`/`lg`, `shadow-sm`/`md`/`lg`, `space-2xs`…`space-2xl`, `container`,
and `density`. Add `vmlb-theme--compact` for tighter density. Adding a preset is a
data-only change in `src/theme/presets.ts`.

## Visualization & bundle size

Charts use [Plotly](https://plotly.com/javascript/) via `plotly.js-basic-dist`
(the scatter + bar + pie partial build), dynamically imported and externalized
from the library build. This is deliberate: the full `plotly.js-dist` bundle is
~4.7 MB raw / ~1.4 MB gzipped, while the basic build is ~1.1 MB raw / ~380 KB
gzipped — about 75% smaller for the trace types this package actually renders.
`npm run check:size` builds the demo and enforces that budget in CI.

This package renders **scatter** (training curves, parameter explorer) and
**bar** (model performance) figures. EDA distributions are drawn as HTML by
`DatasetEda`, not Plotly — so the even smaller `plotly.js-basic-dist` covers
every figure that reaches a `PlotlyChart` here.

## Project association

`Project` is generic app-level grouping owned by the host application, not
this package — `ModelCreateWizard` and `AnnotationWorkspace` accept a
`projectId` prop the host resolves itself rather than implementing project
selection/creation UI here. A host that asks for the project as a step of its own
can pass `firstStep` to `ModelCreateWizard` to continue the numbering.

## Development

```bash
npm install
npm run dev        # demo app with a mock adapter, at src/demo/
npm test           # vitest
npm run build:lib  # library build (ESM + UMD + generated .d.ts)
npm pack --dry-run # confirm dist/ is in the package
```

## Releasing

`.github/workflows/publish.yml` publishes to public npm when a `v*` tag is
pushed. The tag must equal `v` + the `package.json` version. It needs an
`NPM_TOKEN` repository secret (npm automation token). It runs tests, the bundle
size check, the library build, and checks `dist/` is in the packed tarball
before `npm publish --access public`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full release checklist and
[CHANGELOG.md](CHANGELOG.md) for what changed in each version.

## How to cite

If you use vue-legal-ml-builder in research or teaching, please cite it. The
citation metadata is in [`CITATION.cff`](CITATION.cff) (GitHub's "Cite this
repository" button reads it); [`codemeta.json`](codemeta.json) carries the
same metadata in CodeMeta form.

> Chakravarthy, S. (2026). *vue-legal-ml-builder* (Version 0.2.0) [Computer
> software]. Maastricht University. https://github.com/shashankmc/vue-legal-ml-builder

**DOI:** not yet assigned. Once the repository is connected to Zenodo, each
GitHub release will be archived there and its DOI (and a DOI badge) will be
added to this section and to `CITATION.cff`.

The reference backend for these components is
[legal-ml-core](https://github.com/shashankmc/legal-ml-core); cite both if
you use both.

## License

[MIT](LICENSE) © 2026 Shashank Chakravarthy, Maastricht University.
