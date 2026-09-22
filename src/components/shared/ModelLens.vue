<script setup lang="ts">
import { computed } from 'vue'
import {
  LENS_FAMILY_LABEL,
  classColor,
  defaultLabels,
  lensCopy,
  lensFamily,
  scatterPoints,
  type LensFamily,
} from '../../lens/modelLens'

const props = defineProps<{
  modelType: string
  parameters?: Record<string, unknown>
  labels?: string[] | null
  taskType?: string
  datasetName?: string
}>()

const parameters = computed(() => props.parameters ?? {})
const family = computed<LensFamily>(() => lensFamily(props.modelType))
const labels = computed(() => defaultLabels(props.taskType ?? '', props.labels))
const copy = computed(() => lensCopy(props.modelType, parameters.value, labels.value))

const PLOT = { x: 44, y: 36, w: 432, h: 206 }

function num(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function sx(x: number): number {
  return PLOT.x + x * PLOT.w
}
function sy(y: number): number {
  return PLOT.y + y * PLOT.h
}

const points = computed(() => scatterPoints(`${props.modelType}:${labels.value.join('|')}`, Math.max(labels.value.length, 1)))

const gridLines = computed(() => {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number; strong: boolean }> = []
  for (let i = 0; i <= 8; i++) {
    const x = PLOT.x + (PLOT.w / 8) * i
    lines.push({ x1: x, y1: PLOT.y, x2: x, y2: PLOT.y + PLOT.h, strong: i % 4 === 0 })
  }
  for (let i = 0; i <= 4; i++) {
    const y = PLOT.y + (PLOT.h / 4) * i
    lines.push({ x1: PLOT.x, y1: y, x2: PLOT.x + PLOT.w, y2: y, strong: i % 2 === 0 })
  }
  return lines
})

interface TreeNode {
  id: number
  x: number
  y: number
  depth: number
  leaf: boolean
  cls: number
}
interface TreeEdge {
  x1: number
  y1: number
  x2: number
  y2: number
}

const tree = computed(() => {
  const maxDepth = props.modelType === 'random_forest' ? 3 : 4
  const requested = parameters.value.max_depth == null ? maxDepth : Math.round(num(parameters.value.max_depth, maxDepth))
  const depth = Math.min(maxDepth, Math.max(1, requested))
  const top = 46
  const bottom = 246
  const left = 60
  const right = 460
  const levels: TreeNode[][] = []
  for (let level = 0; level <= depth; level++) {
    const count = 2 ** level
    const nodes: TreeNode[] = []
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1)
      nodes.push({
        id: level * 100 + i,
        x: left + t * (right - left),
        y: top + (level / depth) * (bottom - top),
        depth: level,
        leaf: level === depth,
        cls: labels.value.length ? i % labels.value.length : 0,
      })
    }
    levels.push(nodes)
  }
  const edges: TreeEdge[] = []
  for (let level = 0; level < levels.length - 1; level++) {
    const parents = levels[level]
    const children = levels[level + 1]
    parents.forEach((parent, pi) => {
      for (const ci of [pi * 2, pi * 2 + 1]) {
        const child = children[ci]
        if (!child) continue
        edges.push({ x1: parent.x, y1: parent.y, x2: child.x, y2: child.y })
      }
    })
  }
  return { levels, edges, depth, truncated: requested > maxDepth }
})

const litPath = computed(() => {
  const { levels } = tree.value
  const path: number[] = []
  let index = 0
  for (let level = 0; level < levels.length; level++) {
    const node = levels[level][index]
    if (!node) break
    path.push(node.id)
    index = index * 2 + ((index + level) % 2)
  }
  return path
})

const forestTrees = computed(() => {
  const trees = Math.min(4, Math.max(3, Math.round(num(parameters.value.n_estimators, 100) / 40)))
  return Array.from({ length: trees }, (_, i) => ({
    x: 60 + i * 118,
    lit: i % 2 === 0,
    votes: labels.value.map((_, c) => 3 + ((i + c) % 3)),
  }))
})

