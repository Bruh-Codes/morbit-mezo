'use client';

import { Alert, Box, Button, Grid, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useState } from 'react';
import { type Address, maxUint256 } from 'viem';
import { useAccount, useReadContracts } from 'wagmi';

import { AlertsButton } from './AlertsButton';
import { erc20Abi, loopAccountAbi, loopFactoryAbi, mezoRouterAbi, troveManagerAbi } from './abis';
import { MCR, mezo, MEZO_TESTNET_ID, MUSD_GAS_COMPENSATION, ratioColor, ZERO } from './config';
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

const chainId = MEZO_TESTNET_ID;
const WAD = 10n ** 18n;
const GAS_RESERVE = 10n ** 14n;
const LEVERAGE = [1.5, 2, 2.5] as const;
// Accept up to 1% less than the live quote.
const QUOTE_SLIPPAGE_BPS = 100n;
// Sell a little extra BTC when closing, so fees and price moves never leave the debt short.
const CLOSE_BUFFER_BPS = 300n;

const route = (from: Address, to: Address) => [
  { from, to, stable: false, factory: mezo.poolFactory ?? ZERO },
];

/** Live Mezo Pools quotes plus the wallet's loop account and its trove. */
function useLoop(user?: Address, musdIn = 0n, btcIn = 0n) {
  const { data, refetch, isLoading } = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: mezo.loopFactory ?? ZERO,
        abi: loopFactoryAbi,
        functionName: 'accountOf',
        args: [user ?? ZERO],
        chainId,
      },
      // Reference prices for 1,000 MUSD → BTC and 0.01 BTC → MUSD.
      {
        address: mezo.mezoRouter ?? ZERO,
        abi: mezoRouterAbi,
        functionName: 'getAmountsOut',
        args: [1000n * WAD, route(mezo.musd, mezo.btc)],
        chainId,
      },
      {
        address: mezo.mezoRouter ?? ZERO,
        abi: mezoRouterAbi,
        functionName: 'getAmountsOut',
        args: [musdIn || WAD, route(mezo.musd, mezo.btc)],
        chainId,
      },
      {
        address: mezo.mezoRouter ?? ZERO,
        abi: mezoRouterAbi,
        functionName: 'getAmountsOut',
        args: [btcIn || 10n ** 16n, route(mezo.btc, mezo.musd)],
        chainId,
      },
    ],
    query: { refetchInterval: 15_000, enabled: !!mezo.loopFactory },
  });
  const account = data?.[0]?.status === 'success' ? (data[0].result as Address) : undefined;
  const hasAccount = !!account && account !== ZERO;
  const trove = useReadContracts({
    allowFailure: true,
    contracts: (['getTroveStatus', 'getTroveColl', 'getTroveDebt'] as const).map(
      (functionName) => ({
        address: mezo.troveManager,
        abi: troveManagerAbi,
        functionName,
        args: [account ?? ZERO],
        chainId,
      })
    ),
    query: { enabled: hasAccount, refetchInterval: 15_000 },
  });
  const out = (i: number) =>
    data?.[i]?.status === 'success' ? (data[i].result as readonly bigint[])[1] : undefined;
  const t = (i: number) =>
    trove.data?.[i]?.status === 'success' ? (trove.data[i].result as bigint | number) : undefined;
  const btcPer1000 = out(1);
  return {
    account: hasAccount ? account : undefined,
    status: t(0) !== undefined ? (Number(t(0)) as TroveStatus) : undefined,
    coll: t(1) as bigint | undefined,
    debt: t(2) as bigint | undefined,
    /** MUSD paid per BTC when buying on Mezo Pools. */
    buyPrice: btcPer1000 ? (1000n * WAD * WAD) / btcPer1000 : undefined,
    btcForMusd: musdIn ? out(2) : undefined,
    musdForBtc: btcIn ? out(3) : undefined,
    isLoading: isLoading || trove.isLoading,
    refetch: () => {
      refetch();
      trove.refetch();
    },
  };
}

