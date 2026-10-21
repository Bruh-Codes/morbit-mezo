'use client';

import { useEffect } from 'react';
import { LiquidityDashboardPage } from 'modules/musd/MusdV1Pages';
import { useRootStore } from 'store/root';

export default function Dashboard() {
  const trackEvent = useRootStore((store) => store.trackEvent);
  useEffect(() => { trackEvent('Page Viewed', { 'Page Name': 'Dashboard' }); }, [trackEvent]);
  return <LiquidityDashboardPage />;
}
