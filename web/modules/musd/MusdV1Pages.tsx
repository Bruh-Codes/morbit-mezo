'use client';

import {
  ArrowBack,
  ArrowDropDown,
  Search,
  Star,
  StarBorder,
  Close,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { ListWrapper } from 'components/lists/ListWrapper';
import { useDemoLiquidity, demoPools, DemoPool, estimateEarnings } from './demoLiquidity';

const assetSrc = (symbol: string) => `/icons/tokens/${symbol.toLowerCase()}.svg`;
const money = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function AssetIcon({ symbol, size = 30 }: { symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [symbol]);
  return failed ? (
    <Box sx={{ width: size, height: size, borderRadius: '50%', bgcolor: 'secondary.main', color: '#0A0A0A', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: size * 0.42 }}>{symbol.slice(0, 1)}</Box>
  ) : (
    <Box component="img" src={assetSrc(symbol)} alt={`${symbol} logo`} onError={() => setFailed(true)} sx={{ width: size, height: size, borderRadius: '50%', flex: '0 0 auto' }} />
  );
}

function PoolAssets({ pool, size = 34 }: { pool: DemoPool; size?: number }) {
  const [first, second] = pool.pair.split('_');
  return (
    <Stack direction="row" alignItems="center" sx={{ minWidth: size + 22 }}>
      <AssetIcon symbol={first} size={size} />
      <Box sx={{ ml: -1.2, zIndex: 1, borderRadius: '50%', bgcolor: 'background.paper', p: 0.25 }}><AssetIcon symbol={second} size={size} /></Box>
    </Stack>
  );
}

function NetworkIcon({ network, size = 18 }: { network: string; size?: number }) {
  const paths: Record<string, string> = { Base: 'base', Ethereum: 'ethereum', Mezo: 'mezo', BSC: 'binance' };
  return <Box component="img" src={`/icons/networks/${paths[network] ?? 'ethereum'}.svg`} alt={`${network} logo`} sx={{ width: size, height: size }} />;
}

function PageTop({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Box className="morbit-page-top" sx={{ position: 'relative', overflow: 'visible', py: { xs: 5, md: 7 }, mb: 4, color: 'text.primary', bgcolor: (theme) => theme.palette.mode === 'dark' ? theme.palette.background.surface2 : '#E9ECDD' }}>
      <Box aria-hidden sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.14, backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '15px 15px' }} />
      <Container maxWidth={false} sx={{ position: 'relative', zIndex: 1, px: { xs: 2, xsm: 3, md: 5, xl: 8 } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'flex-start' }} gap={3}>
          <Box sx={{ minWidth: 0 }}>
            {eyebrow && <Typography variant="description" sx={{ display: 'block', color: 'text.secondary', letterSpacing: 2, fontWeight: 700, mb: 1 }}>{eyebrow}</Typography>}
            <Typography variant="h1" sx={{ fontSize: { xs: 32, md: 42 }, mb: 1 }}>{title}</Typography>
            {description && <Typography color="text.secondary" sx={{ fontSize: 16 }}>{description}</Typography>}
            {children}
          </Box>
          {actions && <Stack direction="row" justifyContent={{ xs: 'flex-start', md: 'flex-end' }} sx={{ flexShrink: 0 }}>{actions}</Stack>}
        </Stack>
      </Container>
    </Box>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <Box><Typography variant="description" color="text.secondary">{label}</Typography><Typography variant="h2" sx={{ mt: 0.5 }}>{value}</Typography>{hint && <Typography variant="description" color="text.secondary">{hint}</Typography>}</Box>;
}

function TableFrame({ children, columns, labels }: { children: ReactNode; columns: string; labels: string[] }) {
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box role="table" sx={{ minWidth: 740 }}>
        <Box role="row" sx={{ display: 'grid', gridTemplateColumns: columns, alignItems: 'center', px: 3.5, py: 2, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
          {labels.map((label, index) => <Typography role="columnheader" key={`${label}-${index}`} variant="description" color="text.secondary" sx={{ textAlign: index === 0 ? 'left' : 'right', px: 1 }}>{label}</Typography>)}
        </Box>
        {children}
      </Box>
    </Box>
  );
}

function TableRow({ columns, children }: { columns: string; children: ReactNode }) {
  return <Box role="row" sx={{ display: 'grid', gridTemplateColumns: columns, alignItems: 'center', px: 3.5, py: 2.25, borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 }, '&:hover': { bgcolor: 'action.hover' } }}>{children}</Box>;
}

