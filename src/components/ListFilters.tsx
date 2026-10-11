import React from 'react';
import type { OperationType } from '../types';
import type { RequestFilter, RequestState } from '../utils/requestFilter';

interface ListFiltersProps {
  filter: RequestFilter;
  onChange: (filter: RequestFilter) => void;
}

/** The letters and the colours are the ones of the badges on the rows */
const TYPES: Array<{ type: OperationType; letter: string; title: string; on: string }> = [
  { type: 'query', letter: 'Q', title: 'Queries', on: 'bg-badge-query' },
  { type: 'mutation', letter: 'M', title: 'Mutations', on: 'bg-badge-mutation' },
  { type: 'subscription', letter: 'S', title: 'Subscriptions', on: 'bg-badge-subscription' },
];

const STATES: Array<{ state: RequestState; label: string; title: string; on: string }> = [
  {
    state: 'errors',
    label: 'Errors',
    title: 'What went wrong: an HTTP status from 400 up, GraphQL errors, a request that failed or got no response',
    on: 'bg-error',
  },
  {
    state: 'pending',
    label: 'Pending',
    title: 'Requests still waiting for their response',
    on: 'bg-text-muted',
  },
];

const CHIP = 'rounded-[3px] text-[10px] leading-4 cursor-pointer border shrink-0';
const OFF = 'bg-transparent border-border text-text-muted hover:text-text hover:border-accent';

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}

/** The filters above the list: operation types, then states. Each one is a switch. */
export function ListFilters({ filter, onChange }: ListFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-[5px] border-b border-border shrink-0">
      {TYPES.map(({ type, letter, title, on }) => {
        const isOn = filter.types.has(type);
        return (
          <button
            key={type}
            onClick={() => onChange({ ...filter, types: toggled(filter.types, type) })}
            title={title}
            aria-label={title}
            aria-pressed={isOn}
            className={`${CHIP} w-[18px] p-0 text-center font-bold ${isOn ? `${on} border-transparent text-white` : OFF}`}
          >
            {letter}
          </button>
        );
      })}

      <span className="w-px h-3.5 bg-border mx-0.5" />

      {STATES.map(({ state, label, title, on }) => {
        const isOn = filter.states.has(state);
        return (
          <button
            key={state}
            onClick={() => onChange({ ...filter, states: toggled(filter.states, state) })}
            title={title}
            aria-pressed={isOn}
            className={`${CHIP} px-1.5 ${isOn ? `${on} border-transparent text-white` : OFF}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
