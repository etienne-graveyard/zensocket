import { QueryObj } from './types';

/**
 * Object.values but we sort keys first to get consistent order
 */
export function queryToSlug(query: QueryObj | null): string {
  return JSON.stringify(
    query === null
      ? []
      : Array.from(Object.entries(query))
          .sort((l, r) => l[0].localeCompare(r[0]))
          .reduce<Array<any>>((acc, item) => {
            acc.push(...item);
            return acc;
          }, [])
  );
}
