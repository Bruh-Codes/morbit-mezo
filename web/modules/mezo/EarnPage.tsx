'use client';

import {
  Alert,
  Box,
  Button,
  Divider,
  Grid,
  Link as MuiLink,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { maxUint256 } from 'viem';
import { useAccount } from 'wagmi';

import { autoEarnVaultAbi, earnVaultAbi, erc20Abi } from './abis';
import { EARN, mezo } from './config';
import {
  btcValue,
  fmtAmount,
  fmtPlain,
  fmtRatio,
  fmtToken,
  fmtUsd,
  parseAmount,
  timeAgo,
} from './format';
import { useMezoTx, useMusdSystem, useNow, useUserPosition, useVaultDeposited } from './hooks';
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

export function EarnPage() {
  const { address } = useAccount();
  const system = useMusdSystem();
  const position = useUserPosition(system.btcPrice);
  const deposited = useVaultDeposited(address);
  const vault = system.vault;
  const auto = system.autoEarn;

  return (
    <>
      <PageTop title={EARN.name}>
        <MetricRow>
          <Metric
            loading={system.isLoading}
            label="Vault value"
            info={INFO['Vault value']}
            value={fmtUsd(vault?.totalAssets)}
            hint={
              vault?.totalMusd !== undefined
                ? `${fmtAmount(vault.totalMusd, 2)} MUSD + ${fmtAmount(vault.totalBtc, 6)} BTC`
                : undefined
            }
          />
          <Metric
            loading={system.isLoading}
            label="Share price"
            info={INFO['Share price']}
            value={vault?.sharePrice !== undefined ? fmtToken('MUSD', vault.sharePrice, 4) : '—'}
          />
          {mezo.autoEarn ? (
            <Metric
              loading={system.isLoading}
              label="MEZO rewards"
              info={INFO['MEZO rewards']}
              value={auto?.rewardApr !== undefined ? `${fmtRatio(auto.rewardApr, 1)} APR` : '—'}
              hint={auto?.rewardApr === undefined ? 'No reward stream running' : undefined}
            />
          ) : (
            <Metric
              loading={system.isLoading}
              label="Stability Pool"
              info={INFO['Stability Pool']}
              value={fmtToken('MUSD', system.stabilityPoolDeposits, 0)}
            />
          )}
          {address && (
            <Metric
              loading={system.isLoading}
              label="Your position"
              info={INFO['Your position']}
              value={fmtUsd(position.vault.value)}
              hint={
                deposited.data !== undefined && position.vault.value !== undefined
                  ? `Deposited ${fmtAmount(deposited.data, 2)} MUSD · Earned ${fmtUsd(
                      position.vault.value > deposited.data
                        ? position.vault.value - deposited.data
                        : 0n
                    )}`
                  : undefined
              }
            />
          )}
        </MetricRow>
      </PageTop>
      <PageContainer>
        {address && position.legacy && <MoveFromSimpleEarn position={position} />}
        <Grid container spacing={3} alignItems="flex-start">
          <Grid item xs={12} md={7}>
            {!mezo.earnVault ? (
              <Panel title="Vault not deployed">{null}</Panel>
            ) : !address ? (
              <ConnectPrompt message="Connect a wallet to deposit MUSD." />
            ) : (
              <VaultActions system={system} position={position} />
            )}
          </Grid>
          <Grid item xs={12} md={5}>
            <Stack spacing={3}>
              {mezo.autoEarn && <AutoEarnPanel system={system} position={position} />}
              <HowItWorks />
            </Stack>
          </Grid>
        </Grid>
      </PageContainer>
    </>
  );
}

/** Rewards to claim and BTC gains waiting to be compounded. */
function AutoEarnPanel({
  system,
  position,
}: {
  system: ReturnType<typeof useMusdSystem>;
  position: ReturnType<typeof useUserPosition>;
}) {
  const { address } = useAccount();
  const now = useNow();
  const refresh = () => {
    position.refetch();
    system.refetch();
  };
  const claimTx = useMezoTx(refresh);
  const harvestTx = useMezoTx(refresh);
  const auto = system.autoEarn;
  const pendingBtc = system.vault?.totalBtc ?? 0n;
  const canHarvest = auto?.minHarvestBtc !== undefined && pendingBtc >= auto.minHarvestBtc;
  const earned = position.vault.mezoEarned ?? 0n;
  const lastHarvest = auto?.lastHarvestAt ? Number(auto.lastHarvestAt) * 1000 : undefined;

  return (
    <Panel title="Rewards">
      <Stack spacing={2.5}>
        {address && (
          <Box>
            <Row
              label="Your MEZO"
              value={fmtToken('MEZO', earned, 4)}
              hint={
                auto?.mezoPrice !== undefined && earned
                  ? fmtUsd((earned * auto.mezoPrice) / WAD)
                  : undefined
              }
            />
            <TxNotice state={claimTx.state} />
            <Button
              variant="outlined"
              fullWidth
              sx={{ mt: 1.5 }}
              disabled={!earned || claimTx.busy}
              onClick={() =>
                claimTx.send(
                  'Claim MEZO',
                  { address: mezo.earnVault!, abi: autoEarnVaultAbi, functionName: 'claimRewards' },
                  fmtToken('MEZO', earned, 4)
                )
              }
            >
              {claimTx.busy ? 'Claiming…' : 'Claim MEZO'}
            </Button>
          </Box>
        )}
        <Divider />
        <Box>
          <Row
            label="BTC gains to compound"
            info={INFO['BTC gains to compound']}
            value={fmtToken('BTC', pendingBtc, 8)}
            hint={pendingBtc ? fmtUsd(btcValue(pendingBtc, system.btcPrice)) : undefined}
          />
          <Row
            label="Compounded so far"
            value={fmtToken('MUSD', auto?.totalCompoundedMusd, 2)}
            hint={lastHarvest ? `Last ${timeAgo(lastHarvest, now)}` : undefined}
          />
          <TxNotice state={harvestTx.state} />
          {address && (
            <Button
              variant="outlined"
              fullWidth
              sx={{ mt: 1.5 }}
              disabled={!canHarvest || harvestTx.busy}
              onClick={() =>
                harvestTx.send(
                  'Compound',
                  {
                    address: mezo.earnVault!,
                    abi: autoEarnVaultAbi,
                    functionName: 'harvest',
                    args: [0n],
                  },
                  `${fmtAmount(pendingBtc, 8)} BTC → MUSD`
                )
              }
            >
              {harvestTx.busy
                ? 'Compounding…'
                : canHarvest
                ? 'Compound now'
                : 'Nothing to compound'}
            </Button>
          )}
        </Box>
      </Stack>
    </Panel>
  );
}

/** Guides Simple Earn depositors to withdraw, so they can deposit into Auto Earn. */
function MoveFromSimpleEarn({ position }: { position: ReturnType<typeof useUserPosition> }) {
  const tx = useMezoTx(() => position.refetch());
  const { address } = useAccount();
  const legacy = position.legacy!;
  return (
    <Alert
      severity="info"
      sx={{ mb: 3, alignItems: 'center' }}
      action={
        <Button
          color="inherit"
          variant="outlined"
          size="small"
          disabled={tx.busy}
          onClick={() =>
            tx.send(
              'Simple Earn withdrawal',
              {
                address: mezo.legacyVault!,
                abi: earnVaultAbi,
                functionName: 'redeem',
                args: [legacy.shares, address!, address!],
              },
              'All shares, moving to Auto Earn'
            )
          }
        >
          {tx.busy ? 'Withdrawing…' : 'Withdraw'}
        </Button>
      }
    >
      You have {fmtUsd(legacy.value)} in Simple Earn. Withdraw it, then deposit here to
      auto-compound and earn MEZO.
      {tx.state.status === 'error' && <Box sx={{ mt: 0.5 }}>{tx.state.error}</Box>}
    </Alert>
  );
}

function VaultActions({
  system,
  position,
}: {
  system: ReturnType<typeof useMusdSystem>;
  position: ReturnType<typeof useUserPosition>;
}) {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  // Dashboard buttons link here with ?tab=withdraw.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'withdraw') setTab('withdraw');
  }, []);
  return (
    <Panel>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab value="deposit" label="Deposit" />
        <Tab value="withdraw" label="Withdraw" />
      </Tabs>
      {tab === 'deposit' ? (
        <Deposit system={system} position={position} />
      ) : (
        <Withdraw system={system} position={position} />
      )}
    </Panel>
  );
}

