# AGENTS.md — instruções para modelos de IA

Guia canônico para qualquer modelo de IA (Claude, Codex/GPT, Gemini, etc.)
trabalhando neste repositório ou em workspaces gerados por ele. Leia este
arquivo antes de agir. Complementos: `CLAUDE.md` (instruções detalhadas do
repositório), `POLLUX-GEN-KB.md` (base de conhecimento do gerador),
`skeletons/README.md` (contratos dos skeletons), `docs/specs/skeletons/`
(SPEC-001..008).

## 1. O que é este repositório

Fork do start-ui-web v3 (Vite + TanStack Start) que abriga o **gerador
Pollux**: CRUD por entidade dirigido por metadados em
`json-files/<entidade>.json`. Duas famílias de geração:

- **In-repo** — dentro deste checkout: verticais `/manager`
  (`scripts/gen-entity.mjs`), páginas legadas `/generated` e
  `/generated-server` (`_templates/pollux`), backend Go standalone
  (`generated/pollux-go`).
- **Standalone** — apps independentes criados a partir de skeletons
  (`nextjs`, `remix`, `astro`, `tanstack-start`) que consomem o contrato
  REST externo `/api/generated/v2`. Todos experimentais
  (`generatorSupport.pollux: false`); `start-ui-vite` (este repo) é a
  referência suportada.

Stack: TanStack Start/Router, oRPC, Drizzle ORM sobre PostgreSQL, Better
Auth, Tailwind v4, react-hook-form + zod v4, i18next. Idioma da UI Pollux:
**português**. Tipografia: Montserrat (display), Inter (corpo), mono para
números — nunca fontes serifadas.

## 2. Ponto de entrada único: o CLI `./pollux`

Sempre prefira o CLI a chamar scripts/hygen diretamente. Todos os comandos
aceitam `--json` (saída estável para máquinas).

```bash
./pollux help                        # lista completa
./pollux doctor --json               # o checkout está pronto?
./pollux list-entities --json        # entidades com metadados
./pollux describe <entidade> --json  # metadados de uma entidade
./pollux validate [entidade...]      # valida json-files/ (zod)
./pollux list-skeletons --json       # skeletons registrados
./pollux describe-skeleton <n> --json
./pollux new-workspace <skeleton> --dir=<path>   # cópia atômica + proveniência
./pollux plan     --workspace=<p> --entity=<e> --json   # dry-run, zero writes
./pollux generate --workspace=<p> --entity=<e>   # journalado, tudo-ou-nada
./pollux check-generated --workspace=<p>         # drift de arquivos gerados
./pollux gen-entity <e> | gen-all | gen-backend --backend=go   # in-repo
./pollux test --suite=<unit|targets|go|selection>
```

Gate completo por target standalone:
`node scripts/pollux/test/workspace-matrix.mjs --target nextjs|remix|astro|tanstack-start`.

## 3. Modelo de segurança (nunca violar)

- Todo arquivo gerado tem cabeçalho de propriedade (`@pollux-generated`) e é
  registrado em `.pollux/generated.json`. Geração é journalada
  (`.pollux/transactions/`) e tudo-ou-nada.
- Arquivo gerado editado à mão → `GENERATED_EDITED`; só sobrescreva com
  `--accept-generated-overwrite` e confirmação explícita do usuário.
- Nunca escreva código de aplicação à mão para compensar metadados ausentes
  — corrija/crie os metadados e regenere.
- Em targets standalone, gere **uma entidade por vez** (propriedade de
  arquivos compartilhados; `--all` é recusado).
- Nunca edite `src/routeTree.gen.ts`, `plugins/pollux-ui/resources/` ou
  qualquer artefato gerado por ferramenta.
- Códigos de erro estáveis: `PLAN_INVALID`, `TARGET_UNSUPPORTED`,
  `TARGET_MISMATCH`, `GENERATED_EDITED`, `OWNERSHIP_CONFLICT`,
  `SKELETON_UNKNOWN`, `DESTINATION_NOT_EMPTY`.

## 4. Criar nova entidade a partir de uma ideia (autoria de metadados)

Quando o usuário descrever uma entidade em linguagem natural ("pessoas",
"produtos com preço e estoque") e não existir `json-files/<nome>.json`:

1. Derive nome curto minúsculo (`pessoa`, `produto`), campos (4–10; sempre
   `id` uuid pk primeiro e `criado_em` timestamptz somente-grid por último),
   rótulos/títulos em PT-BR.
2. Escreva o envelope dbtool: `{"success": true, "data": {name, dbName,
   description, gridTitle, formAddTitle, formUpdateTitle,
   gridFooterTotalLines: "5,10,25,50", gridButton*/makeForm*, attributes}}`.
3. Tipos suportados: `uuid`, `char`/`varchar` (+`length`), `text`,
   `boolean`, `smallint`, `integer`, `bigint`, `real`, `double`, `numeric`,
   `date`, `time`, `timetz`, `timestamp`, `timestamptz`. NÃO suportado:
   uploads/blobs, rich text, chaves estrangeiras (modele o escalar mais
   próximo e avise).
