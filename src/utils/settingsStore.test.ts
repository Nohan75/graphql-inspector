import { describe, expect, it } from 'vitest';
import { createSettingsStore } from './settingsStore';

/**
 * Stands in for chrome.storage.local. Like it, it answers a read later: the
 * test says when, with `answerRead`.
 */
function storageHolding(stored?: unknown) {
  const written: Array<Record<string, unknown>> = [];
  let answer = () => {};
  return {
    written,
    answerRead: () => answer(),
    get(_keys: string[], callback: (items: Record<string, unknown>) => void) {
      answer = () => callback(stored === undefined ? {} : { gql_inspector_settings: stored });
    },
    set(items: Record<string, unknown>) {
      written.push(items);
    },
  };
}

const graphiql = { sandboxUrl: 'https://sandbox.test/graphiql', sandboxFormat: 'graphiql' } as const;

describe('the settings', () => {
  it('are the defaults until the stored ones have been read', () => {
    const store = createSettingsStore(storageHolding(graphiql));

    expect(store.get()).toEqual({
      sandboxUrl: 'https://studio.apollographql.com/sandbox/explorer',
      sandboxFormat: 'auto',
    });
  });

  it('are the stored ones once they have been read', () => {
    const storage = storageHolding(graphiql);
    const store = createSettingsStore(storage);

    storage.answerRead();

    expect(store.get()).toEqual({ sandboxUrl: 'https://sandbox.test/graphiql', sandboxFormat: 'graphiql' });
  });

  it('take the default for what the stored ones lack', () => {
    // as stored by a version that had no URL format yet
    const storage = storageHolding({ sandboxUrl: 'https://sandbox.test/graphiql' });
    const store = createSettingsStore(storage);

    storage.answerRead();

    expect(store.get()).toEqual({ sandboxUrl: 'https://sandbox.test/graphiql', sandboxFormat: 'auto' });
  });

  it('stay the defaults when nothing is stored', () => {
    const storage = storageHolding();
    const store = createSettingsStore(storage);

    storage.answerRead();

    expect(store.get()).toEqual({
      sandboxUrl: 'https://studio.apollographql.com/sandbox/explorer',
      sandboxFormat: 'auto',
    });
  });
});

describe('saving the settings', () => {
  it('reaches everyone who listens, at once', () => {
    const store = createSettingsStore(storageHolding());
    const seen: string[] = [];
    store.subscribe(() => seen.push(`the list sees ${store.get().sandboxUrl}`));
    store.subscribe(() => seen.push(`the Request tab sees ${store.get().sandboxUrl}`));

    store.save(graphiql);

    expect(seen).toEqual([
      'the list sees https://sandbox.test/graphiql',
      'the Request tab sees https://sandbox.test/graphiql',
    ]);
  });

  it('writes them to storage, under the key earlier versions read', () => {
    const storage = storageHolding();
    const store = createSettingsStore(storage);

    store.save(graphiql);

    expect(storage.written).toEqual([
      { gql_inspector_settings: { sandboxUrl: 'https://sandbox.test/graphiql', sandboxFormat: 'graphiql' } },
    ]);
  });

  it('is not undone by the stored settings when those are read afterwards', () => {
    const storage = storageHolding({ sandboxUrl: 'https://old.test/sandbox', sandboxFormat: 'apollo' });
    const store = createSettingsStore(storage);

    store.save(graphiql);
    storage.answerRead();

    expect(store.get()).toEqual({ sandboxUrl: 'https://sandbox.test/graphiql', sandboxFormat: 'graphiql' });
  });
});

describe('listening to the settings', () => {
  it('tells when the stored ones have been read', () => {
    const storage = storageHolding(graphiql);
    const store = createSettingsStore(storage);
    let told = 0;
    store.subscribe(() => told++);

    storage.answerRead();

    expect(told).toBe(1);
  });

  it('stops when asked to', () => {
    const store = createSettingsStore(storageHolding());
    let told = 0;
    const stop = store.subscribe(() => told++);

    stop();
    store.save(graphiql);

    expect(told).toBe(0);
  });

  it('gives the same settings object as long as they do not change', () => {
    const storage = storageHolding();
    const store = createSettingsStore(storage);

    const before = store.get();
    storage.answerRead(); // nothing stored: nothing changes

    expect(store.get()).toBe(before);
  });
});
