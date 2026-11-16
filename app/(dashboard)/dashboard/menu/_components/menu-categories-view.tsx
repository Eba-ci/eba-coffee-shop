'use client';

// Corps de la page « Menu — Catégories » : barre d'actions, panneaux de
// création, puis le tableau (ou son état vide).
//
// Pourquoi un seul composant client plutôt qu'une barre d'un côté et un
// tableau de l'autre : le bouton « + Nouvelle catégorie » de la barre et celui
// de l'état vide ouvrent le MÊME panneau. Deux composants indépendants
// auraient chacun leur `Sheet`, donc deux formulaires montés en parallèle et
// deux états à garder cohérents pour rien.
//
// Règle directrice du parcours : ne jamais renvoyer quelqu'un en arrière. Le
// bouton « + Nouveau produit » n'est donc jamais désactivé — s'il n'existe
// aucune catégorie, il ouvre le formulaire de catégorie et enchaîne tout seul
// sur la fiche produit une fois celle-ci créée.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderPlus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ScheduleOption } from '@/components/(dashboard)/schedule-field';
import { CategoryForm } from '../category-form';
import { CategoriesTable, type CategoryRow } from '../categories-table';

/**
 * Ce que le panneau ouvert doit faire une fois la catégorie créée :
 * `product` enchaîne sur la fiche produit, `category` se contente de fermer.
 * `null` = panneau fermé.
 */
type Intent = 'product' | 'category' | null;

export function MenuCategoriesView({
  categories,
  schedules,
}: {
  categories: CategoryRow[];
  schedules: ScheduleOption[];
}) {
  const router = useRouter();
  const [intent, setIntent] = useState<Intent>(null);
  // Dans le panneau « produit », bascule entre le choix d'une catégorie
  // existante et le formulaire de création.
  const [isCreating, setIsCreating] = useState(false);

  const isEmpty = categories.length === 0;

  function goToNewProduct(categoryId: string) {
    router.push(`/dashboard/menu/${categoryId}/produits/new`);
  }

  function startNewProduct() {
    // Une seule catégorie : demander laquelle serait une question dont on
    // connaît déjà la réponse.
    if (categories.length === 1) {
      goToNewProduct(categories[0].id);
      return;
    }
    setIsCreating(isEmpty);
    setIntent('product');
  }

  function startNewCategory() {
    setIsCreating(true);
    setIntent('category');
  }

  function handleCreated(category: { id: string; name: string }) {
    if (intent === 'product') {
      // On garde le panneau ouvert pendant la navigation : le refermer ferait
      // clignoter la page avant que la fiche produit ne s'affiche.
      goToNewProduct(category.id);
      return;
    }
    setIntent(null);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Menu — Catégories</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={startNewProduct}>
            <Plus className="size-4" />
            Nouveau produit
          </Button>
          <Button variant="outline" onClick={startNewCategory}>
            <FolderPlus className="size-4" />
            Nouvelle catégorie
          </Button>
        </div>
      </div>

      {isEmpty ? (
        <EmptyCategories onCreate={startNewCategory} />
      ) : (
        <CategoriesTable categories={categories} schedules={schedules} />
      )}

      <Sheet
        open={intent !== null}
        onOpenChange={(open) => !open && setIntent(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {intent === 'category'
                ? 'Nouvelle catégorie'
                : isCreating
                  ? 'D’abord, une catégorie'
                  : 'Dans quelle catégorie ?'}
            </SheetTitle>
            <SheetDescription>
              {intent === 'category'
                ? 'Une catégorie regroupe des produits qui vont ensemble : « Boissons », « Crêpes », « Pâtisseries »…'
                : isCreating
                  ? 'Un produit vit toujours dans une catégorie. Créez-la ici, on enchaîne sur le produit juste après.'
                  : 'Choisissez où ranger le nouveau produit.'}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4 pb-6">
            {intent === 'product' && !isCreating && (
              <>
                <ul className="space-y-2">
                  {categories.map((cat) => (
                    <li key={cat.id}>
                      <button
                        type="button"
                        onClick={() => goToNewProduct(cat.id)}
                        className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:border-primary hover:bg-muted"
                      >
                        <span className="font-medium">{cat.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {cat.productCount} produit
                          {cat.productCount > 1 ? 's' : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setIsCreating(true)}
                >
                  <FolderPlus className="size-4" />
                  Créer une nouvelle catégorie
                </Button>
              </>
            )}

            {isCreating && (
              <CategoryForm
                schedules={schedules}
                onCreated={handleCreated}
                submitLabel={
                  intent === 'product' ? 'Créer et continuer' : 'Ajouter'
                }
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * L'ancien message disait « Créez-en une ci-dessus » en pointant un formulaire
 * qui n'existe plus. Un état vide doit dire ce que c'est, pourquoi c'est
 * nécessaire, et porter l'action — pas désigner un ailleurs.
 */
function EmptyCategories({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
      <div className="rounded-full bg-muted p-3">
        <FolderPlus className="size-6 text-muted-foreground" />
      </div>
      <h2 className="font-semibold">Aucune catégorie pour l’instant</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Une catégorie regroupe des produits qui vont ensemble — « Boissons », «
        Crêpes », « Pâtisseries ». Il en faut au moins une avant de créer un
        produit.
      </p>
      <Button onClick={onCreate} className="mt-1">
        <FolderPlus className="size-4" />
        Créer ma première catégorie
      </Button>
    </div>
  );
}
