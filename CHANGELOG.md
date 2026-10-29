# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the version is 0.x, minor releases may contain breaking changes.
Versions 0.1.0 and 0.2.0 were not tagged; their links point at commits
(0.2.0 is the `package.json` bump at `68959e2`). Releases from 0.3.0 on are
tagged `vX.Y.Z`.

## [Unreleased]

## [0.3.0] - 2026-10-29

### Added

- `hideAnnotation` option (prop on `AnnotationWorkspace` and plugin option,
  default `false`): hidden views render nothing and call no annotation
  operation (#33).
- Publish workflow: on a `v*` tag, checks that the tag equals the
  `package.json` version, runs tests, the bundle-size check and the library
  build, verifies the files named by `main`, `module`, `types` and the style
  export are in the packed tarball, and publishes to the public npm registry
  (#33).
- Two-tier design token system, theme preset registry and theming API,
  `ThemeSwitcher` component, shared component primitives stylesheet, and an
  inline SVG icon component.
- Model wizard: auto-applies the recommendation, uses the backend task-type
  catalogue, and creates and trains in one action.
- FAIR4RS metadata: `LICENSE` (MIT), `CITATION.cff`, `codemeta.json` and
  `.zenodo.json`, plus a "How to cite" section in the README.
- `CHANGELOG.md` and `CONTRIBUTING.md`.

### Changed

- Redesigned `DatasetManager`, `ModelList`, `ModelCreateWizard`,
  `ModelQuestionTree`, model detail, training monitor, curves and explorer,
  `DatasetEda` and `AnnotationWorkspace`, and the demo shell (theme picker).
- README documents theming, the `plotly.js-basic-dist` host requirement,
  hiding annotation and releasing.
- `package.json`: homepage, repository and bugs point at
  `shashankmc/vue-legal-ml-builder`; adds author and keywords; the package
  now ships `LICENSE`, `CHANGELOG.md` and `CITATION.cff`.

### Fixed

- Mount through the library's own Vue runtime.

## [0.2.0] - 2026-09-22

### Added

- `ModelLens` and `ModelQuestionTree` components with lens design tokens and
  model lens/guide data, wired into `ModelCreateWizard` and exported.
- Shared self-scheduling, visibility-aware poll loop, adopted by
  `useTraining`, `useTrainingCurves` and `useModels`.
- Bundle-size gate (`npm run check:size`) for the Plotly dependency.
- CI workflow on push and pull request; `package-lock.json` is tracked so CI
  can use `npm ci`.
- Tests for the lens components, `PlotlyChart` lifecycle, `useTrainingCurves`
  and `useModels` polling.

### Changed

- Replaced `plotly.js-dist` with `plotly.js-basic-dist`.
- `PlotlyChart` diffs updates with `Plotly.react` and caches parsed plot data;
  `useTrainingCurves` appends points in place and groups metrics
  incrementally.

### Removed

- Unused `lucide-vue-next` dependency.

### Fixed

- `TrainingCurves` shows an error state instead of throwing when no adapter is
  available.

## [0.1.0] - 2026-08-28

### Added

- Initial Vue 3 component library for the legal-ML workbench (datasets, model
  configuration, training, prediction, visualization, annotation, experiment
  monitoring), extracted from the `reducing_digital_divide` SvelteKit frontend
  and driven through a host-supplied `MLAdapter`.

[Unreleased]: https://github.com/shashankmc/vue-legal-ml-builder/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/shashankmc/vue-legal-ml-builder/compare/68959e2...v0.3.0
[0.2.0]: https://github.com/shashankmc/vue-legal-ml-builder/compare/c9c724b...68959e2
[0.1.0]: https://github.com/shashankmc/vue-legal-ml-builder/commits/c9c724b
