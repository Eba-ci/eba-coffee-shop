// lib/app-env.ts
//
// Environnement de staging (`APP_ENV=staging`). Absent ou autre valeur = production
// : tout ce qui est ici est alors inerte. En staging, les effets de bord vers
// l'extérieur sont coupés (e-mails) et la connexion par code utilise une valeur
// fixe, car la base est une copie anonymisée de la production.
//
// Lecture directe de `process.env` (comme lib/auth.ts) : disponible tel quel dans
// le serveur standalone, sans passer par varlock.

/** Code de connexion accepté en staging. Jamais utilisé hors `APP_ENV=staging`. */
export const STAGING_OTP = '000000';

export function isStaging(): boolean {
  return process.env.APP_ENV === 'staging';
}

/**
 * Refuse de démarrer un staging branché sur autre chose qu'une base de staging :
 * avec l'OTP fixe, une base de production exposée ouvrirait l'administration à
 * quiconque atteint le site. Le nom de la base doit contenir « staging ».
 */
export function assertStagingDatabase(databaseUrl = process.env.DATABASE_URL) {
  if (!isStaging()) return;
  let dbName = '';
  try {
    dbName = new URL(databaseUrl ?? '').pathname.replace(/^\//, '');
  } catch {
    // URL illisible : traitée comme non conforme ci-dessous.
  }
  if (!dbName.toLowerCase().includes('staging')) {
    throw new Error(
      'APP_ENV=staging exige une base dont le nom contient « staging » ' +
        `(reçu : « ${dbName || 'DATABASE_URL invalide'} »). Démarrage refusé.`
    );
  }
}

/**
 * En staging, journalise l'e-mail au lieu de l'envoyer. À appeler en tête de
 * chaque fonction d'envoi : renvoie `true` quand l'envoi doit être ignoré.
 */
export function skipEmailInStaging(label: string, to: string | string[]) {
  if (!isStaging()) return false;
  const recipients = Array.isArray(to) ? to.length : 1;
  console.log(`[staging] e-mail « ${label} » non envoyé (${recipients} dest.)`);
  return true;
}
