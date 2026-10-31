import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSelfHostedAdapter } from '../src/adapters/selfHosted'

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status })
}

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; token: string | undefined }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    calls.push({ url, token: (init.headers as Record<string, string>).Authorization })
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
})
