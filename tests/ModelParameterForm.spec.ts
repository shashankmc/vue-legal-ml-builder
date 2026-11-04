import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import * as builder from '../src/index'
import ModelParameterForm from '../src/components/ModelParameterForm.vue'

type Form = ReturnType<typeof mount>

const row = (wrapper: Form, label: string) =>
  wrapper.findAll('.vmlb-param-row').find((r) => r.find('.vmlb-link-btn').text() === label)
const control = (wrapper: Form, label: string) => row(wrapper, label)!.find('input, select')
const lastChange = (wrapper: Form) => wrapper.emitted('change')!.at(-1)![0] as Record<string, unknown>

describe('ModelParameterForm', () => {
  it('fills in an existing Model’s settings and reports them', () => {
    const wrapper = mount(ModelParameterForm, {
      props: { modelType: 'logistic_regression', parameters: { C: 2.5, penalty: 'l1', solver: 'saga', class_weight: 'balanced' } },
    })

    expect((control(wrapper, 'Regularisation (C)').element as HTMLInputElement).value).toBe('2.5')
    expect((control(wrapper, 'Solver').element as HTMLSelectElement).value).toBe('saga')
    // A setting not on show still goes with its default, as from the wizard.
    expect(lastChange(wrapper)).toEqual({ C: 2.5, penalty: 'l1', solver: 'saga', l1_ratio: 0.5, class_weight: 'balanced' })
  })
  it('starts from the defaults when given no settings', () => {
    const wrapper = mount(ModelParameterForm, { props: { modelType: 'svm' } })

    expect((control(wrapper, 'Regularisation (C)').element as HTMLInputElement).value).toBe('1')
    expect(lastChange(wrapper)).toMatchObject({ C: 1 })
  })

  it('reports each edit', async () => {
    const wrapper = mount(ModelParameterForm, { props: { modelType: 'svm' } })

    await control(wrapper, 'Regularisation (C)').setValue(5)

    expect(lastChange(wrapper)).toMatchObject({ C: 5 })
  })

  it('leaves a cleared number to the default instead of reporting it empty', async () => {
    const wrapper = mount(ModelParameterForm, { props: { modelType: 'svm', parameters: { C: 5 } } })

    await control(wrapper, 'Regularisation (C)').setValue('')

    expect(lastChange(wrapper)).not.toHaveProperty('C')
  })

  it('starts again from a new set of settings, but keeps edits while given the same one', async () => {
    const saved = { C: 2 }
    const wrapper = mount(ModelParameterForm, { props: { modelType: 'svm', parameters: saved } })
    await control(wrapper, 'Regularisation (C)').setValue(7)

    await wrapper.setProps({ refusedField: 'C', parameters: saved })
    expect(lastChange(wrapper)).toMatchObject({ C: 7 })

    await wrapper.setProps({ parameters: { C: 3 } })
    expect(lastChange(wrapper)).toMatchObject({ C: 3 })
    expect((control(wrapper, 'Regularisation (C)').element as HTMLInputElement).value).toBe('3')
  })

  it('tucks the settings away, closed', () => {
    const wrapper = mount(ModelParameterForm, { props: { modelType: 'svm' } })

    expect(wrapper.find('details summary').text()).toBe('Advanced settings')
    expect(wrapper.find<HTMLDetailsElement>('details').element.open).toBe(false)
  })

  it('explains a setting in plain words, with its recommendation, when asked', async () => {
    const wrapper = mount(ModelParameterForm, { props: { modelType: 'logistic_regression' } })

    await row(wrapper, 'Penalty')!.find('.vmlb-link-btn').trigger('click')

    const explained = row(wrapper, 'Penalty')!.find('.vmlb-param-explain')
    expect(explained.find('.vmlb-option-line').exists()).toBe(true)
    expect(explained.find('.vmlb-recommendation').text()).not.toBe('')
  })

  describe('options that depend on each other', () => {
    const modelInfo = {
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
    }
    const mountForm = (props: Record<string, unknown> = {}) =>
      mount(ModelParameterForm, { props: { modelType: 'logistic_regression', modelInfo, labels: ['civil', 'criminal'], ...props } })
    const solverOptions = (wrapper: Form) => row(wrapper, 'Solver')!.findAll('option').map((o) => o.text())

    it('offers what the backend offers', () => {
      expect(solverOptions(mountForm())).toEqual(['lbfgs', 'liblinear', 'saga'])
    })

    it('moves a choice the rules rule out, says why, and reports the move', async () => {
      const wrapper = mountForm()

      await control(wrapper, 'Penalty').setValue('elasticnet')
      await flushPromises()

      expect(solverOptions(wrapper)).toEqual(['saga'])
      expect(row(wrapper, 'Solver')!.text()).toContain('Solver changed to saga. The elasticnet penalty needs the saga solver.')
      expect(lastChange(wrapper)).toMatchObject({ penalty: 'elasticnet', solver: 'saga' })
    })

    it('moves a saved choice that the rules no longer allow', async () => {
      const wrapper = mountForm({ parameters: { penalty: 'elasticnet', solver: 'lbfgs' } })
      await flushPromises()

      expect(lastChange(wrapper)).toMatchObject({ penalty: 'elasticnet', solver: 'saga' })
    })

    it('does not offer liblinear on a Dataset of more than two labels', () => {
      const wrapper = mountForm({ labels: ['civil', 'criminal', 'family'] })

      expect(solverOptions(wrapper)).toEqual(['lbfgs', 'saga'])
      expect(row(wrapper, 'Solver')!.text()).toContain('The liblinear solver handles two labels only.')
    })

    it('shows a setting only while it has an effect', async () => {
      const wrapper = mountForm()
      expect(row(wrapper, 'Elasticnet Mix')).toBeUndefined()

      await control(wrapper, 'Penalty').setValue('elasticnet')

      expect(row(wrapper, 'Elasticnet Mix')).toBeDefined()
    })

    it('caps a setting at the Dataset’s row count', () => {
      const wrapper = mount(ModelParameterForm, {
        props: {
          modelType: 'kmeans',
          rowCount: 5,
          modelInfo: { name: 'K-Means', description: '', parameters: { n_clusters: { type: 'int', min: 2, max: 50, default: 8, at_most_rows: true } } },
        },
      })

      expect(lastChange(wrapper)).toEqual({ n_clusters: 5 })
    })
  })

  describe('when a refusal names a setting', () => {
    it('marks that setting, points it at the host’s alert and opens the settings', () => {
      const wrapper = mount(ModelParameterForm, { props: { modelType: 'svm', refusedField: 'C', refusalId: 'save-refusal' } })

      const marked = control(wrapper, 'Regularisation (C)')
      expect(marked.attributes('id')).toBe('vmlb-refused-field')
      expect(marked.attributes('aria-invalid')).toBe('true')
      expect(marked.attributes('aria-describedby')).toBe('save-refusal')
      expect(wrapper.find<HTMLDetailsElement>('details').element.open).toBe(true)
    })

    it('marks a select as well, and only that one', () => {
      const wrapper = mount(ModelParameterForm, { props: { modelType: 'logistic_regression', refusedField: 'solver' } })

      expect(control(wrapper, 'Solver').attributes('aria-invalid')).toBe('true')
      expect(control(wrapper, 'Regularisation (C)').attributes('aria-invalid')).toBeUndefined()
    })

    it('leaves the settings as they were for a setting not on show', () => {
      const wrapper = mount(ModelParameterForm, { props: { modelType: 'logistic_regression', refusedField: 'l1_ratio' } })

      expect(wrapper.find('[aria-invalid]').exists()).toBe(false)
      expect(wrapper.find<HTMLDetailsElement>('details').element.open).toBe(false)
    })

    it('names the setting for the host’s alert, only while it is on show', () => {
      const wrapper = mount(ModelParameterForm, { props: { modelType: 'logistic_regression' } })
      const form = wrapper.vm as unknown as { labelFor: (key: string) => string | undefined }

      expect(form.labelFor('solver')).toBe('Solver')
      expect(form.labelFor('l1_ratio')).toBeUndefined()
    })

    it('unmarks it once the host clears the refusal', async () => {
      const wrapper = mount(ModelParameterForm, { props: { modelType: 'svm', refusedField: 'C' } })

      await wrapper.setProps({ refusedField: '' })

      expect(wrapper.find('[aria-invalid]').exists()).toBe(false)
    })
  })
  it('can be mounted by a host outside Vue, from the package entry', async () => {
    const el = document.createElement('div')
    const onChange = vi.fn()
    const mounted = builder.mountComponent(builder.ModelParameterForm, el, { modelType: 'svm', parameters: { C: 4 }, onChange })

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ C: 4 }))

    mounted.updateProps({ refusedField: 'C' })
    await nextTick()
    expect(el.querySelector('#vmlb-refused-field')?.getAttribute('aria-invalid')).toBe('true')
    mounted.unmount()
  })
})
