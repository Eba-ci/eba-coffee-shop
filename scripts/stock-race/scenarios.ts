import prisma from '@/lib/prisma';
import { restockProduct } from '@/lib/menu-mutations';
import { sendOrderToKitchen } from '@/lib/orders/mutations/kitchen';
import { setOrderStatus } from '@/lib/orders/mutations/status';
import { setOrderPayment } from '@/lib/orders/mutations/payment';
import { updateOrderItems } from '@/lib/orders/mutations/items';
import { restoreStockForRefundLines } from '@/lib/refunds/lines';
import { reserveForScheduledOrders } from '@/lib/orders/stock-holds';
import {
  auditSummary,
  burst,
  createOrder,
  item,
  mkCategory,
  mkProduct,
  optStock,
  report,
  rows,
  stockOf,
  tally,
} from './harness';

const N = Number(process.env.RACE_N ?? 100);
/** Prépare des commandes une à une : la numérotation concurrente est mesurée à part (S7). */
async function pre(itemsList: ReturnType<typeof item>[][]) {
  const out = [];
  for (const items of itemsList) out.push(await createOrder(items, false));
  return out;
}
const ok = (results: { ok: boolean }[]) => results.filter((r) => r.ok).length;
const fmt = (t: Record<string, number>) =>
  Object.entries(t)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');

async function s1_lastStockCreation(cat: string) {
  const stock = 3;
  const p = await mkProduct(cat, 'S1', stock);
  const C = 3; // concurrence réaliste : 3 caisses au même instant
  const { results, wallMs } = await burst(
    Array.from({ length: C }, () => () => createOrder([item(p)], true))
  );
  const sold = ok(results),
    left = await stockOf(p.id);
  const good = sold === stock && left === 0;
  report({
    scenario:
      'S1 trois caisses vendent en même temps (création + cuisine, stock 3)',
    concurrency: C,
    wallMs,
    verdict: good ? 'OK' : 'ÉCHEC',
    details: [
      `stock ${stock} → ${left} ; ventes réussies ${sold} (attendu ${stock})`,
      fmt(tally(results)),
    ],
  });
}

async function s1b_lastStockLaunch(cat: string) {
  const stock = 20;
  const p = await mkProduct(cat, 'S1b', stock);
  const created = await pre(Array.from({ length: N }, () => [item(p)]));
  const { results, wallMs } = await burst(
    created.map((o) => () => sendOrderToKitchen(o.id, 'ADMIN'))
  );
  const sold = ok(results),
    left = await stockOf(p.id);
  report({
    scenario:
      'S1b lancement simultané de commandes déjà créées (le dernier stock)',
    concurrency: N,
    wallMs,
    verdict: sold === stock && left === 0 ? 'OK' : 'ÉCHEC',
    details: [
      `stock ${stock} → ${left} ; lancements réussis ${sold} (attendu ${stock})`,
      fmt(tally(results)),
    ],
  });
}

async function s2_doubleLaunch(cat: string) {
  const p = await mkProduct(cat, 'S2', 100);
  const [o] = await pre([[item(p, 3)]]);
  const { results, wallMs } = await burst(
    Array.from({ length: 30 }, () => () => sendOrderToKitchen(o.id, 'ADMIN'))
  );
  const left = await stockOf(p.id);
  report({
    scenario:
      'S2 même commande lancée 30 fois en même temps (double clic / deux écrans)',
    concurrency: 30,
    wallMs,
    verdict: left === 97 ? 'OK' : 'ÉCHEC',
    details: [
      `stock 100 → ${left} (attendu 97 : décompté UNE seule fois)`,
      fmt(tally(results)),
    ],
  });
}

