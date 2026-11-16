'use client';

// Fusion de deux comptes clients en doublon (ex. un client a été enregistré
// une seconde fois sur un autre numéro). Ouvre un Sheet depuis la fiche
// client courante : recherche le doublon par nom ou téléphone (réutilise
// GET /api/customers/search), puis fait valider avant fusion irréversible.
//
// Le client courant (`customerId`) est TOUJOURS conservé comme cible : son
// numéro reste l'identifiant final. Le doublon sélectionné est absorbé
// (commandes, fidélité, votes de sondage re-rattachés) puis supprimé.

import { useEffect, useRef, useState, useTransition } from 'react';
import { Loader2, Merge, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatPhoneForDisplay } from '@/lib/phone';
import { mergeCustomersAction } from './actions';

const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;

type CustomerHit = { id: string; name: string | null; phone: string };

type Props = {
  customerId: string;
  customerName: string | null;
  customerPhone: string;
};

export function MergeCustomerSheet({
  customerId,
  customerName,
  customerPhone,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerHit[]>([]);
  const [duplicate, setDuplicate] = useState<CustomerHit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
    };
  }, []);

  function openSheet() {
    setQuery('');
    setResults([]);
    setDuplicate(null);
    setError(null);
    setSuccess(null);
    setOpen(true);
  }

  function runSearch(term: string) {
    // Une requête plus ancienne mais plus lente écrasait sinon un résultat
    // plus récent (le sélecteur de `caisse/new` annule déjà correctement).
    abort.current?.abort();
    const q = term.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    fetch(`/api/customers/search?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : { customers: [] }))
      .then((data: { customers?: CustomerHit[] }) => {
        setResults((data.customers ?? []).filter((c) => c.id !== customerId));
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setResults([]);
      });
  }

  function handleQueryChange(next: string) {
    setQuery(next);
    setDuplicate(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(next), DEBOUNCE_MS);
  }

  function confirmMerge() {
    if (!duplicate) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await mergeCustomersAction(duplicate.id, customerId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        `Fusion effectuée — ${res.ordersMoved} commande(s), ` +
          `${res.rewardsMoved} récompense(s) et ${res.pollVotesMoved} vote(s) ` +
          `rattachés. ${res.stampsMerged} tampon(s) cumulé(s).`
      );
      setDuplicate(null);
      setQuery('');
      setResults([]);
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openSheet}>
        <Merge className="mr-1.5 h-4 w-4" />
        Fusionner un doublon
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Fusionner un compte en doublon</SheetTitle>
            <SheetDescription>
              Ce client ({customerName ?? 'Sans nom'} ·{' '}
              {formatPhoneForDisplay(customerPhone)}) sera conservé. Le doublon
              sélectionné ci-dessous sera absorbé (commandes, fidélité, votes)
              puis supprimé — action irréversible.
            </SheetDescription>
          </SheetHeader>

          <div className="grid gap-4 px-4 pb-4">
            {!duplicate ? (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  placeholder="Rechercher le doublon (nom ou téléphone)…"
                  autoComplete="off"
                  className="pl-8"
                />
                {results.length > 0 && (
                  <ul className="mt-2 max-h-60 overflow-auto rounded-md border">
                    {results.map((hit) => (
                      <li key={hit.id}>
                        <button
                          type="button"
                          onClick={() => setDuplicate(hit)}
                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <span className="font-medium">
                            {hit.name || 'Sans nom'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatPhoneForDisplay(hit.phone)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {query.trim().length >= MIN_QUERY_LENGTH &&
                  results.length === 0 && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Aucun autre client trouvé.
                    </p>
                  )}
              </div>
            ) : (
              <div className="rounded-md border p-3 text-sm">
                <p className="text-muted-foreground">Doublon sélectionné :</p>
                <p className="font-medium">
                  {duplicate.name || 'Sans nom'} ·{' '}
                  {formatPhoneForDisplay(duplicate.phone)}
                </p>
                <p className="mt-2 text-destructive">
                  Ce compte sera supprimé après la fusion.
                </p>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}

            <div className="flex justify-end gap-2">
              {duplicate && !success && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDuplicate(null)}
                  disabled={pending}
                >
                  Changer
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Fermer
              </Button>
              {duplicate && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={confirmMerge}
                  disabled={pending}
                >
                  {pending && (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  )}
                  Confirmer la fusion
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
