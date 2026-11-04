import { describe, expectTypeOf, it } from 'vitest'
import type { MLAdapter, ModelParameters, MonitoringSettings } from '../src'

describe('MonitoringSettings', () => {
  it('names every setting a run can override', () => {
    expectTypeOf<keyof MonitoringSettings>().toEqualTypeOf<
      | 'log_every_n_steps'
      | 'eval_strategy'
      | 'eval_steps'
      | 'include'
      | 'exclude'
      | 'learning_curve'
      | 'system_metrics'
      | 'flush_every_points'
      | 'flush_every_seconds'
    >()
    expectTypeOf<MonitoringSettings['eval_strategy']>().toEqualTypeOf<'epoch' | 'steps'>()
  })

  it('goes under parameters.monitoring, each setting optional', () => {
    expectTypeOf<{ monitoring: { eval_strategy: 'steps'; eval_steps: 50 } }>().toMatchTypeOf<ModelParameters>()
    expectTypeOf<{ monitoring: { eval_strategy: 'hourly' } }>().not.toMatchTypeOf<ModelParameters>()
    expectTypeOf<Parameters<MLAdapter['createModel']>[0]['parameters']>().toEqualTypeOf<ModelParameters>()
  })
})
