import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Aresa Visor DXF',
        short_name: 'AresaDXF',
        description: 'Visor y medidor de archivos DXF de Aresa',
        lang: 'es',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        id: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-512.png', sizes: 'any', type: 'image/png' }
        ],
        file_handlers: [
          {
            action: '/',
            name: 'Abrir archivo DXF',
            accept: {
              'application/dxf': ['.dxf'],
              'image/vnd.dxf': ['.dxf'],
              'application/octet-stream': ['.dxf']
            },
            launch_type: 'single-client'
          }
        ]
      }
    })
  ]
});