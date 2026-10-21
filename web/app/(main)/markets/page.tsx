'use client';

import { useEffect } from 'react';
import { MusdMarketsPage } from 'modules/musd/MusdV1Pages';
import { useRootStore } from 'store/root';

export default function Markets() {
  const trackEvent = useRootStore((store) => store.trackEvent);
  useEffect(() => { trackEvent('Page Viewed', { 'Page Name': 'Pools' }); }, [trackEvent]);
  return <MusdMarketsPage />;
}
