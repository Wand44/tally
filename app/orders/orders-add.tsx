'use client';

import { useActionState, useState } from 'react';
import { createOrderAction } from '@/app/actions';

const initialState = { ok: false };

export function OrdersAdd({ clients }: { clients: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: typeof initialState, formData: FormData) => {
      const result = await createOrderAction(prev, formData);
      if (result.ok) setAdded(true);
      return result;
    },
    initialState as { ok: boolean; message?: string; errors?: Record<string, string> },
  );

  const error = (field: string) => state.errors?.[field];

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        New order
      </button>
    );
  }

  return (
    <div className="card mt-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">New order</h2>
        <button
          type="button"
          className="btn px-2 py-1 text-xs"
          onClick={() => {
            setOpen(false);
            setAdded(false);
          }}
        >
          Close
        </button>
      </div>

      {added ? (
        <p className="mt-3 text-sm text-good">Order added. It shows up in the list below.</p>
      ) : (
        <form action={formAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="order-title">
              Title
            </label>
            <input id="order-title" name="title" className="input" placeholder="Landing page redesign" required />
            {error('title') ? <p className="hint text-bad">{error('title')}</p> : null}
          </div>

          <div>
            <label className="label" htmlFor="order-client">
              Client
            </label>
            <select id="order-client" name="clientId" className="input" defaultValue="">
              <option value="" disabled>
                {clients.length > 0 ? 'Pick an existing client' : 'No clients yet'}
              </option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            {error('clientId') ? <p className="hint text-bad">{error('clientId')}</p> : null}
          </div>

          <div>
            <label className="label" htmlFor="order-new-client">
              Or new client name
            </label>
            <input id="order-new-client" name="newClient" className="input" placeholder="Acme Corp" />
            <p className="hint">A new client row is created when you type a name here.</p>
          </div>

          <div>
            <label className="label" htmlFor="order-price">
              Agreed price
            </label>
            <input
              id="order-price"
              name="agreedPrice"
              className="input"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              placeholder="1500"
              required
            />
            {error('agreedPrice') ? <p className="hint text-bad">{error('agreedPrice')}</p> : null}
          </div>

          <div>
            <label className="label" htmlFor="order-hours">
              Estimated hours
            </label>
            <input
              id="order-hours"
              name="hours"
              className="input"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              placeholder="30"
              required
            />
            {error('hours') ? <p className="hint text-bad">{error('hours')}</p> : null}
          </div>

          {state.message ? <p className="text-sm text-bad sm:col-span-2">{state.message}</p> : null}

          <div className="sm:col-span-2">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Adding...
                </>
              ) : (
                'Add order'
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
