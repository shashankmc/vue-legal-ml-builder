import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AnnotationWorkspace from '../src/components/AnnotationWorkspace.vue'
import type { MLAdapter } from '../src/types'
import { createTestAdapter } from './testAdapter'
import { llmAgreement, llmMethods, llmStatus, llmSuggestion, refusal } from './fixtures/llm'

function item(id: string, text: string, extra = {}) {
  return { id, dataset_id: 'ds-1', item_index: 0, text, status: 'pending' as const, created_at: '', updated_at: '', ...extra }
}

async function mounted(overrides: Partial<MLAdapter> = {}, props = {}, withLlm = true) {
  const adapter = createTestAdapter({
    getNextAnnotationTask: vi.fn().mockResolvedValue({ task: item('t1', 'Clause one.'), stats: { total: 4, annotated: 1, percentage: 25 } }),
    getDataset: vi.fn().mockResolvedValue({ labels: ['Civil', 'Criminal'] }),
    saveAnnotation: vi.fn().mockResolvedValue({}),
    skipAnnotation: vi.fn().mockResolvedValue({}),
    ...(withLlm ? llmMethods() : {}),
    ...overrides,
  })
  const wrapper = mount(AnnotationWorkspace, {
    props: { adapter, projectId: 'p1', datasetId: 'ds-1', ...props },
    attachTo: document.body,
  })
  await flushPromises()
  return { adapter, wrapper }
}

type Wrapper = Awaited<ReturnType<typeof mounted>>['wrapper']

function button(wrapper: Wrapper, text: string) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

async function click(wrapper: Wrapper, text: string) {
  const found = button(wrapper, text)
  if (!found) throw new Error(`no button "${text}"`)
  await found.trigger('click')
  await flushPromises()
}

function panel(wrapper: Wrapper) {
  return wrapper.find('[aria-label="LLM suggestions"]')
}

