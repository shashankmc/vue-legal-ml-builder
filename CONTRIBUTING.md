# Contributing

Thanks for helping improve vue-legal-ml-builder. Issues and pull requests are
welcome at <https://github.com/shashankmc/vue-legal-ml-builder>.

## Running the tests

Node.js 20.

```bash
npm ci
npm test             # vitest
npm run build        # library build (ESM + UMD + .d.ts)
npm run check:size   # Plotly bundle-size gate
npm pack --dry-run   # dist/, LICENSE, README, CHANGELOG, CITATION.cff
```

CI (`.github/workflows/ci.yml`) runs the tests and the size gate on every push
and pull request. The demo app (`npm run dev`) uses a mock adapter, so no
backend is needed.

## Cutting a release

1. Move the `[Unreleased]` entries in `CHANGELOG.md` under a new version
   heading with the date, following [Semantic Versioning](https://semver.org/).
2. Set the same version in `package.json` (`npm version X.Y.Z --no-git-tag-version`),
   `CITATION.cff` (`version`, `date-released`), `codemeta.json` (`version`,
   `dateModified`) and `.zenodo.json` (`version`).
3. Commit, then tag `vX.Y.Z` and push the tag. `.github/workflows/publish.yml`
   checks the tag equals the `package.json` version, runs the tests, size gate
   and build, and publishes to public npm (needs the `NPM_TOKEN` secret).
4. Create a GitHub release from the tag. Once the repository is connected to
   Zenodo, each GitHub release is archived and receives a DOI.

## How to cite

Cite the software using [`CITATION.cff`](CITATION.cff) (GitHub shows a
"Cite this repository" button for it). See the README for details.

## Citation metadata the owner still has to fill in

- ORCID: uncomment and fill the `orcid` line in `CITATION.cff`, and add the
  same URL as `"@id"` of the author in `codemeta.json` and as `"orcid"`
  (bare `XXXX-XXXX-XXXX-XXXX`) of the creator in `.zenodo.json`.
- DOI: after the first Zenodo release, add `doi` to `CITATION.cff`,
  `"identifier"` to `codemeta.json`, and the DOI badge to the README.
