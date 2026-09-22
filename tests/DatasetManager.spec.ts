import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import DatasetManager from '../src/components/DatasetManager.vue'
import { createTestAdapter } from './testAdapter'
import type { Dataset } from '../src/types'

function dataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: 'ds-1',
    user_id: 'u1',
    name: 'Contracts',
    file_path: '/tmp/x.csv',
    row_count: 1500,
    columns: [{ name: 'text', type: 'object', null_count: 0, unique_count: 1500 }],
    task_type: 'classification',
    dataset_type: 'training',
    annotation_progress: 0,
    annotated_count: 0,
    total_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('DatasetManager', () => {
  it('shows an empty state when there are no datasets', async () => {
    const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([]) })
    const wrapper = mount(DatasetManager, { props: { adapter } })
    await flushPromises()

    expect(wrapper.text()).toContain('No datasets yet')
  })

  it('renders loaded datasets and emits events on their action buttons', async () => {
    const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset()]) })
    const wrapper = mount(DatasetManager, { props: { adapter } })
    await flushPromises()

    expect(wrapper.text()).toContain('Contracts')
    expect(wrapper.text()).toContain('1,500')

    const buttons = wrapper.findAll('button')
    await buttons.find((b) => b.text() === 'EDA')!.trigger('click')
    expect(wrapper.emitted('eda')?.[0][0]).toMatchObject({ id: 'ds-1' })

    await buttons.find((b) => b.text() === 'Create Model')!.trigger('click')
    expect(wrapper.emitted('createModel')?.[0][0]).toMatchObject({ id: 'ds-1' })
  })

  it('deletes a dataset after inline confirmation', async () => {
    const adapter = createTestAdapter({
      listDatasets: vi.fn().mockResolvedValue([dataset()]),
      deleteDataset: vi.fn().mockResolvedValue(undefined),
    })
    const wrapper = mount(DatasetManager, { props: { adapter } })
    await flushPromises()

    await wrapper.find('.vmlb-icon-btn').trigger('click')
    const del = wrapper.findAll('button').find((b) => b.text() === 'Delete')!
    await del.trigger('click')
    await flushPromises()

    expect(adapter.deleteDataset).toHaveBeenCalledWith('ds-1')
    expect(wrapper.text()).toContain('No datasets yet')
  })

  it('does not delete when the confirmation is dismissed', async () => {
    const adapter = createTestAdapter({
      listDatasets: vi.fn().mockResolvedValue([dataset()]),
      deleteDataset: vi.fn(),
    })
    const wrapper = mount(DatasetManager, { props: { adapter } })
    await flushPromises()

    await wrapper.find('.vmlb-icon-btn').trigger('click')
    await wrapper.findAll('button').find((b) => b.text() === 'Cancel')!.trigger('click')
    expect(adapter.deleteDataset).not.toHaveBeenCalled()
  })
})
