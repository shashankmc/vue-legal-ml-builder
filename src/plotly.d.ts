declare module 'plotly.js-basic-dist' {
  const Plotly: {
    newPlot(el: HTMLElement, data: unknown, layout: unknown, config?: unknown): Promise<void>
    react(el: HTMLElement, data: unknown, layout: unknown, config?: unknown): Promise<void>
    purge(el: HTMLElement): void
  }
  export default Plotly
}
