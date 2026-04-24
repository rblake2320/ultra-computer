import type { ZodSchema } from "zod";

/**
 * Validate `data` against `schema`. Returns the parsed value on success.
 * On failure, throws an Error with statusCode 400 attached.
 */
export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ");
    throw Object.assign(new Error(message), { statusCode: 400 });
  }
  return result.data;
}
