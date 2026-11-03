'use client';

import { Alert, Box, Stack } from '@mui/material';
import { useState } from 'react';
import { type Address, maxUint256 } from 'viem';
import { useReadContracts } from 'wagmi';

import { AlertsButton } from './AlertsButton';
import { earnVaultAbi, erc20Abi, loopAccountAbi, loopFactoryAbi, troveManagerAbi } from './abis';
import {
  CCR,
  EARN,
  MCR,
  mezo,
  MEZO_TESTNET_ID,
  MUSD_GAS_COMPENSATION,
  ratioColor,
  ZERO,
} from './config';
import {
  btcValue,
  collateralRatio,
  fmtAmount,
  fmtPlain,
  fmtRatio,
  fmtToken,
  fmtUsd,
  liquidationPrice,
  parseAmount,
} from './format';
import {
  TroveStatus,
  useMezoTx,
  type useMusdSystem,
  useTroveHints,
  type useUserPosition,
} from './hooks';
import { INFO } from './info';
import { AmountField, Panel, Row, SubmitButton, TxNotice } from './ui';

const chainId = MEZO_TESTNET_ID;
const WAD = 10n ** 18n;
const GAS_RESERVE = 10n ** 14n;
const SAFE_RATIO = 2n * 10n ** 18n;

export const AccountMode = { none: 0, loop: 1, earn: 2 } as const;

const ok = <T,>(r?: { status: 'success' | 'failure'; result?: unknown }) =>
  r?.status === 'success' ? (r.result as T) : undefined;

/** The wallet's Morbit account (shared by BTC Loop and Borrow & Earn) and its trove. */
export function useMorbitAccount(user?: Address) {
  const base = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: mezo.loopFactory ?? ZERO,
        abi: loopFactoryAbi,
        functionName: 'accountOf',
        args: [user ?? ZERO],
        chainId,
      },
    ],
    query: { enabled: !!user && !!mezo.loopFactory, refetchInterval: 15_000 },
  });
  const raw = ok<Address>(base.data?.[0]);
  const account = raw && raw !== ZERO ? raw : undefined;
  const details = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: account ?? ZERO, abi: loopAccountAbi, functionName: 'mode', chainId },
      {
        address: mezo.troveManager,
        abi: troveManagerAbi,
        functionName: 'getTroveStatus',
        args: [account ?? ZERO],
        chainId,
      },
      {
        address: mezo.troveManager,
        abi: troveManagerAbi,
        functionName: 'getTroveColl',
        args: [account ?? ZERO],
        chainId,
      },
      {
        address: mezo.troveManager,
        abi: troveManagerAbi,
        functionName: 'getTroveDebt',
        args: [account ?? ZERO],
        chainId,
      },
      {
        address: mezo.earnVault ?? ZERO,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [user ?? ZERO, account ?? ZERO],
        chainId,
      },
      {
        address: mezo.musd,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [user ?? ZERO, account ?? ZERO],
        chainId,
      },
    ],
    query: { enabled: !!account, refetchInterval: 15_000 },
  });
  const d = details.data;
  const status = ok<number>(d?.[1]);
  return {
    account,
    /** Undefined on accounts from the first Loop factory, which only ran loops. */
    mode: ok<number>(d?.[0]),
    active: status !== undefined && Number(status) === TroveStatus.active,
    coll: ok<bigint>(d?.[2]),
    debt: ok<bigint>(d?.[3]),
    shareAllowance: ok<bigint>(d?.[4]),
    musdAllowance: ok<bigint>(d?.[5]),
    isLoading: base.isLoading || details.isLoading,
    refetch: () => {
      base.refetch();
      details.refetch();
    },
  };
}

type System = ReturnType<typeof useMusdSystem>;
type Position = ReturnType<typeof useUserPosition>;
type MorbitAccount = ReturnType<typeof useMorbitAccount>;

