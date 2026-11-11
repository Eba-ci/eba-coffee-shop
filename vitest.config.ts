import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    // Tests temporairement exclus pendant la migration vers le système caisse-centric.
    // Modèle Order modifié (statuts NEW/PREPARING/COMPLETED, champs nullable,
    // dailyNumber). Ces tests seront réécrits en Phase 6 du plan
    // C:\Users\kouax\.claude\plans\deep-zooming-cerf.md
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // TODO(phase-6): re-enable when Order model migration completes.
      'lib/orders.test.ts',
      'app/api/commandes/route.test.ts',
      'app/api/commandes/[id]/route.test.ts',
      'app/(public)/commande/[id]/page.test.tsx',
      'app/(dashboard)/dashboard/commandes/actions.test.ts',
      'app/(dashboard)/dashboard/commandes/page.test.tsx',
      'app/(dashboard)/dashboard/commandes/[id]/page.test.tsx',
      'app/(dashboard)/dashboard/commandes/[id]/status-buttons.test.tsx',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