function Deposit({
  system,
  position,
}: {
  system: ReturnType<typeof useMusdSystem>;
  position: ReturnType<typeof useUserPosition>;
}) {
  const { address } = useAccount();
  const [text, setText] = useState('');
  const refresh = () => {
    position.refetch();
    system.refetch();
  };
  const approveTx = useMezoTx(refresh);
  const depositTx = useMezoTx(refresh);
  const vault = mezo.earnVault!;

  const amount = parseAmount(text) ?? 0n;
  const sharePrice = system.vault?.sharePrice;
  const estShares = sharePrice ? (amount * WAD) / sharePrice : undefined;
  const needsApproval = amount > 0n && (position.musdAllowanceVault ?? 0n) < amount;

  const error = (() => {
    if (amount === 0n) return undefined;
    if (system.vault?.depositsPaused) return 'Deposits are paused. Withdrawals stay open.';
    if (position.musdBalance !== undefined && amount > position.musdBalance)
      return 'Not enough MUSD in your wallet.';
    if (system.vault?.maxDeposit !== undefined && amount > system.vault.maxDeposit)
      return `The vault cap allows ${fmtAmount(system.vault.maxDeposit, 2)} MUSD more.`;
    return undefined;
  })();

  const approve = () =>
    approveTx.send(
      'Approve MUSD',
      { address: mezo.musd, abi: erc20Abi, functionName: 'approve', args: [vault, maxUint256] },
      `${EARN.name} vault`
    );

  const deposit = async () => {
    const done = await depositTx.send(
      `${EARN.name} deposit`,
      { address: vault, abi: earnVaultAbi, functionName: 'deposit', args: [amount, address!] },
      fmtToken('MUSD', amount, 2)
    );
    if (done) setText('');
  };

  return (
    <Stack spacing={2.5}>
      <AmountField
        label="Deposit"
        symbol="MUSD"
        value={text}
        onChange={setText}
        balance={position.musdBalance}
        onMax={() => setText(fmtPlain(position.musdBalance ?? 0n))}
      />
      <Box>
        <Row label="You receive" value={fmtToken(EARN.share, estShares, 4)} />
        <Row label="Fees" value="None" />
      </Box>
      {position.musdBalance === 0n && (
        <Alert severity="info">
          No MUSD yet? <MuiLink href="/borrow/">Borrow some</MuiLink> first.
        </Alert>
      )}
      {error && <Alert severity="warning">{error}</Alert>}
      <TxNotice
        state={
          needsApproval || approveTx.state.status !== 'success'
            ? approveTx.state
            : { status: 'idle' }
        }
      />
      <TxNotice state={depositTx.state} />
      {needsApproval ? (
        <SubmitButton busy={approveTx.busy} disabled={!!error} onClick={approve}>
          Approve MUSD
        </SubmitButton>
      ) : (
        <SubmitButton busy={depositTx.busy} disabled={!amount || !!error} onClick={deposit}>
          Deposit MUSD
        </SubmitButton>
      )}
    </Stack>
  );
}

