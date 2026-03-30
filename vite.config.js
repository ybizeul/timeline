import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

let version = process.env.APP_VERSION || ''
if (!version) {
  try { version = execSync('git describe --tags --always', { encoding: 'utf-8' }).trim() }
  catch { version = 'dev' }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_URL || '/',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
})
