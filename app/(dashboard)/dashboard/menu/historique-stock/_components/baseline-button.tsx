'use client';

import { useState, useTransition } from 'react';
import { Button } from '@heroui/react';
import { recordBaselineAction } from '../actions';

export function BaselineButton({ count }: { count: number }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        color="primary"
        isLoading={isPending}
        onPress={() =>
          startTransition(async () => {
            const res = await recordBaselineAction();
            setMessage(
              res.ok ? `${res.count} relevé(s) de départ posé(s).` : res.error
            );
          })
        }
      >
        Poser le relevé de départ ({count})
      </Button>
      {message && (
        <span role="status" className="text-sm text-muted-foreground">
          {message}
        </span>
      )}
    </div>
  );
}
