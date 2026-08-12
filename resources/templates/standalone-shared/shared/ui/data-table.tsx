// SPEC-003 shared UI — accessible data table with sortable headers,
// filter toolbar and pagination.
//
// Framework-neutral: no router/TanStack imports. The adapter owns the URL —
// it parses `ListQueryState` from the search params (runtime/query.ts) and
// passes `onQueryChange`, which must write the new state back to the URL
// (URL search params are the single source of truth for page, size, sort,
// q and filters). Column labels come from the entity spec (source Portuguese
// text); chrome labels come from the locale module.

import type { ReactNode } from 'react';

import { EmptyState, RefreshingIndicator } from './states';
import type {
  EntityCapabilities,
  EntitySpec,
  FieldSpec,
  WireRecord,
} from '../runtime/api-types';
import { displayValue } from '../runtime/codecs';
import { uiLabels } from '../runtime/errors-pt';
import type { ListQueryState } from '../runtime/query';
import {
  filterKey,
  withFilter,
  withPage,
  withPageSize,
  withSearch,
  withToggledSort,
} from '../runtime/query';

export type DataTableProps<Row extends WireRecord> = {
  spec: EntitySpec;
  rows: Row[];
  totalRows: number;
  query: ListQueryState;
  /** Write the new state to the URL (single source of truth). */
  onQueryChange: (next: ListQueryState) => void;
  capabilities: EntityCapabilities;
  /** Stable row identity (defaults to the primary-key field). */
  getRowId?: (row: Row) => string;
  /** Per-row action cell (edit/delete controls), injected by the adapter. */
  renderRowActions?: (row: Row) => ReactNode;
  /** Toolbar slot for the create button, injected by the adapter. */
  toolbarActions?: ReactNode;
  /** True while a background refresh is in flight (data stays visible). */
  refreshing?: boolean;
};

function SortableHeader({
  field,
  query,
  spec,
  onQueryChange,
}: {
  field: FieldSpec;
  query: ListQueryState;
  spec: EntitySpec;
  onQueryChange: (next: ListQueryState) => void;
}) {
  const sortable = spec.sortableFields.includes(field.codeName);
  const active = query.sort.find((s) => s.id === field.codeName);
  const ariaSort = active ? (active.desc ? 'descending' : 'ascending') : 'none';
  if (!sortable) {
    return (
      <th
        scope="col"
        className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {field.label}
      </th>
    );
  }
  const stateLabel = active
    ? active.desc
      ? uiLabels.sortedDescending
      : uiLabels.sortedAscending
    : uiLabels.notSorted;
  return (
    <th scope="col" aria-sort={ariaSort} className="px-3 py-2 text-left">
      <button
        type="button"
        onClick={() =>
          onQueryChange(withToggledSort(query, field.codeName, spec))
        }
        aria-label={`${field.label} (${stateLabel})`}
        className="inline-flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {field.label}
        <span aria-hidden="true" className="text-[0.65rem]">
          {active ? (active.desc ? '▼' : '▲') : '↕'}
        </span>
      </button>
    </th>
  );
}

function FilterToolbar({
  spec,
  query,
  onQueryChange,
  toolbarActions,
  refreshing,
}: {
  spec: EntitySpec;
  query: ListQueryState;
  onQueryChange: (next: ListQueryState) => void;
  toolbarActions?: ReactNode;
  refreshing?: boolean;
}) {
  const booleanFilters = spec.fields.filter(
    (f) =>
      f.visibility.list &&
      f.scalarType === 'boolean' &&
      spec.filterableFields.includes(f.codeName)
  );
  const hasActiveFilters =
    query.q !== '' || Object.keys(query.filters).length > 0;

  return (
    <div
      role="search"
      className="flex flex-wrap items-center gap-2 rounded-t-lg border-x border-t border-border bg-card p-3"
    >
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="sr-only">{uiLabels.search}</span>
        <input
          type="search"
          value={query.q}
          placeholder={uiLabels.searchPlaceholder}
          onChange={(event) =>
            onQueryChange(withSearch(query, event.target.value))
          }
          className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </label>
      {booleanFilters.map((field) => {
        const key = filterKey(field.codeName);
        const value = query.filters[key] ?? '';
        return (
          <label
            key={field.codeName}
            className="flex items-center gap-1.5 text-sm text-muted-foreground"
          >
            {field.label}
            <select
              value={value}
              onChange={(event) =>
                onQueryChange(
                  withFilter(query, key, event.target.value || null)
                )
              }
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <option value="">—</option>
              <option value="true">{uiLabels.yes}</option>
              <option value="false">{uiLabels.no}</option>
            </select>
          </label>
        );
      })}
      {hasActiveFilters ? (
        <button
          type="button"
          onClick={() =>
            onQueryChange({ ...query, q: '', filters: {}, page: 1 })
          }
          className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {uiLabels.clearFilters}
        </button>
      ) : null}
      <div className="ms-auto flex items-center gap-3">
        <RefreshingIndicator refreshing={refreshing === true} />
        {toolbarActions}
      </div>
    </div>
  );
}