export function LoopPage() {
  const { address } = useAccount();
  const system = useMusdSystem();
  const loop = useLoop(address);
  const active = loop.status === TroveStatus.active;

  return (
    <>
      <PageTop title="BTC Loop">
        <MetricRow>
          <Metric
            loading={system.isLoading}
            label="BTC price"
            info={INFO['BTC price']}
            value={fmtUsd(system.btcPrice)}
          />
          <Metric
            loading={loop.isLoading}
            label="Mezo Pools price"
            info={INFO['Mezo Pools price']}
            value={fmtUsd(loop.buyPrice)}
          />
          <Metric
            loading={system.isLoading}
            label="Borrowing fee"
            info={INFO['Borrowing fee']}
            value={fmtRatio(system.borrowingRate, 2)}
          />
        </MetricRow>
      </PageTop>
      <PageContainer>
        {!mezo.loopFactory ? (
          <Panel title="Loop is not deployed yet">{null}</Panel>
        ) : !address ? (
          <ConnectPrompt message="Connect a wallet to open a BTC loop." />
        ) : (
          <Grid container spacing={3} alignItems="flex-start">
            <Grid item xs={12} md={7}>
              {active ? (
                <ManageLoop system={system} loop={loop} />
              ) : (
                <OpenLoop system={system} loop={loop} />
              )}
            </Grid>
            <Grid item xs={12} md={5}>
              {active ? <LoopSummary system={system} loop={loop} /> : <HowLoopWorks />}
            </Grid>
          </Grid>
        )}
      </PageContainer>
    </>
  );
}

type Loop = ReturnType<typeof useLoop>;
type System = ReturnType<typeof useMusdSystem>;

function OpenLoop({ system, loop }: { system: System; loop: Loop }) {
  const { address } = useAccount();
  const position = useUserPosition(system.btcPrice);
  const [collText, setCollText] = useState('');
  const [leverage, setLeverage] = useState<typeof LEVERAGE[number]>(1.5);
  const hints = useTroveHints();
  const tx = useMezoTx(() => {
    loop.refetch();
    position.refetch();
  });

  const coll = parseAmount(collText) ?? 0n;
  const lev = BigInt(Math.round(leverage * 100));
  // Borrow enough MUSD to buy (leverage − 1) × the deposit in BTC.
  const debt = loop.buyPrice && coll ? (((coll * (lev - 100n)) / 100n) * loop.buyPrice) / WAD : 0n;
  const quote = useLoop(address, debt);
  const bought = quote.btcForMusd ?? 0n;
  const fee = system.borrowingRate !== undefined ? (debt * system.borrowingRate) / WAD : 0n;
  const totalDebt = debt ? debt + fee + MUSD_GAS_COMPENSATION : 0n;
  const totalColl = coll + bought;
  const ratio = collateralRatio(totalColl, totalDebt, system.btcPrice);
  const maxBtc =
    position.btcBalance !== undefined && position.btcBalance > GAS_RESERVE
      ? position.btcBalance - GAS_RESERVE
      : 0n;

  // Smallest deposit whose borrowed MUSD meets MUSD's minimum loan at this leverage (+1% for price moves).
  const minColl =
    system.minNetDebt !== undefined && loop.buyPrice
      ? (system.minNetDebt * WAD * 101n) / ((lev - 100n) * loop.buyPrice)
      : undefined;

  const error = (() => {
    if (!coll) return undefined;
    if (position.btcBalance !== undefined && coll > position.btcBalance)
      return 'Not enough BTC in your wallet.';
    if (system.minNetDebt !== undefined && debt < system.minNetDebt)
      return `Deposit at least ${fmtAmount(minColl, 4)} BTC at ${leverage}x, or raise the leverage. MUSD loans start at ${fmtAmount(
        system.minNetDebt,
        0
      )} MUSD.`;
    if (ratio !== undefined && ratio < MCR) return 'This loop would start below 110%.';
    return undefined;
  })();

  const submit = async () => {
    const [u1, l1] = await hints(coll, totalDebt);
    const [u2, l2] = await hints(totalColl, totalDebt);
    const minOut = (bought * (10_000n - QUOTE_SLIPPAGE_BPS)) / 10_000n;
    const done = await tx.send(
      'Open BTC loop',
      {
        address: mezo.loopFactory!,
        abi: loopFactoryAbi,
        functionName: 'openLoop',
        args: [debt, minOut, [u1, l1, u2, l2]],
        value: coll,
      },
      `${fmtAmount(coll)} BTC at ${leverage}x → ${fmtAmount(totalColl)} BTC`
    );
    if (done) setCollText('');
  };

  return (
    <Panel title="Open a loop">
      <Stack spacing={2.5}>
        <AmountField
          label="Deposit"
          symbol="BTC"
          value={collText}
          onChange={setCollText}
          balance={position.btcBalance}
          onMax={() => setCollText(fmtPlain(maxBtc))}
        />
        <Box>
          <Typography variant="description" color="text.secondary">
            Leverage
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
            {LEVERAGE.map((l) => (
              <Button
                key={l}
                size="small"
                variant={leverage === l ? 'contained' : 'outlined'}
                onClick={() => setLeverage(l)}
              >
                {l}x
              </Button>
            ))}
          </Stack>
          {minColl !== undefined && (
            <Typography variant="description" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Minimum deposit at {leverage}x: {fmtAmount(minColl, 4)} BTC
            </Typography>
          )}
        </Box>
        <Box>
          <Row label="Borrow and swap" value={fmtToken('MUSD', debt, 2)} />
          <Row
            label="BTC exposure"
            info={INFO['BTC exposure']}
            value={fmtToken('BTC', totalColl, 6)}
            hint={totalColl ? fmtUsd(btcValue(totalColl, system.btcPrice)) : undefined}
          />
          <Row
            label="Total debt"
            info={INFO['Total debt']}
            value={fmtToken('MUSD', totalDebt, 2)}
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
            value={fmtUsd(liquidationPrice(totalColl, totalDebt))}
          />
        </Box>
        {error && <Alert severity="warning">{error}</Alert>}
        <TxNotice state={tx.state} />
        <SubmitButton
          busy={tx.busy}
          disabled={!coll || !debt || !bought || !!error}
          onClick={submit}
        >
          Open {leverage}x loop
        </SubmitButton>
      </Stack>
    </Panel>
  );
}

