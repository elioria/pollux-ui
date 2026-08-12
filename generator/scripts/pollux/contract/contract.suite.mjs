// SPEC-003 — reusable runtime contract suite for the Pollux standalone API v2
// (test-fixtures/pollux/api/contract.md). Framework-agnostic: it only needs a
// base URL, a fetch implementation and three capability-tier tokens, so
// SPEC-007 can point the same scenarios at the mock server, the Go v2 backend
// or any adapter BFF proxy.
//
// Usage:
//   const suite = createContractSuite({ baseUrl, fetchImpl: fetch, tokens });
//   for (const scenario of suite.scenarios) await scenario.run();
//   // or: const report = await suite.run();

const DEFAULT_TOKENS = {
  admin: 'token-admin',
  readonly: 'token-readonly',
  none: 'token-none',
};

const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'REFERENCE_CONFLICT',
  'STALE_WRITE',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
];

class ContractAssertionError extends Error {
  constructor(message, detail) {
    super(detail === undefined ? message : `${message} — ${detail}`);
    this.name = 'ContractAssertionError';
  }
}

const check = (condition, message, detail) => {
  if (!condition) {
    throw new ContractAssertionError(
      message,
      detail === undefined ? undefined : JSON.stringify(detail)
    );
  }
};

/**
 * Build the contract scenarios.
 *
 * @param {object} options
 * @param {string} options.baseUrl e.g. http://127.0.0.1:4310 (no trailing /)
 * @param {typeof fetch} [options.fetchImpl] fetch implementation
 * @param {{admin: string, readonly: string, none: string}} [options.tokens]
 *   bearer tokens for the three capability tiers (admin = full CRUD,
 *   readonly = list+read only, none = no capability)
 * @param {string} [options.entity] entity code (default 'amostra')
 * @param {object} [options.features] optional-capability gates:
 *   {referenceConflictId?: string, ifMatch?: boolean}
 * @param {() => string} [options.newIdempotencyKey]
 */
