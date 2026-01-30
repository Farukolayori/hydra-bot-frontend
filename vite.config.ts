import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // 1. Import the Tailwind plugin

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),      // 2. Keep React
    tailwindcss(), // 3. Add Tailwind
  ],
})