async function s3_crossOrderDeadlock(cat: string) {
  const a = await mkProduct(cat, 'S3A', 100000),
    b = await mkProduct(cat, 'S3B', 100000);
  const half = Math.floor(N / 2);
  const ab = await pre(Array.from({ length: half }, () => [item(a), item(b)]));
  const ba = await pre(Array.from({ length: half }, () => [item(b), item(a)]));
  const tasks = [...ab, ...ba].map(
    (o) => () => sendOrderToKitchen(o.id, 'ADMIN')
  );
  const { results, wallMs } = await burst(tasks);
  const sold = ok(results),
    [sa, sb] = [await stockOf(a.id), await stockOf(b.id)];
  const good =
    sold === half * 2 && sa === 100000 - sold && sb === 100000 - sold;
  report({
    scenario:
      "S3 commandes à articles dans l'ordre inverse (risque d'interblocage)",
    concurrency: tasks.length,
    wallMs,
    verdict: good ? 'OK' : 'ÉCHEC',
    details: [
      `réussies ${sold}/${tasks.length} ; stock A ${sa}, B ${sb} (attendu ${100000 - sold} chacun)`,
      fmt(tally(results)),
    ],
  });
}

async function s4_flavors(cat: string) {
  const p = await mkProduct(cat, 'S4', 100000, [
    ['F1', 10],
    ['F2', 10],
    ['F3', 10],
  ]);
  const names = ['F1', 'F2', 'F3'];
  const created = await pre(
    Array.from({ length: 90 }, (_, i) => [item(p, 1, names[i % 3])])
  );
  const tasks = created.map((o) => () => sendOrderToKitchen(o.id, 'ADMIN'));
  const { results, wallMs } = await burst(tasks);
  const sold = ok(results);
  const left = await Promise.all(names.map((n) => optStock(p.options[n])));
  const ps = await stockOf(p.id);
  const good =
    left.every((x) => x === 0) && sold === 30 && ps === 100000 - sold;
  report({
    scenario: 'S4 goûts : 90 commandes sur 3 goûts à 10 en stock',
    concurrency: tasks.length,
    wallMs,
    verdict: good ? 'OK' : 'ÉCHEC',
    details: [
      `ventes réussies ${sold} (attendu 30) ; goûts restants ${left.join('/')} (attendu 0/0/0) ; produit ${ps} (attendu ${100000 - sold})`,
      fmt(tally(results)),
    ],
  });
}

async function s5_restockWhileSelling(cat: string) {
  const p = await mkProduct(cat, 'S5', 50);
  const created = await pre(Array.from({ length: N }, () => [item(p)]));
  const sells = created.map((o) => () => sendOrderToKitchen(o.id, 'ADMIN'));
  const restocks = Array.from(
    { length: 10 },
    () => () => restockProduct(p.id, 5, { reserveForScheduled: false })
  );
  const { results, wallMs } = await burst([...sells, ...restocks]);
  const sold = results.slice(0, N).filter((r) => r.ok).length,
    restocked = results.slice(N).filter((r) => r.ok).length;
  const left = await stockOf(p.id),
    expected = 50 + 5 * restocked - sold;
  report({
    scenario: 'S5 ventes pendant des réapprovisionnements',
    concurrency: N + 10,
    wallMs,
    verdict: left === expected && (left ?? 0) >= 0 ? 'OK' : 'ÉCHEC',
    details: [
      `50 + ${restocked}×5 − ${sold} ventes = ${expected} attendu ; stock réel ${left}`,
      fmt(tally(results)),
    ],
  });
}

async function s6_cancelVsLaunch(cat: string) {
  const p = await mkProduct(cat, 'S6', 1000);
  const orders = await pre(Array.from({ length: 40 }, () => [item(p)]));
  const tasks = orders.flatMap((o) => [
    () => setOrderStatus(o.id, 'CANCELLED', 'ADMIN'),
    () => sendOrderToKitchen(o.id, 'ADMIN'),
  ]);
  const { results, wallMs } = await burst(tasks);
  const rows = await prisma.order.findMany({
    where: { id: { in: orders.map((o) => o.id) } },
    select: { status: true, stockReservedAt: true },
  });
  const reserved = rows.filter((r) => r.stockReservedAt).length,
    left = await stockOf(p.id);
  const incoherent = rows.filter(
    (r) => r.status === 'PREPARING' && !r.stockReservedAt
  ).length;
  report({
    scenario: 'S6 annulation et lancement simultanés de la même commande',
    concurrency: tasks.length,
    wallMs,
    verdict: left === 1000 - reserved && incoherent === 0 ? 'OK' : 'ÉCHEC',
    details: [
      `commandes décomptées ${reserved}/40 ; stock ${left} (attendu ${1000 - reserved}) ; « en cuisine » sans décompte : ${incoherent}`,
      `statuts finaux : ${fmt(Object.fromEntries(Object.entries(rows.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {}))))}`,
      fmt(tally(results)),
    ],
  });
}