function Cell({ children, align = 'right' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return <Box role="cell" sx={{ textAlign: align, px: 1, minWidth: 0 }}>{children}</Box>;
}

function PoolName({ pool }: { pool: DemoPool }) {
  const [first, second] = pool.pair.split('_');
  return (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
      <PoolAssets pool={pool} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="main16" fontWeight={700} noWrap>{first} / {second}</Typography>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <NetworkIcon network={pool.network} />
          <Typography variant="description" color="text.secondary" noWrap>{pool.protocol} · {pool.network}</Typography>
        </Stack>
      </Box>
    </Stack>
  );
}

function PoolFavoriteButton({ poolId }: { poolId: string }) {
  const [favorite, setFavorite] = useState(false);
  useEffect(() => {
    try { setFavorite((JSON.parse(localStorage.getItem('morbit-favorite-pools') || '[]') as string[]).includes(poolId)); } catch { setFavorite(false); }
  }, [poolId]);
  const toggle = () => {
    let ids: string[] = [];
    try { ids = JSON.parse(localStorage.getItem('morbit-favorite-pools') || '[]') as string[]; } catch { ids = []; }
    const next = favorite ? ids.filter((id) => id !== poolId) : [...new Set([...ids, poolId])];
    localStorage.setItem('morbit-favorite-pools', JSON.stringify(next));
    setFavorite(!favorite);
  };
  return <IconButton aria-label={favorite ? 'Remove from favourites' : 'Add to favourites'} onClick={toggle} size="small" color={favorite ? 'secondary' : 'default'}>{favorite ? <Star /> : <StarBorder />}</IconButton>;
}

function SimpleEarnGlyph({ size = 26 }: { size?: number }) {
  return <Box component="img" src="/icons/simple-earn.svg" alt="" sx={{ width: size, height: size, objectFit: 'contain' }} />;
}

function SimpleEarnButton({ onClick }: { onClick: () => void }) {
  return <Button onClick={onClick} variant="contained" startIcon={<SimpleEarnGlyph />} sx={(theme) => ({ color: theme.palette.mode === 'dark' ? '#F4F7EF' : '#183418', bgcolor: theme.palette.mode === 'dark' ? '#263B27' : '#E2F0DF', '&:hover': { bgcolor: theme.palette.mode === 'dark' ? '#314B31' : '#D4E8CF' }, px: 2.5, py: 1.25, fontSize: 16, fontWeight: 700, boxShadow: 'none' })}>Simple Earn</Button>;
}

function SimpleEarnTitle({ children }: { children: ReactNode }) {
  return <Stack direction="row" spacing={1.5} alignItems="center"><SimpleEarnGlyph size={32} /><Typography variant="h2">{children}</Typography></Stack>;
}

type EarnModalProps = { open: boolean; onClose: () => void; onDeposit: (asset: string, amount: number) => void };
function SimpleEarnModal({ open, onClose, onDeposit }: EarnModalProps) {
  const [asset, setAsset] = useState('MUSD');
  const [amount, setAmount] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [complete, setComplete] = useState(false);
  const parsed = Number(amount);
  const close = () => { onClose(); setComplete(false); setAgreed(false); setAmount(''); };
  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 7 }}><SimpleEarnTitle>{complete ? 'Simple Earn confirmed' : 'Simple Earn'}</SimpleEarnTitle><IconButton onClick={close} aria-label="Close modal" sx={{ position: 'absolute', right: 12, top: 12 }}><Close /></IconButton></DialogTitle>
      {complete ? (
        <><DialogContent><Typography color="text.secondary">Your {money(parsed)} {asset} demo deposit was assigned across eligible pools and added as one managed position.</Typography></DialogContent><DialogActions sx={{ p: 3 }}><Button variant="contained" onClick={close}>Done</Button></DialogActions></>
      ) : (
        <>
          <DialogContent>
            <Stack spacing={3}>
              <Typography color="text.secondary">Simple Earn allocates your assets across the most promising available liquidity pools, so you can realize yield opportunities through one managed position.</Typography>
              <TextField select label="Asset" value={asset} onChange={(event) => setAsset(event.target.value)} fullWidth>
                {['MUSD', 'USDC', 'USDT'].map((option) => <MenuItem key={option} value={option}><Stack direction="row" spacing={1.5} alignItems="center"><AssetIcon symbol={option} size={24} />{option}</Stack></MenuItem>)}
              </TextField>
              <TextField type="number" label={`Deposit amount (${asset})`} value={amount} onChange={(event) => setAmount(event.target.value)} inputProps={{ min: 0, step: 'any' }} helperText="Demo mode: no wallet transaction will be sent." />
              <Paper variant="outlined" sx={{ p: 2.5 }}>
                <Typography variant="subheader1" fontWeight={700}>Before you deposit</Typography>
                <Typography variant="description" color="text.secondary" component="p" sx={{ mt: 1 }}>Your deposit is managed across eligible pools. Pool liquidity, token prices, and returns can change. Withdrawals are simulated in this preview.</Typography>
              </Paper>
              <Stack direction="row" alignItems="flex-start" spacing={1}><Checkbox checked={agreed} onChange={(event) => setAgreed(event.target.checked)} sx={{ p: 0 }} /><Typography variant="description" color="text.secondary">I understand how Simple Earn allocates my assets and the risks of liquidity pools.</Typography></Stack>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 3, pt: 0 }}><Button onClick={close} variant="surface">Cancel</Button><Button variant="contained" disabled={!agreed || !(parsed > 0)} onClick={() => { onDeposit(asset, parsed); setComplete(true); }}>Confirm Simple Earn</Button></DialogActions>
        </>
      )}
    </Dialog>
  );
}

