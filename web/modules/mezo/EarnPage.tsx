'use client';

import { Alert, Box, Grid, Link as MuiLink, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useState } from 'react';
import { maxUint256 } from 'viem';
import { useAccount } from 'wagmi';

import { earnVaultAbi, erc20Abi } from './abis';
import { explorerAddress, mezo } from './config';
import { btcValue, fmtAmount, fmtToken, fmtPlain, fmtUsd, parseAmount } from './format';
import { useMezoTx, useMusdSystem, useUserPosition } from './hooks';
import {
  AmountField,
  ConnectPrompt,
  LiveChip,
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
  const vault = system.vault;

  return (
    <>
      <PageTop
        eyebrow="SIMPLE EARN"
        title="Put MUSD to work"
        description="Deposit MUSD into one Morbit position. The vault supplies it to the MUSD Stability Pool, which repays the debt of liquidated troves and pays depositors the liquidated BTC collateral."
        actions={<LiveChip online={system.btcPrice !== undefined} />}
      >
        <MetricRow>
          <Metric
            label="Vault value"
            value={fmtUsd(vault?.totalAssets)}
            hint={
              vault
                ? `${fmtAmount(vault.totalMusd, 2)} MUSD + ${fmtAmount(vault.totalBtc, 6)} BTC`
                : 'Vault not deployed'
            }
          />
          <Metric
            label="mvMUSD price"
            value={vault?.sharePrice !== undefined ? fmtToken('MUSD', vault.sharePrice, 4) : '—'}
            hint="Starts at 1.0000"
          />
          <Metric
            label="Stability Pool deposits"
            value={fmtToken('MUSD', system.stabilityPoolDeposits, 0)}
            hint="All depositors, not only Morbit"
          />
          <Metric label="Your position" value={address ? fmtUsd(position.vault.value) : '—'} />
        </MetricRow>
      </PageTop>
      <PageContainer>
        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>
            {!mezo.earnVault ? (
              <Panel title="Vault not deployed yet">
                <Typography color="text.secondary">
                  The Simple Earn vault contract has not been deployed to Mezo testnet from this
                  build. Run <code>npm run deploy:mezo</code> in <code>contracts/</code> to deploy
                  it.
                </Typography>
              </Panel>
            ) : !address ? (
              <ConnectPrompt message="Connect a wallet on Mezo testnet to deposit MUSD into Simple Earn." />
            ) : (
              <VaultActions system={system} position={position} />
            )}
          </Grid>
          <Grid item xs={12} md={5}>
            <HowItWorks />
          </Grid>
        </Grid>
      </PageContainer>
    </>
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
      'Simple Earn vault'
    );

  const deposit = async () => {
    const done = await depositTx.send(
      'Simple Earn deposit',
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
        <Row
          label="You receive (estimate)"
          value={fmtToken('mvMUSD', estShares, 4)}
          hint="Exact amount set when the deposit confirms"
        />
        <Row label="Goes to" value="MUSD Stability Pool" hint="Through the Morbit vault" />
        <Row label="Fees" value="None" hint="Only Mezo network gas" />
      </Box>
      {position.musdBalance === 0n && (
        <Alert severity="info">
          You have no MUSD yet. Borrow some against BTC on the Borrow page first.
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
          Step 1 of 2 · Approve MUSD
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
  const tx = useMezoTx(() => {
    position.refetch();
    system.refetch();
  });
  const shares = position.vault.shares ?? 0n;
  const amount = parseAmount(text) ?? 0n;
  const portion = (value?: bigint) =>
    value !== undefined && shares > 0n ? (value * amount) / shares : undefined;
  const musdOut = portion(position.vault.musdOut);
  const btcOut = portion(position.vault.btcOut);
  const error = amount > shares ? 'You do not hold that many mvMUSD.' : undefined;

  const withdraw = async () => {
    const done = await tx.send(
      'Simple Earn withdrawal',
      {
        address: mezo.earnVault!,
        abi: earnVaultAbi,
        functionName: 'redeem',
        args: [amount, address!, address!],
      },
      fmtToken('mvMUSD', amount, 4)
    );
    if (done) setText('');
  };

  return (
    <Stack spacing={2.5}>
      <AmountField
        label="Withdraw"
        symbol="mvMUSD"
        value={text}
        onChange={setText}
        balance={shares}
        balanceLabel="Your shares"
        onMax={() => setText(fmtPlain(shares))}
      />
      <Box>
        <Row label="You receive MUSD" value={fmtToken('MUSD', musdOut, 2)} />
        <Row
          label="You receive BTC"
          value={fmtToken('BTC', btcOut, 8)}
          hint={
            btcOut ? fmtUsd(btcValue(btcOut, system.btcPrice)) : 'From liquidation gains, if any'
          }
        />
      </Box>
      <Alert severity="info">
        Withdrawals pay out your share of the vault&apos;s MUSD and BTC. The Stability Pool blocks
        MUSD withdrawals while any trove sits below 110%, until it is liquidated.
      </Alert>
      {error && <Alert severity="warning">{error}</Alert>}
      <TxNotice state={tx.state} />
      <SubmitButton busy={tx.busy} disabled={!amount || !!error} onClick={withdraw}>
        Withdraw
      </SubmitButton>
    </Stack>
  );
}

function HowItWorks() {
  return (
    <Panel title="How Simple Earn works">
      <Stack spacing={2}>
        <Step n={1} title="You deposit MUSD">
          The Morbit vault mints mvMUSD shares at the current share price and supplies all MUSD to
          Mezo&apos;s Stability Pool in the same transaction.
        </Step>
        <Step n={2} title="The pool backs liquidations">
          When a trove falls below 110%, its debt is paid from the pool and its BTC goes to
          depositors. Liquidated BTC is usually worth more than the MUSD it replaces.
        </Step>
        <Step n={3} title="You withdraw MUSD and BTC">
          Redeeming shares returns your share of the vault&apos;s MUSD and any BTC gains. Morbit
          does not swap, rebalance or compound.
        </Step>
        <Alert severity="warning">
          Earnings depend on liquidations, so they can be zero for long periods. If BTC falls fast,
          the BTC you receive can be worth less than the MUSD it replaced. This is a testnet
          deployment and the vault is not audited.
        </Alert>
        {mezo.earnVault && (
          <Typography variant="description" color="text.secondary">
            Vault contract:{' '}
            <MuiLink href={explorerAddress(mezo.earnVault)} target="_blank" rel="noopener">
              {mezo.earnVault}
            </MuiLink>
          </Typography>
        )}
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