/** Open a loan and deposit everything borrowed into Auto Earn, in one transaction. */
export function BorrowAndEarn({
  system,
  position,
  morbit,
}: {
  system: System;
  position: Position;
  morbit: MorbitAccount;
}) {
  const [collText, setCollText] = useState('');
  const [debtText, setDebtText] = useState('');
  const hints = useTroveHints();
  const tx = useMezoTx(() => {
    position.refetch();
    system.refetch();
    morbit.refetch();
  });

  if (morbit.active)
    return (
      <Alert severity="info">
        {morbit.mode === AccountMode.earn
          ? 'Your Borrow & Earn position is open. Manage it on the right.'
          : 'Your Morbit account is running a BTC loop. Close it on the Loop page to use Borrow & Earn.'}
      </Alert>
    );

  const coll = parseAmount(collText) ?? 0n;
  const debt = parseAmount(debtText) ?? 0n;
  const fee = system.borrowingRate !== undefined ? (debt * system.borrowingRate) / WAD : 0n;
  const totalDebt = debt > 0n ? debt + fee + MUSD_GAS_COMPENSATION : 0n;
  const ratio = collateralRatio(coll, totalDebt, system.btcPrice);
  const sharePrice = system.vault?.sharePrice;
  const shares = sharePrice ? (debt * WAD) / sharePrice : undefined;
  const maxBtc =
    position.btcBalance !== undefined && position.btcBalance > GAS_RESERVE
      ? position.btcBalance - GAS_RESERVE
      : 0n;
  const safeDebt = (() => {
    if (!system.btcPrice || system.borrowingRate === undefined) return 0n;
    const room = (((coll * system.btcPrice) / WAD) * WAD) / SAFE_RATIO - MUSD_GAS_COMPENSATION;
    return room > 0n ? (room * WAD) / (WAD + system.borrowingRate) : 0n;
  })();
  // Smallest deposit that backs the minimum loan at 200%.
  const minColl =
    system.minNetDebt !== undefined && system.btcPrice && system.borrowingRate !== undefined
      ? (((system.minNetDebt * (WAD + system.borrowingRate)) / WAD + MUSD_GAS_COMPENSATION) *
          SAFE_RATIO) /
        system.btcPrice
      : undefined;

  const error = (() => {
    if (!coll && !debt) return undefined;
    if (position.btcBalance !== undefined && coll > position.btcBalance)
      return 'Not enough BTC in your wallet.';
    if (system.minNetDebt !== undefined && debt > 0n && debt < system.minNetDebt)
      return `Borrow at least ${fmtAmount(system.minNetDebt, 0)} MUSD. That needs about ${fmtAmount(
        minColl,
        4
      )} BTC at a 200% ratio.`;
    if (ratio !== undefined && ratio < MCR) return 'Collateral ratio must be at least 110%.';
    if (ratio !== undefined && system.tcr !== undefined && system.tcr < CCR && ratio < CCR)
      return 'The system is in recovery mode, so new loans need at least 150%.';
    if (system.vault?.depositsPaused) return `${EARN.name} deposits are paused.`;
    return undefined;
  })();

  const submit = async () => {
    const [upper, lower] = await hints(coll, totalDebt);
    const done = await tx.send(
      'Borrow & Earn',
      {
        address: mezo.loopFactory!,
        abi: loopFactoryAbi,
        functionName: 'openEarn',
        args: [debt, upper, lower],
        value: coll,
      },
      `${fmtAmount(coll)} BTC → ${fmtAmount(debt, 2)} MUSD in ${EARN.name}`
    );
    if (done) {
      setCollText('');
      setDebtText('');
    }
  };

  return (
    <Stack spacing={2.5}>
      <AmountField
        label="Deposit"
        symbol="BTC"
        value={collText}
        onChange={setCollText}
        balance={position.btcBalance}
        onMax={() => setCollText(fmtPlain(maxBtc))}
      />
      <AmountField
        label="Borrow into Earn"
        symbol="MUSD"
        value={debtText}
        onChange={setDebtText}
        onMax={coll ? () => setDebtText(fmtPlain(safeDebt)) : undefined}
        maxLabel="Safe max"
      />
      <Box>
        <Row label="You receive" value={fmtToken(EARN.share, shares, 2)} />
        <Row
          label="Collateral ratio"
          info={INFO['Collateral ratio']}
          value={
            <Box component="span" sx={{ color: ratioColor(ratio) }}>
              {fmtRatio(ratio)}
            </Box>
          }
        />
        <Row
          label="Liquidation price"
          info={INFO['Liquidation price']}
          value={fmtUsd(liquidationPrice(coll, totalDebt))}
        />
        <Row label="Total debt" info={INFO['Total debt']} value={fmtToken('MUSD', totalDebt, 2)} />
      </Box>
      {error && <Alert severity="warning">{error}</Alert>}
      <TxNotice state={tx.state} />
      <SubmitButton busy={tx.busy} disabled={!coll || !debt || !!error} onClick={submit}>
        Borrow & Earn
      </SubmitButton>
    </Stack>
  );
}

