// React
import type { ReactElement } from 'react'
// Packages
import Typography from '@mui/material/Typography'

// The landing page, made of cards from the modules (ADR 0109); the cards arrive in 5.2
export function HomeScreen(): ReactElement {
  return <Typography component="h1" variant="h5">Home</Typography>
}
