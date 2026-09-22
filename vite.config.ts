import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

const isLib = process.env.BUILD_MODE === 'lib'

export default defineConfig({
  plugins: [
    vue(),
    // Only emit .d.ts files during library builds, not during demo dev/build.
    ...(isLib ? [dts({ include: ['src'], insertTypesEntry: true, exclude: ['src/demo'] })] : []),
  ],
  test: {
    environment: 'jsdom',
  },
  build: isLib
    ? {
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          name: 'VueLegalMlBuilder',
          fileName: (format) => `vue-legal-ml-builder.${format}.js`,
        },
        rollupOptions: {
          external: ['vue', 'plotly.js-basic-dist'],
          output: {
            globals: { vue: 'Vue', 'plotly.js-basic-dist': 'Plotly' },
            exports: 'named',
          },
        },
      }
    : {
        // Demo build: standard SPA output for previewing or hosting the demo.
        outDir: 'dist-demo',
        rollupOptions: {
          input: resolve(__dirname, 'index.html'),
        },
      },
})
