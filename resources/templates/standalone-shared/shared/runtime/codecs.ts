// SPEC-003 shared runtime — display + form codecs per normalized scalar type.
//
// Wire values are preserved end-to-end; formatting happens ONLY at the
// presentation boundary. Form inputs edit a string projection of the wire
// value; `fromInput` maps back to the wire domain. An empty input on a
// numeric (or any nullable) field is null — NEVER 0 and never ''.
//
// pt-BR presentation: dates dd/mm/aaaa, decimal comma for display; the wire
// keeps ISO dates and dot-decimal strings.

import type { FieldSpec, ScalarType, WireValue } from './api-types';

export type FieldCodec = {
  /** Presentation-boundary formatting of a wire value (list/detail cells). */
  display: (wire: WireValue) => string;
  /** Wire value -> editable input string (round-trip safe, no locale). */
  toInput: (wire: WireValue) => string;
  /**
   * Input string -> wire value or a field error key. Empty input maps to
   * null (the caller enforces required-ness via the field spec).
   */
  fromInput: (
    input: string
  ) => { ok: true; value: WireValue } | { ok: false; error: string };
  /** Preferred HTML input control. */
  inputType:
    | 'text'
    | 'textarea'
    | 'checkbox'
    | 'number'
    | 'date'
    | 'time'
    | 'datetime-local';
};

const NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/;
const INTEGER_PATTERN = /^-?\d+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;

const empty = { ok: true as const, value: null };
const invalid = (error: string) => ({ ok: false as const, error });

const displayDate = (iso: string): string => {
  const match = DATE_PATTERN.exec(iso.slice(0, 10));
  if (!match) return iso;
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
};

const displayTimestamp = (iso: string): string => {
  const time = iso.slice(11, 16);
  return time ? `${displayDate(iso)} ${time}` : displayDate(iso);
};

/** Display decimal strings with a Brazilian decimal comma. Wire unchanged. */
const displayNumeric = (wire: string): string => wire.replace('.', ',');

const stringCodec = (inputType: FieldCodec['inputType']): FieldCodec => ({
  display: (wire) => (wire === null ? '' : String(wire)),
  toInput: (wire) => (wire === null ? '' : String(wire)),
  fromInput: (input) => (input === '' ? empty : { ok: true, value: input }),
  inputType,
});

const codecs: Record<ScalarType, FieldCodec> = {
  uuid: stringCodec('text'),
  string: stringCodec('text'),
  varchar: stringCodec('text'),
  text: stringCodec('textarea'),

  boolean: {
    display: (wire) => (wire === null ? '' : wire === true ? 'Sim' : 'Não'),
    toInput: (wire) => (wire === true ? 'true' : wire === false ? 'false' : ''),
    fromInput: (input) =>
      input === ''
        ? empty
        : input === 'true'
          ? { ok: true, value: true }
          : input === 'false'
            ? { ok: true, value: false }
            : invalid('invalid_boolean'),
    inputType: 'checkbox',
  },

  integer: {
    display: (wire) => (wire === null ? '' : String(wire)),
    toInput: (wire) => (wire === null ? '' : String(wire)),
    // Empty numeric input stays null — never coerced to 0.
    fromInput: (input) => {
      const trimmed = input.trim();
      if (trimmed === '') return empty;
      if (!INTEGER_PATTERN.test(trimmed)) return invalid('invalid_integer');
      const value = Number(trimmed);
      if (!Number.isSafeInteger(value)) return invalid('out_of_range');
      return { ok: true, value };
    },
    inputType: 'number',
  },

  float: {
    display: (wire) => (wire === null ? '' : displayNumeric(String(wire))),
    toInput: (wire) => (wire === null ? '' : String(wire)),
    fromInput: (input) => {
      const trimmed = input.trim().replace(',', '.');
      if (trimmed === '') return empty;
      const value = Number(trimmed);
      if (!Number.isFinite(value)) return invalid('invalid_number');
      return { ok: true, value };
    },
    inputType: 'number',
  },

  numeric: {
    // Wire is a decimal-literal STRING (precision preserved, e.g. "1234.50").
    display: (wire) => (wire === null ? '' : displayNumeric(String(wire))),
    toInput: (wire) => (wire === null ? '' : String(wire)),
    fromInput: (input) => {
      const trimmed = input.trim().replace(',', '.');
      if (trimmed === '') return empty;
      if (!NUMERIC_PATTERN.test(trimmed)) return invalid('invalid_number');
      return { ok: true, value: trimmed };
    },
    inputType: 'text',
  },

  date: {
    display: (wire) => (wire === null ? '' : displayDate(String(wire))),
    toInput: (wire) => (wire === null ? '' : String(wire).slice(0, 10)),
    fromInput: (input) => {
      if (input === '') return empty;
      if (!DATE_PATTERN.test(input)) return invalid('invalid_date');
      return { ok: true, value: input };
    },
    inputType: 'date',
  },

  time: {
    display: (wire) => (wire === null ? '' : String(wire).slice(0, 5)),
    toInput: (wire) => (wire === null ? '' : String(wire).slice(0, 5)),
    fromInput: (input) => {
      if (input === '') return empty;
      if (!TIME_PATTERN.test(input)) return invalid('invalid_time');
      // Wire format is HH:MM:SS.
      return { ok: true, value: input.length === 5 ? `${input}:00` : input };
    },
    inputType: 'time',
  },

  timestamp: {
    display: (wire) => (wire === null ? '' : displayTimestamp(String(wire))),
    // datetime-local edits 'YYYY-MM-DDTHH:MM'; wire keeps ISO-8601 UTC.
    toInput: (wire) => (wire === null ? '' : String(wire).slice(0, 16)),
    fromInput: (input) => {
      if (input === '') return empty;
      const iso = input.length === 16 ? `${input}:00.000Z` : input;
      if (Number.isNaN(Date.parse(iso))) return invalid('invalid_timestamp');
      return { ok: true, value: iso };
    },
    inputType: 'datetime-local',
  },
};

export const codecFor = (scalarType: ScalarType): FieldCodec =>
  codecs[scalarType];

/** Presentation-boundary formatting for one field of a record. */
export const displayValue = (field: FieldSpec, wire: WireValue): string =>
  codecFor(field.scalarType).display(wire);

/**
 * Parse a form input for a field, enforcing nullability, requiredness and
 * declared max length. Returns the wire value or a stable error key that
 * errors-pt maps to a Portuguese message.
 */
export const parseInput = (
  field: FieldSpec,
  input: string,
  operation: 'create' | 'update'
): { ok: true; value: WireValue } | { ok: false; error: string } => {
  const result = codecFor(field.scalarType).fromInput(input);
  if (!result.ok) return result;
  const required =
    operation === 'create' ? field.requiredOnCreate : field.requiredOnUpdate;
  if (result.value === null) {
    if (required || !field.nullable) return invalid('required');
    return result;
  }
  if (
    field.maxLength !== null &&
    typeof result.value === 'string' &&
    result.value.length > field.maxLength
  ) {
    return invalid('max_length');
  }
  return result;
};
