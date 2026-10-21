'use client';

import { Box } from '@mui/material';
import { useEffect } from 'react';
import { ContentContainer } from 'components/ContentContainer';
import { HistoryWrapper } from 'modules/history/HistoryWrapper';
import { DemoActivityList, MusdTransactionsTop } from 'modules/musd/MusdV1Pages';
import { useRootStore } from 'store/root';

export default function History() {
  const trackEvent = useRootStore((store) => store.trackEvent);
  useEffect(() => { trackEvent('Page Viewed', { 'Page Name': 'Transactions' }); }, [trackEvent]);
  return <>
    <MusdTransactionsTop />
    <ContentContainer>
      <HistoryWrapper />
      <Box sx={{ mt: 12 }}><DemoActivityList /></Box>
    </ContentContainer>
  </>;
}
