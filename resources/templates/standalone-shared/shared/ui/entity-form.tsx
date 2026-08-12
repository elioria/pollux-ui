// SPEC-003 shared UI — create/edit form generated from the entity field
// specs, using the scalar codecs (runtime/codecs.ts).
//
// Framework-neutral: submission is injected via `onSubmit` (the adapter
// wraps its server action / fetch mutation and supplies the idempotency
// key — one key per logical submission, reused across retries). Wire values
// are preserved: inputs edit a string projection and the codecs map back;
// an empty numeric input is null, never 0.
//
// Server `fieldErrors` (VALIDATION_FAILED / CONFLICT envelopes) are merged
// into the same accessible per-field slots as client codec errors, and user
// input is preserved on failure (SPEC-003 conflict behavior).

import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';

import type {
  ApiErrorShape,
  EntitySpec,
  FieldSpec,
  WireRecord,
} from '../runtime/api-types';
import { codecFor, parseInput } from '../runtime/codecs';
import {
  errorMessage,
  fieldErrorMessage,
  uiLabels,
} from '../runtime/errors-pt';

export type EntityFormProps = {
  spec: EntitySpec;
  operation: 'create' | 'update';
  /** Existing record on update (wire values); ignored on create. */
  initial?: WireRecord;
  /**
   * Injected submission wrapper. Receives the wire-encoded writable fields;
   * resolves to null on success or the safe error envelope on failure.
   */
  onSubmit: (values: WireRecord) => Promise<ApiErrorShape | null>;
  /** Injected navigation for the cancel action. */
  onCancel?: () => void;
  /** Extra footer content (e.g. adapter-specific hints). */
  footer?: ReactNode;
};

const writableFields = (spec: EntitySpec, operation: 'create' | 'update') =>
  spec.fields.filter((field) =>
    operation === 'create'
      ? field.mutability === 'createOnly' ||
        field.mutability === 'createAndUpdate'
      : field.mutability === 'updateOnly' ||
        field.mutability === 'createAndUpdate'
  );

const initialInputs = (
  fields: FieldSpec[],
  initial: WireRecord | undefined
): Record<string, string> => {
  const inputs: Record<string, string> = {};
  for (const field of fields) {
    inputs[field.codeName] = codecFor(field.scalarType).toInput(
      initial?.[field.codeName] ?? null
    );
  }
  return inputs;
};

export function EntityForm({
  spec,
  operation,
  initial,
  onSubmit,
  onCancel,
  footer,
}: EntityFormProps) {
  const fields = writableFields(spec, operation);
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    initialInputs(fields, initial)
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<ApiErrorShape | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const title =
    operation === 'create' ? spec.titles.create : spec.titles.update;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);

    // Client-side codec pass: wire encoding + stable error keys.
    const values: WireRecord = {};
    const nextErrors: Record<string, string[]> = {};
    for (const field of fields) {
      const result = parseInput(field, inputs[field.codeName] ?? '', operation);
      if (result.ok) values[field.codeName] = result.value;
      else nextErrors[field.codeName] = [result.error];
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const error = await onSubmit(values);
      if (error) {
        // Preserve user input; map server field errors to their fields.
        setFormError(error);
        if (error.fieldErrors) setFieldErrors(error.fieldErrors);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-busy={submitting}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6"
    >
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>

      {formError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
        >
          <p>{errorMessage(formError)}</p>
          {formError.requestId ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {uiLabels.requestId(formError.requestId)}
            </p>
          ) : null}
        </div>
      ) : null}

      {fields.map((field) => {
        const codec = codecFor(field.scalarType);
        const required =
          operation === 'create'
            ? field.requiredOnCreate || !field.nullable
            : field.requiredOnUpdate || !field.nullable;
        const errors = fieldErrors[field.codeName];
        const inputId = `${spec.id}-${operation}-${field.codeName}`;
        const errorId = `${inputId}-error`;
        const value = inputs[field.codeName] ?? '';
        const setValue = (next: string) =>
          setInputs((prev) => ({ ...prev, [field.codeName]: next }));
        const baseInputClass =
          'rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive';

        return (
          <div key={field.codeName} className="flex flex-col gap-1.5">
            <label
              htmlFor={inputId}
              className="text-sm font-medium text-foreground"
            >
              {field.label}
              <span className="ms-1 text-xs font-normal text-muted-foreground">
                ({required ? uiLabels.requiredMark : uiLabels.optionalMark})
              </span>
            </label>
            {codec.inputType === 'checkbox' ? (
              <label className="flex w-fit items-center gap-2 text-sm text-foreground">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={value === 'true'}
                  onChange={(event) =>
                    setValue(event.target.checked ? 'true' : 'false')
                  }
                  aria-invalid={errors ? true : undefined}
                  aria-describedby={errors ? errorId : undefined}
                  className="size-4 rounded border-input accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
                {value === 'true' ? uiLabels.yes : uiLabels.no}
              </label>
            ) : codec.inputType === 'textarea' ? (
              <textarea
                id={inputId}
                value={value}
                rows={4}
                required={required}
                maxLength={field.maxLength ?? undefined}
                onChange={(event) => setValue(event.target.value)}
                aria-invalid={errors ? true : undefined}
                aria-describedby={errors ? errorId : undefined}
                className={baseInputClass}
              />
            ) : (
              <input
                id={inputId}
                type={codec.inputType}
                value={value}
                required={required}
                maxLength={field.maxLength ?? undefined}
                inputMode={
                  field.scalarType === 'numeric' ? 'decimal' : undefined
                }
                step={
                  codec.inputType === 'number' && field.scalarType !== 'integer'
                    ? 'any'
                    : undefined
                }
                onChange={(event) => setValue(event.target.value)}
                aria-invalid={errors ? true : undefined}
                aria-describedby={errors ? errorId : undefined}
                className={baseInputClass}
              />
            )}
            {errors ? (
              <p id={errorId} role="alert" className="text-sm text-destructive">
                {errors.map((key) => fieldErrorMessage(key)).join(' ')}
              </p>
            ) : null}
          </div>
        );
      })}

      <div className="mt-2 flex items-center justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
          >
            {uiLabels.cancel}
          </button>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {submitting ? uiLabels.saving : uiLabels.save}
        </button>
      </div>
      {footer}
    </form>
  );
}
