import { describe, expectTypeOf, it } from 'vitest'
import type { LlmRefusalError, LlmStatus, MLAdapter } from '../src'

type LlmMethods = Extract<keyof MLAdapter, `${string}Llm${string}`>

describe('MLAdapter LLM methods', () => {
  it('are all optional, so an adapter without them still type-checks', () => {
    expectTypeOf<Omit<MLAdapter, LlmMethods>>().toMatchTypeOf<MLAdapter>()
  })

  it('cover every /api/llm route of legal-ml-core', () => {
    expectTypeOf<LlmMethods>().toEqualTypeOf<
      | 'getLlmStatus'
      | 'saveLlmKey'
      | 'deleteLlmKey'
      | 'acknowledgeLlmDestination'
      | 'getLlmPrompt'
      | 'updateLlmPrompt'
      | 'createLlmSuggestions'
      | 'listLlmSuggestions'
      | 'confirmLlmSuggestion'
      | 'rejectLlmSuggestion'
      | 'getLlmAgreement'
      | 'bulkAcceptLlmSuggestions'
      | 'estimateLlmAnnotation'
      | 'startLlmAnnotation'
      | 'getLlmJob'
    >()
  })

  it('never return the own key', () => {
    expectTypeOf<NonNullable<LlmStatus['key']>>().toEqualTypeOf<{ base_url: string; model: string }>()
    expectTypeOf<Awaited<ReturnType<NonNullable<MLAdapter['saveLlmKey']>>>>().not.toHaveProperty('api_key')
  })

  it('reject with a code and the current destination', () => {
    expectTypeOf<LlmRefusalError>().toHaveProperty('code')
    expectTypeOf<LlmRefusalError>().toHaveProperty('destination')
  })
})
