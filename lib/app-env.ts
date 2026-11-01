// Staging (`APP_ENV=staging`) : e-mails coupés, code de connexion fixe. Inerte sinon.

export const STAGING_OTP = '000000';

export function isStaging(): boolean {
  return process.env.APP_ENV === 'staging';
}

// Avec l'OTP fixe, une base de prod ouvrirait l'administration à tous : le nom doit contenir « staging ».
export function assertStagingDatabase(databaseUrl = process.env.DATABASE_URL) {
  if (!isStaging()) return;
  let dbName = '';
  try {
    dbName = new URL(databaseUrl ?? '').pathname.replace(/^\//, '');
  } catch {
    dbName = '';
  }
  if (!dbName.toLowerCase().includes('staging')) {
    throw new Error(
      'APP_ENV=staging exige une base dont le nom contient « staging » ' +
        `(reçu : « ${dbName || 'DATABASE_URL invalide'} »). Démarrage refusé.`
    );
  }
}

// Renvoie `true` quand l'envoi doit être ignoré (staging).
export function skipEmailInStaging(label: string, to: string | string[]) {
  if (!isStaging()) return false;
  const recipients = Array.isArray(to) ? to.length : 1;
  console.log(`[staging] e-mail « ${label} » non envoyé (${recipients} dest.)`);
  return true;
}
