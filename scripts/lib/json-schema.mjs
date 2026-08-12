// Minimal JSON Schema (2020-12 subset) validator for the pollux-ui plugin
// package. Supports exactly the keywords used by the package schemas:
// type, const, enum, required, properties, additionalProperties, pattern,
// minLength, maxLength, minItems, items, $ref (local #/$defs/*), format
// (date-time, uri — checked shallowly).

const isObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const typeOf = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v; // string | number | boolean | object
};

const typeMatches = (value, expected) => {
  if (expected === 'number' && typeOf(value) === 'integer') return true;
  return typeOf(value) === expected;
};

const checkFormat = (value, format) => {
  if (typeof value !== 'string') return true;
  if (format === 'date-time') return !Number.isNaN(Date.parse(value));
  if (format === 'uri') return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  return true;
};

const resolveRef = (ref, root) => {
  if (!ref.startsWith('#/')) return null;
  return ref
    .slice(2)
    .split('/')
    .reduce((node, key) => (isObject(node) ? node[key] : undefined), root);
};

// oxlint-disable-next-line sonarjs/cognitive-complexity -- one recursive walker keeps this zero-dependency validator's keyword handling together
const validateNode = (value, schema, root, pointer, problems) => {
  if (!isObject(schema)) return;
  if (schema.$ref) {
    const target = resolveRef(schema.$ref, root);
    if (!target) {
      problems.push(`${pointer}: unresolvable $ref ${schema.$ref}`);
      return;
    }
    validateNode(value, target, root, pointer, problems);
    return;
  }
  if (schema.const !== undefined && value !== schema.const) {
    problems.push(
      `${pointer}: must be ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`
    );
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    problems.push(
      `${pointer}: must be one of ${schema.enum.join(', ')}, got ${JSON.stringify(value)}`
    );
    return;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(value, t))) {
      problems.push(
        `${pointer}: expected type ${types.join(',')}, got ${typeOf(value)}`
      );
      return;
    }
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      problems.push(`${pointer}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      problems.push(`${pointer}: longer than maxLength ${schema.maxLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      problems.push(`${pointer}: does not match pattern ${schema.pattern}`);
    }
    if (schema.format && !checkFormat(value, schema.format)) {
      problems.push(`${pointer}: invalid ${schema.format} format`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      problems.push(`${pointer}: fewer than minItems ${schema.minItems}`);
    }
    if (schema.items) {
      value.forEach((item, i) =>
        validateNode(item, schema.items, root, `${pointer}/${i}`, problems)
      );
    }
  }
  if (isObject(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value))
        problems.push(`${pointer}: missing required '${key}'`);
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in value) {
          validateNode(
            value[key],
            propSchema,
            root,
            `${pointer}/${key}`,
            problems
          );
        }
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          problems.push(`${pointer}: unexpected property '${key}'`);
        }
      }
    }
  }
};

// Returns a list of problem strings; empty means valid.
export const validateSchema = (value, schema) => {
  const problems = [];
  validateNode(value, schema, schema, '#', problems);
  return problems;
};
