import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSelfHostedAdapter } from '../src/adapters/selfHosted'

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status })
}

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; token: string | undefined; method?: string; body?: unknown }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      token: (init.headers as Record<string, string>).Authorization,
      method: init.method,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    return handler(url, init)
  })
  return calls
}

// A server that only accepts the token 'fresh'.
function freshOnly(url: string, init: RequestInit) {
  const auth = (init.headers as Record<string, string>).Authorization
  return auth === 'Bearer fresh' ? reply(200, { datasets: [{ id: 'd1' }] }) : reply(401, { error: 'Access token has expired.' })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createSelfHostedAdapter', () => {
  it('retries a request once with the refreshed token when the token has expired', async () => {
    let token = 'stale'
    const calls = stubFetch(freshOnly)
    const adapter = createSelfHostedAdapter({
      apiUrl: '/api',
      getAuthToken: () => token,
      refreshAuthToken: async () => {
        token = 'fresh'
        return token
      },
    })

    await expect(adapter.listDatasets()).resolves.toEqual([{ id: 'd1' }])
    expect(calls.map((c) => c.token)).toEqual(['Bearer stale', 'Bearer fresh'])
  })

  it('refreshes once for requests that expire together', async () => {
    stubFetch(freshOnly)
    const refreshAuthToken = vi.fn(async () => 'fresh')
    const adapter = createSelfHostedAdapter({ apiUrl: '/api', getAuthToken: () => 'stale', refreshAuthToken })

    await Promise.all([adapter.listDatasets(), adapter.listDatasets()])

    expect(refreshAuthToken).toHaveBeenCalledTimes(1)
  })

  it('reports the failure when the session cannot be refreshed', async () => {
    const calls = stubFetch(freshOnly)
    const adapter = createSelfHostedAdapter({
      apiUrl: '/api',
      getAuthToken: () => 'stale',
      refreshAuthToken: async () => null,
    })

    await expect(adapter.listDatasets()).rejects.toThrow('Access token has expired.')
    expect(calls).toHaveLength(1)
  })

  it('reports the failure when the host offers no refresh', async () => {
    stubFetch(freshOnly)
    const adapter = createSelfHostedAdapter({ apiUrl: '/api', getAuthToken: () => 'stale' })

    await expect(adapter.listDatasets()).rejects.toThrow('Access token has expired.')
  })

  const create = { name: 'M', dataset_id: 'd1', model_type: 'svm', parameters: { C: -1 } }

  it('keeps the field a refusal names', async () => {
    stubFetch(() => reply(400, { error: 'Regularisation (C) must be between 0.001 and 100.', field: 'C' }))
    const adapter = createSelfHostedAdapter({ apiUrl: '/api' })

    const refused = await adapter.createModel(create).catch((err) => err)

    expect(refused).toBeInstanceOf(Error)
    expect(refused.message).toBe('Regularisation (C) must be between 0.001 and 100.')
    expect(refused.field).toBe('C')
  })

  it('adds no field for a backend that sends none', async () => {
    stubFetch(() => reply(400, { error: 'Invalid model type' }))
    const adapter = createSelfHostedAdapter({ apiUrl: '/api' })

    const refused = await adapter.createModel(create).catch((err) => err)

    expect(refused.message).toBe('Invalid model type')
    expect('field' in refused).toBe(false)
  })
  describe('updateModel', () => {
    const changes = { parameters: { C: 2, solver: 'saga' } }

    it('sends the new settings to the Model and returns the saved Model', async () => {
      const calls = stubFetch(() => reply(200, { message: 'Model updated', model: { id: 'm1', parameters: changes.parameters } }))
      const adapter = createSelfHostedAdapter({ apiUrl: '/api' })

      const model = await adapter.updateModel!('m1', changes)

      expect(calls).toEqual([expect.objectContaining({ url: '/api/models/m1', method: 'PUT', body: changes })])
      expect(model).toEqual({ id: 'm1', parameters: changes.parameters })
    })

    it('keeps the field a refusal names', async () => {
      stubFetch(() => reply(400, { error: 'Regularisation (C) must be between 0.001 and 100.', field: 'C' }))
      const adapter = createSelfHostedAdapter({ apiUrl: '/api' })

      const refused = await adapter.updateModel!('m1', changes).catch((err) => err)

      expect(refused).toBeInstanceOf(Error)
      expect(refused.message).toBe('Regularisation (C) must be between 0.001 and 100.')
      expect(refused.field).toBe('C')
    })

    it('adds no field for a backend that sends none', async () => {
      stubFetch(() => reply(409, { error: 'This Model is training. Wait for it to finish.' }))
      const adapter = createSelfHostedAdapter({ apiUrl: '/api' })

      const refused = await adapter.updateModel!('m1', changes).catch((err) => err)

      expect(refused.message).toBe('This Model is training. Wait for it to finish.')
      expect('field' in refused).toBe(false)
    })
  })
  it('fits the models to a Dataset, asking the server by its id', async () => {
    const fit = { models: { svm: { name: 'Support Vector Machine', usable: false, reason: 'Not categories.' } }, advice: 'Give the rows a few categories.' }
    const calls = stubFetch(() => reply(200, fit))
    const adapter = createSelfHostedAdapter({ apiUrl: '/api', getAuthToken: () => 't' })

    await expect(adapter.getModelFit!('ds 1')).resolves.toEqual(fit)
    expect(calls[0].url).toBe('/api/models/available?dataset_id=ds%201')
  })

  it('returns training metric points with their group and the training step', async () => {
    const point = {
      id: 'p1', training_job_id: 'job-1', step: 0, epoch: 0.5, training_step: 10,
      metric_name: 'loss', group: 'train', value: 0.7, created_at: '2026-11-03T10:00:00',
    }
    const calls = stubFetch(() => reply(200, { points: [point] }))
    const adapter = createSelfHostedAdapter({ apiUrl: '/api', getAuthToken: () => 't' })

    await expect(adapter.getTrainingMetrics('job-1', 4)).resolves.toEqual([point])
    expect(calls[0].url).toBe('/api/training/job-1/metrics?since_step=4')
  })
})