function ManageLoop({ system, loop }: { system: System; loop: Loop }) {
  const { address } = useAccount();
  const position = useUserPosition(system.btcPrice);
  const [tab, setTab] = useState<'add' | 'close'>('add');
  const [text, setText] = useState('');
  const hints = useTroveHints();
  const refresh = () => {
    loop.refetch();
    position.refetch();
  };
  const tx = useMezoTx(refresh);
  const approveTx = useMezoTx(refresh);
  const coll = loop.coll ?? 0n;
  const debt = loop.debt ?? 0n;
  const need = debt > MUSD_GAS_COMPENSATION ? debt - MUSD_GAS_COMPENSATION : 0n;

  // BTC to sell so the swap covers the debt, with a buffer, capped so the trove stays above 110%.
  const target = (need * (10_000n + CLOSE_BUFFER_BPS)) / 10_000n;
  const estimate = loop.buyPrice ? (target * WAD) / loop.buyPrice : 0n;
  const maxSell =
    system.btcPrice && debt ? coll - (((debt * MCR) / WAD) * WAD) / system.btcPrice - 1n : 0n;
  const sell = estimate < maxSell ? estimate : maxSell > 0n ? maxSell : 0n;
  const closeQuote = useLoop(address, 0n, sell);
  const musdBack = closeQuote.musdForBtc ?? 0n;
  const shortfall = need > musdBack ? need - musdBack : 0n;

  const add = parseAmount(text) ?? 0n;
  const nextRatio = collateralRatio(coll + add, debt, system.btcPrice);

  const allowance = useReadContracts({
    contracts: [
      {
        address: mezo.musd,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address ?? ZERO, loop.account ?? ZERO],
        chainId,
      },
    ],
    query: { enabled: !!loop.account && shortfall > 0n },
  });
  const allowed =
    allowance.data?.[0]?.status === 'success' ? (allowance.data[0].result as bigint) : 0n;
  const needsApproval = shortfall > 0n && allowed < shortfall;

  const submitAdd = async () => {
    const [u, l] = await hints(coll + add, debt);
    const done = await tx.send(
      'Add BTC to loop',
      {
        address: loop.account!,
        abi: loopAccountAbi,
        functionName: 'addCollateral',
        args: [u, l],
        value: add,
      },
      `+${fmtAmount(add)} BTC`
    );
    if (done) setText('');
  };

  const submitClose = async () => {
    const [u, l] = await hints(coll - sell, debt);
    const minOut = (musdBack * (10_000n - QUOTE_SLIPPAGE_BPS)) / 10_000n;
    await tx.send(
      'Close BTC loop',
      {
        address: loop.account!,
        abi: loopAccountAbi,
        functionName: 'closeLoop',
        args: [sell, minOut, u, l],
      },
      `Sold ${fmtAmount(sell, 6)} BTC, ${fmtAmount(coll - sell, 6)} BTC back`
    );
  };

  return (
    <Panel title="Manage loop">
      <Tabs
        value={tab}
        onChange={(_, v) => {
          setTab(v);
          tx.reset();
        }}
        sx={{ mb: 3 }}
      >
        <Tab value="add" label="Add BTC" />
        <Tab value="close" label="Close loop" />
      </Tabs>
      {tab === 'add' ? (
        <Stack spacing={2.5}>
          <AmountField
            label="Add collateral"
            symbol="BTC"
            value={text}
            onChange={setText}
            balance={position.btcBalance}
          />
          <Row
            label="Collateral ratio"
            info={INFO['Collateral ratio']}
            value={
              <Box component="span" sx={{ color: ratioColor(nextRatio) }}>
                {fmtRatio(nextRatio)}
              </Box>
            }
          />
          <TxNotice state={tx.state} />
          <SubmitButton busy={tx.busy} disabled={!add} onClick={submitAdd}>
            Add BTC
          </SubmitButton>
        </Stack>
      ) : (
        <Stack spacing={2.5}>
          <Box>
            <Row
              label="Sell"
              value={fmtToken('BTC', sell, 6)}
              hint={`≈ ${fmtToken('MUSD', musdBack, 2)}`}
            />
            <Row label="Repay" value={fmtToken('MUSD', need, 2)} />
            <Row
              label="You get back"
              value={fmtToken('BTC', coll - sell, 6)}
              hint={musdBack > need ? `+ ${fmtToken('MUSD', musdBack - need, 2)}` : undefined}
            />
          </Box>
          {shortfall > 0n && (
            <Alert severity="info">
              The BTC you can sell covers all but {fmtToken('MUSD', shortfall, 2)}. That part comes
              from your wallet.
            </Alert>
          )}
          <TxNotice state={needsApproval ? approveTx.state : tx.state} />
          {needsApproval ? (
            <SubmitButton
              busy={approveTx.busy}
              onClick={() =>
                approveTx.send(
                  'Approve MUSD',
                  {
                    address: mezo.musd,
                    abi: erc20Abi,
                    functionName: 'approve',
                    args: [loop.account!, maxUint256],
                  },
                  'Loop account'
                )
              }
            >
              Approve MUSD
            </SubmitButton>
          ) : (
            <SubmitButton busy={tx.busy} disabled={!debt} onClick={submitClose}>
              Close loop
            </SubmitButton>
          )}
        </Stack>
      )}
    </Panel>
  );
}

