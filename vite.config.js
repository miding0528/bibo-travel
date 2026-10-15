import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages：https://miding0528.github.io/bibo-travel/
const base = '/bibo-travel/';

export default defineConfig({
  base,
  build: {
    assetsDir: 'static',        // 避免與 public/assets（景點圖片）撞名
    assetsInlineLimit: 0,       // 字型、圖示一律輸出成檔案，不內嵌成 data: URI
    target: 'es2019',
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        id: base,
        name: 'BIBO Travel',
        short_name: 'BIBO',
        description: '西安、洛陽、徐州、南京旅遊書',
        lang: 'zh-TW',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        background_color: '#fcf9f8',
        theme_color: '#fcf9f8',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,woff2,png,jpg,jpeg,webp,svg,ico,webmanifest}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: base + 'index.html',
        /* Supabase（REST / Auth / Realtime）一律走網路，絕不進快取 */
        runtimeCaching: [
          { urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'), handler: 'NetworkOnly' },
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