type LiquidityModalProps = { open: boolean; action: 'add' | 'withdraw' | null; pool: DemoPool; positionValue: number; onClose: () => void; onAdd: (musd: number, paired: number) => void; onWithdraw: (fraction: number) => void };
function LiquidityModal({ open, action, pool, positionValue, onClose, onAdd, onWithdraw }: LiquidityModalProps) {
  const [musd, setMusd] = useState('');
  const [paired, setPaired] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [complete, setComplete] = useState(false);
  const [first, second] = pool.pair.split('_');
  const amount = Number(withdrawAmount);
  const close = () => { onClose(); setComplete(false); setMusd(''); setPaired(''); setWithdrawAmount(''); };
  const confirm = () => {
    if (action === 'add' && Number(musd) > 0 && Number(paired) > 0) onAdd(Number(musd), Number(paired));
    if (action === 'withdraw' && amount > 0 && positionValue > 0) onWithdraw(Math.min(1, amount / positionValue));
    setComplete(true);
  };
  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>{complete ? 'Demo action complete' : action === 'withdraw' ? 'Withdraw liquidity' : 'Add liquidity'}</DialogTitle>
      <DialogContent>
        {complete ? <Alert severity="success" sx={{ mt: 1 }}>Your simulated {action} has been recorded in Transactions.</Alert> : (
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Typography color="text.secondary">{pool.protocol} · {pool.network} · Demo actions only</Typography>
            {action === 'add' ? <>
              <TextField type="number" label={`${first} amount`} value={musd} onChange={(event) => setMusd(event.target.value)} inputProps={{ min: 0, step: 'any' }} InputProps={{ startAdornment: <InputAdornment position="start"><AssetIcon symbol={first} size={22} /></InputAdornment> }} />
              <TextField type="number" label={`${second} amount`} value={paired} onChange={(event) => setPaired(event.target.value)} inputProps={{ min: 0, step: 'any' }} InputProps={{ startAdornment: <InputAdornment position="start"><AssetIcon symbol={second} size={22} /></InputAdornment> }} />
            </> : <>
              <Typography>Position value: {money(positionValue)}</Typography>
              <TextField type="number" label="Amount to withdraw ($)" value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} inputProps={{ min: 0, max: positionValue, step: 'any' }} helperText="Withdraw all or part of this pool position." />
              <Button onClick={() => setWithdrawAmount(positionValue.toString())} sx={{ alignSelf: 'flex-start' }}>Withdraw all</Button>
            </>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 3 }}><Button onClick={close} variant="surface">{complete ? 'Close' : 'Cancel'}</Button>{!complete && <Button variant="contained" disabled={action === 'add' ? !(Number(musd) > 0 && Number(paired) > 0) : !(amount > 0 && positionValue > 0)} onClick={confirm}>{action === 'withdraw' ? 'Confirm withdrawal' : 'Confirm deposit'}</Button>}</DialogActions>
    </Dialog>
  );
}

