import { useCallback } from 'react';
import { backupRepoKey } from '@/lib/backup/model';
import { capturePendingDraft } from '@/lib/drafts/pending';
import { writeDraft } from '@/lib/drafts/store';
import { useGateway } from '@/lib/gateway/context';
import { useDrafts } from '@/stores/drafts';
import { usePendingPost } from '@/stores/pending-post';
import { useSettings } from '@/stores/settings';

export type ParkPendingDraftResult = 'empty' | 'saved' | 'failed';

/**
 * Move the in-memory new-post draft into the encrypted draft box before the
 * editor replaces it with another draft. Never clears the memory draft unless
 * the write succeeded, so a failed park cannot silently lose work.
 */
export function useParkPendingDraft(): () => Promise<ParkPendingDraftResult> {
  const { mode, repo } = useGateway();
  const fields = useSettings((state) => state.frontmatter.fields);

  return useCallback(async () => {
    const pending = usePendingPost.getState().draft;
    if (!pending) return 'empty';

    const repoKey = backupRepoKey(mode, repo);
    const record = await capturePendingDraft({ repoKey, fields, pending });
    const result = await writeDraft(record);
    if (result !== 'saved') return 'failed';

    usePendingPost.getState().clearDraft();
    useDrafts.getState().remember(record);
    return 'saved';
  }, [mode, repo, fields]);
}
