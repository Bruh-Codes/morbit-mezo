'use client';

import { Alert, Box, Divider, Grid, Link as MuiLink, Stack, Tab, Tabs } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';

import { borrowerOperationsAbi } from './abis';
import { CCR, MCR, mezo, MUSD_GAS_COMPENSATION, ZERO } from './config';
import {
  btcValue,
  collateralRatio,
  fmtAmount,
  fmtToken,
  fmtPlain,
  fmtRatio,
  fmtUsd,
  liquidationPrice,
  parseAmount,
} from './format';
import { TroveStatus, useMezoTx, useMusdSystem, useTroveHints, useUserPosition } from './hooks';
import { INFO } from './info';
import {
  AmountField,
  ConnectPrompt,
  Metric,
  MetricRow,
  PageContainer,
  PageTop,
  Panel,
  Row,
  SubmitButton,
  TxNotice,
} from './ui';

const WAD = 10n ** 18n;
// Leave room for gas when the user picks Max on native BTC.
const GAS_RESERVE = 10n ** 14n;
// "Safe max" borrows down to a 200% collateral ratio.
const SAFE_RATIO = 2n * 10n ** 18n;

function ratioColor(ratio?: bigint) {
  if (ratio === undefined) return 'text.primary';
  if (ratio < MCR) return 'error.main';
  if (ratio < CCR) return 'warning.main';
  return 'success.main';
}

export function BorrowPage() {
  const { address } = useAccount();
  const system = useMusdSystem();
  const position = useUserPosition(system.btcPrice);
  const hasTrove = position.trove.status === TroveStatus.active;

  return (
    <>
      <PageTop title="Borrow">
        <MetricRow>
          <Metric
            loading={system.isLoading}
            label="BTC price"
            info={INFO['BTC price']}
            value={fmtUsd(system.btcPrice)}
          />
          <Metric
            loading={system.isLoading}
            label="Minimum debt"
            info={INFO['Minimum debt']}
            value={fmtToken('MUSD', system.minNetDebt, 0)}
          />
          <Metric
            loading={system.isLoading}
            label="Borrowing fee"
            info={INFO['Borrowing fee']}
            value={fmtRatio(system.borrowingRate, 2)}
          />
          <Metric
            loading={system.isLoading}
            label="System ratio"
            info={INFO['System ratio']}
            value={fmtRatio(system.tcr)}
            hint={system.tcr !== undefined && system.tcr < CCR ? 'Recovery mode' : undefined}
          />
        </MetricRow>
      </PageTop>
      <PageContainer>
        {!address ? (
          <ConnectPrompt message="Connect a wallet to borrow MUSD." />
        ) : (
          <Grid container spacing={3}>
            <Grid item xs={12} md={5}>
              <TroveSummary position={position} btcPrice={system.btcPrice} />
            </Grid>
            <Grid item xs={12} md={7}>
              {position.isLoading && position.trove.status === undefined ? (
                <Panel title="Loading…">{null}</Panel>
              ) : hasTrove ? (
                <ManageTrove system={system} position={position} />
              ) : (
                <OpenTrove system={system} position={position} />
              )}
            </Grid>
          </Grid>
        )}
      </PageContainer>
    </>
  );
}

