// Added alongside GET /api/vehicles/[id]'s new `client`/`interventions`
// fields (Phase C item #7, 2026-08-25) — no test file existed for this
// route before. Mirrors clients/[id]/route.test.ts's shape.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/organizations/require-caller-org', () => ({
  requireCallerOrg: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn() };
});

import { requireCallerOrg } from '@/lib/server/organizations/require-caller-org';
import { GET } from './route';

const mockRequireCallerOrg = vi.mocked(requireCallerOrg);

const callerCtx = {
  user: { sub: 'user_1', email: 'owner@test.local' },
  organizationId: 'org_1',
  role: 'MEMBER' as const,
  jobTitle: null,
};

const vehicleRow = {
  id: 'veh_1',
  clientId: 'client_1',
  brand: 'Toyota',
  model: 'Corolla',
  year: 2018,
  registration: 'DK-1234-AA',
  mileage: 45_000,
  fuelType: null,
  vin: null,
  engineNumber: null,
  color: null,
  notes: null,
  status: 'Actif',
  client: {
    type: 'INDIVIDUAL',
    firstName: 'Awa',
    lastName: 'Ndiaye',
    companyName: null,
    phone: '+221771234567',
  },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/vehicles/veh_1', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCallerOrg.mockResolvedValue(callerCtx);
});

describe('GET /api/vehicles/[id]', () => {
  it('404s VEHICLE_NOT_FOUND when the vehicle does not belong to the caller org', async () => {
    prismaMock.vehicle.findFirst.mockResolvedValue(null as never);
    const res = await GET(makeGet(), { params: Promise.resolve({ id: 'veh_1' }) });
    expect(res.status).toBe(404);
  });

  it('includes the owning client and its intervention history', async () => {
    prismaMock.vehicle.findFirst.mockResolvedValue(vehicleRow as never);
    prismaMock.intervention.findMany.mockResolvedValue([
      {
        id: 'int_1',
        reference: 'INT-001',
        work: 'Vidange',
        amount: 25_000,
        status: 'Terminé',
        createdAt: new Date('2026-08-01'),
      },
    ] as never);

    const res = await GET(makeGet(), { params: Promise.resolve({ id: 'veh_1' }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      vehicle: {
        clientId: string;
        client: { id: string; name: string; phone: string };
        interventions: { id: string; reference: string }[];
      };
    };
    expect(body.vehicle.clientId).toBe('client_1');
    expect(body.vehicle.client).toEqual({
      id: 'client_1',
      name: 'Awa Ndiaye',
      phone: '+221771234567',
    });
    expect(body.vehicle.interventions).toHaveLength(1);
    expect(prismaMock.intervention.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { vehicleId: 'veh_1' } }),
    );
  });
});
