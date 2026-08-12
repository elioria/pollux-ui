---
name: pollux-author-entity
description: Author new Pollux entity metadata (a json-files entity file) from a brief description of the app entity — e.g. "people", "products with price and stock". Use when a user wants a new entity and no metadata file exists yet; produces validated metadata ready for pollux-generate-crud.
---

# pollux-author-entity

Turn a brief intent ("an entity for people", "products with price, stock and
active flag") into a valid `json-files/<entity>.json` metadata file, validate
it, and hand off to generation. The metadata file is the single source every
Pollux generator consumes — author it, never hand-write generated code.


## Generator resolution

Commands below run from the generator root — resolve it in this order:
1. a start-ui-web checkout the user is working in (full surface);
2. the plugin's bundled snapshot at `${CLAUDE_PLUGIN_ROOT}/generator`
   (standalone surface only — run `pnpm install` there once). From an empty
   folder this is the default; state which root you are using.

## Preconditions

- Running inside a checkout containing the `./pollux` CLI and `json-files/`.
- The target entity name must NOT already exist in
  `./pollux list-entities --json` (if it does, this is a metadata *edit* —
  confirm with the user before overwriting).
- UI language for Pollux pages is Portuguese: labels and titles are PT-BR
  even when the conversation is in another language.

## Step 1 — Elicit (one bounded question at most)

Derive from the user's description; only ask when genuinely ambiguous:

- **name** — short lowercase code, safe identifier (`/^[a-z][a-z0-9_]*$/`),
  singular (`pessoa`, `produto`). Reserved/awkward plurals matter: route
  plural is `name + 's'` (or `es` when ending in `s`).
- **fields** — infer a sensible set from the domain when not enumerated
  (e.g. people → nome, email, telefone, nascimento, ativo). 4–10 fields is
  the sweet spot. Always add: `id` (uuid pk) first, `criado_em`
  (timestamptz, grid-only) last.
- **behavior** — which fields show in the grid, which are searchable/
  sortable, which are required on create/update.

## Step 2 — Author the file

Metadata location depends on the generator root (see Generator
resolution): in a start-ui-web checkout, write `json-files/<name>.json`;
when using the plugin's bundled snapshot, write into the USER'S project at
`./pollux-metadata/<name>.json` instead — the plugin cache is wiped on
update, so user metadata must never live there — and pass
`--metadata-dir=<abs path>` to every validate/plan/generate below.

Write the file in the dbtool envelope:

```json
{
  "success": true,
  "data": {
    "name": "<name>",
    "dbName": "<name>",
    "description": "<one PT-BR sentence>",
    "gridTitle": "<PT-BR plural title>",
    "formAddTitle": "<PT-BR 'Novo/Nova X'>",
    "formUpdateTitle": "<PT-BR 'Editar X'>",
    "gridFooterTotalLines": "5,10,25,50",
    "gridButtonAdd": true,
    "gridButtonDelete": true,
    "gridButtonReport": false,
    "gridButtonOperation": false,
    "makeFormAdd": true,
    "makeFormUpdate": true,
    "makeFormReport": false,
    "makeFormOperation": false,
    "attributes": [ ... ]
  }
}
```

### Attribute contract (per field)

Required on every attribute: `name` (snake_case, unique), `dataType`,
`isPrimaryKey`, `isNullable`, `position` (sequential, unique, from 1),
`grdIsinGrid`, `fnrIsinFormAdd`, `fedIsinFormUpd`. `defaultValue` is the
string `"NULL"` unless a real default exists (e.g. `"true"`).

Supported `dataType` values (anything else fails validation):
`uuid`, `char` (+ `length`), `varchar` (+ `length`), `text`, `boolean`,
`smallint`, `integer`, `bigint`, `real`, `double`, `numeric`, `date`,
`time`, `timetz`, `timestamp`, `timestamptz`.
NOT supported (SPEC-002; rejected at plan time): uploads/blobs, rich text,
foreign keys / relationships. If the user asks for those, say so and model
the closest scalar (e.g. store a category as `varchar` for now).

Per-surface keys:

- **Grid** (`grdIsinGrid: true`): `grdLabel` (PT-BR), `grdOrderAble`
  (sortable). Default sort column additionally: `grdSort: true`,
  `grdSortSequence: 1`, `grdSortAscending: true`.
- **Create form** (`fnrIsinFormAdd: true`): `fnrLabel`, `fnrMandatory`
  (`"sim"`/`"não"`), `fnrReadonly` (`"não"` normally).
- **Update form** (`fedIsinFormUpd: true`): `fedLabel`, `fedMandatory`,
  `fedReadonly` (`"não"`, or `"nunca"` for immutable-after-create fields).

Canonical patterns:

- `id`: `{"name":"id","dataType":"uuid","isPrimaryKey":true,"isNullable":false,"defaultValue":"NULL","position":1,"grdIsinGrid":false,"fnrIsinFormAdd":false,"fedIsinFormUpd":false}`
- Audit column `criado_em`: `timestamptz`, grid-only (`grdIsinGrid: true`,
  both forms `false`) — becomes read-only server data.
- Main text field (e.g. `nome`): `char` or `varchar` with `length`, in grid
  with `grdOrderAble: true` and the default sort, mandatory on both forms.
  Text fields in the grid are what search (`q`) and `contains` filters use.
- `boolean` grid fields get a Sim/Não faceted filter automatically.

Exactly ONE `isPrimaryKey: true`. Unique names, unique positions. A working
complete example ships in the checkout:
`test-fixtures/pollux/entities/rich-valid.json` (entity `amostra`) — mirror
its shape when unsure.

## Step 3 — Validate (loop until clean)

```bash
./pollux validate <name> [--metadata-dir=<dir>]
```

Fix every reported issue and re-run. Then prove normalization end-to-end
with a dry-run against the intended surface — for a standalone workspace:

```bash
./pollux plan --workspace=<path> --entity=<name> --json
```

(`plan` performs full model normalization and writes nothing; diagnostics
like `E_UNKNOWN_TYPE` or unsafe identifiers surface here.) For in-repo
generation the generate command itself validates first.

## Step 4 — Hand off

Report per contract, then offer generation (pollux-generate-crud):

1. **Authored** — path of the metadata file + field table (name, type,
   grid/forms, required).
2. **Validated** — validate output + plan summary (paths to be created).
3. **Assumptions** — every field or behavior you inferred rather than was
   told (so the user can correct before generating).
4. **Next** — `./pollux generate --workspace=<path> --entity=<name>`
   (plus `--metadata-dir=<dir>` when the metadata lives in the user's
   project) (or
   `./pollux gen-entity <name>` in-repo), and how to edit the metadata and
   regenerate.

## Refusals

- Do not invent unsupported dataTypes or relationship fields.
- Do not write generated application code by hand to compensate for missing
  metadata — fix the metadata.
- Do not overwrite an existing entity's metadata without explicit
  confirmation.
