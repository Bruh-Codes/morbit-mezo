'use client';

import { Box, Button, Paper, Typography } from '@mui/material';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '70vh', p: 2 }}>
      <Paper sx={{ p: 6, textAlign: 'center', maxWidth: 520 }}>
        <Typography variant="h2" sx={{ mb: 1 }}>
          Something went wrong
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3, wordBreak: 'break-word' }}>
          {error.message}
        </Typography>
        <Button variant="contained" onClick={reset}>
          Try again
        </Button>
      </Paper>
    </Box>
  );
}