function useEarnModal() {
  const [open, setOpen] = useState(false);
  const liquidity = useDemoLiquidity();
  const onDeposit = (asset: string, amount: number) => liquidity.addSimpleEarn(asset, amount, demoPools.slice(0, 4).map((pool) => pool.id));
  return { open, setOpen, liquidity, onDeposit };
}

export function LiquidityDashboardPage() {
  const earn = useEarnModal();
  const { positions, simpleEarnPositions, ready } = earn.liquidity;
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const currentEarnPosition = simpleEarnPositions.find((position) => position.id === withdrawId) ?? null;
  const earnValue = simpleEarnPositions.reduce((sum, position) => sum + position.amount, 0)
    + Object.values(positions).reduce((sum, position) => sum + position.musd + position.paired, 0);
  return (
    <>
      <PageTop title="Dashboard" description="Your MUSD liquidity positions, rewards, and activity." actions={<SimpleEarnButton onClick={() => earn.setOpen(true)} />}>
        <Stack direction="row" spacing={{ xs: 3, md: 6 }} sx={{ mt: 4, flexWrap: 'wrap' }}>
          <Metric label="Position value · est." value={ready ? money(earnValue) : '—'} />
          <Metric label="Net APR" value="—" />
          <Metric label="Available rewards" value="—" />
        </Stack>
      </PageTop>
    <Container maxWidth={false} sx={{ pb: 12, px: { xs: 2, xsm: 3, md: 5, xl: 8 } }}>
        <Stack spacing={8}>
          {simpleEarnPositions.length > 0 && <ListWrapper titleComponent={<Typography variant="h3">Simple Earn positions</Typography>} paperSx={{ bgcolor: 'background.surface' }}>
            <TableFrame labels={['Strategy', 'Deposited', 'Estimated earnings', 'Current value', 'Actions']} columns="minmax(230px, 2fr) repeat(3, minmax(125px, 1fr)) minmax(110px, 0.8fr)">
              {simpleEarnPositions.map((position) => {
                const earnings = estimateEarnings(position.amount, 4.92, position.timestamp);
                return <TableRow key={position.id} columns="minmax(230px, 2fr) repeat(3, minmax(125px, 1fr)) minmax(110px, 0.8fr)">
                  <Cell align="left"><Stack direction="row" spacing={1.5} alignItems="center"><SimpleEarnGlyph size={34} /><Box><Typography fontWeight={700}>Simple Earn</Typography><Typography variant="description" color="text.secondary">{position.asset} strategy · {position.allocations.length} pools</Typography></Box></Stack></Cell>
                  <Cell><Typography fontWeight={700}>{money(position.amount)} {position.asset}</Typography></Cell>
                  <Cell><Typography fontWeight={700}>{money(earnings)}</Typography><Typography variant="description" color="text.secondary">4.92% APR est.</Typography></Cell>
                  <Cell><Typography fontWeight={700}>{money(position.amount + earnings)}</Typography></Cell>
                  <Cell><Button variant="surface" onClick={() => setWithdrawId(position.id)}>Withdraw</Button></Cell>
                </TableRow>;
              })}
            </TableFrame>
          </ListWrapper>}

          <ListWrapper titleComponent={<Typography variant="h3">Your liquidity positions</Typography>} paperSx={{ bgcolor: 'background.surface' }}>
            <TableFrame labels={['Pool', 'Deposited', 'Estimated earnings', 'Current value', 'Actions']} columns="minmax(230px, 2fr) repeat(3, minmax(125px, 1fr)) minmax(170px, 1fr)">
              {demoPools.filter((pool) => (positions[pool.id]?.musd ?? 0) + (positions[pool.id]?.paired ?? 0) > 0).length === 0 ? <Box sx={{ minHeight: 190, display: 'grid', placeItems: 'center', p: 4, textAlign: 'center' }}><Box><Typography variant="h3">No simulated positions yet</Typography><Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>Add liquidity in a pool to see your position here.</Typography><Button component={Link} href="/markets/" variant="surface">Explore pools</Button></Box></Box> : demoPools.filter((pool) => (positions[pool.id]?.musd ?? 0) + (positions[pool.id]?.paired ?? 0) > 0).map((pool) => {
                const position = positions[pool.id];
                const deposited = position.musd + position.paired;
                const apr = Number(pool.apr.replace('%', ''));
                const earnings = estimateEarnings(deposited, apr, position.since);
                return <TableRow key={pool.id} columns="minmax(230px, 2fr) repeat(3, minmax(125px, 1fr)) minmax(170px, 1fr)">
                  <Cell align="left"><PoolName pool={pool} /></Cell><Cell><Typography fontWeight={700}>{money(deposited)}</Typography></Cell><Cell><Typography fontWeight={700}>{money(earnings)}</Typography><Typography variant="description" color="text.secondary">{pool.apr} APR est.</Typography></Cell><Cell><Typography fontWeight={700}>{money(deposited + earnings)}</Typography></Cell><Cell><Stack direction="row" spacing={1} justifyContent="flex-end"><Button component={Link} href={`/pool/${pool.id}/`} variant="surface">Manage</Button><Button component={Link} href={`/pool/${pool.id}/?action=withdraw`} variant="contained">Withdraw</Button></Stack></Cell>
                </TableRow>;
              })}
            </TableFrame>
          </ListWrapper>
        </Stack>

        <Box sx={{ mt: 20 }}>
          <ListWrapper titleComponent={<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}><Typography variant="h3">Available pools</Typography><Button component={Link} href="/markets/" variant="surface">View all pools</Button></Box>}>
            <TableFrame labels={['Pool', 'Pool TVL', 'Estimated APR', 'Actions']} columns="minmax(250px, 2fr) repeat(2, minmax(140px, 1fr)) minmax(120px, 0.8fr)">
              {demoPools.slice(0, 3).map((pool) => <TableRow key={pool.id} columns="minmax(250px, 2fr) repeat(2, minmax(140px, 1fr)) minmax(120px, 0.8fr)"><Cell align="left"><PoolName pool={pool} /></Cell><Cell><Typography fontWeight={700}>{pool.tvl}</Typography></Cell><Cell><Typography fontWeight={700}>{pool.apr}</Typography></Cell><Cell><Button component={Link} href={`/pool/${pool.id}/`} variant="surface">Details</Button></Cell></TableRow>)}
            </TableFrame>
          </ListWrapper>
        </Box>
      </Container>
      <SimpleEarnModal open={earn.open} onClose={() => earn.setOpen(false)} onDeposit={earn.onDeposit} />
      <SimpleWithdrawDialog position={currentEarnPosition} onClose={() => setWithdrawId(null)} onWithdraw={(amount) => { if (currentEarnPosition) earn.liquidity.withdrawSimpleEarn(currentEarnPosition.id, amount); setWithdrawId(null); }} />
    </>
  );
}