function Withdraw({
  system,
  position,
}: {
  system: ReturnType<typeof useMusdSystem>;
  position: ReturnType<typeof useUserPosition>;
}) {
  const { address } = useAccount();
  const [text, setText] = useState('');
  // A percentage pick redeems an exact share count, so 100% never leaves dust behind.
  const [pick, setPick] = useState<number | undefined>();
  const tx = useMezoTx(() => {
    position.refetch();
    system.refetch();
  });
  const shares = position.vault.shares ?? 0n;
  const value = position.vault.value ?? 0n;
  const amount = parseAmount(text) ?? 0n;
  const sharesToRedeem =
    pick !== undefined
      ? (shares * BigInt(pick)) / 100n
      : value > 0n
      ? (amount * shares) / value
      : 0n;
  const portion = (out?: bigint) =>
    out !== undefined && shares > 0n ? (out * sharesToRedeem) / shares : undefined;
  const musdOut = portion(position.vault.musdOut);
  const btcOut = portion(position.vault.btcOut);
  const error =
    pick === undefined && amount > value && value > 0n
      ? `You can withdraw up to ${fmtUsd(value)}.`
      : undefined;

  const choose = (pct: number) => {
    setPick(pct);
    setText(fmtPlain((value * BigInt(pct)) / 100n));
  };

  const withdraw = async () => {
    const done = await tx.send(
      `${EARN.name} withdrawal`,
      {
        address: mezo.earnVault!,
        abi: earnVaultAbi,
        functionName: 'redeem',
        args: [sharesToRedeem, address!, address!],
      },
      `${fmtAmount(musdOut, 2)} MUSD${btcOut ? ` + ${fmtAmount(btcOut, 6)} BTC` : ''}`
    );
    if (done) {
      setText('');
      setPick(undefined);
    }
  };

  return (
    <Stack spacing={2.5}>
      <AmountField
        label="Withdraw"
        symbol="MUSD"
        value={text}
        onChange={(next) => {
          setText(next);
          setPick(undefined);
        }}
        balance={value}
        balanceLabel="Your position"
      />
      <Stack direction="row" spacing={1}>
        {[25, 50, 75, 100].map((pct) => (
          <Button
            key={pct}
            size="small"
            variant={pick === pct ? 'contained' : 'outlined'}
            onClick={() => choose(pct)}
            disabled={!shares}
          >
            {pct === 100 ? 'All' : `${pct}%`}
          </Button>
        ))}
      </Stack>
      <Box>
        <Row label="You receive MUSD" value={fmtToken('MUSD', musdOut, 2)} />
        <Row
          label="You receive BTC"
          value={fmtToken('BTC', btcOut, 8)}
          hint={btcOut ? fmtUsd(btcValue(btcOut, system.btcPrice)) : undefined}
        />
      </Box>
      {error && <Alert severity="warning">{error}</Alert>}
      <TxNotice state={tx.state} />
      <SubmitButton busy={tx.busy} disabled={!sharesToRedeem || !!error} onClick={withdraw}>
        Withdraw
      </SubmitButton>
    </Stack>
  );
}