function LoopSummary({ system, loop }: { system: System; loop: Loop }) {
  const coll = loop.coll ?? 0n;
  const debt = loop.debt ?? 0n;
  const ratio = collateralRatio(coll, debt, system.btcPrice);
  const value = btcValue(coll, system.btcPrice);
  const equity = value !== undefined ? value - debt : undefined;
  const leverage = equity && equity > 0n && value ? (value * 100n) / equity : undefined;
  return (
    <Panel title="Your loop">
      <Row
        label="BTC exposure"
        info={INFO['BTC exposure']}
        value={fmtToken('BTC', coll, 6)}
        hint={fmtUsd(value)}
      />
      <Row label="Debt" value={fmtToken('MUSD', debt, 2)} />
      <Row label="Net value" info={INFO['Loop net value']} value={fmtUsd(equity)} />
      <Row
        label="Leverage"
        value={leverage !== undefined ? `${(Number(leverage) / 100).toFixed(2)}x` : '—'}
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
        value={fmtUsd(liquidationPrice(coll, debt))}
      />
      <AlertsButton />
    </Panel>
  );
}

function HowLoopWorks() {
  return (
    <Panel title="How it works">
      <Stack spacing={1.5}>
        <Typography color="text.secondary">
          One transaction deposits your BTC, borrows MUSD against it, buys more BTC with that MUSD
          on Mezo Pools and adds it to your collateral. At 2x, a 10% BTC move changes your net value
          by about 20%.
        </Typography>
        <Typography color="text.secondary">
          Closing is one transaction too: some BTC is sold to repay the loan and the rest comes back
          to your wallet.
        </Typography>
        <Typography variant="description" color="text.secondary">
          The loan lives in a personal Morbit account only you control. Testnet. Unaudited.
        </Typography>
      </Stack>
    </Panel>
  );
}
