'use client';

import { Box, Button, Paper, Typography } from '@mui/material';
import Link from 'next/link';

export default function NotFound() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '70vh', p: 2 }}>
      <Paper sx={{ p: 6, textAlign: 'center', maxWidth: 480 }}>
        <Typography variant="h2" sx={{ mb: 1 }}>
          Page not found
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          This page does not exist. Head back to the overview.
        </Typography>
        <Button component={Link} href="/" variant="contained">
          Back to overview
        </Button>
      </Paper>
    </Box>
  );
}