function SimpleWithdrawDialog({ position, onClose, onWithdraw }: { position: { id: string; asset: string; amount: number; timestamp: number } | null; onClose: () => void; onWithdraw: (amount: number) => void }) {
  const [amount, setAmount] = useState('');
  useEffect(() => { setAmount(position?.amount.toString() ?? ''); }, [position]);
  const earnings = position ? estimateEarnings(position.amount, 4.92, position.timestamp) : 0;
  return <Dialog open={Boolean(position)} onClose={onClose} fullWidth maxWidth="sm"><DialogTitle><SimpleEarnTitle>Withdraw Simple Earn</SimpleEarnTitle></DialogTitle><DialogContent><Stack spacing={3} sx={{ pt: 1 }}>
    {position && <><Alert severity="info">This withdraws from this Simple Earn position. Other positions remain invested.</Alert><Paper variant="outlined" sx={{ p: 2.5 }}><Stack spacing={1}><Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography color="text.secondary">Deposited</Typography><Typography fontWeight={700}>{money(position.amount)} {position.asset}</Typography></Box><Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography color="text.secondary">Estimated earnings</Typography><Typography fontWeight={700}>{money(earnings)}</Typography></Box><Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography color="text.secondary">Estimated value</Typography><Typography fontWeight={700}>{money(position.amount + earnings)}</Typography></Box></Stack></Paper><TextField type="number" label={`Withdraw amount (${position.asset})`} value={amount} onChange={(event) => setAmount(event.target.value)} inputProps={{ min: 0, max: position.amount, step: 'any' }} helperText={`Available: ${money(position.amount)} ${position.asset}`} /></>}
  </Stack></DialogContent><DialogActions sx={{ p: 3 }}><Button variant="surface" onClick={onClose}>Cancel</Button><Button variant="contained" disabled={!position || !(Number(amount) > 0) || Number(amount) > position.amount} onClick={() => onWithdraw(Number(amount))}>Withdraw</Button></DialogActions></Dialog>;
}

