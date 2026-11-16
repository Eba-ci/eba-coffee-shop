'use client';

import { useState, useTransition } from 'react';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  isAllowedImageMimeType,
} from '@/lib/schemas/upload';
import { uploadToCloudinary } from '@/lib/cloudinary-client';
import {
  createPollOptionAction,
  updatePollOptionAction,
  movePollOptionAction,
  deletePollOptionAction,
  moderatePollSuggestionAction,
} from '../../actions';
import type { OptionRow, SuggestionRow } from './types';

export type PollDetailState = ReturnType<typeof usePollDetail>;

const MAX_MB = Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024));

async function uploadPollOptionImage(file: File): Promise<string> {
  return uploadToCloudinary(file, '/api/upload/sign', {
    subdir: 'poll-options',
  });
}

export function usePollDetail({
  pollId,
  suggestions,
}: {
  pollId: string;
  suggestions: SuggestionRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [uploading, setUploading] = useState(false);

  const pendingSuggestions = suggestions.filter((s) => s.status === 'PENDING');
  const decidedSuggestions = suggestions.filter((s) => s.status !== 'PENDING');

  function addOption() {
    setError(null);
    const label = newLabel.trim();
    if (!label) {
      setError('Le libellé est obligatoire.');
      return;
    }
    startTransition(async () => {
      const r = await createPollOptionAction(pollId, {
        label,
        description: newDescription.trim() || undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNewLabel('');
      setNewDescription('');
    });
  }

  function move(id: string, direction: 'up' | 'down') {
    setPendingId(id);
    startTransition(async () => {
      const r = await movePollOptionAction(id, pollId, direction);
      setPendingId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
    });
  }

  function remove(option: OptionRow) {
    if (!window.confirm(`Retirer l’option « ${option.label} » ?`)) return;
    setPendingId(option.id);
    startTransition(async () => {
      const r = await deletePollOptionAction(option.id, pollId);
      setPendingId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
    });
  }

  async function uploadImage(optionId: string, file: File) {
    setError(null);
    if (!isAllowedImageMimeType(file.type)) {
      setError(
        `Format non supporté (autorisés : ${ALLOWED_IMAGE_MIME_TYPES.join(', ')}).`
      );
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setError(`Fichier trop volumineux (max ${MAX_MB} MB).`);
      return;
    }
    setUploading(true);
    try {
      const url = await uploadPollOptionImage(file);
      const r = await updatePollOptionAction(optionId, pollId, {
        imageUrl: url,
      });
      if (!r.ok) setError(r.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur upload');
    } finally {
      setUploading(false);
    }
  }

  function moderate(suggestion: SuggestionRow, decision: 'approve' | 'reject') {
    let rejectionReason: string | undefined;
    if (decision === 'reject') {
      const reason = window.prompt('Motif du rejet ?');
      if (!reason || !reason.trim()) return;
      rejectionReason = reason.trim();
    }
    setPendingId(suggestion.id);
    startTransition(async () => {
      const r = await moderatePollSuggestionAction(suggestion.id, pollId, {
        decision,
        rejectionReason,
      });
      setPendingId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
    });
  }

  return {
    pending,
    pendingId,
    error,
    newLabel,
    setNewLabel,
    newDescription,
    setNewDescription,
    uploading,
    pendingSuggestions,
    decidedSuggestions,
    addOption,
    move,
    remove,
    uploadImage,
    moderate,
  };
}
