// SPEC-003 shared runtime — URL-search-params-as-source-of-truth list state.
//
// The URL is the single source of truth for page, pageSize, sort, q and
// declared filters, so a copied or reloaded URL always shows the same list.
// `parseListQuery` and `stringifyListQuery` round-trip: stringify(parse(sp))
// produces the same canonical params, and defaults are omitted from the URL.
//
// Wire keys (contract v2.0.0):
//   page, pageSize, sort = JSON [{"id","desc"}], q, f_<codeName>[__<op>]

import type { EntitySpec, SortSpec } from './api-types';

export type ListQueryState = {
  page: number;
  pageSize: number;
  sort: SortSpec[];
  q: string;
  /** Filters keyed by full wire key (`f_<codeName>` or `f_<codeName>__<op>`). */
  filters: Record<string, string>;
};

export const FILTER_KEY_PATTERN = /^f_([A-Za-z0-9]+?)(?:__([a-z]+))?$/;

export const filterKey = (codeName: string, operator?: string) =>
  operator ? `f_${codeName}__${operator}` : `f_${codeName}`;

const sortEquals = (a: SortSpec[], b: SortSpec[]) =>
  a.length === b.length &&
  a.every((s, i) => s.id === b[i]?.id && s.desc === b[i]?.desc);

/**
 * Parse URLSearchParams into a complete list state, applying entity defaults
 * for absent/invalid values. Never throws: a shareable URL with a bad value
 * degrades to the default rather than a broken page (the API remains strict).
 */
export function parseListQuery(
  searchParams: URLSearchParams,
  spec: EntitySpec
): ListQueryState {
  const pageRaw = Number(searchParams.get('page') ?? '');
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const pageSizeRaw = Number(searchParams.get('pageSize') ?? '');
  const pageSize = spec.pageSizes.includes(pageSizeRaw)
    ? pageSizeRaw
    : spec.defaultPageSize;

  let sort: SortSpec[] = spec.defaultSort.map((s) => ({ ...s }));
  const sortRaw = searchParams.get('sort');
  if (sortRaw !== null) {
    try {
      const parsed: unknown = JSON.parse(sortRaw);
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (s): s is SortSpec =>
            typeof s === 'object' &&
            s !== null &&
            typeof (s as SortSpec).id === 'string' &&
            typeof (s as SortSpec).desc === 'boolean' &&
            spec.sortableFields.includes((s as SortSpec).id)
        ) &&
        parsed.length > 0
      ) {
        sort = parsed;
      }
    } catch {
      // keep default sort
    }
  }

  const filters: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    const match = FILTER_KEY_PATTERN.exec(key);
    const codeName = match?.[1];
    if (!codeName || !spec.filterableFields.includes(codeName)) continue;
    if (value === '') continue;
    filters[key] = value;
  }

  return {
    page,
    pageSize,
    sort,
    q: searchParams.get('q') ?? '',
    filters,
  };
}

/**
 * Serialize list state into canonical URLSearchParams. Values equal to the
 * entity defaults are omitted so canonical URLs stay short and stable; key
 * order is fixed (page, pageSize, sort, q, filters by code-unit order).
 */
export function stringifyListQuery(
  state: ListQueryState,
  spec: EntitySpec
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.page !== 1) params.set('page', String(state.page));
  if (state.pageSize !== spec.defaultPageSize) {
    params.set('pageSize', String(state.pageSize));
  }
  if (!sortEquals(state.sort, spec.defaultSort)) {
    params.set(
      'sort',
      JSON.stringify(state.sort.map(({ id, desc }) => ({ id, desc })))
    );
  }
  if (state.q !== '') params.set('q', state.q);
  const filterKeys = Object.keys(state.filters).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  for (const key of filterKeys) {
    const value = state.filters[key];
    if (value !== undefined && value !== '') params.set(key, value);
  }
  return params;
}

/** Convenience: canonical query string ('' or '?...'). */
export const listQueryString = (
  state: ListQueryState,
  spec: EntitySpec
): string => {
  const qs = stringifyListQuery(state, spec).toString();
  return qs.length > 0 ? `?${qs}` : '';
};

/**
 * State transition helpers. All return a NEW state; filter/search/size
 * changes reset to page 1 (SPEC-003 list behavior).
 */
export const withPage = (state: ListQueryState, page: number) => ({
  ...state,
  page: Math.max(1, Math.trunc(page)),
});

export const withPageSize = (state: ListQueryState, pageSize: number) => ({
  ...state,
  pageSize,
  page: 1,
});

export const withSearch = (state: ListQueryState, q: string) => ({
  ...state,
  q,
  page: 1,
});

export const withFilter = (
  state: ListQueryState,
  key: string,
  value: string | null
) => {
  const filters = { ...state.filters };
  if (value === null || value === '') delete filters[key];
  else filters[key] = value;
  return { ...state, filters, page: 1 };
};

/** Cycle a column: none -> asc -> desc -> none (single-column toggle). */
export const withToggledSort = (
  state: ListQueryState,
  columnId: string,
  spec: EntitySpec
): ListQueryState => {
  if (!spec.sortableFields.includes(columnId)) return state;
  const current = state.sort.length === 1 ? state.sort[0] : undefined;
  let sort: SortSpec[];
  if (current?.id !== columnId) sort = [{ id: columnId, desc: false }];
  else if (!current.desc) sort = [{ id: columnId, desc: true }];
  else sort = spec.defaultSort.map((s) => ({ ...s }));
  return { ...state, sort, page: 1 };
};
