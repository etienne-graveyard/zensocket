export interface ControllablePromise<T> {
  promise: Promise<T>;
  resolve: Resolved<T>;
  reject: Reject;
}

type Resolved<T> = (value: T) => void;
type Reject = (error: any) => void;

export function createControllablePromise<T>(
  exec: (resolve: Resolved<T>, reject: Reject) => any
): ControllablePromise<T> {
  let res: Resolved<T> | null = null;
  let rej: Reject | null = null;
  const prom = new Promise<T>((resolve, reject) => {
    res = resolve;
    rej = reject;
    return exec(resolve, reject);
  });
  return {
    promise: prom,
    reject: err => {
      if (rej) {
        const r = rej;
        rej = null;
        return r(err);
      }
    },
    resolve: v => {
      if (res) {
        const r = res;
        res = null;
        return r(v);
      }
    }
  };
}