function HowItWorks() {
  return (
    <Panel title="How it works">
      <Stack spacing={2}>
        <Step n={1} title="Deposit MUSD">
          The vault puts it in the MUSD Stability Pool.
        </Step>
        <Step n={2} title="Earn BTC">
          The pool repays liquidated loans and receives their BTC.
        </Step>
        {mezo.autoEarn ? (
          <>
            <Step n={3} title="Auto-compound">
              BTC gains are swapped to MUSD on Mezo Pools and deposited again.
            </Step>
            <Step n={4} title="Earn MEZO">
              MEZO rewards stream to every depositor. Claim anytime.
            </Step>
          </>
        ) : (
          <Step n={3} title="Withdraw anytime">
            Get your share of MUSD and BTC.
          </Step>
        )}
        <Typography variant="description" color="text.secondary">
          Testnet. Unaudited. Returns depend on liquidations.
        </Typography>
      </Stack>
    </Panel>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={2}>
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          bgcolor: 'secondary.main',
          color: '#111',
          fontWeight: 700,
          display: 'grid',
          placeItems: 'center',
          flex: '0 0 auto',
        }}
      >
        {n}
      </Box>
      <Box>
        <Typography fontWeight={700}>{title}</Typography>
        <Typography color="text.secondary">{children}</Typography>
      </Box>
    </Stack>
  );
}