export function MusdMarketsPage() {
  const earn = useEarnModal();
  const [network, setNetwork] = useState('Base');
  const [networkMenu, setNetworkMenu] = useState<HTMLElement | null>(null);
  const [search, setSearch] = useState('');
  const pools = demoPools.filter((pool) => pool.network === network && `${pool.pair} ${pool.protocol} ${pool.network} ${pool.rewards.join(' ')}`.toLowerCase().includes(search.toLowerCase().trim()));
  const totalTvl = network === 'Base' ? '$1.70M' : network === 'Mezo' ? '$820K' : network === 'Ethereum' ? '$2.14M' : '$680K';
  return <>
    <PageTop eyebrow="MUSD LIQUIDITY" title={<Stack direction="row" alignItems="center" spacing={1}><NetworkIcon network={network} size={32} /><Button color="inherit" onClick={(event) => setNetworkMenu(event.currentTarget)} sx={{ p: 0, textTransform: 'none', fontSize: 'inherit', fontWeight: 700 }}>{network} Market <Chip label="V1" size="small" sx={{ bgcolor: 'secondary.main', color: '#111', mx: 1 }} /><ArrowDropDown /></Button></Stack>} description="Explore supported liquidity pools and compare yield opportunities." actions={<SimpleEarnButton onClick={() => earn.setOpen(true)} />}>
      <Menu anchorEl={networkMenu} open={Boolean(networkMenu)} onClose={() => setNetworkMenu(null)}>{['Base', 'Mezo', 'Ethereum', 'BSC'].map((item) => <MenuItem key={item} selected={item === network} onClick={() => { setNetwork(item); setNetworkMenu(null); }}><Stack direction="row" alignItems="center" spacing={1.5}><NetworkIcon network={item} />{item} Market</Stack></MenuItem>)}</Menu>
      <Stack direction="row" spacing={{ xs: 3, md: 7 }} sx={{ mt: 3, flexWrap: 'wrap' }}><Metric label="Pools" value={String(pools.length)} hint="Supported in this market" /><Metric label="Combined TVL · demo" value={totalTvl} /><Metric label="Network" value={network} /></Stack>
    </PageTop>
    <Container maxWidth={false} sx={{ pb: 12, px: { xs: 2, xsm: 3, md: 5, xl: 8 } }}>
      <ListWrapper titleComponent={<Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between" spacing={2} sx={{ width: '100%' }}><Typography variant="h3">Supported pools</Typography><TextField size="small" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pools by asset, protocol, or network" sx={{ width: { xs: '100%', md: 430 } }} InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} /></Stack>}>
        <TableFrame labels={['Pool', 'Pool TVL · demo', 'Estimated APR · demo', 'Rewards', 'Actions']} columns="minmax(240px, 2fr) repeat(3, minmax(125px, 1fr)) minmax(100px, 0.8fr)">
          {pools.length ? pools.map((pool) => <TableRow key={pool.id} columns="minmax(240px, 2fr) repeat(3, minmax(125px, 1fr)) minmax(100px, 0.8fr)"><Cell align="left"><PoolName pool={pool} /></Cell><Cell><Typography fontWeight={700}>{pool.tvl}</Typography></Cell><Cell><Typography fontWeight={700}>{pool.apr}</Typography></Cell><Cell><Stack direction="row" justifyContent="flex-end" spacing={0.5}>{pool.rewards.map((symbol) => <Chip key={symbol} size="small" label={symbol} />)}</Stack></Cell><Cell><Stack direction="row" justifyContent="flex-end" alignItems="center"><PoolFavoriteButton poolId={pool.id} /><Button component={Link} href={`/pool/${pool.id}/`} variant="surface">Details</Button></Stack></Cell></TableRow>) : <Box sx={{ p: 6, textAlign: 'center' }}><Typography fontWeight={700}>No pools found</Typography><Typography color="text.secondary">Try another search or select a different market.</Typography></Box>}
        </TableFrame>
        <Alert severity="info" sx={{ borderRadius: 0 }}>Demo pool metrics and actions are illustrative; deposits are simulated, and no wallet transaction is sent.</Alert>
      </ListWrapper>
    </Container>
    <SimpleEarnModal open={earn.open} onClose={() => earn.setOpen(false)} onDeposit={earn.onDeposit} />
  </>;
}