async function s7_numbering(cat: string) {
  const p = await mkProduct(cat, 'S7', null);
  const lines: string[] = [];
  let worst = 100,
    wall = 0;
  for (const c of [2, 3, 4, 5, 8, 10, 20, 50]) {
    let created = 0,
      total = 0;
    for (let round = 0; round < 5; round++) {
      const { results, wallMs } = await burst(
        Array.from({ length: c }, () => () => createOrder([item(p)], false))
      );
      created += ok(results);
      total += c;
      wall += wallMs;
    }
    const pct = Math.round((created / total) * 100);
    worst = Math.min(worst, pct);
    lines.push(
      `${String(c).padStart(2)} créations simultanées : ${created}/${total} réussies (${pct} %)`
    );
  }
  report({
    scenario:
      'S7 numérotation du jour : combien de commandes se perdent selon la charge',
    concurrency: 50,
    wallMs: wall,
    verdict: worst === 100 ? 'OK' : 'ÉCHEC',
    details: lines,
  });
}

async function s8_payVsLaunch(cat: string) {
  const p = await mkProduct(cat, 'S8', 1000);
  const orders = await pre(Array.from({ length: 40 }, () => [item(p)]));
  const pay = [{ mode: 'CASH' as const, amount: 500 }];
  const tasks = orders.flatMap((o) => [
    () => setOrderPayment(o.id, true, pay as never, null),
    () => sendOrderToKitchen(o.id, 'ADMIN'),
  ]);
  const { results, wallMs } = await burst(tasks);
  const left = await stockOf(p.id);
  const rows = await prisma.order.findMany({
    where: { id: { in: orders.map((o) => o.id) } },
    select: { stockReservedAt: true },
  });
  const reserved = rows.filter((r) => r.stockReservedAt).length;
  report({
    scenario:
      'S8 encaissement et envoi en cuisine simultanés de la même commande',
    concurrency: tasks.length,
    wallMs,
    verdict: left === 1000 - reserved ? 'OK' : 'ÉCHEC',
    details: [
      `commandes décomptées ${reserved}/40 ; stock ${left} (attendu ${1000 - reserved}) → ${left === 1000 - reserved ? 'décompté une seule fois' : 'DOUBLE ou MANQUANT'}`,
      fmt(tally(results)),
    ],
  });
}

async function s9_editVsLaunch(cat: string) {
  const a = await mkProduct(cat, 'S9A', 100000),
    b = await mkProduct(cat, 'S9B', 100000);
  const orders = await pre(
    Array.from({ length: 40 }, () => [item(a, 2), item(b, 1)])
  );
  const tasks = orders.flatMap((o, i) => [
    () =>
      updateOrderItems(
        o.id,
        i % 2 ? [item(b, 3), item(a, 1)] : [item(a, 1), item(b, 3)]
      ),
    () => sendOrderToKitchen(o.id, 'ADMIN'),
  ]);
  const { results, wallMs } = await burst(tasks);
  const au = await auditSummary();
  report({
    scenario: 'S9 modification des articles et envoi en cuisine simultanés',
    concurrency: tasks.length,
    wallMs,
    verdict:
      au.defects === 0 &&
      au.drifts === 0 &&
      !results.some(
        (r) => r.kind.startsWith('DEADLOCK') || r.kind.startsWith('ERREUR')
      )
        ? 'OK'
        : 'ÉCHEC',
    details: [
      `audit : ${au.defects} défauts, ${au.drifts} écarts avec le journal`,
      fmt(tally(results)),
    ],
  });
}

