import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app-[hash].js',
        chunkFileNames: 'assets/app-[hash].js',
        assetFileNames: 'assets/app-[hash][extname]',
        // React zmienia sie rzadko, kod aplikacji codziennie. Osobny chunk sprawia,
        // ze po deployu przegladarka dociaga tylko to, co faktycznie sie zmienilo.
        // Zysk pojawia sie dopiero przy dlugim cache na /assets/* (vercel.json).
        manualChunks: {
          react: ['react', 'react-dom']
        }
      }
    }
  }
})
