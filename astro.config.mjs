// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import * as dotenv from 'dotenv';
import node from '@astrojs/node';

// Load environment variables from .env file
dotenv.config();

// https://astro.build/config
export default defineConfig({
  output: "server", // Use server-side rendering for environment variable access
  adapter: node({
    mode: "standalone" // Use standalone mode for most hosting providers
  }),
  // No integrations needed
  server: {
    host: true // Expose to all network interfaces
  },
  vite: {
    plugins: [tailwindcss()],
    // Make environment variables available to client-side code with explicit values for debugging
    define: {
      'import.meta.env.NOCODB_API_URL': JSON.stringify(process.env.NOCODB_API_URL || ''),
      'import.meta.env.NOCODB_API_TOKEN': JSON.stringify(process.env.NOCODB_API_TOKEN || '')
    }
  }
});
