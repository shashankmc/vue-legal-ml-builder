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
})
