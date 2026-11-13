#!/bin/sh
# Applique, AVANT `prisma db push`, les migrations idempotentes du chantier
# « charges fixes + salaires » et de ses compléments (#409, #411, #417, #433).
#
# Pourquoi : `db push` refuse d'ajouter une contrainte UNIQUE sur une table
# existante (`expense.salaryPaymentId`) sans --accept-data-loss, même quand la
# colonne est nouvelle donc vide. Poser la structure ici, avec les migrations
# écrites avec IF NOT EXISTS, évite ce flag : aucune donnée n'est supprimée ni
# modifiée, et `db push` ne trouve alors plus de différence.
#
# Rejouable sans effet (IF NOT EXISTS / blocs EXCEPTION duplicate_object).
set -eu

for dir in \
  20261111090000_add_fixed_cost \
  20261112090000_add_fixed_cost_schedule \
  20261113090000_add_salary_model \
  20261114090000_add_salary_payment_expense_link \
  20261114091000_salary_payment_default_wave \
  20261115090000_add_expense_idempotency_key \
  20261115090000_add_fixed_cost_imported_category \
  20261116090000_drop_recurring_expense; do
  echo "[pre-push] $dir"
  pnpm exec prisma db execute --file "prisma/migrations/$dir/migration.sql"
done
