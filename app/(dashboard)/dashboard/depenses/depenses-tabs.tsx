'use client';

import { useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const TAB_VALUES = [
  'apercu',
  'historique',
  'articles',
  'pointmort',
  'paiements',
  'salaires',
] as const;
type TabValue = (typeof TAB_VALUES)[number];

/**
 * Onglets de la page Dépenses. L'onglet actif est reflété dans l'URL (`?tab=`)
 * via l'History API (pas de round-trip serveur) pour survivre aux navigations
 * des filtres (date, catégorie…) qui préservent les search params.
 *
 * `showSalaires` (ADMIN seul) masque l'onglet Salaires aux autres rôles : la
 * page ne lui transmet pas son contenu, et le garde de la section reste posé
 * onglet par onglet.
 */
export function DepensesTabs({
  defaultTab,
  showSalaires = false,
  apercu,
  historique,
  articles,
  pointmort,
  paiements,
  salaires,
}: {
  defaultTab?: string;
  showSalaires?: boolean;
  apercu: ReactNode;
  historique: ReactNode;
  articles: ReactNode;
  pointmort: ReactNode;
  paiements: ReactNode;
  salaires: ReactNode;
}) {
  const [tab, setTab] = useState<TabValue>(
    TAB_VALUES.includes(defaultTab as TabValue) &&
      (defaultTab !== 'salaires' || showSalaires)
      ? (defaultTab as TabValue)
      : 'apercu'
  );

  function change(value: string) {
    setTab(value as TabValue);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', value);
    window.history.replaceState(null, '', url);
  }

  return (
    <Tabs value={tab} onValueChange={change}>
      {/*
        Mobile : défilement horizontal (hauteur figée h-9 du TabsList + flex-wrap
        faisaient déborder la 2e ligne hors du fond arrondi). Desktop : wrap normal.
      */}
      <TabsList className="mb-4 flex w-full max-w-full overflow-x-auto scrollbar-none [&>*]:shrink-0 sm:w-auto sm:flex-wrap sm:overflow-x-visible">
        <TabsTrigger value="apercu">Aperçu</TabsTrigger>
        <TabsTrigger value="historique">Historique</TabsTrigger>
        <TabsTrigger value="articles">Articles</TabsTrigger>
        <TabsTrigger value="pointmort">Point mort</TabsTrigger>
        <TabsTrigger value="paiements">Paiements</TabsTrigger>
        {showSalaires && <TabsTrigger value="salaires">Salaires</TabsTrigger>}
      </TabsList>
      <TabsContent value="apercu" className="space-y-4">
        {apercu}
      </TabsContent>
      <TabsContent value="historique" className="space-y-4">
        {historique}
      </TabsContent>
      <TabsContent value="articles" className="space-y-4">
        {articles}
      </TabsContent>
      <TabsContent value="pointmort" className="space-y-4">
        {pointmort}
      </TabsContent>
      <TabsContent value="paiements" className="space-y-4">
        {paiements}
      </TabsContent>
      {showSalaires && (
        <TabsContent value="salaires" className="space-y-4">
          {salaires}
        </TabsContent>
      )}
    </Tabs>
  );
}