/** The open Borrow & Earn position: its loan, and closing it in one transaction. */
export function BorrowEarnPosition({
  system,
  position,
  morbit,
}: {
  system: System;
  position: Position;
  morbit: MorbitAccount;
}) {
  const refresh = () => {
    position.refetch();
    system.refetch();
    morbit.refetch();
  };
  const tx = useMezoTx(refresh);
  const approveTx = useMezoTx(refresh);
  const coll = morbit.coll ?? 0n;
  const debt = morbit.debt ?? 0n;
  const ratio = collateralRatio(coll, debt, system.btcPrice);
  // Closing repays the debt minus the 200 MUSD reserve, which MUSD refunds.
  const need = debt > MUSD_GAS_COMPENSATION ? debt - MUSD_GAS_COMPENSATION : 0n;
  const walletShares = position.vault.shares ?? 0n;
  const sharePrice = system.vault?.sharePrice;
  // Redeem enough shares to cover the repayment (+1% for BTC still waiting to be compounded),
  // leaving any other Auto Earn deposit in the wallet.
  const wanted = sharePrice ? (need * WAD * 101n) / (sharePrice * 100n) : walletShares;
  const shares = wanted < walletShares ? wanted : walletShares;

  const preview = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: mezo.earnVault ?? ZERO,
        abi: earnVaultAbi,
        functionName: 'previewRedeem',
        args: [shares],
        chainId,
      },
    ],
    query: { enabled: shares > 0n, refetchInterval: 15_000 },
  });
  const out = ok<readonly [bigint, bigint]>(preview.data?.[0]);
  const musdOut = out?.[0] ?? 0n;
  const btcOut = out?.[1] ?? 0n;
  const shortfall = need > musdOut ? need - musdOut : 0n;
  const needsShares = shares > 0n && (morbit.shareAllowance ?? 0n) < shares;
  const needsMusd = shortfall > 0n && (morbit.musdAllowance ?? 0n) < shortfall;
  const short = shortfall > 0n && (position.musdBalance ?? 0n) < shortfall;

  const approve = (token: Address, label: string) =>
    approveTx.send(
      label,
      {
        address: token,
        abi: erc20Abi,
        functionName: 'approve',
        args: [morbit.account!, maxUint256],
      },
      'Morbit account'
    );

  const close = () =>
    tx.send(
      'Close Borrow & Earn',
      { address: morbit.account!, abi: loopAccountAbi, functionName: 'closeEarn', args: [shares] },
      `${fmtAmount(coll, 6)} BTC back${btcOut ? ` + ${fmtAmount(btcOut, 6)} BTC earned` : ''}`
    );

  return (
    <Panel title="Your Borrow & Earn">
      <Row
        label="Collateral"
        value={fmtToken('BTC', coll, 6)}
        hint={fmtUsd(btcValue(coll, system.btcPrice))}
      />
      <Row label="Debt" value={fmtToken('MUSD', debt, 2)} />
      <Row
        label="Collateral ratio"
        info={INFO['Collateral ratio']}
        value={
          <Box component="span" sx={{ color: ratioColor(ratio) }}>
            {fmtRatio(ratio)}
          </Box>
        }
      />
      <Row
        label="Liquidation price"
        info={INFO['Liquidation price']}
        value={fmtUsd(liquidationPrice(coll, debt))}
      />
      <Row
        label="Close: redeem"
        value={fmtToken(EARN.share, shares, 2)}
        hint={`${fmtToken('MUSD', musdOut, 2)}${btcOut ? ` + ${fmtToken('BTC', btcOut, 6)}` : ''}`}
      />
      <Stack spacing={1.5} sx={{ mt: 1.5 }}>
        {shortfall > 0n && (
          <Alert severity={short ? 'warning' : 'info'}>
            {short
              ? `Closing needs ${fmtToken('MUSD', shortfall, 2)} more than your ${
                  EARN.name
                } shares cover. Add MUSD to your wallet first.`
              : `${fmtToken('MUSD', shortfall, 2)} of the repayment comes from your wallet.`}
          </Alert>
        )}
        <TxNotice state={needsShares || needsMusd ? approveTx.state : tx.state} />
        {needsShares ? (
          <SubmitButton
            busy={approveTx.busy}
            onClick={() => approve(mezo.earnVault!, `Approve ${EARN.share}`)}
          >
            Approve {EARN.share}
          </SubmitButton>
        ) : needsMusd ? (
          <SubmitButton busy={approveTx.busy} onClick={() => approve(mezo.musd, 'Approve MUSD')}>
            Approve MUSD
          </SubmitButton>
        ) : (
          <SubmitButton busy={tx.busy} disabled={!debt || short} onClick={close}>
            Repay and close
          </SubmitButton>
        )}
        <AlertsButton fullWidth />
      </Stack>
    </Panel>
  );
}
