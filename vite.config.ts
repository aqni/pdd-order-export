import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import { getUserscriptVersion } from './vite.version.ts';

export default defineConfig(({ mode }) => ({
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    minify: false,
    rolldownOptions: { output: { comments: true } },
  },
  // Keep monkey last if other Vite plugins are added.
  plugins: [
    monkey({
      server: { open: mode === 'test' ? false : undefined },
      entry: 'src/main.ts',
      userscript: {
        version: getUserscriptVersion(process.cwd()),
        name: '拼多多订单导出工具',
        namespace: 'http://tampermonkey.net/',
        author: 'aqnin@outlook.com',
        homepageURL: 'https://github.com/aqni/pdd-order-export',
        match: ['https://mobile.pinduoduo.com/orders.html*'],
        grant: 'none',
        'run-at': 'document-end',
        noframes: true,
      },
    }),
  ],
}));