export function MusdTransactionsTop() {
  return <PageTop eyebrow="MUSD LIQUIDITY" title="Transaction history" description="Review on-chain transactions and simulated liquidity activity." />;
}

export function MusdPoolDetailPage({ poolId: suppliedPoolId }: { poolId?: string }) {
  const params = useParams<{ poolId?: string }>();
  const poolId = suppliedPoolId ?? params?.poolId;
  const pool = demoPools.find((item) => item.id === poolId) ?? demoPools[0];
  const liquidity = useDemoLiquidity();
  const position = liquidity.positions[pool.id] ?? { musd: 0, paired: 0, since: 0 };
  const deposited = position.musd + position.paired;
  const apr = Number(pool.apr.replace('%', ''));
  const earnings = estimateEarnings(deposited, apr, position.since);
  const [modalAction, setModalAction] = useState<'add' | 'withdraw' | null>(null);
  const [favorite, setFavorite] = useState(false);
  const autoOpenedWithdraw = useRef(false);
  const [first, second] = pool.pair.split('_');
  useEffect(() => { autoOpenedWithdraw.current = false; }, [pool.id]);
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem('morbit-favorite-pools') || '[]') as string[]; setFavorite(saved.includes(pool.id)); } catch { setFavorite(false); }
    if (!autoOpenedWithdraw.current && new URLSearchParams(window.location.search).get('action') === 'withdraw' && deposited > 0) {
      autoOpenedWithdraw.current = true;
      setModalAction('withdraw');
    }
  }, [pool.id, deposited]);
  const toggleFavorite = () => {
    const ids = JSON.parse(localStorage.getItem('morbit-favorite-pools') || '[]') as string[];
    const next = favorite ? ids.filter((id) => id !== pool.id) : [...new Set([...ids, pool.id])];
    localStorage.setItem('morbit-favorite-pools', JSON.stringify(next)); setFavorite(!favorite);
  };
  return <>
    <PageTop title={<Stack direction="row" spacing={1.5} alignItems="center"><PoolAssets pool={pool} size={38} /><Box>{first} / {second} Pool</Box></Stack>} description={<Stack direction="row" spacing={1} alignItems="center"><NetworkIcon network={pool.network} />{pool.protocol} · {pool.network} · Demo actions only</Stack>} actions={<Stack direction="row" spacing={1}><Button variant="surface" onClick={toggleFavorite} startIcon={favorite ? <Star /> : <StarBorder />}>Favourite</Button><Button component={Link} href="/markets/" variant="surface" startIcon={<ArrowBack />}>All pools</Button></Stack>}>
      <Stack direction="row" spacing={{ xs: 3, md: 7 }} sx={{ mt: 3, flexWrap: 'wrap' }}><Metric label="Pool TVL · demo" value={pool.tvl} /><Metric label="Estimated APR · demo" value={pool.apr} /><Metric label="Incentives" value={pool.rewards.join(' · ')} /></Stack>
    </PageTop>
    <Container maxWidth={false} sx={{ pb: 12, px: { xs: 2, xsm: 3, md: 5, xl: 8 } }}>
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Box sx={{ px: 3.5, py: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}><Typography variant="h3">Pool overview</Typography><Stack direction="row" spacing={1.5}><Button variant="surface" onClick={() => setModalAction('add')}>Add liquidity</Button><Button variant="contained" disabled={!deposited} onClick={() => setModalAction('withdraw')}>Withdraw</Button></Stack></Box>
        <Divider />
        <TableFrame labels={['Pool', 'Network', 'Protocol', 'Rewards']} columns="minmax(260px, 2fr) repeat(3, minmax(130px, 1fr))"><TableRow columns="minmax(260px, 2fr) repeat(3, minmax(130px, 1fr))"><Cell align="left"><PoolName pool={pool} /></Cell><Cell><Typography fontWeight={700}>{pool.network}</Typography></Cell><Cell><Typography fontWeight={700}>{pool.protocol}</Typography></Cell><Cell><Typography fontWeight={700}>{pool.rewards.join(' · ')}</Typography></Cell></TableRow></TableFrame>
      </Paper>
      <Box sx={{ mt: 4 }}><ListWrapper titleComponent={<Typography variant="h3">Your position in this pool</Typography>}>
        <TableFrame labels={[first, second, 'Deposited', 'Estimated earnings', 'Estimated value', 'Actions']} columns="repeat(5, minmax(130px, 1fr)) minmax(140px, 0.8fr)">
          {deposited ? <TableRow columns="repeat(5, minmax(130px, 1fr)) minmax(140px, 0.8fr)"><Cell><Stack alignItems="flex-end"><Stack direction="row" spacing={1} alignItems="center"><AssetIcon symbol={first} size={24} />{money(position.musd)}</Stack></Stack></Cell><Cell><Stack alignItems="flex-end"><Stack direction="row" spacing={1} alignItems="center"><AssetIcon symbol={second} size={24} />{money(position.paired)}</Stack></Stack></Cell><Cell><Typography fontWeight={700}>{money(deposited)}</Typography></Cell><Cell><Typography fontWeight={700}>{money(earnings)}</Typography><Typography variant="description" color="text.secondary">{pool.apr} APR est.</Typography></Cell><Cell><Typography fontWeight={700}>{money(deposited + earnings)}</Typography></Cell><Cell><Button variant="contained" onClick={() => setModalAction('withdraw')}>Withdraw</Button></Cell></TableRow> : <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No position in this pool yet.</Typography><Button sx={{ mt: 2 }} variant="surface" onClick={() => setModalAction('add')}>Add liquidity</Button></Box>}
        </TableFrame>
      </ListWrapper></Box>
      <Alert severity="warning" sx={{ mt: 3 }}>Liquidity provision involves pool, peg, and impermanent-loss risks. Incentives can change by epoch and are not guaranteed.</Alert>
    </Container>
    <LiquidityModal open={Boolean(modalAction)} action={modalAction} pool={pool} positionValue={deposited + earnings} onClose={() => setModalAction(null)} onAdd={(musd, paired) => liquidity.addLiquidity(pool.id, musd, paired)} onWithdraw={(fraction) => liquidity.withdrawLiquidity(pool.id, fraction)} />
  </>;
}

