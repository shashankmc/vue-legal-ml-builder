import { vi } from 'vitest'
import type { MLAdapter } from '../src/types'

/** A fully-mocked MLAdapter for component/composable tests — every method is
 * a vi.fn() so individual tests can override return values as needed. */
export function createTestAdapter(overrides: Partial<MLAdapter> = {}): MLAdapter {
  return {
    listDatasets: vi.fn().mockResolvedValue([]),
    getDataset: vi.fn(),
    uploadDataset: vi.fn(),
    deleteDataset: vi.fn(),
    getEdaData: vi.fn(),

    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn(),
    getAvailableModelTypes: vi.fn().mockResolvedValue({}),
    createModel: vi.fn(),
    deleteModel: vi.fn(),

    startTraining: vi.fn(),
    getTrainingStatus: vi.fn(),
    stopTraining: vi.fn(),
    getTrainingMetrics: vi.fn().mockResolvedValue([]),

    predict: vi.fn(),
    explain: vi.fn(),

    getModelPerformance: vi.fn(),
    getConfusionMatrix: vi.fn(),
    compareModels: vi.fn(),
    getParameterComparison: vi.fn().mockResolvedValue([]),

    getNextAnnotationTask: vi.fn(),
    saveAnnotation: vi.fn(),
    skipAnnotation: vi.fn(),

    ...overrides,
  }
}
