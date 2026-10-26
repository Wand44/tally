'use client';

import { useTransition } from 'react';
import { completeProjectAction, deleteProjectAction, reopenProjectAction } from '@/app/actions';

export function OrdersActions({ projectId, status }: { projectId: string; status: string }) {
  const [pending, startTransition] = useTransition();

  function complete() {
    startTransition(async () => {
      await completeProjectAction(projectId);
    });
  }

  function reopen() {
    startTransition(async () => {
      await reopenProjectAction(projectId);
    });
  }

  function remove() {
    startTransition(async () => {
      await deleteProjectAction(projectId);
    });
  }

  return (
    <span className="flex gap-2">
      {status === 'active' ? (
        <button type="button" className="btn" onClick={complete} disabled={pending}>
          {pending ? 'Saving...' : 'Mark complete'}
        </button>
      ) : (
        <button type="button" className="btn" onClick={reopen} disabled={pending}>
          {pending ? 'Saving...' : 'Reopen'}
        </button>
      )}
      <button type="button" className="btn text-bad" onClick={remove} disabled={pending}>
        {pending ? 'Deleting...' : 'Remove'}
      </button>
    </span>
  );
}
