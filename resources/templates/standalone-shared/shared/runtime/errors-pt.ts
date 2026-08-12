// SPEC-003 shared runtime — generated Portuguese locale module.
//
// EVERY user-visible default label and message of the shared CRUD surface
// lives here, in one module, instead of being duplicated across components
// (SPEC-003 "generated locale module" rule). Adapters may re-export or wrap
// it; entity/field labels come from the metadata (source text preserved) and
// are NOT duplicated here.

import type { ApiErrorCode, ApiErrorShape } from './api-types';

/** Safe messages per taxonomy code — mirrors src/lib/generated-crud.ts. */
export const errorMessages: Record<ApiErrorCode, string> = {
  UNAUTHENTICATED: 'Sessão expirada. Faça login novamente.',
  FORBIDDEN: 'Você não tem permissão para esta operação.',
  VALIDATION_FAILED: 'Dados inválidos. Verifique os campos e tente novamente.',
  NOT_FOUND: 'Registro não encontrado.',
  CONFLICT: 'Já existe um registro com estes dados.',
  REFERENCE_CONFLICT:
    'Existem registros utilizados em outras tabelas - Nenhuma exclusão foi realizada',
  STALE_WRITE:
    'Este registro foi alterado por outro usuário. Recarregue os dados.',
  RATE_LIMITED: 'Muitas solicitações. Aguarde um instante e tente novamente.',
  SERVICE_UNAVAILABLE: 'Serviço temporariamente indisponível. Tente novamente.',
  INTERNAL: 'Erro inesperado. Tente novamente ou contate o suporte.',
};

/** Field-level validation error keys -> Portuguese messages. */
export const fieldErrorMessages: Record<string, string> = {
  required: 'Campo obrigatório.',
  unknown_field: 'Campo não reconhecido.',
  invalid_type: 'Valor inválido para este campo.',
  invalid_boolean: 'Selecione Sim ou Não.',
  invalid_integer: 'Informe um número inteiro.',
  invalid_number: 'Informe um número válido.',
  invalid_date: 'Informe uma data válida.',
  invalid_time: 'Informe uma hora válida.',
  invalid_timestamp: 'Informe uma data e hora válidas.',
  max_length: 'O valor excede o tamanho máximo permitido.',
  out_of_range: 'Valor fora do intervalo permitido.',
};

export const fieldErrorMessage = (key: string): string =>
  fieldErrorMessages[key] ?? fieldErrorMessages.invalid_type!;

/** Prefer the envelope's safe server message; fall back to the taxonomy map. */
export const errorMessage = (error: ApiErrorShape): string =>
  error.message || errorMessages[error.code];

/** Shared UI labels (all defaults, Portuguese). */
export const uiLabels = {
  // generic actions
  actions: 'Ações',
  create: 'Novo registro',
  edit: 'Editar',
  delete: 'Excluir',
  save: 'Salvar',
  cancel: 'Cancelar',
  retry: 'Tentar novamente',
  confirm: 'Confirmar',
  close: 'Fechar',
  back: 'Voltar',
  login: 'Fazer login',

  // boolean display
  yes: 'Sim',
  no: 'Não',

  // table / list
  search: 'Buscar',
  searchPlaceholder: 'Buscar…',
  filters: 'Filtros',
  clearFilters: 'Limpar filtros',
  sortAscending: 'Ordenar crescente',
  sortDescending: 'Ordenar decrescente',
  sortedAscending: 'ordenado crescente',
  sortedDescending: 'ordenado decrescente',
  notSorted: 'sem ordenação',
  rowsPerPage: 'Linhas por página',
  pageOf: (page: number, pageCount: number) =>
    `Página ${page} de ${Math.max(pageCount, 1)}`,
  totalRows: (total: number) =>
    total === 1 ? '1 registro' : `${total} registros`,
  firstPage: 'Primeira página',
  previousPage: 'Página anterior',
  nextPage: 'Próxima página',
  lastPage: 'Última página',

  // states
  loading: 'Carregando…',
  refreshing: 'Atualizando…',
  empty: 'Nenhum registro encontrado.',
  emptyFiltered: 'Nenhum registro corresponde aos filtros.',
  forbidden: 'Você não tem permissão para acessar este recurso.',
  unauthenticated: 'Sessão expirada. Faça login novamente.',
  errorTitle: 'Não foi possível concluir a operação',
  requestId: (id: string) => `Código da solicitação: ${id}`,

  // form
  requiredMark: 'obrigatório',
  optionalMark: 'opcional',
  formHasErrors: 'Corrija os campos destacados e tente novamente.',
  saving: 'Salvando…',
  created: 'Registro criado com sucesso.',
  updated: 'Registro atualizado com sucesso.',
  deleted: 'Registro excluído com sucesso.',

  // delete confirmation
  deleteTitle: 'Confirmar exclusão',
  deleteMessage: 'Tem certeza de que deseja excluir este registro?',
  deleteIrreversible: 'Esta ação não pode ser desfeita.',
  deleting: 'Excluindo…',
} as const;

export type UiLabels = typeof uiLabels;