const boundary = computed(() => {
  const c = num(parameters.value.C, 1)
  const margin = Math.max(6, Math.min(46, 30 / Math.max(0.15, c)))
  const curved = ['rbf', 'poly', 'sigmoid'].includes(String(parameters.value.kernel ?? ''))
  const gy = PLOT.y + PLOT.h / 2
  if (curved) {
    const d = `M ${PLOT.x} ${gy - 10} C ${PLOT.x + PLOT.w * 0.3} ${gy - 60}, ${PLOT.x + PLOT.w * 0.7} ${gy + 60}, ${PLOT.x + PLOT.w} ${gy + 10}`
    return { kind: 'curve' as const, d, margin, curved }
  }
  const x = PLOT.x + PLOT.w / 2
  return { kind: 'line' as const, d: `M ${x} ${PLOT.y} L ${x} ${PLOT.y + PLOT.h}`, margin, curved }
})

const clusters = computed(() => {
  const k = Math.round(num(parameters.value.n_clusters, 8))
  const count = Math.max(2, Math.min(labels.value.length || Math.min(k, 5), 6))
  const centers = Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 0.18 + ((i % 3) / 2) * 0.62 + (i >= 3 ? 0.12 : 0),
    y: 0.24 + (Math.floor(i / 3) / 1) * 0.5,
    color: classColor(i),
  }))
  return { centers, count }
})

const clusterPoints = computed(() =>
  clusters.value.centers.flatMap((center, ci) =>
    scatterPoints(`${props.modelType}:${ci}:${clusters.value.count}`, 1, 8).map((p) => ({
      x: center.x + (p.x - 0.5) * 0.32,
      y: center.y + (p.y - 0.5) * 0.3,
      cls: ci,
      outlier: props.modelType === 'dbscan' && ((ci + Math.round(p.x * 100)) % 11 === 0),
    })),
  ),
)

const topics = computed(() => {
  const requested = Math.round(num(parameters.value.n_components, 10))
  const count = Math.max(2, Math.min(requested, 5))
  const stems = ['liability', 'notice', 'term', 'payment', 'jurisdiction', 'breach', 'party', 'damages']
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    color: classColor(i),
    terms: stems
      .slice(i % 3, (i % 3) + 4)
      .map((term, j) => ({ term, weight: 0.9 - j * 0.18 - (i % 2) * 0.05 })),
    share: 1 / count + ((i % 2) * 0.05 - 0.02),
  }))
})

const attention = computed(() => {
  const tokens = ['the', 'tenant', 'shall', 'not', 'be', 'liable']
  const pairs = [
    { from: 1, to: 5, weight: 0.9 },
    { from: 1, to: 3, weight: 0.55 },
    { from: 3, to: 5, weight: 0.7 },
    { from: 2, to: 5, weight: 0.4 },
    { from: 0, to: 5, weight: 0.2 },
  ]
  return { tokens, pairs }
})

function tokenX(i: number, total: number): number {
  return PLOT.x + 24 + (i / (total - 1 || 1)) * (PLOT.w - 48)
}
</script>