async function s10_refundRestockCross(cat: string) {
  const a = await mkProduct(cat, 'S10A', 1000),
    b = await mkProduct(cat, 'S10B', 1000);
  const o = (await pre([[item(a), item(b)]]))[0];
  const L = (p: typeof a) => ({
    productId: p.id,
    kind: 'PRODUCT' as const,
    groupName: null,
    optionName: null,
    quantity: 1,
  });
  const tasks = Array.from(
    { length: 60 },
    (_, i) => () =>
      prisma.$transaction((tx) =>
        restoreStockForRefundLines(tx, i % 2 ? [L(b), L(a)] : [L(a), L(b)], {
          orderId: o.id,
        })
      )
  );
  const { results, wallMs } = await burst(tasks);
  const [sa, sb] = [await stockOf(a.id), await stockOf(b.id)];
  report({
    scenario: 'S10 remises en stock de remboursements croisées (A,B / B,A)',
    concurrency: tasks.length,
    wallMs,
    verdict: ok(results) === 60 && sa === 1060 && sb === 1060 ? 'OK' : 'ÉCHEC',
    details: [
      `stock A ${sa}, B ${sb} (attendu 1060 chacun)`,
      fmt(tally(results)),
    ],
  });
}

async function s11_holds(cat: string) {
  const p = await mkProduct(cat, 'S11', 10);
  const orders = await pre(Array.from({ length: 30 }, () => [item(p)]));
  const soon = new Date(Date.now() + 60_000);
  await prisma.order.updateMany({
    where: { id: { in: orders.map((o) => o.id) } },
    data: { isPaid: true, paidAt: new Date(), pickupTime: soon },
  });
  const tasks = [
    ...Array.from({ length: 10 }, () => () => reserveForScheduledOrders()),
    ...Array.from(
      { length: 5 },
      () => () => restockProduct(p.id, 2, { reserveForScheduled: false })
    ),
    ...orders.slice(0, 10).map((o) => () => sendOrderToKitchen(o.id, 'ADMIN')),
  ];
  const { results, wallMs } = await burst(tasks);
  await reserveForScheduledOrders();
  const restocks = results.slice(10, 15).filter((r) => r.ok).length;
  const holds =
    (
      await prisma.orderStockHold.aggregate({
        where: { resourceId: p.id },
        _sum: { quantity: true },
      })
    )._sum.quantity ?? 0;
  const launched = await prisma.order.count({
    where: {
      id: { in: orders.map((x) => x.id) },
      stockReservedAt: { not: null },
    },
  });
  const stock = (await stockOf(p.id)) ?? 0;
  const initial = 10 + restocks * 2;
  report({
    scenario:
      'S11 réservations des programmées + lancements + réappros simultanés',
    concurrency: tasks.length,
    wallMs,
    verdict:
      stock + holds + launched === initial && stock >= 0 ? 'OK' : 'ÉCHEC',
    details: [
      `stock ${stock} + réservé ${holds} + lancé ${launched} = ${stock + holds + launched} (attendu ${initial} = 10 + ${restocks}×2)`,
      fmt(tally(results)),
    ],
  });
}

export async function runAll(): Promise<number> {
  const cat = (await mkCategory()).id;
  let crashed = 0;
  const only = process.env.RACE_ONLY?.split(',');
  const all = [
    s1_lastStockCreation,
    s1b_lastStockLaunch,
    s2_doubleLaunch,
    s3_crossOrderDeadlock,
    s4_flavors,
    s5_restockWhileSelling,
    s6_cancelVsLaunch,
    s7_numbering,
    s8_payVsLaunch,
    s9_editVsLaunch,
    s10_refundRestockCross,
    s11_holds,
  ];
  for (const s of all.filter(
    (f) => !only || only.some((o) => f.name.startsWith(o))
  )) {
    try {
      await s(cat);
    } catch (e) {
      crashed++;
      console.log(
        `\n💥 ${s.name} a planté :`,
        e instanceof Error ? e.message.split('\n').slice(-2).join(' ') : e
      );
    }
  }
  const failed = rows.filter((r) => r.verdict !== 'OK').length + crashed;
  const a = await auditSummary();
  console.log(
    `\n— Audit du dépôt après toutes les charges : ${a.examined} commandes examinées, ${a.defects} défauts, ${a.drifts} écarts avec le journal, ${a.negatives} stocks négatifs`
  );
  return failed + (a.defects + a.drifts + a.negatives > 0 ? 1 : 0);
}
