import { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { parseDateOnlyToUTC } from '@/lib/timezone';
import {
  getNextReceiptSeq,
  receiptPeriodFromDate,
  formatReceiptNo,
  RECEIPT_NUMBER_MAX_RETRIES,
} from '@/lib/expense-numbering';
import { assertLinkedPaymentAllowed } from '@/lib/fixed-costs/queries';
import {
  expenseCreateSchema,
  expenseUpdateSchema,
} from '@/lib/schemas/expense';
import {
  expenseItemsInclude,
  createExpenseItems,
  sumExpenseItems,
} from './items';

export async function createExpense(input: unknown, createdById?: string) {
  const data = expenseCreateSchema.parse(input);
  const date = parseDateOnlyToUTC(data.date)!;
  // Numéro de reçu : compteur du mois civil de la dépense. Figé à la création.
  const receiptPeriod = receiptPeriodFromDate(date);

  if (data.items && data.items.length > 0) {
    const sum = sumExpenseItems(data.items);
    if (sum !== data.amount) {
      throw new Error(
        `La somme des lignes (${sum} F) doit égaler le montant de la dépense (${data.amount} F).`
      );
    }
  }

  // Retry sur conflit de l'index unique (receiptPeriod, receiptSeq) en cas de
  // saisies concurrentes sur le même mois.
  for (let attempt = 0; attempt < RECEIPT_NUMBER_MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Paiement lié à une échéance de charge fixe : la charge doit exister,
        // l'échéance doit être réelle, et le cumul ne peut pas la dépasser.
        if (data.fixedCostId && data.dueDate) {
          await assertLinkedPaymentAllowed(
            tx,
            data.fixedCostId,
            data.dueDate,
            data.amount
          );
        }
        const receiptSeq = await getNextReceiptSeq(tx, receiptPeriod);
        const expense = await tx.expense.create({
          data: {
            date,
            amount: data.amount,
            categoryId: data.categoryId,
            paymentMethod: data.paymentMethod ?? 'CASH',
            supplier: data.supplier ?? null,
            note: data.note ?? null,
            receiptUrl: data.receiptUrl ?? null,
            createdById: createdById ?? null,
            // Règlement d'une occurrence de charge fixe (calendrier des
            // paiements) : la dépense porte l'occurrence qu'elle solde.
            fixedCostId: data.fixedCostId ?? null,
            dueDate: data.dueDate ? parseDateOnlyToUTC(data.dueDate) : null,
            receiptPeriod,
            receiptSeq,
            receiptNo: formatReceiptNo(receiptPeriod, receiptSeq),
          },
        });
        if (data.items && data.items.length > 0) {
          await createExpenseItems(tx, expense.id, data.items);
          return tx.expense.findUniqueOrThrow({
            where: { id: expense.id },
            include: expenseItemsInclude,
          });
        }
        return expense;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        attempt < RECEIPT_NUMBER_MAX_RETRIES - 1
      ) {
        continue;
      }
      throw err;
    }
  }

  throw new Error('Impossible de générer un numéro de reçu de dépense');
}

export async function updateExpense(id: string, input: unknown) {
  const data = expenseUpdateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.expense.findUnique({
      where: { id },
      select: { amount: true, _count: { select: { items: true } } },
    });
    if (!existing) throw new Error('Dépense introuvable.');

    const itemsProvided = data.items !== undefined;
    if (
      !itemsProvided &&
      data.amount !== undefined &&
      existing._count.items > 0
    ) {
      throw new Error(
        'Cette dépense est détaillée : modifiez ses lignes (items), ou retirez le détail (items: null) pour changer le montant seul.'
      );
    }

    const expense = await tx.expense.update({
      where: { id },
      data: {
        ...(data.date !== undefined
          ? { date: parseDateOnlyToUTC(data.date)! }
          : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.categoryId !== undefined
          ? { categoryId: data.categoryId }
          : {}),
        ...(data.paymentMethod !== undefined
          ? { paymentMethod: data.paymentMethod }
          : {}),
        ...(data.supplier !== undefined ? { supplier: data.supplier } : {}),
        ...(data.note !== undefined ? { note: data.note } : {}),
        ...(data.receiptUrl !== undefined
          ? { receiptUrl: data.receiptUrl }
          : {}),
      },
    });

    if (data.items === null) {
      await tx.expenseItem.deleteMany({ where: { expenseId: id } });
      return expense;
    }

    if (data.items) {
      const finalAmount = data.amount ?? existing.amount;
      const sum = sumExpenseItems(data.items);
      if (sum !== finalAmount) {
        throw new Error(
          `La somme des lignes (${sum} F) doit égaler le montant de la dépense (${finalAmount} F).`
        );
      }
      await tx.expenseItem.deleteMany({ where: { expenseId: id } });
      await createExpenseItems(tx, id, data.items);
      return tx.expense.findUniqueOrThrow({
        where: { id },
        include: expenseItemsInclude,
      });
    }

    return expense;
  });
}

export async function deleteExpense(id: string) {
  return prisma.expense.delete({ where: { id } });
}