export function DemoActivityList() {
  const { activities } = useDemoLiquidity();
  if (!activities.length) return null;
  const columns = 'minmax(150px, 1fr) minmax(230px, 2fr) minmax(220px, 1.5fr) minmax(190px, 1.2fr) minmax(110px, 0.8fr)';
  return <ListWrapper titleComponent={<Typography variant="h3">Simulated liquidity activity</Typography>}>
    <TableFrame labels={['Action', 'Pool', 'Amount', 'Date', 'Status']} columns={columns}>
      {activities.map((activity) => {
        const pool = demoPools.find((item) => item.id === activity.poolId) ?? demoPools[0];
        const [first, second] = pool.pair.split('_');
        return <TableRow key={activity.id} columns={columns}><Cell align="left"><Typography fontWeight={700}>{activity.action}</Typography></Cell><Cell align="left"><PoolName pool={pool} /></Cell><Cell><Typography>{money(activity.musd)} {first}{activity.paired ? ` + ${money(activity.paired)} ${second}` : ''}</Typography></Cell><Cell><Typography variant="description" color="text.secondary">{new Date(activity.timestamp).toLocaleString()}</Typography></Cell><Cell><Chip size="small" label="Simulated" /></Cell></TableRow>;
      })}
    </TableFrame>
  </ListWrapper>;
}