function Pagination({
  query,
  totalRows,
  spec,
  onQueryChange,
}: {
  query: ListQueryState;
  totalRows: number;
  spec: EntitySpec;
  onQueryChange: (next: ListQueryState) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(totalRows / query.pageSize));
  const pagerButton =
    'rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
  return (
    <nav
      aria-label={uiLabels.pageOf(query.page, pageCount)}
      className="flex flex-wrap items-center gap-3 rounded-b-lg border border-border bg-card p-3 text-sm text-muted-foreground"
    >
      <span aria-live="polite">{uiLabels.totalRows(totalRows)}</span>
      <label className="flex items-center gap-1.5">
        {uiLabels.rowsPerPage}
        <select
          value={query.pageSize}
          onChange={(event) =>
            onQueryChange(withPageSize(query, Number(event.target.value)))
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {spec.pageSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div className="ms-auto flex items-center gap-1.5">
        <span aria-live="polite">{uiLabels.pageOf(query.page, pageCount)}</span>
        <button
          type="button"
          aria-label={uiLabels.firstPage}
          disabled={query.page <= 1}
          onClick={() => onQueryChange(withPage(query, 1))}
          className={pagerButton}
        >
          «
        </button>
        <button
          type="button"
          aria-label={uiLabels.previousPage}
          disabled={query.page <= 1}
          onClick={() => onQueryChange(withPage(query, query.page - 1))}
          className={pagerButton}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label={uiLabels.nextPage}
          disabled={query.page >= pageCount}
          onClick={() => onQueryChange(withPage(query, query.page + 1))}
          className={pagerButton}
        >
          ›
        </button>
        <button
          type="button"
          aria-label={uiLabels.lastPage}
          disabled={query.page >= pageCount}
          onClick={() => onQueryChange(withPage(query, pageCount))}
          className={pagerButton}
        >
          »
        </button>
      </div>
    </nav>
  );
}

export function DataTable<Row extends WireRecord>({
  spec,
  rows,
  totalRows,
  query,
  onQueryChange,
  getRowId,
  renderRowActions,
  toolbarActions,
  refreshing,
}: DataTableProps<Row>) {
  const pkField = spec.fields.find((f) => f.primaryKey);
  const rowId =
    getRowId ?? ((row: Row) => String(row[pkField?.codeName ?? 'id']));
  const columns = spec.fields.filter((f) => f.visibility.list);
  const hasActiveFilters =
    query.q !== '' || Object.keys(query.filters).length > 0;

  return (
    <div className="text-foreground">
      <FilterToolbar
        spec={spec}
        query={query}
        onQueryChange={onQueryChange}
        toolbarActions={toolbarActions}
        refreshing={refreshing}
      />
      {rows.length === 0 ? (
        <div className="border-x border-border">
          <EmptyState
            message={hasActiveFilters ? uiLabels.emptyFiltered : uiLabels.empty}
          />
        </div>
      ) : (
        <div className="overflow-x-auto border-x border-t border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{spec.titles.list}</caption>
            <thead className="border-b border-border">
              <tr>
                {columns.map((field) => (
                  <SortableHeader
                    key={field.codeName}
                    field={field}
                    query={query}
                    spec={spec}
                    onQueryChange={onQueryChange}
                  />
                ))}
                {renderRowActions ? (
                  <th
                    scope="col"
                    className="px-3 py-2 text-right text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    {uiLabels.actions}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowId(row)}
                  className="border-b border-border last:border-b-0 hover:bg-accent/50"
                >
                  {columns.map((field) => (
                    <td
                      key={field.codeName}
                      className="px-3 py-2 align-middle text-foreground"
                    >
                      {displayValue(field, row[field.codeName] ?? null)}
                    </td>
                  ))}
                  {renderRowActions ? (
                    <td className="px-3 py-2 text-right align-middle">
                      {renderRowActions(row)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        query={query}
        totalRows={totalRows}
        spec={spec}
        onQueryChange={onQueryChange}
      />
    </div>
  );
}