<template>
  <figure class="vmlb-lens" role="img" :aria-label="`${copy.headline}. ${copy.reading}`">
    <div class="vmlb-lens-head">
      <span class="vmlb-lens-badge">{{ LENS_FAMILY_LABEL[family] }}</span>
      <span v-if="datasetName" class="vmlb-lens-source">schematic over {{ datasetName }}</span>
    </div>

    <svg class="vmlb-lens-canvas" viewBox="0 0 520 300" preserveAspectRatio="xMidYMid meet">
      <rect :x="PLOT.x" :y="PLOT.y" :width="PLOT.w" :height="PLOT.h" class="vmlb-lens-paper" rx="6" />
      <line
        v-for="(l, i) in gridLines"
        :key="`g-${i}`"
        :x1="l.x1"
        :y1="l.y1"
        :x2="l.x2"
        :y2="l.y2"
        class="vmlb-lens-grid"
        :class="{ 'vmlb-lens-grid-strong': l.strong }"
      />

      <template v-if="family === 'tree'">
        <template v-if="modelType === 'random_forest'">
          <g v-for="treeDef in forestTrees" :key="`ft-${treeDef.x}`">
            <line
              v-for="(edge, ei) in tree.edges.filter((_, idx) => idx % 3 === 0)"
              :key="`fe-${treeDef.x}-${ei}`"
              :x1="treeDef.x - 26 + (edge.x1 - 60) * 0.12"
              :y1="edge.y1"
              :x2="treeDef.x - 26 + (edge.x2 - 60) * 0.12"
              :y2="edge.y2"
              class="vmlb-lens-edge"
              :class="{ 'vmlb-lens-edge-lit': treeDef.lit && ei < 4 }"
            />
            <circle
              v-for="node in tree.levels.flat().filter((_, idx) => idx % 4 === 0)"
              :key="`fn-${treeDef.x}-${node.id}`"
              :cx="treeDef.x - 26 + (node.x - 60) * 0.12"
              :cy="node.y"
              :r="node.leaf ? 5 : 3.5"
              class="vmlb-lens-node"
              :style="{ fill: node.leaf ? classColor(node.cls) : undefined }"
            />
            <rect :x="treeDef.x - 32" y="252" width="64" height="14" rx="4" class="vmlb-lens-vote" />
            <text :x="treeDef.x" y="262" text-anchor="middle" class="vmlb-lens-vote-text">
              vote {{ treeDef.votes[0] }}–{{ treeDef.votes[1] ?? 0 }}
            </text>
          </g>
        </template>
        <template v-else>
          <line
            v-for="(edge, ei) in tree.edges"
            :key="`te-${ei}`"
            :x1="edge.x1"
            :y1="edge.y1"
            :x2="edge.x2"
            :y2="edge.y2"
            class="vmlb-lens-edge"
          />
          <template v-for="level in tree.levels" :key="`lvl-${level[0]?.depth}`">
            <template v-for="node in level" :key="`tn-${node.id}`">
              <circle
                v-if="litPath.includes(node.id)"
                :cx="node.x"
                :cy="node.y"
                :r="node.leaf ? 10 : 8"
                class="vmlb-lens-path"
              />
              <circle
                :cx="node.x"
                :cy="node.y"
                :r="node.leaf ? 7 : 5.5"
                class="vmlb-lens-node"
                :style="{ fill: node.leaf ? classColor(node.cls) : undefined }"
              />
            </template>
          </template>
          <text x="60" y="34" class="vmlb-lens-note">
            depth {{ tree.depth }}{{ tree.truncated ? ' (capped for display)' : '' }}
          </text>
        </template>
      </template>

      <template v-else-if="family === 'linear'">
        <line
          v-if="boundary.kind === 'line'"
          :x1="sx(0.5)"
          :y1="PLOT.y"
          :x2="sx(0.5)"
          :y2="PLOT.y + PLOT.h"
          class="vmlb-lens-margin"
          :stroke-width="boundary.margin"
        />
        <path
          v-else
          :d="boundary.d"
          class="vmlb-lens-margin"
          fill="none"
          :stroke-width="boundary.margin / 2"
        />
        <path v-if="boundary.kind === 'curve'" :d="boundary.d" class="vmlb-lens-boundary" fill="none" />
        <line v-else :x1="sx(0.5)" :y1="PLOT.y" :x2="sx(0.5)" :y2="PLOT.y + PLOT.h" class="vmlb-lens-boundary" />
        <circle
          v-for="(p, i) in points"
          :key="`lp-${i}`"
          :cx="sx(p.x)"
          :cy="sy(p.y)"
          r="4.5"
          :style="{ fill: classColor(p.cls) }"
          class="vmlb-lens-point"
        />
      </template>

      <template v-else-if="family === 'cluster'">
        <circle
          v-for="center in clusters.centers"
          :key="`cc-${center.id}`"
          :cx="sx(center.x)"
          :cy="sy(center.y)"
          r="42"
          :style="{ stroke: center.color }"
          class="vmlb-lens-cluster-halo"
        />
        <circle
          v-for="(p, i) in clusterPoints"
          :key="`cp-${i}`"
          :cx="sx(p.x)"
          :cy="sy(p.y)"
          :r="p.outlier ? 4 : 4.5"
          :style="p.outlier ? undefined : { fill: classColor(p.cls) }"
          class="vmlb-lens-point"
          :class="{ 'vmlb-lens-point-noise': p.outlier }"
        />
        <path
          v-for="center in clusters.centers"
          :key="`cx-${center.id}`"
          :d="`M ${sx(center.x) - 7} ${sy(center.y)} L ${sx(center.x) + 7} ${sy(center.y)} M ${sx(center.x)} ${sy(center.y) - 7} L ${sx(center.x)} ${sy(center.y) + 7}`"
          :style="{ stroke: center.color }"
          class="vmlb-lens-centroid"
        />
        <text x="60" y="34" class="vmlb-lens-note">{{ clusters.count }} groups found</text>
      </template>

      <template v-else-if="family === 'topic'">
        <g v-for="(topic, ti) in topics" :key="`tp-${topic.id}`">
          <text x="60" :y="58 + ti * 40" class="vmlb-lens-note">topic {{ ti + 1 }}</text>
          <rect :x="120" :y="48 + ti * 40" width="248" height="9" rx="4.5" class="vmlb-lens-track" />
          <rect
            v-for="(term, wi) in topic.terms"
            :key="`tm-${ti}-${wi}`"
            :x="124 + wi * 62"
            :y="46 + ti * 40"
            :width="52 * term.weight"
            height="13"
            rx="4"
            :style="{ fill: topic.color, opacity: 0.4 + term.weight * 0.5 }"
          />
          <text v-for="(term, wi) in topic.terms" :key="`tl-${ti}-${wi}`" :x="126 + wi * 62" :y="70 + ti * 40" class="vmlb-lens-tick">
            {{ term.term }}
          </text>
        </g>
        <rect x="388" y="48" width="18" height="184" rx="6" class="vmlb-lens-track" />
        <rect
          v-for="(topic, ti) in topics"
          :key="`mix-${ti}`"
          x="388"
          :y="48 + topics.slice(0, ti).reduce((acc, t) => acc + t.share, 0) * 184"
          width="18"
          :height="topic.share * 184"
          :style="{ fill: topic.color }"
        />
        <text x="388" y="244" class="vmlb-lens-tick">one doc's mix</text>
      </template>

      <template v-else>
        <g v-for="(pair, pi) in attention.pairs" :key="`at-${pi}`">
          <path
            :d="`M ${tokenX(pair.from, attention.tokens.length)} 214 Q ${(tokenX(pair.from, attention.tokens.length) + tokenX(pair.to, attention.tokens.length)) / 2} ${214 - 70 * pair.weight} ${tokenX(pair.to, attention.tokens.length)} 214`"
            fill="none"
            class="vmlb-lens-attention"
            :style="{ stroke: 'var(--vmlb-lens-path, #4f46e5)', opacity: 0.25 + pair.weight * 0.6 }"
            :stroke-width="1 + pair.weight * 3"
          />
        </g>
        <g v-for="(token, ti) in attention.tokens" :key="`tk-${ti}`">
          <rect :x="tokenX(ti, attention.tokens.length) - 26" y="214" width="52" height="26" rx="6" class="vmlb-lens-token" />
          <text :x="tokenX(ti, attention.tokens.length)" y="231" text-anchor="middle" class="vmlb-lens-token-text">{{ token }}</text>
          <circle :cx="tokenX(ti, attention.tokens.length)" :cy="160" r="7" :style="{ fill: classColor(ti) }" opacity="0.85" />
        </g>
        <text x="60" y="128" class="vmlb-lens-note">weighted context links</text>
      </template>
    </svg>

    <figcaption class="vmlb-lens-caption">
      <p class="vmlb-lens-headline">{{ copy.headline }}</p>
      <p class="vmlb-lens-reading">{{ copy.reading }}</p>
      <ul class="vmlb-lens-legend">
        <li v-for="item in copy.legend" :key="item.label">
          <strong>{{ item.label }}</strong>
          <span>{{ item.detail }}</span>
        </li>
      </ul>
    </figcaption>
  </figure>
