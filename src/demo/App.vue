<script setup lang="ts">
import { provide, ref } from 'vue'
import DatasetManager from '../components/DatasetManager.vue'
import ModelCreateWizard from '../components/ModelCreateWizard.vue'
import ModelList from '../components/ModelList.vue'
import TrainingMonitor from '../components/TrainingMonitor.vue'
import { createMockAdapter } from './mockAdapter'

const adapter = createMockAdapter()
provide('vmlb:adapter', adapter)

type View =
  | { name: 'datasets' }
  | { name: 'models' }
  | { name: 'create'; datasetId?: string }
  | { name: 'train'; modelId: string }

const view = ref<View>({ name: 'datasets' })
</script>

<template>
  <div class="demo-shell">
    <nav class="demo-nav">
      <button @click="view = { name: 'datasets' }">Datasets</button>
      <button @click="view = { name: 'models' }">Models</button>
    </nav>

    <main class="demo-main">
      <DatasetManager
        v-if="view.name === 'datasets'"
        @create-model="(ds) => (view = { name: 'create', datasetId: ds.id })"
        @eda="() => {}"
        @view="() => {}"
      />
      <ModelList
        v-else-if="view.name === 'models'"
        @create="view = { name: 'create' }"
        @view="() => {}"
        @train="(m) => (view = { name: 'train', modelId: m.id })"
      />
      <ModelCreateWizard
        v-else-if="view.name === 'create'"
        :dataset-id="view.datasetId"
        @created="(m: any) => (view = { name: 'train', modelId: m.id })"
        @cancel="view = { name: 'models' }"
      />
      <TrainingMonitor v-else-if="view.name === 'train'" :model-id="view.modelId" />
    </main>
  </div>
</template>

<style>
body { font-family: system-ui, sans-serif; background: #f9fafb; margin: 0; }
.demo-shell { max-width: 56rem; margin: 0 auto; padding: 2rem 1.5rem; }
.demo-nav { display: flex; gap: 0.75rem; margin-bottom: 2rem; }
.demo-nav button { padding: 0.5rem 1rem; border-radius: 0.5rem; border: 1px solid #d1d5db; background: #fff; cursor: pointer; }
</style>