4. Por atributo: `name` (snake_case único), `dataType`, `isPrimaryKey`
   (exatamente um `true` no total), `isNullable`, `position` (sequencial
   único), `grdIsinGrid`/`grdLabel`/`grdOrderAble` (+ `grdSort`,
   `grdSortSequence`, `grdSortAscending` na coluna de ordenação padrão),
   `fnrIsinFormAdd`/`fnrLabel`/`fnrMandatory` (`"sim"`/`"não"`)/
   `fnrReadonly`, `fedIsinFormUpd`/`fedLabel`/`fedMandatory`/`fedReadonly`
   (`"nunca"` = imutável pós-criação). `defaultValue` é a string `"NULL"`
   salvo default real.
5. Valide em loop: `./pollux validate <nome> --json`; prove a normalização
   com `./pollux plan` (nenhuma escrita). Exemplo completo funcional:
   `test-fixtures/pollux/entities/rich-valid.json`.
6. Reporte toda suposição inferida antes de gerar.

## 5. Banco de dados — geração de docker-compose.yml (padrão pgvector)

O PostgreSQL de desenvolvimento roda em Docker. **Imagem padrão:
`pgvector/pgvector:pg17`** (PostgreSQL 17 + extensão pgvector) — use-a
sempre que o usuário pedir um banco para este repo, para um workspace
standalone ou para o backend Go, salvo pedido explícito de outra imagem.

Este provisionamento é AUTOMÁTICO ao criar um app/workspace pelo plugin
(skill `pollux-create-workspace`) — não espere o usuário pedir o banco.
Quando solicitado a criar infraestrutura de banco, gere um
`docker-compose.yml` seguindo este modelo (ajuste nomes/portas ao projeto;
neste checkout o dev usa a porta host 5440):

```yaml
services:
  db:
    image: pgvector/pgvector:pg17
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-pollux}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-pollux}
      POSTGRES_DB: ${POSTGRES_DB:-pollux}
    ports:
      - '${POSTGRES_PORT:-5440}:5432'
    volumes:
      - db_data:/var/lib/postgresql/data
      - ./docker/initdb:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U $${POSTGRES_USER:-pollux} -d $${POSTGRES_DB:-pollux}']
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  db_data:
```

Regras ao gerar:

1. Crie também `docker/initdb/01-extensions.sql` com
   `CREATE EXTENSION IF NOT EXISTS vector;` (o entrypoint executa na
   primeira subida; para volume já existente, rode o mesmo SQL via
   `docker compose exec db psql`).
2. Nunca embuta senha real: use `${VAR:-default}` e documente no
   `.env.example` (`DATABASE_URL=postgres://pollux:pollux@localhost:5440/pollux`).
3. Inclua `healthcheck` (serviços dependentes usam
   `depends_on: { db: { condition: service_healthy } }`).
4. Volume nomeado obrigatório — nunca dados do banco em bind-mount do
   código.
5. Depois de subir: `pnpm db:push` (Drizzle) neste repo, ou as migrações
   próprias do backend Go.
6. Não conflite com o Docker existente do repo (`pnpm dk:init`/`dk:start` —
   PostgreSQL, MinIO, Maildev): para infra local deste checkout, use esses
   scripts; o compose acima é para workspaces/serviços novos.

## 6. Plugin pollux-ui (Claude Code + Codex)

Distribuição: https://github.com/elioria/pollux-ui (marketplace `pollux`,
instalação sem clone: `claude plugin marketplace add elioria/pollux-ui` +
`claude plugin install pollux-ui@pollux`). Seis skills: `pollux-inspect`,
`pollux-author-entity`, `pollux-create-workspace`, `pollux-generate-crud`,
`pollux-apply-layout`, `pollux-verify`. Fonte canônica:
`plugins/pollux-ui/` — após mudar templates/skeletons/skills, rode
`pnpm pollux:plugin` (o gate `verify-source-drift` falha com snapshot
desatualizado).

## 7. Verificação antes de declarar sucesso

- Metadados: `./pollux validate` limpo.
- Workspace: `./pollux check-generated` + `pnpm typecheck && pnpm build`
  no workspace.
- Target completo: workspace-matrix do target (15 passos, inclui smoke SSR,
  proxy, auth-strip, varredura de segredos no bundle cliente).
- In-repo: `pnpm lint` (oxlint + tsc) e `pnpm test:ci` no caminho tocado;
  drift de templates: `./scripts/pollux/check-drift.sh`.
- Nunca reporte "pronto" sem executar o comando de verificação e citar o
  resultado.

## 8. Convenções que pegam modelos desprevenidos

- Formatador roda no pre-commit (lefthook + oxfmt): se um commit tocar
  `_templates/pollux-targets/` ou skeletons empacotados, regenere goldens
  (`node scripts/pollux/targets/<target>/build-golden.mjs`) e
  `pnpm pollux:plugin` em commit de follow-up.
- `pnpm install` dentro de `skeletons/<nome>/` exige `--ignore-workspace`.
- React Compiler ativo: componentes que leem estado mutável do TanStack
  Table precisam de `'use no memo'`.
- `src/components/ui/dropdown-menu.tsx` é Base UI, não Radix.
- Rotas de servidor TanStack Start (`server.handlers`) exigem
  `import type {} from '@tanstack/react-start'` para o tsc.
- Variáveis `POLLUX_*` são server-only — jamais com prefixo `VITE_`.
