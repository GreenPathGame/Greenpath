import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/Greenpath/',
  build: {
    // Firebase alone is ~545 kB minified (160 kB gzipped); it's split into its own cached chunk below.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Keep the big, rarely-changing libraries in their own cached chunks.
        codeSplitting: {
          groups: [
            { name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
