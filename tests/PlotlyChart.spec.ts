import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const plotlyMock = vi.hoisted(() => ({
  newPlot: vi.fn().mockResolvedValue(undefined),
  react: vi.fn().mockResolvedValue(undefined),
  purge: vi.fn(),
}))

vi.mock('plotly.js-basic-dist', () => ({ default: plotlyMock }))

import PlotlyChart from '../src/components/shared/PlotlyChart.vue'

describe('PlotlyChart', () => {
  beforeEach(() => {
    plotlyMock.newPlot.mockClear()
    plotlyMock.react.mockClear()
    plotlyMock.purge.mockClear()
  })

  it('creates the plot exactly once on mount', async () => {
    const wrapper = mount(PlotlyChart, { props: { plotData: { data: [], layout: {} } } })
    await flushPromises()

    expect(plotlyMock.newPlot).toHaveBeenCalledTimes(1)
    expect(plotlyMock.react).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('diffs subsequent data changes with react, never re-creating', async () => {
    const wrapper = mount(PlotlyChart, { props: { plotData: { data: [], layout: {} } } })
    await flushPromises()

    await wrapper.setProps({ plotData: { data: [{ x: [1], y: [2] }], layout: {} } })
    await flushPromises()
    await wrapper.setProps({ plotData: { data: [{ x: [1, 2], y: [2, 3] }], layout: {} } })
    await flushPromises()

    expect(plotlyMock.newPlot).toHaveBeenCalledTimes(1)
    expect(plotlyMock.react).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('purges the element on unmount', async () => {
    const wrapper = mount(PlotlyChart, { props: { plotData: { data: [], layout: {} } } })
    await flushPromises()

    wrapper.unmount()
    expect(plotlyMock.purge).toHaveBeenCalledTimes(1)
  })
})
