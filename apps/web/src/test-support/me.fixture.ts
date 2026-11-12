// Shared
import type { AdminUser, Me } from '@atlas/shared'

export const meFixture = ( overrides: Partial< Me > = {} ): Me => ( {
  id: '3f1c1c6e-5d0a-4a52-9a43-0c8f0e6d1a01',
  email: 'naresh@example.com',
  name: 'Naresh',
  role: 'admin',
  modules: [ 'transcriber', 'melete' ],
  vault_dir: 'naresh',
  vault_missing: false,
  study_today: '2026-11-08',
  ...overrides,
} )

export const memberFixture = ( overrides: Partial< Me > = {} ): Me => meFixture( {
  id: '9b2d4f7a-1e63-4c1b-8d55-7a0e2c4b9f02',
  email: 'brother@example.com',
  name: 'Brother',
  role: 'member',
  modules: [ 'transcriber' ],
  vault_dir: 'brother',
  ...overrides,
} )

export const adminUserFixture = ( overrides: Partial< AdminUser > = {} ): AdminUser => ( {
  id: '9b2d4f7a-1e63-4c1b-8d55-7a0e2c4b9f02',
  email: 'brother@example.com',
  name: 'Brother',
  role: 'member',
  status: 'active',
  modules: [ 'transcriber' ],
  vault_dir: 'brother',
  last_signin_at: '2026-10-27T08:00:00.000Z',
  created_at: '2026-10-24T08:00:00.000Z',
  ...overrides,
} )