function TroveSummary({
  position,
  btcPrice,
}: {
  position: ReturnType<typeof useUserPosition>;
  btcPrice?: bigint;
}) {
  const { trove } = position;
  const active = trove.status === TroveStatus.active;
  const statusText: Record<number, string> = {
    [TroveStatus.nonExistent]: 'No trove yet',
    [TroveStatus.active]: 'Active',
    [TroveStatus.closedByOwner]: 'Closed',
    [TroveStatus.closedByLiquidation]: 'Liquidated',
    [TroveStatus.closedByRedemption]: 'Closed by redemption',
  };
  return (
    <Panel title="Your trove">
      <Row label="Status" value={trove.status === undefined ? '—' : statusText[trove.status]} />
      <Row
        label="Collateral"
        value={fmtToken('BTC', active ? trove.coll : 0n)}
        hint={fmtUsd(btcValue(active ? trove.coll : 0n, btcPrice))}
      />
      <Row label="Debt" value={fmtToken('MUSD', active ? trove.debt : 0n, 2)} />
      <Row
        label="Collateral ratio"
        info={INFO['Collateral ratio']}
        value={
          <Box component="span" sx={{ color: ratioColor(active ? trove.icr : undefined) }}>
            {active ? fmtRatio(trove.icr) : '—'}
          </Box>
        }
      />
      <Row
        label="Liquidation price"
        info={INFO['Liquidation price']}
        value={active ? fmtUsd(liquidationPrice(trove.coll, trove.debt)) : '—'}
      />
      <Row
        label="Interest rate"
        info={INFO['Interest rate']}
        value={
          active && trove.interestRate !== undefined
            ? `${(trove.interestRate / 100).toFixed(2)}% APR`
            : '—'
        }
      />
      <Divider sx={{ my: 2 }} />
      <Row label="Wallet BTC" value={fmtAmount(position.btcBalance)} />
      <Row label="Wallet MUSD" value={fmtAmount(position.musdBalance, 2)} />
      {position.btcBalance === 0n && (
        <Alert severity="info" sx={{ mt: 2 }}>
          No BTC yet?{' '}
          <MuiLink href={mezo.faucetUrl} target="_blank" rel="noopener">
            Get testnet BTC
          </MuiLink>
        </Alert>
      )}
    </Panel>
  );
}

function OpenTrove({
  system,
  position,
}: {
  system: ReturnType<typeof useMusdSystem>;
  position: ReturnType<typeof useUserPosition>;
}) {
  const [collText, setCollText] = useState('');
  const [debtText, setDebtText] = useState('');
  const hints = useTroveHints();
  const tx = useMezoTx(() => {
    position.refetch();
    system.refetch();
  });

  const coll = parseAmount(collText) ?? 0n;
  const debt = parseAmount(debtText) ?? 0n;
  const fee = system.borrowingRate !== undefined ? (debt * system.borrowingRate) / WAD : 0n;
  const totalDebt = debt > 0n ? debt + fee + MUSD_GAS_COMPENSATION : 0n;
  const ratio = collateralRatio(coll, totalDebt, system.btcPrice);
  const maxBtc =
    position.btcBalance !== undefined && position.btcBalance > GAS_RESERVE
      ? position.btcBalance - GAS_RESERVE
      : 0n;
  // Largest borrow that keeps the trove at SAFE_RATIO after the fee and reserve.
  const safeDebt = (() => {
    if (!system.btcPrice || system.borrowingRate === undefined) return 0n;
    const room = (((coll * system.btcPrice) / WAD) * WAD) / SAFE_RATIO - MUSD_GAS_COMPENSATION;
    return room > 0n ? (room * WAD) / (WAD + system.borrowingRate) : 0n;
  })();

  const error = useMemo(() => {
    if (coll === 0n && debt === 0n) return undefined;
    if (position.btcBalance !== undefined && coll > position.btcBalance)
      return 'Not enough BTC in your wallet.';
    if (system.minNetDebt !== undefined && debt > 0n && debt < system.minNetDebt)
      return `Borrow at least ${fmtAmount(system.minNetDebt, 0)} MUSD.`;
    if (ratio !== undefined && ratio < MCR) return 'Collateral ratio must be at least 110%.';
    if (ratio !== undefined && system.tcr !== undefined && system.tcr < CCR && ratio < CCR)
      return 'The system is in recovery mode, so new troves need at least 150%.';
    return undefined;
  }, [coll, debt, position.btcBalance, system.minNetDebt, ratio, system.tcr]);

  const submit = async () => {
    const [upper, lower] = await hints(coll, totalDebt);
    const done = await tx.send(
      'Open trove',
      {
        address: mezo.borrowerOperations,
        abi: borrowerOperationsAbi,
        functionName: 'openTrove',
        args: [debt, upper, lower],
        value: coll,
      },
      `${fmtAmount(coll)} BTC → ${fmtAmount(debt, 2)} MUSD`
    );
    if (done) {
      setCollText('');
      setDebtText('');
    }
  };

  return (
    <Panel title="Open a trove">
      <Stack spacing={2.5}>
        <AmountField
          label="Deposit collateral"
          symbol="BTC"
          value={collText}
          onChange={setCollText}
          balance={position.btcBalance}
          onMax={() => setCollText(fmtPlain(maxBtc))}
        />
        <AmountField
          label="Borrow"
          symbol="MUSD"
          value={debtText}
          onChange={setDebtText}
          onMax={coll && safeDebt > 0n ? () => setDebtText(fmtPlain(safeDebt)) : undefined}
          maxLabel="Safe max"
        />
        <Box>
          <Row
            label="Total debt"
            info={INFO['Total debt']}
            value={fmtToken('MUSD', totalDebt, 2)}
            hint={debt > 0n ? `Incl. ${fmtAmount(fee, 2)} fee + 200 reserve` : undefined}
          />
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
        </Box>
        {error && <Alert severity="warning">{error}</Alert>}
        <TxNotice state={tx.state} />
        <SubmitButton
          busy={tx.busy}
          disabled={!coll || !debt || !!error || system.btcPrice === undefined}
          onClick={submit}
        >
          Borrow MUSD
        </SubmitButton>
      </Stack>
    </Panel>
  );
}