export function createContractSuite(options) {
  const {
    baseUrl,
    fetchImpl = globalThis.fetch,
    tokens = DEFAULT_TOKENS,
    entity = 'amostra',
    features = {},
    newIdempotencyKey = () => globalThis.crypto.randomUUID(),
  } = options;

  const root = `${baseUrl.replace(/\/$/, '')}/api/generated/v2/${entity}`;

  const call = async (path, init = {}) => {
    const { token, idempotencyKey, json, ...rest } = init;
    const headers = { Accept: 'application/json', ...init.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    let body;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    }
    const response = await fetchImpl(`${root}${path}`, {
      ...rest,
      headers,
      body,
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    return { response, body: parsed, rawText: text };
  };

  const expectErrorEnvelope = ({ response, body }, code) => {
    check(body?.ok === false, `error envelope must carry ok:false`, body);
    check(body.code === code, `expected code ${code}, got ${body.code}`, body);
    check(
      ERROR_CODES.includes(body.code),
      'code must be in the stable taxonomy'
    );
    check(
      typeof body.message === 'string' && body.message.length > 0,
      'error envelope must carry a safe message'
    );
    check(
      typeof body.requestId === 'string' && body.requestId.length > 0,
      'error envelope must carry a requestId'
    );
    check(
      typeof body.retryable === 'boolean',
      'error envelope must carry explicit retryable'
    );
    const retryableCodes = ['RATE_LIMITED', 'SERVICE_UNAVAILABLE'];
    check(
      body.retryable === retryableCodes.includes(body.code),
      `retryable flag must match taxonomy for ${body.code}`
    );
    check(response.status >= 400, 'error responses use a 4xx/5xx status');
  };

  const expectOk = ({ response, body }, status) => {
    check(
      response.status === status,
      `expected HTTP ${status}, got ${response.status}`,
      body
    );
    check(body?.ok === true, 'success envelope must carry ok:true', body);
    check(body.data !== undefined, 'success envelope must carry data');
    return body.data;
  };

  const createRecord = async (overrides = {}, init = {}) => {
    const result = await call('', {
      method: 'POST',
      token: tokens.admin,
      idempotencyKey: newIdempotencyKey(),
      json: {
        titulo: `Registro de contrato ${newIdempotencyKey()}`,
        ...overrides,
      },
      ...init,
    });
    return { ...result, data: result.body?.ok ? result.body.data : undefined };
  };

  const totalRows = async () => {
    const result = await call('?pageSize=1', { token: tokens.admin });
    return expectOk(result, 200).totalRows;
  };

  /** @type {Array<{id: string, name: string, optional?: boolean, run: () => Promise<void>}>} */
  const scenarios = [];
  const scenario = (id, name, run, optional = false) => {
    scenarios.push({ id, name, optional, run });
  };

  // ---- authentication (fail closed) ------------------------------------

  scenario(
    'auth-missing-token',
    'missing bearer token is UNAUTHENTICATED',
    async () => {
      expectErrorEnvelope(await call(''), 'UNAUTHENTICATED');
    }
  );

  scenario(
    'auth-invalid-token',
    'invalid bearer token is UNAUTHENTICATED',
    async () => {
      expectErrorEnvelope(
        await call('', { token: 'not-a-real-token' }),
        'UNAUTHENTICATED'
      );
    }
  );

  scenario(
    'auth-mutation-fail-closed',
    'anonymous mutation fails closed without mutating',
    async () => {
      const before = await totalRows();
      expectErrorEnvelope(
        await call('', {
          method: 'POST',
          idempotencyKey: newIdempotencyKey(),
          json: { titulo: 'Não deve existir' },
        }),
        'UNAUTHENTICATED'
      );
      check(
        (await totalRows()) === before,
        'anonymous POST must not create a row'
      );
    }
  );

  // ---- authorization + capabilities ------------------------------------

  scenario('forbidden-create', 'readonly token cannot create', async () => {
    expectErrorEnvelope(
      await call('', {
        method: 'POST',
        token: tokens.readonly,
        idempotencyKey: newIdempotencyKey(),
        json: { titulo: 'Proibido' },
      }),
      'FORBIDDEN'
    );
  });

  scenario('forbidden-list', 'capability-less token cannot list', async () => {
    expectErrorEnvelope(await call('', { token: tokens.none }), 'FORBIDDEN');
  });

  scenario(
    'capabilities-shape',
    'capabilities endpoint returns per-operation booleans for any authenticated token',
    async () => {
      for (const token of [tokens.admin, tokens.readonly, tokens.none]) {
        const data = expectOk(await call('/capabilities', { token }), 200);
        for (const op of ['list', 'read', 'create', 'update', 'delete']) {
          check(
            typeof data[op] === 'boolean',
            `capabilities.${op} must be boolean`,
            data
          );
        }
      }
    }
  );

  scenario(
    'capabilities-agree-with-enforcement',
    'reported capabilities agree with server enforcement',
    async () => {
      for (const token of [tokens.admin, tokens.readonly, tokens.none]) {
        const caps = expectOk(await call('/capabilities', { token }), 200);
        const attempts = {
          list: () => call('', { token }),
          create: () =>
            call('', {
              method: 'POST',
              token,
              idempotencyKey: newIdempotencyKey(),
              json: { titulo: 'Verificação de capacidade' },
            }),
        };
        for (const [op, attempt] of Object.entries(attempts)) {
          const result = await attempt();
          if (caps[op]) {
            check(
              result.body?.code !== 'FORBIDDEN',
              `capability ${op}:true must not be rejected FORBIDDEN`,
              result.body
            );
          } else {
            expectErrorEnvelope(result, 'FORBIDDEN');
          }
        }
      }
    }
  );

  // ---- list: envelope, pagination, sort, filters ------------------------

  scenario(
    'list-envelope',
    'list returns rows/totalRows/page/pageSize/capabilities',
    async () => {
      const data = expectOk(await call('', { token: tokens.admin }), 200);
      check(Array.isArray(data.rows), 'rows must be an array', data);
      check(Number.isInteger(data.totalRows), 'totalRows must be an integer');
      check(data.page === 1, 'default page is 1');
      check(Number.isInteger(data.pageSize), 'pageSize must be an integer');
      check(
        typeof data.capabilities === 'object' && data.capabilities !== null,
        'list payload carries effective capabilities'
      );
      check(data.rows.length <= data.pageSize, 'rows respect pageSize');
    }
  );

  scenario(
    'list-pagination',
    'pages are disjoint and totalRows is stable',
    async () => {
      const page1 = expectOk(
        await call('?page=1&pageSize=2', { token: tokens.admin }),
        200
      );
      const page2 = expectOk(
        await call('?page=2&pageSize=2', { token: tokens.admin }),
        200
      );
      check(
        page1.totalRows === page2.totalRows,
        'totalRows stable across pages'
      );
      const ids1 = new Set(page1.rows.map((r) => r.id));
      check(
        page2.rows.every((r) => !ids1.has(r.id)),
        'page 2 must not repeat page 1 rows'
      );
      const past = expectOk(
        await call('?page=999&pageSize=50', { token: tokens.admin }),
        200
      );
      check(past.rows.length === 0, 'page past the end returns empty rows');
      check(past.totalRows === page1.totalRows, 'totalRows still accurate');
    }
  );

  scenario(
    'list-page-bounds',
    'out-of-bounds page/pageSize are VALIDATION_FAILED',
    async () => {
      expectErrorEnvelope(
        await call('?page=0', { token: tokens.admin }),
        'VALIDATION_FAILED'
      );
      expectErrorEnvelope(
        await call('?pageSize=0', { token: tokens.admin }),
        'VALIDATION_FAILED'
      );
      expectErrorEnvelope(
        await call('?pageSize=9999', { token: tokens.admin }),
        'VALIDATION_FAILED'
      );
    }
  );

  scenario('list-sort', 'sort orders rows and reverses with desc', async () => {
    const sortAsc = encodeURIComponent(
      JSON.stringify([{ id: 'titulo', desc: false }])
    );
    const sortDesc = encodeURIComponent(
      JSON.stringify([{ id: 'titulo', desc: true }])
    );
    const asc = expectOk(
      await call(`?sort=${sortAsc}&pageSize=100`, { token: tokens.admin }),
      200
    );
    const desc = expectOk(
      await call(`?sort=${sortDesc}&pageSize=100`, { token: tokens.admin }),
      200
    );
    const titles = asc.rows.map((r) => r.titulo);
    const sorted = [...titles].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    check(
      JSON.stringify(titles) === JSON.stringify(sorted),
      'ascending sort must order rows',
      titles
    );
    check(
      JSON.stringify(desc.rows.map((r) => r.titulo)) ===
        JSON.stringify([...titles].reverse()),
      'descending sort must reverse the order'
    );
  });

  scenario(
    'list-sort-invalid',
    'malformed or unknown sort is VALIDATION_FAILED',
    async () => {
      expectErrorEnvelope(
        await call('?sort=not-json', { token: tokens.admin }),
        'VALIDATION_FAILED'
      );
      const unknown = encodeURIComponent(
        JSON.stringify([{ id: 'naoExiste', desc: false }])
      );
      expectErrorEnvelope(
        await call(`?sort=${unknown}`, { token: tokens.admin }),
        'VALIDATION_FAILED'
      );
    }
  );

  scenario('list-filters', 'declared filters narrow results', async () => {
    const all = expectOk(
      await call('?pageSize=100', { token: tokens.admin }),
      200
    );
    const active = expectOk(
      await call('?f_ativo=true&pageSize=100', { token: tokens.admin }),
      200
    );
    check(
      active.totalRows < all.totalRows ||
        all.totalRows === 0 ||
        active.rows.every((r) => r.ativo === true),
      'boolean eq filter applies'
    );
    check(
      active.rows.every((r) => r.ativo === true),
      'boolean filter returns only matching rows'
    );
    const priced = expectOk(
      await call('?f_preco__gte=100&pageSize=100', { token: tokens.admin }),
      200
    );
    check(
      priced.rows.every((r) => r.preco !== null && Number(r.preco) >= 100),
      'numeric gte filter applies',
      priced.rows
    );
    const contains = expectOk(
      await call(`?f_titulo=${encodeURIComponent('ção')}&pageSize=100`, {
        token: tokens.admin,
      }),
      200
    );
    check(
      contains.rows.every((r) => r.titulo.toLowerCase().includes('ção')),
      'string contains filter applies (accent-aware)'
    );
  });

  scenario(
    'list-strict-query',
    'unknown query keys are VALIDATION_FAILED',
    async () => {
      expectErrorEnvelope(
        await call('?bogus=1', { token: tokens.admin }),
        'VALIDATION_FAILED'
      );
      expectErrorEnvelope(
        await call('?f_naoExiste=1', { token: tokens.admin }),
        'VALIDATION_FAILED'
      );
    }
  );

  scenario('list-q-search', 'q searches text columns', async () => {
    const created = await createRecord({
      titulo: 'Busca Específica QSuite',
      descricao: 'texto pesquisável exclusivo',
    });
    check(
      created.data !== undefined,
      'setup create must succeed',
      created.body
    );
    const found = expectOk(
      await call(`?q=${encodeURIComponent('QSuite')}&pageSize=100`, {
        token: tokens.admin,
      }),
      200
    );
    check(
      found.rows.some((r) => r.id === created.data.id),
      'q must find the created row'
    );
  });

  // ---- read -------------------------------------------------------------

  scenario(
    'read-canonical',
    'read returns the canonical wire-encoded record',
    async () => {
      const created = await createRecord({
        preco: '123.40',
        quantidadeMaxima: 8,
        dataInicio: '2026-07-01',
        horaInicio: '07:15:00',
        ativo: false,
      });
      const data = expectOk(
        await call(`/${created.data.id}`, { token: tokens.admin }),
        200
      );
      check(
        data.preco === '123.40',
        'numeric wire value is a string, precision preserved',
        data
      );
      check(data.quantidadeMaxima === 8, 'integer wire value is a number');
      check(data.dataInicio === '2026-07-01', 'date wire format preserved');
      check(data.horaInicio === '07:15:00', 'time wire format preserved');
      check(data.ativo === false, 'boolean wire value preserved');
    }
  );

  scenario('read-not-found', 'unknown id is NOT_FOUND', async () => {
    expectErrorEnvelope(
      await call('/00000000-0000-4000-8000-00000000dead', {
        token: tokens.admin,
      }),
      'NOT_FOUND'
    );
  });

  scenario('unknown-entity', 'unknown entity is NOT_FOUND', async () => {
    const url = `${baseUrl.replace(/\/$/, '')}/api/generated/v2/nao_existe`;
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
    });
    const body = await response.json();
    check(
      body?.ok === false && body.code === 'NOT_FOUND',
      'unknown entity NOT_FOUND',
      body
    );
  });

  // ---- create / strict input --------------------------------------------

  scenario(
    'create-canonical',
    'create returns the canonical record with generated id',
    async () => {
      const before = await totalRows();
      const created = await createRecord({ descricao: 'criado pela suíte' });
      check(
        created.response.status === 201,
        'create returns 201',
        created.body
      );
      check(
        typeof created.data.id === 'string' && created.data.id.length > 0,
        'id generated'
      );
      check((await totalRows()) === before + 1, 'exactly one row created');
    }
  );

  scenario(
    'create-missing-required',
    'missing required field maps to fieldErrors',
    async () => {
      const result = await call('', {
        method: 'POST',
        token: tokens.admin,
        idempotencyKey: newIdempotencyKey(),
        json: { descricao: 'sem título' },
      });
      expectErrorEnvelope(result, 'VALIDATION_FAILED');
      check(
        Array.isArray(result.body.fieldErrors?.titulo),
        'fieldErrors must key the missing field',
        result.body
      );
    }
  );

  scenario('create-unknown-field', 'unknown fields are rejected', async () => {
    const result = await call('', {
      method: 'POST',
      token: tokens.admin,
      idempotencyKey: newIdempotencyKey(),
      json: { titulo: 'Válido', campoInexistente: 1 },
    });
    expectErrorEnvelope(result, 'VALIDATION_FAILED');
    check(
      Array.isArray(result.body.fieldErrors?.campoInexistente),
      'unknown field appears in fieldErrors',
      result.body
    );
  });

  scenario(
    'create-readonly-field',
    'server-managed fields are not writable',
    async () => {
      const result = await call('', {
        method: 'POST',
        token: tokens.admin,
        idempotencyKey: newIdempotencyKey(),
        json: { titulo: 'Válido', criadoEm: '2020-01-01T00:00:00.000Z' },
      });
      expectErrorEnvelope(result, 'VALIDATION_FAILED');
    }
  );

  scenario(
    'create-type-errors',
    'wrong wire types map to fieldErrors',
    async () => {
      const result = await call('', {
        method: 'POST',
        token: tokens.admin,
        idempotencyKey: newIdempotencyKey(),
        json: { titulo: 'Válido', ativo: 'sim', quantidadeMaxima: 'muitos' },
      });
      expectErrorEnvelope(result, 'VALIDATION_FAILED');
      check(Array.isArray(result.body.fieldErrors?.ativo), 'ativo flagged');
      check(
        Array.isArray(result.body.fieldErrors?.quantidadeMaxima),
        'quantidadeMaxima flagged'
      );
    }
  );

  scenario(
    'empty-numeric-stays-null',
    'empty numeric is null, never 0; "" is rejected',
    async () => {
      const rejected = await call('', {
        method: 'POST',
        token: tokens.admin,
        idempotencyKey: newIdempotencyKey(),
        json: { titulo: 'Numérico vazio', preco: '' },
      });
      expectErrorEnvelope(rejected, 'VALIDATION_FAILED');

      const created = await createRecord({
        titulo: 'Numérico nulo',
        preco: null,
        quantidadeMaxima: null,
      });
      check(created.data.preco === null, 'preco stays null', created.data);
      check(
        created.data.preco !== 0 && created.data.preco !== '0',
        'preco never coerced to 0'
      );
      check(
        created.data.quantidadeMaxima === null,
        'quantidadeMaxima stays null'
      );
      const read = expectOk(
        await call(`/${created.data.id}`, { token: tokens.admin }),
        200
      );
      check(
        read.preco === null && read.quantidadeMaxima === null,
        'null survives round-trip'
      );
    }
  );

  scenario(
    'accent-round-trip',
    'accented Portuguese text round-trips byte-equal',
    async () => {
      const titulo = 'Ação São João à Noite — Bênção nº 1';
      const descricao = 'Descrição com çãõáéíóúÀÂÊ e travessão —';
      const created = await createRecord({ titulo, descricao });
      check(
        created.data.titulo === titulo,
        'create echoes accents',
        created.data
      );
      const read = expectOk(
        await call(`/${created.data.id}`, { token: tokens.admin }),
        200
      );
      check(read.titulo === titulo, 'read preserves accented titulo');
      check(read.descricao === descricao, 'read preserves accented descricao');
    }
  );

  // ---- update ------------------------------------------------------------

  scenario(
    'update-canonical',
    'update applies writable fields and returns the record',
    async () => {
      const created = await createRecord({ ativo: true });
      const updated = expectOk(
        await call(`/${created.data.id}`, {
          method: 'PATCH',
          token: tokens.admin,
          idempotencyKey: newIdempotencyKey(),
          json: { titulo: 'Título Atualizado', ativo: false },
        }),
        200
      );
      check(updated.titulo === 'Título Atualizado', 'titulo updated', updated);
      check(updated.ativo === false, 'ativo updated');
      check(updated.id === created.data.id, 'id unchanged');
    }
  );

  scenario(
    'update-mutability',
    'createOnly fields are rejected on update',
    async () => {
      const created = await createRecord({
        descricao: 'imutável após criação',
      });
      const result = await call(`/${created.data.id}`, {
        method: 'PATCH',
        token: tokens.admin,
        idempotencyKey: newIdempotencyKey(),
        json: { descricao: 'tentativa de alteração' },
      });
      expectErrorEnvelope(result, 'VALIDATION_FAILED');
      check(
        Array.isArray(result.body.fieldErrors?.descricao),
        'createOnly field flagged on update',
        result.body
      );
    }
  );

  scenario(
    'update-not-found',
    'update of unknown id is NOT_FOUND',
    async () => {
      expectErrorEnvelope(
        await call('/00000000-0000-4000-8000-00000000beef', {
          method: 'PATCH',
          token: tokens.admin,
          idempotencyKey: newIdempotencyKey(),
          json: { titulo: 'Fantasma' },
        }),
        'NOT_FOUND'
      );
    }
  );

  scenario(
    'stale-write',
    'stale If-Match is STALE_WRITE without mutation',
    async () => {
      const created = await createRecord({});
      const id = created.data.id;
      expectOk(
        await call(`/${id}`, {
          method: 'PATCH',
          token: tokens.admin,
          idempotencyKey: newIdempotencyKey(),
          json: { titulo: 'Primeira edição' },
          headers: { 'If-Match': '1' },
        }),
        200
      );
      const stale = await call(`/${id}`, {
        method: 'PATCH',
        token: tokens.admin,
        idempotencyKey: newIdempotencyKey(),
        json: { titulo: 'Edição obsoleta' },
        headers: { 'If-Match': '1' },
      });
      expectErrorEnvelope(stale, 'STALE_WRITE');
      const read = expectOk(await call(`/${id}`, { token: tokens.admin }), 200);
      check(read.titulo === 'Primeira edição', 'stale write must not mutate');
    },
    features.ifMatch === false
  );

  // ---- delete ------------------------------------------------------------

  scenario(
    'delete-confirmation',
    'delete returns confirmation and removes the row',
    async () => {
      const created = await createRecord({});
      const data = expectOk(
        await call(`/${created.data.id}`, {
          method: 'DELETE',
          token: tokens.admin,
          idempotencyKey: newIdempotencyKey(),
        }),
        200
      );
      check(
        data.deleted === true && data.id === created.data.id,
        'deletion confirmed',
        data
      );
      expectErrorEnvelope(
        await call(`/${created.data.id}`, { token: tokens.admin }),
        'NOT_FOUND'
      );
    }
  );

  scenario(
    'reference-conflict',
    'deleting a referenced record is REFERENCE_CONFLICT without deletion',
    async () => {
      const id = features.referenceConflictId;
      const result = await call(`/${id}`, {
        method: 'DELETE',
        token: tokens.admin,
        idempotencyKey: newIdempotencyKey(),
      });
      expectErrorEnvelope(result, 'REFERENCE_CONFLICT');
      expectOk(await call(`/${id}`, { token: tokens.admin }), 200);
    },
    !features.referenceConflictId
  );

  // ---- idempotency --------------------------------------------------------

  scenario(
    'idempotency-required',
    'mutations without Idempotency-Key are rejected',
    async () => {
      expectErrorEnvelope(
        await call('', {
          method: 'POST',
          token: tokens.admin,
          json: { titulo: 'Sem chave' },
        }),
        'VALIDATION_FAILED'
      );
    }
  );

  scenario(
    'idempotency-replay',
    'same key + same body replays without a second mutation',
    async () => {
      const key = newIdempotencyKey();
      const payload = { titulo: 'Idempotente Única' };
      const first = await call('', {
        method: 'POST',
        token: tokens.admin,
        idempotencyKey: key,
        json: payload,
      });
      check(first.response.status === 201, 'first attempt creates', first.body);
      const before = await totalRows();
      const replay = await call('', {
        method: 'POST',
        token: tokens.admin,
        idempotencyKey: key,
        json: payload,
      });
      check(replay.response.status === 201, 'replay returns the stored status');
      check(
        replay.response.headers.get('idempotency-replayed') === 'true',
        'replay carries Idempotency-Replayed: true'
      );
      check(
        replay.rawText === first.rawText,
        'replay body is the exact stored body'
      );
      check((await totalRows()) === before, 'replay must not mutate again');
    }
  );

  scenario(
    'idempotency-different-body',
    'same key + different body is CONFLICT',
    async () => {
      const key = newIdempotencyKey();
      const first = await call('', {
        method: 'POST',
        token: tokens.admin,
        idempotencyKey: key,
        json: { titulo: 'Corpo original' },
      });
      check(first.response.status === 201, 'first attempt creates', first.body);
      const before = await totalRows();
      expectErrorEnvelope(
        await call('', {
          method: 'POST',
          token: tokens.admin,
          idempotencyKey: key,
          json: { titulo: 'Corpo diferente' },
        }),
        'CONFLICT'
      );
      check(
        (await totalRows()) === before,
        'conflicting reuse must not mutate'
      );
    }
  );

  scenario(
    'idempotency-concurrent',
    'concurrent duplicates produce exactly one mutation',
    async () => {
      const before = await totalRows();
      const key = newIdempotencyKey();
      const payload = { titulo: 'Duplicata Concorrente' };
      const fire = () =>
        call('', {
          method: 'POST',
          token: tokens.admin,
          idempotencyKey: key,
          json: payload,
        });
      const [a, b] = await Promise.all([fire(), fire()]);
      for (const result of [a, b]) {
        const okOutcome = result.response.status === 201;
        const retryOutcome =
          result.body?.ok === false &&
          result.body.code === 'SERVICE_UNAVAILABLE' &&
          result.body.retryable === true;
        check(
          okOutcome || retryOutcome,
          'each duplicate either replays completion or gets retryable SERVICE_UNAVAILABLE',
          result.body
        );
      }
      check(
        a.response.status === 201 || b.response.status === 201,
        'at least one duplicate observes the completed mutation'
      );
      check((await totalRows()) === before + 1, 'exactly one row created');
    }
  );

  scenario(
    'idempotency-scope-per-key',
    'different keys with the same body mutate independently',
    async () => {
      const before = await totalRows();
      const payload = { titulo: 'Mesma carga, chaves distintas' };
      for (const _ of [1, 2]) {
        const result = await call('', {
          method: 'POST',
          token: tokens.admin,
          idempotencyKey: newIdempotencyKey(),
          json: payload,
        });
        check(
          result.response.status === 201,
          'each distinct key creates',
          result.body
        );
      }
      check(
        (await totalRows()) === before + 2,
        'two rows created for two keys'
      );
    }
  );

  // ---- request id ---------------------------------------------------------

  scenario(
    'request-id-echo',
    'X-Request-Id is echoed and carried in error envelopes',
    async () => {
      const supplied = 'suite-req-id-123';
      const ok = await call('', {
        token: tokens.admin,
        headers: { 'X-Request-Id': supplied },
      });
      check(
        ok.response.headers.get('x-request-id') === supplied,
        'success response echoes the request id'
      );
      const err = await call('', { headers: { 'X-Request-Id': supplied } });
      expectErrorEnvelope(err, 'UNAUTHENTICATED');
      check(
        err.body.requestId === supplied,
        'error envelope carries the echoed request id'
      );
      const generated = await call('', { token: tokens.admin });
      check(
        (generated.response.headers.get('x-request-id') ?? '').length > 0,
        'a request id is generated when none is supplied'
      );
    }
  );

  const applicable = scenarios.filter((s) => !s.optional);

  return {
    scenarios,
    applicable,
    /** Run every applicable scenario; returns {passed, failed, results}. */
    async run() {
      const results = [];
      for (const s of scenarios) {
        if (s.optional) {
          results.push({ id: s.id, status: 'skipped' });
          continue;
        }
        try {
          await s.run();
          results.push({ id: s.id, status: 'passed' });
        } catch (error) {
          results.push({ id: s.id, status: 'failed', error: String(error) });
        }
      }
      return {
        passed: results.filter((r) => r.status === 'passed').length,
        failed: results.filter((r) => r.status === 'failed').length,
        skipped: results.filter((r) => r.status === 'skipped').length,
        results,
      };
    },
  };
}
