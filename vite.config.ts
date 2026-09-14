import { resolve } from 'path';

// 可選的前端構建配置：不改變現有直出模式
// - 輸入：根目錄 index.html 與 admin/index.html
// - 輸出：dist/ （與生產無關，預設不被服務端使用）
// - 可選使用：npm run dev:fe / build:fe / preview:fe

export default {
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        // admin 入口已被 .vercelignore 排除，不參與 Vercel 構建
        // admin: resolve(__dirname, 'admin/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
};