type Action = 'addColl' | 'withdrawColl' | 'borrow' | 'repay' | 'close';
const ACTIONS: Action[] = ['addColl', 'withdrawColl', 'borrow', 'repay', 'close'];

function ManageTrove({
  system,
  position,
}: {
  system: ReturnType<typeof useMusdSystem>;
  position: ReturnType<typeof useUserPosition>;
}) {
  const [action, setAction] = useState<Action>('addColl');
  // Dashboard buttons link here with ?action=repay etc.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('action');
    if (requested && ACTIONS.includes(requested as Action)) setAction(requested as Action);
  }, []);
  const [text, setText] = useState('');
  const hints = useTroveHints();
  const tx = useMezoTx(() => {
    position.refetch();
    system.refetch();
  });

  const coll = position.trove.coll ?? 0n;
  const debt = position.trove.debt ?? 0n;
  const amount = parseAmount(text) ?? 0n;
  const fee =
    action === 'borrow' && system.borrowingRate !== undefined
      ? (amount * system.borrowingRate) / WAD
      : 0n;

  const next = {
    addColl: { coll: coll + amount, debt },
    withdrawColl: { coll: coll > amount ? coll - amount : 0n, debt },
    borrow: { coll, debt: debt + amount + fee },
    repay: { coll, debt: debt > amount ? debt - amount : 0n },
    close: { coll: 0n, debt: 0n },
  }[action];
  const nextRatio = collateralRatio(next.coll, next.debt, system.btcPrice);
  const repayable = debt > MUSD_GAS_COMPENSATION ? debt - MUSD_GAS_COMPENSATION : 0n;
  const maxBtc =
    position.btcBalance !== undefined && position.btcBalance > GAS_RESERVE
      ? position.btcBalance - GAS_RESERVE
      : 0n;

  const error = (() => {
    if (action === 'close') {
      if (position.musdBalance !== undefined && position.musdBalance < repayable)
        return `Closing burns ${fmtAmount(repayable, 2)} MUSD. You hold ${fmtAmount(
          position.musdBalance,
          2
        )}.`;
      return undefined;
    }
    if (amount === 0n) return undefined;
    if (action === 'addColl' && position.btcBalance !== undefined && amount > position.btcBalance)
      return 'Not enough BTC in your wallet.';
    if (action === 'withdrawColl' && amount >= coll)
      return 'To take out all collateral, close the trove.';
    if (action === 'repay' && position.musdBalance !== undefined && amount > position.musdBalance)
      return 'Not enough MUSD in your wallet.';
    if (
      action === 'repay' &&
      system.minNetDebt !== undefined &&
      next.debt < system.minNetDebt + MUSD_GAS_COMPENSATION
    )
      return `Debt cannot go below ${fmtAmount(
        system.minNetDebt + MUSD_GAS_COMPENSATION,
        0
      )} MUSD. Close the trove to repay everything.`;
    if (nextRatio !== undefined && nextRatio < MCR) return 'This would put the trove below 110%.';
    return undefined;
  })();

  const submit = async () => {
    const [upper, lower] = action === 'close' ? [ZERO, ZERO] : await hints(next.coll, next.debt);
    const call = {
      addColl: {
        args: [0n, 0n, false, upper, lower],
        value: amount,
        label: 'Add collateral',
        detail: `+${fmtAmount(amount)} BTC`,
      },
      withdrawColl: {
        args: [amount, 0n, false, upper, lower],
        label: 'Withdraw collateral',
        detail: `−${fmtAmount(amount)} BTC`,
      },
      borrow: {
        args: [0n, amount, true, upper, lower],
        label: 'Borrow MUSD',
        detail: `+${fmtAmount(amount, 2)} MUSD`,
      },
      repay: {
        args: [0n, amount, false, upper, lower],
        label: 'Repay MUSD',
        detail: `−${fmtAmount(amount, 2)} MUSD`,
      },
    } as const;
    let done: boolean;
    if (action === 'close') {
      done = await tx.send(
        'Close trove',
        {
          address: mezo.borrowerOperations,
          abi: borrowerOperationsAbi,
          functionName: 'closeTrove',
        },
        `${fmtAmount(coll)} BTC returned`
      );
    } else {
      const c = call[action];
      done = await tx.send(
        c.label,
        {
          address: mezo.borrowerOperations,
          abi: borrowerOperationsAbi,
          functionName: 'adjustTrove',
          args: c.args,
          ...('value' in c ? { value: c.value } : {}),
        },
        c.detail
      );
    }
    if (done) setText('');
  };

  const field = {
    addColl: (
      <AmountField
        label="Add collateral"
        symbol="BTC"
        value={text}
        onChange={setText}
        balance={position.btcBalance}
        onMax={() => setText(fmtPlain(maxBtc))}
      />
    ),
    withdrawColl: (
      <AmountField
        label="Withdraw collateral"
        symbol="BTC"
        value={text}
        onChange={setText}
        balance={coll}
        balanceLabel="In trove"
      />
    ),
    borrow: <AmountField label="Borrow more" symbol="MUSD" value={text} onChange={setText} />,
    repay: (
      <AmountField
        label="Repay"
        symbol="MUSD"
        value={text}
        onChange={setText}
        balance={position.musdBalance}
        onMax={() => {
          const floor =
            system.minNetDebt !== undefined ? system.minNetDebt + MUSD_GAS_COMPENSATION : debt;
          const room = debt > floor ? debt - floor : 0n;
          const bal = position.musdBalance ?? 0n;
          setText(fmtPlain(bal < room ? bal : room));
        }}
      />
    ),
    close: (
      <Alert severity="info">
        Repay {fmtAmount(repayable, 2)} MUSD, get back {fmtAmount(coll)} BTC.
      </Alert>
    ),
  }[action];

  return (
    <Panel title="Manage trove">
      <Tabs
        value={action}
        onChange={(_, value: Action) => {
          setAction(value);
          setText('');
          tx.reset();
        }}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ mb: 3 }}
      >
        <Tab value="addColl" label="Add BTC" />
        <Tab value="withdrawColl" label="Withdraw BTC" />
        <Tab value="borrow" label="Borrow" />
        <Tab value="repay" label="Repay" />
        <Tab value="close" label="Close" />
      </Tabs>
      <Stack spacing={2.5}>
        {field}
        {action !== 'close' && (
          <Box>
            {action === 'borrow' && (
              <Row
                label="Borrowing fee"
                info={INFO['Borrowing fee']}
                value={fmtToken('MUSD', fee, 2)}
              />
            )}
            <Row label="Collateral" value={fmtToken('BTC', next.coll)} />
            <Row label="Debt" value={fmtToken('MUSD', next.debt, 2)} />
            <Row
              label="Collateral ratio"
              info={INFO['Collateral ratio']}
              value={
                <Box component="span" sx={{ color: ratioColor(nextRatio) }}>
                  {fmtRatio(nextRatio)}
                </Box>
              }
            />
            <Row
              label="Liquidation price"
              info={INFO['Liquidation price']}
              value={fmtUsd(liquidationPrice(next.coll, next.debt))}
            />
          </Box>
        )}
        {error && <Alert severity="warning">{error}</Alert>}
        <TxNotice state={tx.state} />
        <SubmitButton
          busy={tx.busy}
          disabled={(action !== 'close' && !amount) || !!error}
          onClick={submit}
        >
          {
            {
              addColl: 'Add collateral',
              withdrawColl: 'Withdraw collateral',
              borrow: 'Borrow MUSD',
              repay: 'Repay MUSD',
              close: 'Close trove',
            }[action]
          }
        </SubmitButton>
      </Stack>
    </Panel>
  );
}
