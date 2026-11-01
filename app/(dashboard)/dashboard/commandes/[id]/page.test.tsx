// app/(dashboard)/dashboard/commandes/[id]/page.test.tsx
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/orders', () => ({
  getOrder: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}));

vi.mock('./_components/order-stock-card', () => ({
  OrderStockCard: () => null,
}));

vi.mock('./status-buttons', () => ({
  StatusButtons: ({ currentStatus }: { currentStatus: string }) =>
    React.createElement('div', { 'data-status': currentStatus }),
}));

import { getOrder } from '@/lib/orders';
import CommandeDetailPage from './page';

const mockGetOrder = getOrder as MockedFunction<typeof getOrder>;

const mockOrder = {
  id: 'o1',
  reference: 'EBA-20260511-AB12',
  customerName: 'Kofi',
  customerPhone: '07001234',
  pickupTime: new Date('2026-05-11T14:30:00'),
  items: [
    {
      cartId: 'c1',
      productId: 'p1',
      productName: 'Cappuccino',
      basePrice: 3500,
      quantity: 2,
      supplements: [
        { groupName: 'Lait', optionName: 'Lait de soja', price: 500 },
      ],
    },
  ],
  total: 8000,
  status: 'PENDING' as const,
  note: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CommandeDetailPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('affiche les articles avec les suppléments', async () => {
    mockGetOrder.mockResolvedValue(mockOrder as never);
    const element = await CommandeDetailPage({
      params: Promise.resolve({ id: 'o1' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('Cappuccino');
    expect(html).toContain('Lait de soja');
    expect(html).toContain('x2');
  });

  it('passe le statut courant aux StatusButtons', async () => {
    mockGetOrder.mockResolvedValue(mockOrder as never);
    const element = await CommandeDetailPage({
      params: Promise.resolve({ id: 'o1' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-status="PENDING"');
  });

  it('retourne 404 pour un id inexistant', async () => {
    mockGetOrder.mockResolvedValue(null);
    await expect(
      CommandeDetailPage({ params: Promise.resolve({ id: 'inexistant' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('affiche la référence et les infos client', async () => {
    mockGetOrder.mockResolvedValue(mockOrder as never);
    const element = await CommandeDetailPage({
      params: Promise.resolve({ id: 'o1' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('EBA-20260511-AB12');
    expect(html).toContain('Kofi');
    expect(html).toContain('07001234');
  });

  it('affiche le total formaté en FCFA', async () => {
    mockGetOrder.mockResolvedValue(mockOrder as never);
    const element = await CommandeDetailPage({
      params: Promise.resolve({ id: 'o1' }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('FCFA');
    expect(html).toMatch(/8.000/);
  });
});
