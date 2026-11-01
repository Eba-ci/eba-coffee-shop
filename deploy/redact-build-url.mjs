// Retire du build l'URL de base figée par varlock (le vrai DATABASE_URL est résolu au démarrage).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.DATABASE_URL;
const root = process.argv[2] ?? '.next';
if (!url) throw new Error('DATABASE_URL absent');

const password = decodeURIComponent(new URL(url).password);
const needles = [url, ...(password ? [password] : [])];
let redacted = 0;

function walk(dir, verify) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'cache' || entry.isSymbolicLink()) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, verify);
      continue;
    }
    const content = readFileSync(path);
    if (!needles.some((needle) => content.includes(needle))) continue;
    if (verify) throw new Error(`Secret encore présent dans ${path}`);
    let text = content.toString('utf8');
    text = text.split(url).join('postgresql://redacted');
    if (password) text = text.split(password).join('redacted');
    writeFileSync(path, text);
    redacted += 1;
  }
}

walk(root, false);
walk(root, true);
console.log(`[redact] ${redacted} fichier(s) nettoyé(s)`);
