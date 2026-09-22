# vue-legal-ml-builder

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
npm install vue-legal-ml-builder vue
```

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

## Components

`DatasetManager`, `DatasetEda`, `ModelList`, `ModelCreateWizard`, `ModelDetail`,
`TrainingMonitor` (composes `TrainingCurves`), `ParameterPerformanceExplorer`,
`AnnotationWorkspace`, plus shared primitives `ConfusionMatrix`/`PlotlyChart`.

`TrainingCurves` and `ParameterPerformanceExplorer` are the experiment-monitoring
pieces (mlop.ai-inspired): live per-training-job metric curves and cross-run
hyperparameter-vs-performance comparison. Live curves are dense only for the
LegalBERT/RoBERTa training path — classical sklearn algorithms only produce a
few coarse phase-marker points (see `legal-ml-core`'s README for why).

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
selection/creation UI here.

## Development

```bash
npm install
npm run dev        # demo app with a mock adapter, at src/demo/
npm test           # vitest
npm run build:lib  # library build (ESM + UMD + generated .d.ts)
```
