import { createApp, reactive, type Component } from 'vue'

export interface MountedComponent {
  /** Reassigns into the same reactive props object the app was created with. */
  updateProps: (props: Record<string, unknown>) => void
  unmount: () => void
}

/**
 * Mounts a component into a DOM element using *this package's* Vue runtime.
 *
 * Hosts that embed these components in a non-Vue framework (e.g. the SvelteKit
 * app's VueMount bridge) must not `import('vue')` themselves: that can resolve
 * to a different Vue build than the one this package was bundled against, and
 * two Vue instances don't share reactivity — the component mounts but never
 * updates out of its initial state. Routing the mount through this helper
 * guarantees a single runtime. The host still owns the element's lifecycle.
 */
export function mountComponent(
  component: Component,
  el: Element,
  initialProps: Record<string, unknown> = {},
): MountedComponent {
  const props = reactive({ ...initialProps })
  const app = createApp(component, props)
  app.mount(el)

  return {
    updateProps(next) {
      Object.assign(props, next)
    },
    unmount() {
      app.unmount()
    },
  }
}
