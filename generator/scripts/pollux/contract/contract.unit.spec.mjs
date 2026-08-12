// SPEC-003 — runs the reusable runtime contract suite against the local mock
// server (test-fixtures/pollux/api/mock-server.mjs), plus mock-only checks
// that need injectable clock/delay knobs (idempotency expiry, forced
// in_progress window).
//
//   node --test scripts/pollux/contract/contract.unit.spec.mjs

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { createContractSuite } from './contract.suite.mjs';
import {
  REFERENCED_ROW_ID,
  start,
} from '../../../test-fixtures/pollux/api/mock-server.mjs';

describe('pollux standalone API v2 — contract suite vs mock server', () => {
  let server;
  let suite;

  before(async () => {
    server = await start({ port: 0 });
    suite = createContractSuite({
      baseUrl: server.url,
      fetchImpl: fetch,
      features: {
        referenceConflictId: REFERENCED_ROW_ID,
        ifMatch: true,
      },
    });
  });

  after(async () => {
    await server.close();
  });

  test('suite covers every applicable scenario (none skipped)', () => {
    assert.equal(
      suite.scenarios.filter((s) => s.optional).length,
      0,
      'mock server supports every optional feature, so nothing is skipped'
    );
  });

  test('scenarios', async (t) => {
    for (const scenario of suite.scenarios) {
      await t.test(`${scenario.id} — ${scenario.name}`, async () => {
        await scenario.run();
      });
    }
  });
});

describe('mock-only idempotency internals (injectable knobs)', () => {
  test('concurrent duplicate inside the in_progress window gets retryable SERVICE_UNAVAILABLE', async () => {
    // Mutation takes 300ms; duplicates only wait 50ms -> 503 path.
    const server = await start({
      port: 0,
      mutationDelayMs: 300,
      idempotencyWaitMs: 50,
    });
    try {
      const key = crypto.randomUUID();
      const fire = () =>
        fetch(`${server.url}/api/generated/v2/amostra`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer token-admin',
            'Content-Type': 'application/json',
            'Idempotency-Key': key,
          },
          body: JSON.stringify({ titulo: 'Janela in_progress' }),
        });
      const first = fire();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const second = await fire();
      const secondBody = await second.json();
      assert.equal(second.status, 503);
      assert.equal(secondBody.code, 'SERVICE_UNAVAILABLE');
      assert.equal(secondBody.retryable, true);
      const firstResponse = await first;
      assert.equal(firstResponse.status, 201, 'original mutation completes');
      // The retryable failure allows a later retry that replays completion.
      const retry = await fire();
      assert.equal(retry.status, 201);
      assert.equal(retry.headers.get('idempotency-replayed'), 'true');
    } finally {
      await server.close();
    }
  });

  test('completed idempotency records expire after 24h (injectable clock)', async () => {
    let nowMs = 1_750_000_000_000; // fixed epoch; never Date.now
    const server = await start({ port: 0, clock: () => nowMs });
    try {
      const key = 'expiry-key-1';
      const fire = () =>
        fetch(`${server.url}/api/generated/v2/amostra`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer token-admin',
            'Content-Type': 'application/json',
            'Idempotency-Key': key,
          },
          body: JSON.stringify({ titulo: 'Expiração' }),
        });
      const first = await fire();
      assert.equal(first.status, 201);
      const firstBody = await first.json();

      // Within 24h: replay.
      nowMs += 60 * 60 * 1000;
      const replay = await fire();
      assert.equal(replay.headers.get('idempotency-replayed'), 'true');

      // Past 24h: the key is fresh again and performs a new mutation.
      nowMs += 25 * 60 * 60 * 1000;
      const fresh = await fire();
      assert.equal(fresh.status, 201);
      assert.equal(fresh.headers.get('idempotency-replayed'), null);
      const freshBody = await fresh.json();
      assert.notEqual(freshBody.data.id, firstBody.data.id);
    } finally {
      await server.close();
    }
  });

  test('deterministic ids via injectable idFactory', async () => {
    let n = 0;
    const server = await start({
      port: 0,
      idFactory: () =>
        `00000000-0000-4000-9000-${String(++n).padStart(12, '0')}`,
    });
    try {
      const created = await fetch(`${server.url}/api/generated/v2/amostra`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-admin',
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ titulo: 'Id determinístico' }),
      });
      const body = await created.json();
      assert.equal(body.data.id, '00000000-0000-4000-9000-000000000001');
    } finally {
      await server.close();
    }
  });

  test('per-token capability map is configurable', async () => {
    const server = await start({
      port: 0,
      capabilityByToken: {
        'token-custom': {
          list: true,
          read: false,
          create: false,
          update: false,
          delete: false,
        },
      },
    });
    try {
      const caps = await fetch(
        `${server.url}/api/generated/v2/amostra/capabilities`,
        { headers: { Authorization: 'Bearer token-custom' } }
      );
      const body = await caps.json();
      assert.deepEqual(body.data, {
        list: true,
        read: false,
        create: false,
        update: false,
        delete: false,
      });
      // Default tokens are replaced by the override -> UNAUTHENTICATED.
      const admin = await fetch(`${server.url}/api/generated/v2/amostra`, {
        headers: { Authorization: 'Bearer token-admin' },
      });
      assert.equal(admin.status, 401);
    } finally {
      await server.close();
    }
  });
});
