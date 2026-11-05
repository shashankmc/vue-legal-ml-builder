import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AnnotationWorkspace from '../src/components/AnnotationWorkspace.vue'
import type { MLAdapter } from '../src/types'
import { createTestAdapter } from './testAdapter'
import { llmMethods, llmStatus, refusal } from './fixtures/llm'

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
