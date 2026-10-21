'use client';

import { useSyncExternalStore } from 'react';

/** Transactions sent from this browser. Each entry is a real Mezo testnet tx hash. */
export type TxRecord = {
  hash: string;
  account: string;
  action: string;
  detail?: string;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: number;
};

const KEY = 'morbit-mezo-txs-v1';
const listeners = new Set<() => void>();
let cache: TxRecord[] | null = null;

function read(): TxRecord[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || '[]') as TxRecord[];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: TxRecord[]) {
  cache = next.slice(0, 200);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Storage can be unavailable (private mode); the list still lives for this session.
  }
  listeners.forEach((listener) => listener());
}

export function recordTx(record: TxRecord) {
  write([record, ...read().filter((r) => r.hash !== record.hash)]);
}

export function updateTx(hash: string, status: TxRecord['status']) {
  write(read().map((r) => (r.hash === hash ? { ...r, status } : r)));
}

const EMPTY: TxRecord[] = [];

export function useTxHistory(account?: string) {
  const all = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => EMPTY
  );
  return account ? all.filter((r) => r.account.toLowerCase() === account.toLowerCase()) : EMPTY;
}
