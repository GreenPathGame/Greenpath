import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Content Security Policy for the published site (GitHub Pages can't send security headers,
// so it goes in a <meta> tag). It tells the browser to run only this site's own code and to
// talk only to Firebase/Google, which blocks injected scripts and data being sent elsewhere.
// Added to production builds only: the dev server (npm run dev) needs inline scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
  // React inline style attributes + the game's <style> block need 'unsafe-inline' for styles only.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://www.google.com/recaptcha/",
  "frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://greenpath-96558.firebaseapp.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ')

function securityHeaders() {
  return {
    name: 'greenpath-security-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), securityHeaders()],
  base: '/Greenpath/',
  build: {
    // Firebase alone is ~545 kB minified (160 kB gzipped); it's split into its own cached chunk below.
    chunkSizeWarningLimit: 600,
    // No source maps in the published site (keeps the original source out of the download).
    sourcemap: false,
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
