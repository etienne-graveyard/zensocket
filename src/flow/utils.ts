import { QueryObj } from './types';

/**
 * { a: 3, b: true } => ['a', 3, 'b', true];
 */
export function queryToKeys(query: QueryObj | null): Array<any> {
  return query === null
    ? []
    : Array.from(Object.entries(query))
        .sort((l, r) => l[0].localeCompare(r[0]))
        .reduce<Array<any>>((acc, item) => {
          acc.push(...item);
          return acc;
        }, []);
}