</template>

<style scoped>
.vmlb-lens {
  margin: 0;
  border: 1px solid var(--vmlb-border, #e5e7eb);
  border-radius: var(--vmlb-lens-radius, 0.75rem);
  background: var(--vmlb-lens-paper, #fbfbfc);
  overflow: hidden;
}
.vmlb-lens-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid var(--vmlb-border, #e5e7eb);
  background: var(--vmlb-surface, #fff);
}
.vmlb-lens-badge {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vmlb-lens-boundary, #4338ca);
}
.vmlb-lens-source {
  font-size: 0.6875rem;
  color: var(--vmlb-text-muted, #6b7280);
}
.vmlb-lens-canvas {
  display: block;
  width: 100%;
  height: auto;
}
.vmlb-lens-paper { fill: var(--vmlb-lens-paper, #fbfbfc); }
.vmlb-lens-grid { stroke: var(--vmlb-lens-grid, #eef0f3); stroke-width: 1; }
.vmlb-lens-grid-strong { stroke: var(--vmlb-lens-grid-strong, #d9dde3); }
.vmlb-lens-edge { stroke: var(--vmlb-lens-node-border, #9ca3af); stroke-width: 1.25; }
.vmlb-lens-edge-lit { stroke: var(--vmlb-lens-path, #4f46e5); stroke-width: 2; }
.vmlb-lens-node { stroke: var(--vmlb-lens-node-border, #9ca3af); stroke-width: 1.25; fill: var(--vmlb-lens-node, #fff); }
.vmlb-lens-path { fill: var(--vmlb-lens-path, #4f46e5); opacity: 0.18; }
.vmlb-lens-vote { fill: var(--vmlb-lens-vote, #6366f1); opacity: 0.14; }
.vmlb-lens-vote-text { font-size: 9px; font-family: var(--vmlb-lens-font-mono, monospace); fill: var(--vmlb-text-muted, #6b7280); }
.vmlb-lens-boundary { stroke: var(--vmlb-lens-boundary, #4338ca); stroke-width: 2.5; }
.vmlb-lens-margin { stroke: var(--vmlb-lens-margin, #c7d2fe); opacity: 0.55; stroke-width: 30; }
.vmlb-lens-point { stroke: var(--vmlb-surface, #fff); stroke-width: 1.25; }
.vmlb-lens-point-noise { fill: var(--vmlb-lens-paper, #fbfbfc); stroke: var(--vmlb-lens-noise, #9ca3af); stroke-dasharray: 2 2; }
.vmlb-lens-cluster-halo { fill: none; stroke-width: 1.5; opacity: 0.4; stroke-dasharray: 4 4; }
.vmlb-lens-centroid { stroke-width: 2.5; }
.vmlb-lens-track { fill: var(--vmlb-lens-grid, #eef0f3); }
.vmlb-lens-tick { font-size: 9px; fill: var(--vmlb-text-muted, #6b7280); }
.vmlb-lens-note { font-size: 10px; fill: var(--vmlb-text-muted, #6b7280); font-family: var(--vmlb-lens-font-mono, monospace); }
.vmlb-lens-token { fill: var(--vmlb-surface, #fff); stroke: var(--vmlb-border-strong, #d1d5db); }
.vmlb-lens-token-text { font-size: 11px; fill: var(--vmlb-text, #111827); font-family: var(--vmlb-lens-font-mono, monospace); }
.vmlb-lens-attention { stroke-linecap: round; }
.vmlb-lens-caption { padding: 0.875rem; border-top: 1px solid var(--vmlb-border, #e5e7eb); background: var(--vmlb-surface, #fff); }
.vmlb-lens-headline { font-size: 0.9375rem; font-weight: 600; color: var(--vmlb-text, #111827); }
.vmlb-lens-reading { margin-top: 0.375rem; font-size: 0.8125rem; line-height: 1.5; color: var(--vmlb-text-muted, #4b5563); }
.vmlb-lens-legend { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; margin-top: 0.75rem; list-style: none; padding: 0; }
.vmlb-lens-legend li { display: flex; flex-direction: column; font-size: 0.6875rem; }
.vmlb-lens-legend strong { color: var(--vmlb-lens-boundary, #4338ca); font-weight: 600; }
.vmlb-lens-legend span { color: var(--vmlb-text-muted, #6b7280); }
</style>
