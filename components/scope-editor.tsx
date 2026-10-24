'use client';

import { useState, useTransition } from 'react';
import { extractScope, saveScope } from '@/app/actions';

type Category = 'deliverable' | 'exclusion' | 'revision_limit' | 'assumption' | 'deadline';

const categories: Category[] = ['deliverable', 'revision_limit', 'exclusion', 'assumption', 'deadline'];

export interface ClauseRow {
  ref: string | null;
  category: Category;
  text: string;
}

export function ScopeEditor({
  projectId,
  agreedTerms,
  clauses,
}: {
  projectId: string;
  agreedTerms: string;
  clauses: ClauseRow[];
}) {
  const [terms, setTerms] = useState(agreedTerms);
  const [rows, setRows] = useState<ClauseRow[]>(clauses);
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();

  function update(index: number, patch: Partial<ClauseRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function extract() {
    setNote('');
    startTransition(async () => {
      const result = await extractScope(projectId, terms);
      if (!result.ok || !result.clauses) {
        setNote(result.message ?? 'Could not read the terms.');
        return;
      }
      setRows(result.clauses.map((clause) => ({ ref: null, category: clause.category, text: clause.text })));
      setNote(
        `Extracted ${result.clauses.length} clause${result.clauses.length === 1 ? '' : 's'}. Edit them, then save.`,
      );
    });
  }

  function save() {
    setNote('');
    startTransition(async () => {
      const result = await saveScope(
        projectId,
        terms,
        rows.map((row) => ({ category: row.category, text: row.text })),
      );
      if (!result.ok) {
        setNote(result.message ?? 'Could not save.');
        return;
      }
      setRows((current) => current.map((row, i) => ({ ...row, ref: result.refs?.[i] ?? row.ref })));
      setNote(`Saved. Clause ids: ${result.refs?.join(', ')}.`);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card">
        <h2 className="font-semibold">Agreed terms</h2>
        <p className="hint mt-1">
          Paste what the client agreed to. Tally turns it into clauses you can edit.
        </p>
        <textarea
          className="input mt-3 min-h-64"
          value={terms}
          placeholder={'Landing site with hero, menu and contact page.\n2 rounds of visual revisions included.\nPhotography and copywriting are not included.'}
          onChange={(event) => setTerms(event.target.value)}
        />
        <button type="button" className="btn btn-primary mt-3" onClick={extract} disabled={pending}>
          {pending ? 'Working...' : 'Extract scope'}
        </button>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Scope clauses</h2>
          <button
            type="button"
            className="btn px-2 py-1 text-xs"
            onClick={() => setRows((current) => [...current, { ref: null, category: 'deliverable', text: '' }])}
          >
            Add clause
          </button>
        </div>
        <p className="hint mt-1">Each clause keeps a stable id (C1, C2, ...) so verdicts can cite it.</p>

        <ul className="mt-3 space-y-2">
          {rows.map((row, index) => (
            <li key={index} className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-2">
                <span className="badge bg-accent-soft text-accent">{row.ref ?? 'new'}</span>
                <select
                  className="input w-auto py-1 text-xs"
                  value={row.category}
                  onChange={(event) => update(index, { category: event.target.value as Category })}
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category.replace('_', ' ')}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn ml-auto px-2 py-1 text-xs"
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
              <input
                className="input mt-2"
                value={row.text}
                placeholder="What is agreed"
                onChange={(event) => update(index, { text: event.target.value })}
              />
            </li>
          ))}
        </ul>

        <button type="button" className="btn btn-primary mt-4" onClick={save} disabled={pending}>
          {pending ? 'Saving...' : 'Save scope'}
        </button>
        {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
      </div>
    </div>
  );
}
