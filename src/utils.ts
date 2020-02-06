export function expectNever<T extends never>(_val: T): void {
  throw new Error(`Expected never !`);
}
