import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
export default defineConfig({
    plugins: [vinext()],
    css: { postcss: { plugins: [tailwindcss()] } },
    ssr: { external: ['node:sqlite'] },
});
