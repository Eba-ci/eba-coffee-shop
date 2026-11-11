// lib/salaries/errors.ts

/**
 * Conflit d'idempotence : une clé déjà utilisée est rejouée pour un versement
 * dont le contenu (employé, date, mois, montant, type) diffère de l'existant.
 */
export class SalaryIdempotencyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SalaryIdempotencyConflictError';
  }
}
