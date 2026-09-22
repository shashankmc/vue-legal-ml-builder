import { createApp } from 'vue'
import App from './App.vue'
import { VueLegalMlBuilderPlugin } from '../index'
import { createMockAdapter } from './mockAdapter'

createApp(App)
  .use(VueLegalMlBuilderPlugin, { adapter: createMockAdapter() })
  .mount('#app')
