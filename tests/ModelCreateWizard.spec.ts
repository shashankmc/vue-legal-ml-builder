import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ModelCreateWizard from '../src/components/ModelCreateWizard.vue'
import { createTestAdapter } from './testAdapter'
import type { Dataset } from '../src/types'

function dataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: 'ds-1',
    user_id: 'u1',
    name: 'Contracts',
    file_path: '/tmp/x.csv',
    row_count: 100,
    columns: [],
    task_type: 'classification',
    dataset_type: 'training',
    annotation_progress: 0,
    annotated_count: 0,
    total_count: 0,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('ModelCreateWizard', () => {
  it('loads datasets on mount and pre-selects one via the datasetId prop', async () => {
    const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset()]) })
    const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
    await flushPromises()

    // Selecting the dataset reveals step 2 (model type selection).
    expect(wrapper.text()).toContain('Select model type')
    expect(wrapper.text()).toContain('Support Vector Machine')
  })

  it('only shows model types valid for the dataset task_type', async () => {
    const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset({ task_type: 'clustering' })]) })
    const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
    await flushPromises()

    expect(wrapper.text()).toContain('K-Means Clustering')
    expect(wrapper.text()).not.toContain('Support Vector Machine')
  })

  it('populates default parameters when a model type is selected', async () => {
    const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset()]) })
    const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
    await flushPromises()

    const svmCard = wrapper.findAll('[role="button"]').find((c) => c.text().includes('Support Vector Machine'))
    await svmCard!.trigger('click')

    expect(wrapper.text()).toContain('Configure model')
    const cInput = wrapper.find('input[type="number"]')
    expect((cInput.element as HTMLInputElement).value).toBe('1')
  })

  it('creates the model, queues training and emits created', async () => {
    const createdModel = { id: 'm-1' }
    const adapter = createTestAdapter({
      listDatasets: vi.fn().mockResolvedValue([dataset()]),
      createModel: vi.fn().mockResolvedValue(createdModel),
      startTraining: vi.fn().mockResolvedValue({ job_id: 'job-1' }),
    })
    const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
    await flushPromises()

    const svmCard = wrapper.findAll('[role="button"]').find((c) => c.text().includes('Support Vector Machine'))
    await svmCard!.trigger('click')

    await wrapper.find('#vmlb-model-name').setValue('My SVM')
    await wrapper.find('button.vmlb-btn-primary').trigger('click')
    await flushPromises()

    expect(adapter.createModel).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My SVM', dataset_id: 'ds-1', model_type: 'svm' }),
    )
    // Create-and-train: training is queued automatically right after creation.
    expect(adapter.startTraining).toHaveBeenCalledWith('m-1')
    expect(wrapper.emitted('created')?.[0]).toEqual([createdModel, { trainingQueued: true }])
  })

  describe('asks less of a no-code user', () => {
    const labelsIn = (wrapper: ReturnType<typeof mount>) => wrapper.find('.vmlb-configure-lens').text()
    const selectedCards = (wrapper: ReturnType<typeof mount>) =>
      wrapper.findAll('.vmlb-model-card.vmlb-selected').map((c) => c.find('h3').text())

    it('preselects Logistic Regression for classification', async () => {
      const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset()]) })
      const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
      await flushPromises()

      expect(selectedCards(wrapper)).toEqual(['Logistic Regression'])
      expect(wrapper.text()).toContain('Create & train')
    })

    it('preselects the catalogue default for other tasks', async () => {
      const adapter = createTestAdapter({
        listDatasets: vi.fn().mockResolvedValue([dataset({ task_type: 'clustering' })]),
      })
      const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
      await flushPromises()

      expect(selectedCards(wrapper)).toEqual(['K-Means Clustering'])
    })

    it('preselects a model when the user picks the dataset', async () => {
      const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset()]) })
      const wrapper = mount(ModelCreateWizard, { props: { adapter } })
      await flushPromises()

      await wrapper.find('select').setValue(wrapper.find('select').findAll('option')[1].element.value)
      await wrapper.find('select').trigger('change')
      await flushPromises()

      expect(selectedCards(wrapper)).toEqual(['Logistic Regression'])
    })

    it('keeps the card short when the model was not chosen by hand', async () => {
      const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset()]) })
      const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
      await flushPromises()

      expect(wrapper.text()).not.toContain('When to select:')
    })

    it('offers the backend catalogue for a preselected dataset too', async () => {
      const adapter = createTestAdapter({
        listDatasets: vi.fn().mockResolvedValue([dataset({ task_type: 'clustering' })]),
        getAvailableModelTypes: vi.fn().mockResolvedValue({ clustering: { kmeans: {}, lda: {} } }),
      })
      const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
      await flushPromises()

      expect(wrapper.text()).toContain('LDA (Topic Modeling)')
    })

    it('tucks settings away, closed, and still sends their defaults', async () => {
      const createModel = vi.fn().mockResolvedValue({ id: 'm-1' })
      const adapter = createTestAdapter({
        listDatasets: vi.fn().mockResolvedValue([dataset()]),
        createModel,
        startTraining: vi.fn().mockResolvedValue({ job_id: 'j' }),
      })
      const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
      await flushPromises()

      const advanced = wrapper.find('details')
      expect(advanced.find('summary').text()).toBe('Advanced settings')
      expect(advanced.attributes('open')).toBeUndefined()
      expect(advanced.text()).toContain('Solver')

      await wrapper.find('.vmlb-btn-primary').trigger('click')
      await flushPromises()
      expect(createModel.mock.calls[0][0].parameters.solver).toBe('lbfgs')
    })

    it('explains with the dataset labels read from its overview', async () => {
      const adapter = createTestAdapter({
        listDatasets: vi.fn().mockResolvedValue([dataset({ labels: null } as Partial<Dataset>)]),
        getEdaData: vi.fn().mockResolvedValue({
          task_specific_analysis: { label_distribution: { Rejected: 3, Granted: 10 } },
        }),
      })
      const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
      await flushPromises()

      expect(labelsIn(wrapper)).toContain('Granted and Rejected')
      expect(labelsIn(wrapper)).not.toContain('Category A')
    })

    it('falls back to generic wording when the overview cannot say', async () => {
      const adapter = createTestAdapter({
        listDatasets: vi.fn().mockResolvedValue([dataset()]),
        getEdaData: vi.fn().mockRejectedValue(new Error('Dataset file not found')),
      })
      const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
      await flushPromises()

      expect(labelsIn(wrapper)).toContain('Category A')
    })

    it('numbers its steps from firstStep, so a host can add its own before them', async () => {
      const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset()]) })
      const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1', firstStep: 2 } })
      await flushPromises()

      expect(wrapper.findAll('.vmlb-step-num').map((n) => n.text())).toEqual(['2', '3', '4'])
    })

    it('applies the recommendation from the chooser tiles', async () => {
      const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset()]) })
      const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
      await flushPromises()

      const tile = wrapper.findAll('.vmlb-guide-option').find((t) => t.text().includes('Accuracy on complex cases'))
      await tile!.trigger('click')

      expect(selectedCards(wrapper)).toEqual(['Random Forest'])
      expect(wrapper.find('.vmlb-guide-rec-current').text()).toContain('Applied')
    })
  })
})
