/** Self-scheduling, visibility-aware polling loop shared by the training/model
 * composables. Unlike `setInterval(async ...)`, the next tick is scheduled only
 * after the previous one settles — so a request slower than the interval can
 * never overlap its successor. Tick errors are swallowed (the loop keeps
 * going), and the loop parks while the tab is hidden, resuming with an
 * immediate tick when it becomes visible. */

export interface PollLoop {
  start(): void
  stop(): void
}

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden === true
}

export function createPollLoop(tick: () => void | Promise<void>, intervalMs: number): PollLoop {
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = true
  let inFlight = false
  let listening = false

  function onVisibilityChange() {
    if (!stopped && !isHidden() && !inFlight && timer === null) {
      void run()
    }
  }

  function schedule() {
    if (stopped || inFlight || timer !== null || isHidden()) return
    timer = setTimeout(() => {
      void run()
    }, intervalMs)
  }

  async function run() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (stopped || inFlight || isHidden()) return
    inFlight = true
    try {
      await tick()
    } catch {
      // transient failure — keep polling
    } finally {
      inFlight = false
    }
    schedule()
  }

  function attach() {
    if (!listening && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
      listening = true
    }
  }

  function detach() {
    if (listening && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      listening = false
    }
  }

  function start() {
    stop()
    stopped = false
    attach()
    schedule()
  }

  function stop() {
    stopped = true
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    detach()
  }

  return { start, stop }
}
