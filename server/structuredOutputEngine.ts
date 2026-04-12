/**
 * Structured Output Engine — JSON Schema Conformance
 * Ensures agent responses conform to expected schemas when structured output is required.
 * 
 * Capabilities:
 * 1. Schema enforcement — validate JSON output against a schema
 * 2. Auto-extraction — extract JSON from markdown/text responses
 * 3. Repair — attempt to fix common JSON malformations
 * 4. Type coercion — convert strings to numbers/booleans where schema expects them
 * 5. Default filling — inject default values for missing optional fields
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchemaSpec {
  type: "object" | "array" | "string" | "number" | "boolean";
  properties?: Record<string, PropertySpec>;
  items?: PropertySpec;
  required?: string[];
  description?: string;
}

export interface PropertySpec {
  type: string;
  description?: string;
  enum?: any[];
  default?: any;
  items?: PropertySpec;
  properties?: Record<string, PropertySpec>;
  required?: string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

export interface ValidationResult {
  valid: boolean;
  data?: any;                // parsed + coerced data
  errors: ValidationError[];
  repaired: boolean;         // whether auto-repair was applied
  extractedFrom?: "json_block" | "raw" | "repaired";
}

export interface ValidationError {
  path: string;
  message: string;
  severity: "error" | "warning";
}

// ─── Extract JSON ─────────────────────────────────────────────────────────────

export function extractJSON(text: string): { json: string; source: "json_block" | "raw" | "repaired" } | null {
  // 1. Try to extract from markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      JSON.parse(codeBlockMatch[1].trim());
      return { json: codeBlockMatch[1].trim(), source: "json_block" };
    } catch {}
  }

  // 2. Try the full text as JSON
  try {
    JSON.parse(text.trim());
    return { json: text.trim(), source: "raw" };
  } catch {}

  // 3. Try to find JSON object/array in text
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      JSON.parse(jsonMatch[1]);
      return { json: jsonMatch[1], source: "raw" };
    } catch {}
  }

  // 4. Try to repair common issues
  const repaired = repairJSON(text);
  if (repaired) {
    return { json: repaired, source: "repaired" };
  }

  return null;
}

// ─── JSON Repair ──────────────────────────────────────────────────────────────

function repairJSON(text: string): string | null {
  // Extract the most likely JSON portion
  let candidate = text;
  
  // Find the JSON-like portion
  const jsonStart = text.search(/[\{\[]/);
  if (jsonStart === -1) return null;
  candidate = text.slice(jsonStart);

  // Common repairs
  const repairs = [
    // Trailing comma before closing brace/bracket
    (s: string) => s.replace(/,\s*([}\]])/g, "$1"),
    // Single quotes → double quotes
    (s: string) => s.replace(/'/g, '"'),
    // Unquoted keys
    (s: string) => s.replace(/(\{|,)\s*([a-zA-Z_]\w*)\s*:/g, '$1"$2":'),
    // Missing closing brace
    (s: string) => {
      const opens = (s.match(/\{/g) || []).length;
      const closes = (s.match(/\}/g) || []).length;
      return s + "}".repeat(Math.max(0, opens - closes));
    },
    // Missing closing bracket
    (s: string) => {
      const opens = (s.match(/\[/g) || []).length;
      const closes = (s.match(/\]/g) || []).length;
      return s + "]".repeat(Math.max(0, opens - closes));
    },
  ];

  for (const repair of repairs) {
    candidate = repair(candidate);
  }

  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return null;
  }
}

// ─── Schema Validation ────────────────────────────────────────────────────────

export function validateStructuredOutput(
  rawOutput: string,
  schema: SchemaSpec
): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Extract JSON
  const extracted = extractJSON(rawOutput);
  if (!extracted) {
    return {
      valid: false,
      errors: [{ path: "$", message: "Could not extract valid JSON from output", severity: "error" }],
      repaired: false,
    };
  }

  let data: any;
  try {
    data = JSON.parse(extracted.json);
  } catch (e: any) {
    return {
      valid: false,
      errors: [{ path: "$", message: `JSON parse error: ${e.message}`, severity: "error" }],
      repaired: false,
    };
  }

  // 2. Type check root
  const rootType = Array.isArray(data) ? "array" : typeof data;
  if (schema.type && rootType !== schema.type) {
    errors.push({ path: "$", message: `Expected ${schema.type}, got ${rootType}`, severity: "error" });
  }

  // 3. Validate properties
  if (schema.type === "object" && schema.properties) {
    data = validateObject(data, schema.properties, schema.required || [], "$", errors);
  }

  // 4. Validate array items
  if (schema.type === "array" && schema.items && Array.isArray(data)) {
    data = data.map((item: any, i: number) => {
      if (schema.items!.type === "object" && schema.items!.properties) {
        return validateObject(item, schema.items!.properties!, schema.items!.required || [], `$[${i}]`, errors);
      }
      return coerceType(item, schema.items!.type, `$[${i}]`, errors);
    });
  }

  const hasErrors = errors.some(e => e.severity === "error");

  return {
    valid: !hasErrors,
    data,
    errors,
    repaired: extracted.source === "repaired",
    extractedFrom: extracted.source,
  };
}

function validateObject(
  data: any,
  properties: Record<string, PropertySpec>,
  required: string[],
  pathPrefix: string,
  errors: ValidationError[]
): any {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    errors.push({ path: pathPrefix, message: "Expected object", severity: "error" });
    return data;
  }

  const result = { ...data };

  // Check required fields
  for (const req of required) {
    if (!(req in result) || result[req] === undefined || result[req] === null) {
      if (properties[req]?.default !== undefined) {
        result[req] = properties[req].default;
      } else {
        errors.push({ path: `${pathPrefix}.${req}`, message: `Required field missing`, severity: "error" });
      }
    }
  }

  // Validate + coerce each property
  for (const [key, spec] of Object.entries(properties)) {
    if (key in result) {
      const path = `${pathPrefix}.${key}`;
      result[key] = coerceType(result[key], spec.type, path, errors);

      // Enum check
      if (spec.enum && !spec.enum.includes(result[key])) {
        errors.push({ path, message: `Value "${result[key]}" not in enum: [${spec.enum.join(", ")}]`, severity: "error" });
      }

      // String constraints
      if (spec.type === "string" && typeof result[key] === "string") {
        if (spec.minLength && result[key].length < spec.minLength) {
          errors.push({ path, message: `String too short (min: ${spec.minLength})`, severity: "warning" });
        }
        if (spec.maxLength && result[key].length > spec.maxLength) {
          result[key] = result[key].slice(0, spec.maxLength);
          errors.push({ path, message: `String truncated to maxLength: ${spec.maxLength}`, severity: "warning" });
        }
        if (spec.pattern) {
          try {
            if (!new RegExp(spec.pattern).test(result[key])) {
              errors.push({ path, message: `String doesn't match pattern: ${spec.pattern}`, severity: "warning" });
            }
          } catch {}
        }
      }

      // Number constraints
      if (spec.type === "number" && typeof result[key] === "number") {
        if (spec.minimum !== undefined && result[key] < spec.minimum) {
          errors.push({ path, message: `Value below minimum: ${spec.minimum}`, severity: "warning" });
        }
        if (spec.maximum !== undefined && result[key] > spec.maximum) {
          errors.push({ path, message: `Value above maximum: ${spec.maximum}`, severity: "warning" });
        }
      }

      // Nested object
      if (spec.type === "object" && spec.properties) {
        result[key] = validateObject(result[key], spec.properties, spec.required || [], path, errors);
      }

      // Nested array
      if (spec.type === "array" && spec.items && Array.isArray(result[key])) {
        result[key] = result[key].map((item: any, i: number) => {
          if (spec.items!.type === "object" && spec.items!.properties) {
            return validateObject(item, spec.items!.properties!, spec.items!.required || [], `${path}[${i}]`, errors);
          }
          return coerceType(item, spec.items!.type, `${path}[${i}]`, errors);
        });
      }
    } else if (spec.default !== undefined) {
      // Fill defaults for missing optional fields
      result[key] = spec.default;
    }
  }

  return result;
}

function coerceType(value: any, expectedType: string, path: string, errors: ValidationError[]): any {
  if (expectedType === "string" && typeof value !== "string") {
    return String(value);
  }
  if (expectedType === "number" && typeof value !== "number") {
    const num = Number(value);
    if (isNaN(num)) {
      errors.push({ path, message: `Cannot coerce "${value}" to number`, severity: "error" });
      return value;
    }
    return num;
  }
  if (expectedType === "boolean" && typeof value !== "boolean") {
    if (value === "true" || value === 1) return true;
    if (value === "false" || value === 0) return false;
    errors.push({ path, message: `Cannot coerce "${value}" to boolean`, severity: "warning" });
    return Boolean(value);
  }
  if (expectedType === "array" && !Array.isArray(value)) {
    errors.push({ path, message: `Expected array, got ${typeof value}`, severity: "error" });
    return [value]; // wrap in array as recovery
  }
  return value;
}

// ─── Convenience: Format Instruction Prompt ───────────────────────────────────

export function buildFormatInstruction(schema: SchemaSpec): string {
  const example = generateExample(schema);
  return `You MUST respond with ONLY valid JSON matching this schema. No markdown, no explanation, no extra text.

Schema:
${JSON.stringify(schema, null, 2)}

Example response:
${JSON.stringify(example, null, 2)}`;
}

function generateExample(schema: SchemaSpec): any {
  if (schema.type === "object" && schema.properties) {
    const obj: Record<string, any> = {};
    for (const [key, spec] of Object.entries(schema.properties)) {
      obj[key] = generateExampleValue(spec);
    }
    return obj;
  }
  if (schema.type === "array" && schema.items) {
    return [generateExampleValue(schema.items)];
  }
  return generateExampleValue(schema as PropertySpec);
}

function generateExampleValue(spec: PropertySpec): any {
  if (spec.enum) return spec.enum[0];
  if (spec.default !== undefined) return spec.default;
  switch (spec.type) {
    case "string": return spec.description || "example";
    case "number": return spec.minimum || 0;
    case "boolean": return true;
    case "array": return spec.items ? [generateExampleValue(spec.items)] : [];
    case "object": {
      if (spec.properties) {
        const obj: Record<string, any> = {};
        for (const [k, v] of Object.entries(spec.properties)) {
          obj[k] = generateExampleValue(v);
        }
        return obj;
      }
      return {};
    }
    default: return null;
  }
}
