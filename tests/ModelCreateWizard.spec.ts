import { beforeEach, mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    expect(wrapper.text()).toContain('Logistic Regression')
  })

  it('only shows model types valid for the dataset task_type', async () => {
    const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset({ task_type: 'clustering' })]) })
    const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
    await flushPromises()

    expect(wrapper.text()).toContain('K-Means Clustering')
    expect(wrapper.text()).not.toContain('Support Vector Machine')
  })

  it('names the task type in words, never the raw value', async () => {
    const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset({ row_count: 1567 })]) })
    const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
    await flushPromises()

    expect(wrapper.find('select option:nth-child(2)').text()).toBe('Contracts (1,567 rows, text classification)')
    expect(wrapper.text()).toContain('Available models for text classification tasks.')
  })

  it('shows only the chosen model until asked for the rest', async () => {
    const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset()]) })
    const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
    await flushPromises()

    expect(wrapper.findAll('.vmlb-model-card').map((c) => c.find('h3').text())).toEqual(['Logistic Regression'])

    await wrapper.find('.vmlb-show-models').trigger('click')

    expect(wrapper.text()).toContain('Support Vector Machine')
    expect(wrapper.findAll('.vmlb-model-card').length).toBeGreaterThan(1)
  })

  it('keeps every model on show while the user compares them', async () => {
    const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset()]) })
    const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
    await flushPromises()
    await wrapper.find('.vmlb-show-models').trigger('click')
    const count = wrapper.findAll('.vmlb-model-card').length

    await wrapper.findAll('.vmlb-model-card').find((c) => c.text().includes('Support Vector Machine'))!.trigger('click')

    expect(wrapper.findAll('.vmlb-model-card').length).toBe(count)
  })

  it('tucks the chooser questions away, closed', async () => {
    const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset()]) })
    const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
    await flushPromises()

    const chooser = wrapper.find('details.vmlb-chooser')
    expect(chooser.attributes('open')).toBeUndefined()
    expect(chooser.find('summary').text()).toBe('Help me choose a model')
  })

  it('populates default parameters when a model type is selected', async () => {
    const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset()]) })
    const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
    await flushPromises()

    await wrapper.find('.vmlb-show-models').trigger('click')
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

    await wrapper.find('.vmlb-show-models').trigger('click')
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

  describe('when the backend refuses', () => {
    const scrollIntoView = vi.fn()
    beforeEach(() => {
      scrollIntoView.mockClear()
      Element.prototype.scrollIntoView = scrollIntoView // not in this test DOM
    })

    const message = 'Regularization Strength (C) must be at most 1000.'
    const mountRefused = async (createModel = vi.fn().mockRejectedValue(new Error(message))) => {
      const adapter = createTestAdapter({
        listDatasets: vi.fn().mockResolvedValue([dataset(), dataset({ id: 'ds-2', name: 'Leases' })]),
        createModel,
      })
      const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
      await flushPromises()
      await wrapper.find('.vmlb-btn-primary').trigger('click')
      await flushPromises()
      return wrapper
    }
    const alertText = (wrapper: Awaited<ReturnType<typeof mountRefused>>) => wrapper.find('[role="alert"]').text()

    it('says so beside Create & train, not at the top of the form', async () => {
      const wrapper = await mountRefused()

      expect(wrapper.find('.vmlb-actions').element.previousElementSibling).toBe(wrapper.find('[role="alert"]').element)
      expect(alertText(wrapper)).toBe(message)
      expect(wrapper.text().split(message)).toHaveLength(2)
    })

    it('brings the buttons into view, as the alert above them pushes them down', async () => {
      const wrapper = await mountRefused()

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
      expect(scrollIntoView.mock.instances[0]).toBe(wrapper.find('.vmlb-actions').element)
    })

    it('keeps the alert in the page beforehand, so screen readers announce what arrives in it', async () => {
      const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset()]) })
      const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
      await flushPromises()

      expect(wrapper.find('[role="alert"]').exists()).toBe(true)
      expect(wrapper.find('[role="alert"]').text()).toBe('')
    })

    it('clears when a setting changes', async () => {
      const wrapper = await mountRefused()

      await wrapper.find('.vmlb-param-input input[type="number"]').setValue(5)

      expect(alertText(wrapper)).toBe('')
    })

    it('clears when the name changes', async () => {
      const wrapper = await mountRefused()

      await wrapper.find('#vmlb-model-name').setValue('Another name')

      expect(alertText(wrapper)).toBe('')
    })

    it('clears when another model is chosen', async () => {
      const wrapper = await mountRefused()

      await wrapper.find('.vmlb-show-models').trigger('click')
      await wrapper.findAll('.vmlb-model-card').find((c) => c.text().includes('Support Vector Machine'))!.trigger('click')

      expect(alertText(wrapper)).toBe('')
    })

    it('clears when another dataset is chosen', async () => {
      const wrapper = await mountRefused()

      await wrapper.find('select').setValue(wrapper.find('select').findAll('option')[2].element.value)
      await flushPromises()

      expect(alertText(wrapper)).toBe('')
    })

    it('empties the alert during a retry, so the same refusal is announced again', async () => {
      let refuse = (_: Error) => {}
      const createModel = vi.fn()
        .mockRejectedValueOnce(new Error(message))
        .mockReturnValueOnce(new Promise((_, reject) => { refuse = reject }))
      const wrapper = await mountRefused(createModel)

      await wrapper.find('.vmlb-btn-primary').trigger('click')
      expect(alertText(wrapper)).toBe('')

      refuse(new Error(message))
      await flushPromises()
      expect(alertText(wrapper)).toBe(message)
    })

    it('does not guess the field from the wording of the message', async () => {
      const wrapper = await mountRefused()

      expect(wrapper.find('[aria-invalid]').exists()).toBe(false)
      expect(wrapper.find('.vmlb-configure-form details').attributes('open')).toBeUndefined()
    })

    it('still shows a failure to load, when there is no action to sit beside', async () => {
      const adapter = createTestAdapter({ listDatasets: vi.fn().mockRejectedValue(new Error('Could not reach the server')) })
      const wrapper = mount(ModelCreateWizard, { props: { adapter } })
      await flushPromises()

      expect(wrapper.find('.vmlb-actions').exists()).toBe(false)
      expect(wrapper.text()).toContain('Could not reach the server')
    })
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
      await wrapper.find('.vmlb-show-models').trigger('click')

      expect(wrapper.text()).toContain('LDA (Topic Modelling)')
    })

    describe('options that depend on each other', () => {
      const catalogue = {
        classification: {
          logistic_regression: {
            name: 'Logistic Regression',
            description: '',
            parameters: {
              penalty: { type: 'select', options: ['l2', 'elasticnet'], default: 'l2', description: 'Penalty' },
              solver: { type: 'select', options: ['lbfgs', 'liblinear', 'saga'], default: 'lbfgs', description: 'Solver' },
              l1_ratio: { type: 'float', min: 0, max: 1, default: 0.5, description: 'Mix' },
            },
            rules: [
              { when: { penalty: 'elasticnet' }, parameter: 'solver', options: ['saga'], reason: 'The elasticnet penalty needs the saga solver.' },
              { when: { multiclass: true }, parameter: 'solver', options: ['lbfgs', 'saga'], reason: 'The liblinear solver handles two labels only.' },
            ],
          },
        },
      }
      const mountWizard = async (labels: string[], createModel = vi.fn().mockResolvedValue({ id: 'm-1' })) => {
        const adapter = createTestAdapter({
          listDatasets: vi.fn().mockResolvedValue([dataset({ labels })]),
          getAvailableModelTypes: vi.fn().mockResolvedValue(catalogue),
          createModel,
        })
        const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
        await flushPromises()
        return wrapper
      }
      const row = (wrapper: Awaited<ReturnType<typeof mountWizard>>, label: string) =>
        wrapper.findAll('.vmlb-param-row').find((r) => r.text().includes(label))!
      const solverOptions = (wrapper: Awaited<ReturnType<typeof mountWizard>>) =>
        row(wrapper, 'Solver').findAll('option').map((o) => o.text())

      it('offers what the catalogue offers', async () => {
        const wrapper = await mountWizard(['civil', 'criminal'])

        expect(solverOptions(wrapper)).toEqual(['lbfgs', 'liblinear', 'saga'])
      })

      it('narrows the solvers to what the penalty allows, moves the choice and says why', async () => {
        const createModel = vi.fn().mockResolvedValue({ id: 'm-1' })
        const wrapper = await mountWizard(['civil', 'criminal'], createModel)

        await row(wrapper, 'Penalty').find('select').setValue('elasticnet')
        await flushPromises()

        expect(solverOptions(wrapper)).toEqual(['saga'])
        expect(row(wrapper, 'Solver').text()).toContain('Solver changed to saga. The elasticnet penalty needs the saga solver.')

        await wrapper.find('.vmlb-btn-primary').trigger('click')
        await flushPromises()
        expect(createModel.mock.calls[0][0].parameters).toMatchObject({ penalty: 'elasticnet', solver: 'saga' })
      })

      it('drops the note once the penalty that caused it is gone', async () => {
        const wrapper = await mountWizard(['civil', 'criminal'])
        await row(wrapper, 'Penalty').find('select').setValue('elasticnet')
        await flushPromises()

        await row(wrapper, 'Penalty').find('select').setValue('l2')
        await flushPromises()

        expect(row(wrapper, 'Solver').text()).not.toContain('changed to')
      })

      it('does not offer liblinear on a Dataset of more than two labels', async () => {
        const wrapper = await mountWizard(['civil', 'criminal', 'family'])

        expect(solverOptions(wrapper)).toEqual(['lbfgs', 'saga'])
        expect(row(wrapper, 'Solver').text()).toContain('The liblinear solver handles two labels only.')
      })

      it('shows the elasticnet mix only with the elasticnet penalty', async () => {
        const wrapper = await mountWizard(['civil', 'criminal'])
        expect(row(wrapper, 'Elasticnet Mix')).toBeUndefined()

        await row(wrapper, 'Penalty').find('select').setValue('elasticnet')
        await flushPromises()

        expect(row(wrapper, 'Elasticnet Mix')).toBeDefined()
      })
    })

    it('leaves a cleared number to the default instead of sending nothing', async () => {
      const createModel = vi.fn().mockResolvedValue({ id: 'm-1' })
      const adapter = createTestAdapter({
        listDatasets: vi.fn().mockResolvedValue([dataset()]),
        createModel,
        startTraining: vi.fn().mockResolvedValue({ job_id: 'j' }),
      })
      const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
      await flushPromises()
      await wrapper.find('.vmlb-param-input input[type="number"]').setValue('')

      await wrapper.find('.vmlb-btn-primary').trigger('click')
      await flushPromises()

      expect(createModel.mock.calls[0][0].parameters).not.toHaveProperty('C')
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

      const advanced = wrapper.find('.vmlb-configure-form details')
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
