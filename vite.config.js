import { defineConfig } from 'vite';
import { resolve } from 'path';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.js',
      userscript: {
        name: 'DOM事件追踪器',
        namespace: 'http://tampermonkey.net/',
        version: '0.1',
        description: '追踪DOM元素的事件冒泡、捕获和调用堆栈',
        author: 'FXS',
        match: ['*://*/*'],
        grant: [],
      },
      build: {
        fileName: 'dom-event-tracker.user.js',
      },
    }),
  ],
  build: {
    rollupOptions: {
      // 优化 treeshaking
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false
      }
    },
    // 减小打包体积
    minify: true,
    target: 'es2015'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
