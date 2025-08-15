import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ВАЖЛИВО: base './' — щоб у проді шляхи до assets були відносні
export default defineConfig({
  plugins: [react()],
  base: './',
})
