import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ModelLens from '../src/components/shared/ModelLens.vue'
import ModelQuestionTree from '../src/components/ModelQuestionTree.vue'

describe('ModelLens', () => {
  it('renders an accessible figure with the plain-language reading', () => {
    const wrapper = mount(ModelLens, {
      props: { modelType: 'decision_tree', parameters: { max_depth: 3 }, labels: ['Lease', 'Loan'], taskType: 'classification' },
    })
    const figure = wrapper.find('figure')
    expect(figure.attributes('role')).toBe('img')
    expect(figure.attributes('aria-label')).toContain('3 levels')
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.text()).toContain('Rule tree')
  })

  it('redraws when a parameter changes the copy', async () => {
    const wrapper = mount(ModelLens, { props: { modelType: 'svm', parameters: { C: 1 } } })
    expect(wrapper.text()).toContain('moderate gap')
    await wrapper.setProps({ parameters: { C: 4 } })
    expect(wrapper.text()).toContain('narrow and strict')
  })

  it('renders a cluster lens for density models', () => {
    const wrapper = mount(ModelLens, { props: { modelType: 'dbscan', parameters: { eps: 0.4 }, taskType: 'clustering' } })
    expect(wrapper.text()).toContain('Similarity map')
    expect(wrapper.findAll('circle').length).toBeGreaterThan(0)
  })
})

describe('ModelQuestionTree', () => {
  const answer = async (wrapper: ReturnType<typeof mount>, text: string) =>
    wrapper.findAll('button.vmlb-guide-option').find((b) => b.text().includes(text))!.trigger('click')

  it('walks a branch and emits the recommended model', async () => {
    const wrapper = mount(ModelQuestionTree, { props: { taskType: 'classification' } })
    expect(wrapper.text()).toContain('What matters most to you?')

    await answer(wrapper, 'Being able to explain each result')
    await answer(wrapper, 'As rules a colleague can follow')

    expect(wrapper.text()).toContain('Decision Tree')
    const use = wrapper.find('button.vmlb-guide-use')
    await use.trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['decision_tree'])
  })

  it('shows a direct recommendation and marks the current selection', async () => {
    const wrapper = mount(ModelQuestionTree, { props: { taskType: 'topic_modeling', currentModelType: 'lda' } })
    await answer(wrapper, 'a document can cover several topics')
    expect(wrapper.text()).toContain('LDA (Topic Modelling)')
    expect(wrapper.text()).toContain('Currently selected')
    expect(wrapper.find('button.vmlb-guide-use').exists()).toBe(false)
  })

  it('explains the recommendation by the answer given, not by how the Model works', async () => {
    const wrapper = mount(ModelQuestionTree, { props: { taskType: 'classification' } })
    await answer(wrapper, 'Quick results on a lot of documents')

    const reason = wrapper.find('.vmlb-guide-rec-desc').text()
    expect(reason).toBe('Recommended because it learns from thousands of documents in seconds.')
    expect(wrapper.text()).not.toContain('Bayes theorem')
  })
})