describe('LLM assistance: where it appears', () => {
  it('does not appear when the adapter has no LLM methods', async () => {
    const { wrapper } = await mounted({}, {}, false)

    expect(panel(wrapper).exists()).toBe(false)
    expect(wrapper.text()).toContain('Clause one.')
    wrapper.unmount()
  })

  it('does not appear for multi-label or entity tasks', async () => {
    for (const taskType of ['multi-label', 'ner']) {
      const { adapter, wrapper } = await mounted({}, { taskType })

      expect(panel(wrapper).exists()).toBe(false)
      expect(adapter.getLlmStatus).not.toHaveBeenCalled()
      wrapper.unmount()
    }
  })

  it('does not appear while the Dataset names fewer than two labels', async () => {
    const { adapter, wrapper } = await mounted({ getDataset: vi.fn().mockResolvedValue({ labels: [] }) })

    expect(panel(wrapper).exists()).toBe(false)
    expect(adapter.getLlmStatus).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('asks for the status of this Dataset', async () => {
    const { adapter, wrapper } = await mounted()

    expect(panel(wrapper).exists()).toBe(true)
    expect(adapter.getLlmStatus).toHaveBeenCalledWith('ds-1')
    wrapper.unmount()
  })
})

describe('LLM assistance: status and own key', () => {
  it('names the shared key, the destination and the tokens left', async () => {
    const { wrapper } = await mounted({ getLlmStatus: vi.fn().mockResolvedValue(llmStatus({ remaining_tokens: 1200 })) })

    const text = panel(wrapper).text()
    expect(text).toContain('the shared key')
    expect(text).toContain('openrouter.ai')
    expect(text).toContain('1,200 tokens left this month')
    wrapper.unmount()
  })

  it('names the own key by its model and URL, never the key', async () => {
    const status = llmStatus({ mode: 'byok', destination: 'api.example.com', model: 'gpt-x', remaining_tokens: null, key: { base_url: 'https://api.example.com/v1', model: 'gpt-x' } })
    const { wrapper } = await mounted({ getLlmStatus: vi.fn().mockResolvedValue(status) })

    const text = panel(wrapper).text()
    expect(text).toContain('your own key')
    expect(text).toContain('gpt-x')
    expect(text).toContain('https://api.example.com/v1')
    expect(text).not.toContain('tokens left')
    expect(button(wrapper, 'Delete your key')).toBeDefined()
    wrapper.unmount()
  })

  it('offers an own key when the account has no access', async () => {
    const status = llmStatus({ mode: 'none', destination: null, model: null, shared_key_allowed: false, remaining_tokens: null, acknowledged: false })
    const { wrapper } = await mounted({ getLlmStatus: vi.fn().mockResolvedValue(status) })

    expect(panel(wrapper).text()).toContain('LLM suggestions are not available for your account. Add your own API key to use them.')
    expect(wrapper.find('input[type="password"]').exists()).toBe(true)
    expect(button(wrapper, 'Suggest labels for this batch')).toBeUndefined()
    wrapper.unmount()
  })

  it('saves an own key and clears it from the form', async () => {
    const status = llmStatus({ mode: 'none', destination: null, model: null, remaining_tokens: null, acknowledged: false })
    const getLlmStatus = vi.fn().mockResolvedValue(status)
    const { adapter, wrapper } = await mounted({ getLlmStatus })

    await wrapper.find('input[name="base_url"]').setValue('https://api.example.com/v1')
    await wrapper.find('input[name="model"]').setValue('gpt-x')
    await wrapper.find('input[name="api_key"]').setValue('sk-secret')
    await wrapper.find('form.vmlb-llm-key').trigger('submit')
    await flushPromises()

    expect(adapter.saveLlmKey).toHaveBeenCalledWith({ base_url: 'https://api.example.com/v1', model: 'gpt-x', api_key: 'sk-secret' })
    expect((wrapper.find('input[name="api_key"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.html()).not.toContain('sk-secret')
    expect(getLlmStatus).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('clears the key from the form when saving it fails, and says why', async () => {
    const status = llmStatus({ mode: 'none', destination: null, model: null, remaining_tokens: null, acknowledged: false })
    const { wrapper } = await mounted({
      getLlmStatus: vi.fn().mockResolvedValue(status),
      saveLlmKey: vi.fn().mockRejectedValue(new Error('The base URL must point to a public host.')),
    })

    await wrapper.find('input[name="base_url"]').setValue('https://localhost/v1')
    await wrapper.find('input[name="model"]').setValue('gpt-x')
    await wrapper.find('input[name="api_key"]').setValue('sk-secret')
    await wrapper.find('form.vmlb-llm-key').trigger('submit')
    await flushPromises()

    expect(panel(wrapper).text()).toContain('The base URL must point to a public host.')
    expect((wrapper.find('input[name="api_key"]').element as HTMLInputElement).value).toBe('')
    wrapper.unmount()
  })

  it('deletes the own key', async () => {
    const status = llmStatus({ mode: 'byok', destination: 'api.example.com', remaining_tokens: null, key: { base_url: 'https://api.example.com/v1', model: 'gpt-x' } })
    const getLlmStatus = vi.fn().mockResolvedValueOnce(status).mockResolvedValue(llmStatus())
    const { adapter, wrapper } = await mounted({ getLlmStatus })

    await click(wrapper, 'Delete your key')

    expect(adapter.deleteLlmKey).toHaveBeenCalled()
    expect(panel(wrapper).text()).toContain('the shared key')
    wrapper.unmount()
  })
})

describe('LLM assistance: acknowledging the destination', () => {
  const unacknowledged = llmStatus({ acknowledged: false })

  it('asks before anything is sent, naming the destination the backend gives', async () => {
    const { adapter, wrapper } = await mounted({ getLlmStatus: vi.fn().mockResolvedValue(unacknowledged) })

    expect(panel(wrapper).text()).toContain('Before anything is sent, confirm that text from this Project may be sent to openrouter.ai.')
    expect(button(wrapper, 'Allow sending to openrouter.ai')).toBeDefined()
    expect(button(wrapper, 'Suggest labels for this batch')).toBeUndefined()
    expect(adapter.createLlmSuggestions).not.toHaveBeenCalled()
    expect(adapter.getLlmAgreement).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('acknowledges that destination and then offers suggestions', async () => {
    const getLlmStatus = vi.fn().mockResolvedValueOnce(unacknowledged).mockResolvedValue(llmStatus())
    const { adapter, wrapper } = await mounted({ getLlmStatus })

    await click(wrapper, 'Allow sending to openrouter.ai')

    expect(adapter.acknowledgeLlmDestination).toHaveBeenCalledWith('ds-1', 'openrouter.ai')
    expect(panel(wrapper).text()).not.toContain('Before anything is sent')
    wrapper.unmount()
  })

  it('shows the new destination when it changed meanwhile', async () => {
    const moved = llmStatus({ acknowledged: false, mode: 'byok', destination: 'api.example.com' })
    const getLlmStatus = vi.fn().mockResolvedValueOnce(unacknowledged).mockResolvedValue(moved)
    const acknowledgeLlmDestination = vi.fn().mockRejectedValue(
      refusal('The LLM destination has changed. Please review it again.', 'destination_changed', { destination: 'api.example.com' }),
    )
    const { wrapper } = await mounted({ getLlmStatus, acknowledgeLlmDestination })

    await click(wrapper, 'Allow sending to openrouter.ai')

    expect(panel(wrapper).text()).toContain('The LLM destination has changed. Please review it again.')
    expect(button(wrapper, 'Allow sending to api.example.com')).toBeDefined()
    expect(button(wrapper, 'Allow sending to openrouter.ai')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('LLM assistance: suggestions for the batch', () => {
  it('asks for the next pending items, in the order the queue serves them', async () => {
    const pending = [
      item('t5', 'e', { item_index: 5, score: null }),
      item('t2', 'b', { item_index: 2, score: 0.4 }),
      item('t3', 'c', { item_index: 3, score: null }),
      item('t1', 'a', { item_index: 1, score: 0.9 }),
      ...Array.from({ length: 10 }, (_, i) => item(`u${i}`, 'x', { item_index: 10 + i, score: null })),
    ]
    const listAnnotationTasks = vi.fn().mockResolvedValue(pending)
    const { adapter, wrapper } = await mounted({ listAnnotationTasks })

    await click(wrapper, 'Suggest labels for this batch')

    expect(listAnnotationTasks).toHaveBeenCalledWith('p1', { status: 'pending', datasetId: 'ds-1' })
    expect(adapter.createLlmSuggestions).toHaveBeenCalledWith('ds-1', ['t1', 't2', 't3', 't5', 'u0', 'u1', 'u2', 'u3', 'u4', 'u5'])
    wrapper.unmount()
  })

  it('asks for the item on screen when the adapter cannot list items', async () => {
    const { adapter, wrapper } = await mounted()

    await click(wrapper, 'Suggest labels for this batch')

    expect(adapter.createLlmSuggestions).toHaveBeenCalledWith('ds-1', ['t1'])
    wrapper.unmount()
  })

  it('says what came back', async () => {
    const listLlmSuggestions = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([llmSuggestion()])
    const createLlmSuggestions = vi.fn().mockResolvedValue({ suggestions: [llmSuggestion(), llmSuggestion({ id: 's2', task_id: 't2' })], skipped: 1, invalid: 1 })
    const { wrapper } = await mounted({ createLlmSuggestions, listLlmSuggestions })

    await click(wrapper, 'Suggest labels for this batch')

    expect(panel(wrapper).text()).toContain('2 suggestions ready. 1 item already had one. 1 answer was discarded because it did not give one of your labels.')
    expect(wrapper.text()).toContain('The clause sets out a penalty for an offence.')
    wrapper.unmount()
  })

  it('shows the suggestion on its item with the rationale, not as a label', async () => {
    const { adapter, wrapper } = await mounted({ listLlmSuggestions: vi.fn().mockResolvedValue([llmSuggestion()]) })

    const card = wrapper.find('[aria-label="LLM suggestion"]')
    expect(card.text()).toContain('Criminal')
    expect(card.text()).toContain('The clause sets out a penalty for an offence.')
    expect(card.text()).toContain('It is not a label until you accept it.')
    expect(adapter.listLlmSuggestions).toHaveBeenCalledWith('ds-1', 'pending')
    expect(adapter.confirmLlmSuggestion).not.toHaveBeenCalled()
    expect(adapter.saveAnnotation).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not show a suggestion for another item', async () => {
    const { wrapper } = await mounted({ listLlmSuggestions: vi.fn().mockResolvedValue([llmSuggestion({ task_id: 't9' })]) })

    expect(wrapper.find('[aria-label="LLM suggestion"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('accepts a suggestion, then moves on', async () => {
    const getNextAnnotationTask = vi.fn()
      .mockResolvedValueOnce({ task: item('t1', 'Clause one.'), stats: { total: 4, annotated: 1, percentage: 25 } })
      .mockResolvedValue({ task: item('t2', 'Clause two.'), stats: { total: 4, annotated: 2, percentage: 50 } })
    const { adapter, wrapper } = await mounted({ getNextAnnotationTask, listLlmSuggestions: vi.fn().mockResolvedValue([llmSuggestion()]) })

    await click(wrapper, 'Accept')

    expect(adapter.confirmLlmSuggestion).toHaveBeenCalledWith('s1')
    expect(adapter.saveAnnotation).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Clause two.')
    wrapper.unmount()
  })

  it('rejects a suggestion and leaves the item to label by hand', async () => {
    const { adapter, wrapper } = await mounted({ listLlmSuggestions: vi.fn().mockResolvedValueOnce([llmSuggestion()]).mockResolvedValue([]) })

    await click(wrapper, 'Reject')

    expect(adapter.rejectLlmSuggestion).toHaveBeenCalledWith('s1')
    expect(wrapper.find('[aria-label="LLM suggestion"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Clause one.')
    expect(adapter.saveAnnotation).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('records a different label as a correction of the suggestion', async () => {
    const { adapter, wrapper } = await mounted({ listLlmSuggestions: vi.fn().mockResolvedValue([llmSuggestion()]) })

    await click(wrapper, 'Civil')
    await click(wrapper, 'Save & Next')

    expect(adapter.confirmLlmSuggestion).toHaveBeenCalledWith('s1', 'Civil')
    expect(adapter.saveAnnotation).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('asks again for the acknowledgement when the backend wants it', async () => {
    const getLlmStatus = vi.fn().mockResolvedValueOnce(llmStatus()).mockResolvedValue(llmStatus({ acknowledged: false }))
    const createLlmSuggestions = vi.fn().mockRejectedValue(
      refusal("Confirm that this project's text may be sent to openrouter.ai.", 'acknowledgement_required', { destination: 'openrouter.ai' }),
    )
    const { wrapper } = await mounted({ getLlmStatus, createLlmSuggestions })

    await click(wrapper, 'Suggest labels for this batch')

    expect(button(wrapper, 'Allow sending to openrouter.ai')).toBeDefined()
    wrapper.unmount()
  })
})

describe('LLM assistance: the monthly limit', () => {
  it('says the limit is reached and offers an own key', async () => {
    const createLlmSuggestions = vi.fn().mockRejectedValue(
      refusal("You've reached the monthly limit. Add your own API key to continue.", 'budget_exhausted', { byok_available: true }),
    )
    const { wrapper } = await mounted({ createLlmSuggestions })

    await click(wrapper, 'Suggest labels for this batch')

    expect(panel(wrapper).text()).toContain("You've reached the monthly limit. Add your own API key to continue.")
    expect(wrapper.find('details.vmlb-llm-more').attributes('open')).toBeDefined()
    expect(wrapper.find('input[name="api_key"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('says so before a request when no shared tokens are left', async () => {
    const { wrapper } = await mounted({ getLlmStatus: vi.fn().mockResolvedValue(llmStatus({ remaining_tokens: 0 })) })

    expect(panel(wrapper).text()).toContain("You've used this month's limit on the shared key. Add your own API key to continue.")
    expect(button(wrapper, 'Suggest labels for this batch')?.attributes('disabled')).toBeDefined()
    expect(wrapper.find('details.vmlb-llm-more').attributes('open')).toBeDefined()
    wrapper.unmount()
  })
})

describe('LLM assistance: agreement and bulk accept', () => {
  const partway = llmAgreement({ model: 'mistral-small', prompt_version: 0, checked: 12, agreed: 10, rate: 0.8333 })
  const passed = llmAgreement({ model: 'mistral-small', prompt_version: 0, checked: 30, agreed: 27, rate: 0.9, unlocked: true })

  it('shows the progress of the check, and keeps bulk accept locked', async () => {
    const { wrapper } = await mounted({ getLlmAgreement: vi.fn().mockResolvedValue(partway) })

    const text = panel(wrapper).text()
    expect(text).toContain('12 of 30 items checked')
    expect(text).toContain('10 of 12 suggestions matched your label (83%).')
    expect(text).toContain('Bulk accept unlocks at 30 checked items with at least 80% agreement.')
    expect(wrapper.find('[aria-label="LLM suggestions"] [role="progressbar"]').attributes('aria-valuenow')).toBe('12')
    expect(button(wrapper, 'Accept all waiting suggestions')?.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('says when nothing has been checked yet', async () => {
    const { wrapper } = await mounted()

    expect(panel(wrapper).text()).toContain('0 of 30 items checked')
    expect(panel(wrapper).text()).toContain('Accept or correct suggestions, or label their items yourself, to check the LLM against your own labels.')
    wrapper.unmount()
  })

  it('reads the agreement again after a suggestion is accepted', async () => {
    const { adapter, wrapper } = await mounted({ listLlmSuggestions: vi.fn().mockResolvedValue([llmSuggestion()]) })
    const before = vi.mocked(adapter.getLlmAgreement!).mock.calls.length

    await click(wrapper, 'Accept')

    expect(vi.mocked(adapter.getLlmAgreement!).mock.calls.length).toBeGreaterThan(before)
    wrapper.unmount()
  })

  it('accepts every waiting suggestion once the check passes, then reloads the queue', async () => {
    const bulkAcceptLlmSuggestions = vi.fn().mockResolvedValue({ accepted: 12, agreement: passed })
    const { adapter, wrapper } = await mounted({ getLlmAgreement: vi.fn().mockResolvedValue(passed), bulkAcceptLlmSuggestions })
    expect(panel(wrapper).text()).toContain('27 of 30 suggestions matched your label (90%).')
    const loads = vi.mocked(adapter.getNextAnnotationTask).mock.calls.length

    await click(wrapper, 'Accept all waiting suggestions')

    expect(bulkAcceptLlmSuggestions).toHaveBeenCalledWith('ds-1')
    expect(panel(wrapper).text()).toContain('12 suggestions accepted.')
    expect(vi.mocked(adapter.getNextAnnotationTask).mock.calls.length).toBeGreaterThan(loads)
    wrapper.unmount()
  })

  it('shows why the backend refused a bulk accept', async () => {
    const bulkAcceptLlmSuggestions = vi.fn().mockRejectedValue(refusal('Bulk accept needs 30 checked items at 80% agreement.', 'agreement_not_met'))
    const getLlmAgreement = vi.fn().mockResolvedValueOnce(passed).mockResolvedValue(partway)
    const { wrapper } = await mounted({ getLlmAgreement, bulkAcceptLlmSuggestions })

    await click(wrapper, 'Accept all waiting suggestions')

    expect(panel(wrapper).text()).toContain('Bulk accept needs 30 checked items at 80% agreement.')
    expect(button(wrapper, 'Accept all waiting suggestions')?.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
