import { vi } from 'vitest'
import type { LlmAgreement, LlmStatus, LlmSuggestion, MLAdapter } from '../../src/types'

// Shapes as legal-ml-core 0.7.0's /api/llm routes return them.

export function llmStatus(overrides: Partial<LlmStatus> = {}): LlmStatus {
  return {
    mode: 'shared',
    destination: 'openrouter.ai',
    model: 'mistral-small',
    shared_key_allowed: true,
    key: null,
    remaining_tokens: 200000,
    acknowledged: true,
    ...overrides,
  }
}

export function llmAgreement(overrides: Partial<LlmAgreement> = {}): LlmAgreement {
  return {
    model: null,
    prompt_version: null,
    checked: 0,
    agreed: 0,
    rate: null,
    min_sample: 30,
    threshold: 0.8,
    unlocked: false,
    ...overrides,
  }
}

export function llmSuggestion(overrides: Partial<LlmSuggestion> = {}): LlmSuggestion {
  return {
    id: 's1',
    task_id: 't1',
    model: 'mistral-small',
    prompt_version: 0,
    label: 'Criminal',
    rationale: 'The clause sets out a penalty for an offence.',
    status: 'pending',
    created_at: '2026-11-05T10:00:00',
    ...overrides,
  }
}

export const DEFAULT_TEMPLATE = 'Label the legal text below with exactly one label.\n\nLabels:\n{labels}\n\nExamples:\n{examples}\n\nText to label:\n{text}'

/** Every LLM method, answering as a ready shared key with nothing suggested yet. */
export function llmMethods(overrides: Partial<MLAdapter> = {}): Partial<MLAdapter> {
  return {
    getLlmStatus: vi.fn().mockResolvedValue(llmStatus()),
    saveLlmKey: vi.fn().mockResolvedValue({ base_url: 'https://api.example.com/v1', model: 'gpt-x' }),
    deleteLlmKey: vi.fn().mockResolvedValue(undefined),
    acknowledgeLlmDestination: vi.fn().mockResolvedValue({ destination: 'openrouter.ai', created_at: '' }),
    getLlmPrompt: vi.fn().mockResolvedValue({ version: 0, template: DEFAULT_TEMPLATE, definitions: {} }),
    updateLlmPrompt: vi.fn(),
    createLlmSuggestions: vi.fn().mockResolvedValue({ suggestions: [], skipped: 0, invalid: 0 }),
    listLlmSuggestions: vi.fn().mockResolvedValue([]),
    confirmLlmSuggestion: vi.fn().mockResolvedValue({}),
    rejectLlmSuggestion: vi.fn().mockResolvedValue({}),
    getLlmAgreement: vi.fn().mockResolvedValue(llmAgreement()),
    bulkAcceptLlmSuggestions: vi.fn(),
    estimateLlmAnnotation: vi.fn(),
    startLlmAnnotation: vi.fn(),
    getLlmJob: vi.fn(),
    ...overrides,
  }
}

/** An Error as the self-hosted adapter rejects with, code and all. */
export function refusal(message: string, code?: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), code ? { code } : {}, extra)
}
