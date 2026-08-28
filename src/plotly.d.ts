declare module 'plotly.js-dist' {
  const Plotly: {
    newPlot(el: HTMLElement, data: unknown, layout: unknown, config?: unknown): Promise<void>
    purge(el: HTMLElement): void
  }
  export default Plotly
}
