// Tiny readers that narrow `unknown` JSON into typed content without `as` casts.

export class ContentError extends Error {
  override name = "ContentError";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRecord(value: unknown, where: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ContentError(`${where}: expected an object`);
  return value;
}

export function readArray(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) throw new ContentError(`${where}: expected an array`);
  return value;
}

export function readString(value: unknown, where: string): string {
  if (typeof value !== "string") throw new ContentError(`${where}: expected a string`);
  return value;
}

export function readInt(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ContentError(`${where}: expected an integer`);
  }
  return value;
}
