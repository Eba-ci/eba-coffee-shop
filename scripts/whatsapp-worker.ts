// pnpm whatsapp:worker — traite la file des messages WhatsApp (Redis requis).

import prisma from '@/lib/prisma';
import { startWhatsAppWorker } from '@/lib/whatsapp/worker';

const worker = startWhatsAppWorker();
console.log('[whatsapp-worker] démarré');

async function stop() {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