describe('createSelfHostedAdapter LLM methods', () => {
  const suggestion = {
    id: 's1', task_id: 't1', model: 'gpt-x', prompt_version: 0, label: 'Civil',
    rationale: 'A contract dispute.', status: 'pending', created_at: '2026-11-05T10:00:00',
  }
  const agreement = { model: 'gpt-x', prompt_version: 0, checked: 30, agreed: 27, rate: 0.9, min_sample: 30, threshold: 0.8, unlocked: true }
  const estimate = { tasks: 2, estimated_tokens: 1800, remaining_tokens: 200000, within_budget: true, destination: 'openrouter.ai' }

  async function call(body: unknown, run: (adapter: ReturnType<typeof createSelfHostedAdapter>) => Promise<unknown>, status = 200) {
    const calls = stubFetch(() => reply(status, body))
    const result = await run(createSelfHostedAdapter({ apiUrl: '/api' }))
    return { calls, result }
  }

  it('reads the status, for a Dataset when asked', async () => {
    const status = { mode: 'shared', destination: 'openrouter.ai', model: 'gpt-x', shared_key_allowed: true, key: null, remaining_tokens: 1200, acknowledged: false }
    const { calls, result } = await call(status, (a) => a.getLlmStatus!('ds 1'))
    expect(calls).toEqual([expect.objectContaining({ url: '/api/llm/status?dataset_id=ds%201', method: undefined })])
    expect(result).toEqual(status)

    const plain = await call(status, (a) => a.getLlmStatus!())
    expect(plain.calls[0].url).toBe('/api/llm/status')
  })

  it('saves and deletes the own key', async () => {
    const key = { base_url: 'https://api.example.com/v1', model: 'm', api_key: 'sk-1' }
    const saved = await call({ base_url: key.base_url, model: 'm' }, (a) => a.saveLlmKey!(key))
    expect(saved.calls).toEqual([expect.objectContaining({ url: '/api/llm/key', method: 'PUT', body: key })])
    expect(saved.result).toEqual({ base_url: key.base_url, model: 'm' })

    const deleted = await call({ deleted: true }, (a) => a.deleteLlmKey!())
    expect(deleted.calls).toEqual([expect.objectContaining({ url: '/api/llm/key', method: 'DELETE' })])
  })

  it('acknowledges the destination the user saw', async () => {
    const ack = { destination: 'openrouter.ai', created_at: '2026-11-05T10:00:00' }
    const { calls, result } = await call(ack, (a) => a.acknowledgeLlmDestination!('ds-1', 'openrouter.ai'))
    expect(calls).toEqual([expect.objectContaining({ url: '/api/llm/datasets/ds-1/acknowledgement', method: 'POST', body: { destination: 'openrouter.ai' } })])
    expect(result).toEqual(ack)
  })

  it('reads and saves the prompt', async () => {
    const prompt = { version: 0, template: 'Label {labels} {text}', definitions: {} }
    const read = await call(prompt, (a) => a.getLlmPrompt!('ds-1'))
    expect(read.calls[0]).toEqual(expect.objectContaining({ url: '/api/llm/datasets/ds-1/prompt', method: undefined }))
    expect(read.result).toEqual(prompt)

    const edit = { template: 'Pick one of {labels} for {text}', definitions: { Civil: 'Private disputes' } }
    const saved = await call({ ...edit, version: 1, created_at: '' }, (a) => a.updateLlmPrompt!('ds-1', edit))
    expect(saved.calls).toEqual([expect.objectContaining({ url: '/api/llm/datasets/ds-1/prompt', method: 'PUT', body: edit })])
    expect(saved.result).toEqual({ ...edit, version: 1, created_at: '' })
  })

  it('creates and lists suggestions', async () => {
    const batch = { suggestions: [suggestion], skipped: 1, invalid: 0 }
    const created = await call(batch, (a) => a.createLlmSuggestions!('ds-1', ['t1', 't2']))
    expect(created.calls).toEqual([expect.objectContaining({ url: '/api/llm/datasets/ds-1/suggestions', method: 'POST', body: { task_ids: ['t1', 't2'] } })])
    expect(created.result).toEqual(batch)

    const listed = await call({ suggestions: [suggestion] }, (a) => a.listLlmSuggestions!('ds-1', 'pending'))
    expect(listed.calls[0].url).toBe('/api/llm/datasets/ds-1/suggestions?status=pending')
    expect(listed.result).toEqual([suggestion])
  })

  it('confirms, corrects and rejects a suggestion', async () => {
    const task = { id: 't1', annotation_label: 'Civil', status: 'annotated', label_source: 'llm_confirmed' }
    const accepted = await call({ suggestion: { ...suggestion, status: 'accepted' }, task }, (a) => a.confirmLlmSuggestion!('s1'))
    expect(accepted.calls).toEqual([expect.objectContaining({ url: '/api/llm/suggestions/s1/confirm', method: 'POST', body: {} })])
    expect(accepted.result).toEqual({ suggestion: { ...suggestion, status: 'accepted' }, task })

    const corrected = await call({ suggestion, task }, (a) => a.confirmLlmSuggestion!('s1', 'Criminal'))
    expect(corrected.calls[0].body).toEqual({ label: 'Criminal' })

    const rejected = await call({ suggestion: { ...suggestion, status: 'rejected' } }, (a) => a.rejectLlmSuggestion!('s1'))
    expect(rejected.calls).toEqual([expect.objectContaining({ url: '/api/llm/suggestions/s1/reject', method: 'POST' })])
    expect(rejected.result).toEqual({ ...suggestion, status: 'rejected' })
  })

  it('reads the agreement and bulk accepts', async () => {
    const read = await call(agreement, (a) => a.getLlmAgreement!('ds-1'))
    expect(read.calls[0]).toEqual(expect.objectContaining({ url: '/api/llm/datasets/ds-1/agreement', method: undefined }))
    expect(read.result).toEqual(agreement)

    const bulk = await call({ accepted: 12, agreement }, (a) => a.bulkAcceptLlmSuggestions!('ds-1'))
    expect(bulk.calls).toEqual([expect.objectContaining({ url: '/api/llm/datasets/ds-1/bulk-accept', method: 'POST' })])
    expect(bulk.result).toEqual({ accepted: 12, agreement })
  })

  it('prices an LLM-suggested first batch', async () => {
    const priced = await call(estimate, (a) => a.estimateActiveLearningSeed!('ds-1', { batch_size: 20, holdout_percent: 20 }))

    expect(priced.calls).toEqual([
      expect.objectContaining({
        url: '/api/active-learning/datasets/ds-1/seed-estimate',
        method: 'POST',
        body: { batch_size: 20, holdout_percent: 20 },
      }),
    ])
    expect(priced.result).toEqual(estimate)
  })

  it('estimates, starts and follows a standalone job', async () => {
    const subset = await call(estimate, (a) => a.estimateLlmAnnotation!('ds-1', ['t1', 't2']))
    expect(subset.calls).toEqual([expect.objectContaining({ url: '/api/llm/datasets/ds-1/annotate/estimate', method: 'POST', body: { task_ids: ['t1', 't2'] } })])
    expect(subset.result).toEqual(estimate)

    const whole = await call(estimate, (a) => a.estimateLlmAnnotation!('ds-1'))
    expect(whole.calls[0].body).toEqual({})

    const started = await call({ job_id: 'job-1', estimate }, (a) => a.startLlmAnnotation!('ds-1'), 202)
    expect(started.calls).toEqual([expect.objectContaining({ url: '/api/llm/datasets/ds-1/annotate', method: 'POST', body: { confirm_estimate: true } })])
    expect(started.result).toEqual({ job_id: 'job-1', estimate })

    const startedSubset = await call({ job_id: 'job-1', estimate }, (a) => a.startLlmAnnotation!('ds-1', ['t1']), 202)
    expect(startedSubset.calls[0].body).toEqual({ task_ids: ['t1'], confirm_estimate: true })

    const job = { status: 'running', total: 2, done: 1, created: 1, invalid: 0 }
    const polled = await call(job, (a) => a.getLlmJob!('job-1'))
    expect(polled.calls[0]).toEqual(expect.objectContaining({ url: '/api/llm/jobs/job-1', method: undefined }))
    expect(polled.result).toEqual(job)
  })

  it('keeps the code and destination of an LLM refusal', async () => {
    stubFetch(() => reply(409, { error: 'The LLM destination has changed. Please review it again.', code: 'destination_changed', destination: 'api.example.com' }))
    const adapter = createSelfHostedAdapter({ apiUrl: '/api' })

    const refused = await adapter.acknowledgeLlmDestination!('ds-1', 'openrouter.ai').catch((err) => err)

    expect(refused.message).toBe('The LLM destination has changed. Please review it again.')
    expect(refused.code).toBe('destination_changed')
    expect(refused.destination).toBe('api.example.com')
  })

  it('adds no code for a refusal that sends none', async () => {
    stubFetch(() => reply(404, { error: 'Dataset not found' }))
    const adapter = createSelfHostedAdapter({ apiUrl: '/api' })

    const refused = await adapter.getLlmAgreement!('ds-1').catch((err) => err)

    expect('code' in refused).toBe(false)
    expect('destination' in refused).toBe(false)
  })
})
