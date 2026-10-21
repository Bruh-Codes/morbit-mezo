'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type DemoPool = {
  id: string;
  pair: string;
  protocol: string;
  network: string;
  tvl: string;
  apr: string;
  rewards: string[];
};

export const demoPools: DemoPool[] = [
  { id: 'base-usdc-aerodrome', pair: 'MUSD_USDC', protocol: 'Aerodrome', network: 'Base', tvl: '$1.28M', apr: '4.7%', rewards: ['AERO', 'MEZO'] },
  { id: 'base-usdt-uniswap', pair: 'MUSD_USDT', protocol: 'Uniswap', network: 'Base', tvl: '$420K', apr: '3.9%', rewards: ['MEZO'] },
  { id: 'mezo-usdc', pair: 'MUSD_USDC', protocol: 'Mezo DEX', network: 'Mezo', tvl: '$820K', apr: '6.2%', rewards: ['MEZO'] },
  { id: 'ethereum-usdc-uniswap', pair: 'MUSD_USDC', protocol: 'Uniswap', network: 'Ethereum', tvl: '$2.14M', apr: '3.4%', rewards: ['MEZO'] },
  { id: 'bsc-usdt-pancake', pair: 'MUSD_USDT', protocol: 'PancakeSwap', network: 'BSC', tvl: '$680K', apr: '5.1%', rewards: ['MEZO'] },
];

export type DemoPosition = { musd: number; paired: number; since: number };
export type SimpleEarnPosition = { id: string; asset: string; amount: number; timestamp: number; allocations: string[] };
export type DemoActivity = { id: string; action: string; poolId: string; musd: number; paired: number; timestamp: number };

type DemoState = {
  positions: Record<string, DemoPosition>;
  simpleEarnPositions: SimpleEarnPosition[];
  activities: DemoActivity[];
};

const STORAGE_KEY = 'morbit-musd-liquidity-demo-v1';
const SAMPLE_SEED_KEY = 'morbit-musd-liquidity-demo-sample-seeded';
const EMPTY_STATE: DemoState = { positions: {}, simpleEarnPositions: [], activities: [] };

function sampleState(): DemoState {
  const timestamp = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return {
    positions: { 'base-usdc-aerodrome': { musd: 40, paired: 30, since: timestamp } },
    simpleEarnPositions: [{ id: 'demo-simple-earn', asset: 'MUSD', amount: 100, timestamp, allocations: ['base-usdc-aerodrome', 'mezo-usdc', 'bsc-usdt-pancake'] }],
    activities: [{ id: 'demo-liquidity-add', action: 'Add liquidity', poolId: 'base-usdc-aerodrome', musd: 40, paired: 30, timestamp }],
  };
}

function readState(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const sampleAlreadySeeded = localStorage.getItem(SAMPLE_SEED_KEY) === 'true';
    if (!raw) {
      if (sampleAlreadySeeded) return EMPTY_STATE;
      const sample = sampleState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
      localStorage.setItem(SAMPLE_SEED_KEY, 'true');
      return sample;
    }
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    const activities = Array.isArray(parsed.activities) ? parsed.activities : [];
    const state = {
      positions: parsed.positions && typeof parsed.positions === 'object' ? parsed.positions : {},
      simpleEarnPositions: Array.isArray(parsed.simpleEarnPositions) ? parsed.simpleEarnPositions : [],
      activities: sampleAlreadySeeded ? activities.filter((activity) => activity.id !== 'demo-simple-earn-deposit') : activities,
    };
    if (!sampleAlreadySeeded) {
      localStorage.setItem(SAMPLE_SEED_KEY, 'true');
      if (!Object.keys(state.positions).length && !state.simpleEarnPositions.length && !state.activities.length) {
        const sample = sampleState();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
        return sample;
      }
    }
    return state;
  } catch {
    return EMPTY_STATE;
  }
}

export function useDemoLiquidity() {
  const [state, setState] = useState<DemoState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(readState());
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setState(readState());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const save = useCallback((next: DemoState) => {
    setState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
  }, []);

  const addLiquidity = useCallback((poolId: string, musd: number, paired: number) => {
    const current = readState();
    const prev = current.positions[poolId];
    const timestamp = Date.now();
    const next: DemoState = {
      ...current,
      positions: { ...current.positions, [poolId]: { musd: (prev?.musd ?? 0) + musd, paired: (prev?.paired ?? 0) + paired, since: prev?.since ?? timestamp } },
      activities: [{ id: `${timestamp}-add-${poolId}`, action: 'Add liquidity', poolId, musd, paired, timestamp }, ...current.activities],
    };
    save(next);
  }, [save]);

  const withdrawLiquidity = useCallback((poolId: string, fraction: number) => {
    const current = readState();
    const position = current.positions[poolId];
    if (!position) return;
    const musd = position.musd * fraction;
    const paired = position.paired * fraction;
    const remaining = { musd: position.musd - musd, paired: position.paired - paired, since: position.since };
    const positions = { ...current.positions };
    if (remaining.musd + remaining.paired < 0.000001) delete positions[poolId];
    else positions[poolId] = remaining;
    const timestamp = Date.now();
    save({
      ...current,
      positions,
      activities: [{ id: `${timestamp}-withdraw-${poolId}`, action: 'Withdraw liquidity', poolId, musd, paired, timestamp }, ...current.activities],
    });
  }, [save]);

  const addSimpleEarn = useCallback((asset: string, amount: number, allocations: string[]) => {
    const current = readState();
    const timestamp = Date.now();
    const position: SimpleEarnPosition = { id: `${timestamp}-earn`, asset, amount, timestamp, allocations };
    save({
      ...current,
      simpleEarnPositions: [position, ...current.simpleEarnPositions],
      activities: [{ id: `${timestamp}-earn-deposit`, action: 'Simple Earn deposit', poolId: allocations[0] ?? demoPools[0].id, musd: amount, paired: 0, timestamp }, ...current.activities],
    });
  }, [save]);

  const withdrawSimpleEarn = useCallback((id: string, amount: number) => {
    const current = readState();
    const position = current.simpleEarnPositions.find((item) => item.id === id);
    if (!position) return;
    const withdrawn = Math.min(amount, position.amount);
    const positions = current.simpleEarnPositions
      .map((item) => item.id === id ? { ...item, amount: item.amount - withdrawn } : item)
      .filter((item) => item.amount > 0.000001);
    const timestamp = Date.now();
    save({
      ...current,
      simpleEarnPositions: positions,
      activities: [{ id: `${timestamp}-earn-withdraw`, action: 'Simple Earn withdrawal', poolId: position.allocations[0] ?? demoPools[0].id, musd: withdrawn, paired: 0, timestamp }, ...current.activities],
    });
  }, [save]);

  return useMemo(() => ({
    ...state,
    ready,
    addLiquidity,
    withdrawLiquidity,
    addSimpleEarn,
    withdrawSimpleEarn,
  }), [state, ready, addLiquidity, withdrawLiquidity, addSimpleEarn, withdrawSimpleEarn]);
}

export function estimateEarnings(amount: number, aprPercent: number, since: number): number {
  if (!since || !amount || !aprPercent) return 0;
  return amount * (aprPercent / 100) * ((Date.now() - since) / (365 * 24 * 60 * 60 * 1000));
}
