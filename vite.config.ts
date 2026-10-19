import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  const rawBase = process.env.BASE_PATH || './';
  const basePath = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

  // Start URL, Scope, and Icons must match basePath for correct PWA installability on GitHub Pages & preview
  const manifestStartUrl = basePath === './' ? './' : basePath;
  const manifestScope = basePath === './' ? './' : basePath;
  const iconPrefix = basePath === './' ? '' : basePath;

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'icon.svg',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: 'clearcut-studio-app',
          name: 'ClearCut STUDIO - Offline Background Remover & Icon Studio',
          short_name: 'ClearCut',
          description: 'Strip backgrounds locally with client-side AI. Crop, resize, WebP compression, and .ico export.',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: manifestStartUrl,
          scope: manifestScope,
          icons: [
            {
              src: `${iconPrefix}pwa-192x192.png`,
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${iconPrefix}pwa-512x512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${iconPrefix}pwa-maskable-512x512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,wasm}'],
          maximumFileSizeToCacheInBytes: 35 * 1024 * 1024, // 35MB for onnx wasm precaching
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/staticimgly\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'imgly-ai-models-cache',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'cdn-libraries-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    optimizeDeps: {
      include: ['@imgly/background-removal', 'onnxruntime-web', 'onnxruntime-web/webgpu'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
