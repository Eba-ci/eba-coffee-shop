'use client';

// Fiche produit en onglets. La validation est faite en JS (pas `required` natif :
// un champ invalide dans un onglet masqué bloquerait sans message) ; l'onglet
// fautif est ouvert automatiquement. Règles : `lib/menu/product-form-completeness.ts`.

import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/(dashboard)/confirm-dialog';
import type { ScheduleOption } from '@/components/(dashboard)/schedule-field';
import { SupplementsEditor } from '@/components/(dashboard)/supplements-editor';
import { BadgesField } from './_components/badges-field';
import { ActionBar } from './_components/form/action-bar';
import { CoutsTab } from './_components/form/couts-tab';
import { DisponibiliteTab } from './_components/form/disponibilite-tab';
import { EssentielTab } from './_components/form/essentiel-tab';
import { TabTrigger } from './_components/form/tab-trigger';
import type { ProductFormInitial } from './_components/form/types';
import { useProductForm } from './_components/form/use-product-form';

export type { ProductFormInitial } from './_components/form/types';

export function ProductForm({
  categoryId,
  initial,
  schedules,
  defaultTab,
  statsSlot,
  stockSlot,
}: {
  categoryId: string;
  initial?: ProductFormInitial;
  schedules: ScheduleOption[];
  /** Onglet initial, lu dans l'URL (`?onglet=`) par la page. */
  defaultTab?: string;
  /** Contenu de l'onglet « Statistiques », rendu côté serveur ; absent en création. */
  statsSlot?: ReactNode;
  /** Contenu de l'onglet « Stock » (commandes et mouvements), rendu côté serveur ; absent en création. */
  stockSlot?: ReactNode;
}) {
  const form = useProductForm({
    categoryId,
    initial,
    defaultTab,
    hasStats: Boolean(statsSlot),
    hasStock: Boolean(stockSlot),
  });
  const {
    tab,
    changeTab,
    errorTabs,
    costHint,
    groups,
    setGroups,
    supplementIssues,
    showSupplementErrors,
    featured,
    featuredOrder,
    featuredBadge,
    setFeatured,
    setFeaturedOrder,
    setFeaturedBadge,
  } = form;

  return (
    <>
      <form onSubmit={form.handleSubmit} className="space-y-4">
        <Tabs value={tab} onValueChange={changeTab}>
          {/* Le repli à la ligne exige de lever le `h-9` fixe, avec le même variant que la base pour que tailwind-merge l'emporte. */}
          <TabsList className="max-w-full flex-wrap group-data-[orientation=horizontal]/tabs:h-auto">
            <TabTrigger value="essentiel" hasError={errorTabs.has('essentiel')}>
              Essentiel
            </TabTrigger>
            <TabTrigger
              value="couts"
              hasError={errorTabs.has('couts')}
              hasWarning={Boolean(costHint)}
            >
              Coûts &amp; stock
            </TabTrigger>
            <TabTrigger value="disponibilite" hasError={false} optional>
              Disponibilité
            </TabTrigger>
            <TabTrigger
              value="supplements"
              hasError={showSupplementErrors && supplementIssues.size > 0}
              optional={groups.length === 0}
            >
              Suppléments
              {groups.length > 0 && (
                <span className="text-muted-foreground">({groups.length})</span>
              )}
            </TabTrigger>
            <TabTrigger value="mise-en-avant" hasError={false} optional>
              Mise en avant
            </TabTrigger>
            {statsSlot && (
              <TabTrigger value="stats" hasError={false}>
                Statistiques
              </TabTrigger>
            )}
            {stockSlot && (
              <TabTrigger value="stock" hasError={false}>
                Stock
              </TabTrigger>
            )}
          </TabsList>

          <EssentielTab form={form} />
          <CoutsTab form={form} />
          <DisponibiliteTab
            form={form}
            schedules={schedules}
            initial={initial}
          />

          <TabsContent value="supplements">
            <SupplementsEditor
              groups={groups}
              onChange={setGroups}
              issues={showSupplementErrors ? supplementIssues : undefined}
            />
          </TabsContent>

          <TabsContent value="mise-en-avant">
            <BadgesField
              featured={featured}
              featuredOrder={featuredOrder}
              featuredBadge={featuredBadge}
              onFeaturedChange={setFeatured}
              onFeaturedOrderChange={setFeaturedOrder}
              onFeaturedBadgeChange={setFeaturedBadge}
            />
          </TabsContent>

          {statsSlot && <TabsContent value="stats">{statsSlot}</TabsContent>}
          {stockSlot && <TabsContent value="stock">{stockSlot}</TabsContent>}
        </Tabs>

        <ActionBar form={form} />
      </form>

      <ConfirmDialog
        open={form.confirmLeave}
        onOpenChange={form.setConfirmLeave}
        title="Abandonner les modifications ?"
        description="Les changements de cette fiche n’ont pas été enregistrés. Ils seront perdus."
        confirmLabel="Abandonner"
        cancelLabel="Continuer l’édition"
        destructive
        onConfirm={form.leave}
      />
    </>
  );
}
