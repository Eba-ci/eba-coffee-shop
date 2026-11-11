'use client';

import { useState, useSyncExternalStore } from 'react';
import { useQueryStates } from 'nuqs';
import { CalendarDays, List } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { BreakEvenDay } from '@/lib/fixed-costs/compute';
import { cn } from '@/lib/utils';
import {
  pointMortParsers,
  type PointMortView,
} from '../../point-mort-search-params';
import { CalendarView } from './calendar-view';
import { DayDetailSheet } from './day-detail-sheet';
import { ListView } from './list-view';

const STORAGE_KEY = 'eba:point-mort:vue';

const STORAGE_EVENT = 'eba:point-mort:vue-change';

function subscribeStoredView(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(STORAGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(STORAGE_EVENT, onChange);
  };
}

function readStoredView(): PointMortView | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'calendrier' || v === 'liste' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Suivi jour par jour : bascule Calendrier / Liste + filtre « non atteints »
 * + détail du jour. Vue par défaut : liste sur mobile, calendrier sur PC (par
 * CSS, donc sans flash) ; un choix explicite (URL, puis préférence mémorisée)
 * l'emporte.
 */
export function PointMortDays({
  days,
  today,
}: {
  days: BreakEvenDay[];
  today: string;
}) {
  const [params, setParams] = useQueryStates(pointMortParsers);
  // Préférence mémorisée : lue côté client seulement (null au rendu serveur).
  const stored = useSyncExternalStore(
    subscribeStoredView,
    readStoredView,
    () => null
  );
  const [selected, setSelected] = useState<string | null>(null);

  const explicit = params.vue ?? stored;
  const onlyMissed = params.manques === true;

  function choose(view: PointMortView) {
    try {
      window.localStorage.setItem(STORAGE_KEY, view);
      window.dispatchEvent(new Event(STORAGE_EVENT));
    } catch {
      /* stockage indisponible : la préférence ne sera pas mémorisée */
    }
    void setParams({ vue: view });
  }

  const selectedDay = days.find((d) => d.date === selected) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Affichage"
          className="inline-flex rounded-lg border p-0.5"
        >
          <ViewButton
            active={explicit === 'calendrier'}
            defaultOnDesktop={explicit === null}
            icon={<CalendarDays className="h-4 w-4" aria-hidden />}
            label="Calendrier"
            onClick={() => choose('calendrier')}
          />
          <ViewButton
            active={explicit === 'liste'}
            defaultOnMobile={explicit === null}
            icon={<List className="h-4 w-4" aria-hidden />}
            label="Liste"
            onClick={() => choose('liste')}
          />
        </div>

        <div className="flex min-h-11 items-center gap-2">
          <Switch
            id="pm-manques"
            checked={onlyMissed}
            onCheckedChange={(v) =>
              void setParams({ manques: v ? true : null })
            }
          />
          <Label htmlFor="pm-manques" className="text-sm">
            Jours non atteints
          </Label>
        </div>
      </div>

      <div
        className={cn(
          explicit === 'calendrier' && 'block',
          explicit === 'liste' && 'hidden',
          explicit === null && 'hidden lg:block'
        )}
      >
        <CalendarView
          days={days}
          today={today}
          onlyMissed={onlyMissed}
          onSelect={setSelected}
        />
      </div>
      <div
        className={cn(
          explicit === 'liste' && 'block',
          explicit === 'calendrier' && 'hidden',
          explicit === null && 'lg:hidden'
        )}
      >
        <ListView
          days={days}
          today={today}
          onlyMissed={onlyMissed}
          onSelect={setSelected}
        />
      </div>

      <DayDetailSheet
        day={selectedDay}
        today={today}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function ViewButton({
  active,
  defaultOnDesktop,
  defaultOnMobile,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  /** Pas de choix explicite : ce bouton est « actif » dès lg. */
  defaultOnDesktop?: boolean;
  /** Pas de choix explicite : ce bouton est « actif » sous lg. */
  defaultOnMobile?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
        active && 'bg-primary text-primary-foreground',
        !active &&
          defaultOnDesktop &&
          'lg:bg-primary lg:text-primary-foreground',
        !active &&
          defaultOnMobile &&
          'max-lg:bg-primary max-lg:text-primary-foreground'
      )}
    >
      {icon}
      {label}
    </button>
  );
}
