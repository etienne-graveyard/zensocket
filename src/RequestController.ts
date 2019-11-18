import { ZenSocketError } from "./ZenSocketError";

export interface RequestController<T> {
  resolve(data: T): void;
  reject(error: any): void;
}

export const RequestController = {
  create: createRequestController
};

function createRequestController<T>(
  resolve: (data: T) => void,
  reject: (error: any) => void,
  timeout: number
): RequestController<T> {
  const timer = setTimeout(() => {
    reject(new ZenSocketError.RequestTimeout());
  }, timeout);
  return {
    reject: err => {
      clearTimeout(timer);
      return reject(err);
    },
    resolve: data => {
      clearTimeout(timer);
      return resolve(data);
    }
  };
}
