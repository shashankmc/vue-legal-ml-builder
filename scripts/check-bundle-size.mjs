import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const RAW_LIMIT_BYTES = 1300 * 1024
const GZIP_LIMIT_BYTES = 450 * 1024

const assetsDir = fileURLToPath(new URL('../dist-demo/assets/', import.meta.url))

let files
try {
  files = readdirSync(assetsDir)
} catch {
  console.error('dist-demo/assets not found — run `npm run build:demo` first.')
  process.exit(1)
}

const plotlyFile = files.find((file) => /plotly.*\.js$/.test(file))
if (!plotlyFile) {
  console.error('No plotly chunk found in dist-demo/assets — was it inlined into the app bundle?')
  process.exit(1)
}

const raw = readFileSync(join(assetsDir, plotlyFile))
const gzip = gzipSync(raw)

const kb = (bytes) => (bytes / 1024).toFixed(2)

console.log(`Plotly chunk: ${plotlyFile}`)
console.log(`  raw:  ${kb(raw.length)} KB (limit ${kb(RAW_LIMIT_BYTES)} KB)`)
console.log(`  gzip: ${kb(gzip.length)} KB (limit ${kb(GZIP_LIMIT_BYTES)} KB)`)

if (raw.length > RAW_LIMIT_BYTES || gzip.length > GZIP_LIMIT_BYTES) {
  console.error('Bundle-size gate failed: plotly chunk exceeds the configured budget.')
  process.exit(1)
}

console.log('Bundle-size gate passed.')
