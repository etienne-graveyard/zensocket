import {
  InternalMessageDown,
  ALL_MESSAGE_DOWN_TYPES,
  Bounces,
  BounceClient,
  BounceRequestOptions,
  CancellableBounce,
  InternalMessageUp,
  BounceErrorType
} from './types';
import { expectNever } from '../utils';
import { BounceError } from './BounceError';
import cuid from 'cuid';
import { ControllablePromise, createControllablePromise } from './utils';

export interface BounceClientOptions {
  outgoing(message: any): void;
  zenid: string;
  defaultTimeout?: number | null;
}

export function createBounceClient<T extends Bounces>(
  options: BounceClientOptions
): BounceClient<T> {
  const { outgoing, zenid, defaultTimeout = null } = options;

  const pendingRequests = new Map<string, ControllablePromise<any>>();

  return {
    incoming,
    cancellable,
    request
  };

  function cancellable<K extends keyof T>(
    bounce: K,
    data: T[K]['request'],
    options: BounceRequestOptions = {}
  ): CancellableBounce<T[K]> {
    const { timeout = defaultTimeout } = options;
    const requestId = cuid.slug();
    const prom = createControllablePromise<T[K]['response']>(() => {});

    let timer: null | NodeJS.Timeout = null;
    if (timeout !== null && timeout > 0) {
      timer = setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          prom.reject(new BounceError.Timeout());
        }
      }, timeout * 1000);
    }

    const mes: InternalMessageUp = {
      zenid,
      type: 'Request',
      id: requestId,
      bounce: bounce as string,
      data
    };
    outgoing(mes);
    pendingRequests.set(requestId, {
      promise: prom.promise,
      reject: prom.reject,
      resolve: v => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        prom.resolve(v);
      }
    });

    function cancel() {
      if (pendingRequests.has(requestId)) {
        const mes: InternalMessageUp = {
          zenid,
          type: 'Cancel',
          requestId
        };
        outgoing(mes);
        pendingRequests.delete(requestId);
        prom.reject(new BounceError.Canceled());
      }
    }

    return {
      response: prom.promise,
      cancel
    };
  }

  async function request<K extends keyof T>(
    event: K,
    data: T[K]['request'],
    options?: BounceRequestOptions
  ): Promise<T[K]['response']> {
    return cancellable(event, data, options).response;
  }

  function handleDownMessage(message: InternalMessageDown): void {
    if (message.type === 'Success') {
      const prom = pendingRequests.get(message.responseTo);
      if (!prom) {
        return;
      }
      pendingRequests.delete(message.responseTo);
      prom.resolve(message.data);
      return;
    }
    if (message.type === 'Error') {
      const prom = pendingRequests.get(message.responseTo);
      if (!prom) {
        return;
      }
      pendingRequests.delete(message.responseTo);
      if (message.errorType === BounceErrorType.ServerHandlerError) {
        prom.reject(new BounceError.ServerHandlerError());
        return;
      }
      if (message.errorType === BounceErrorType.MissingServerHandler) {
        prom.reject(new BounceError.MissingServerHandler());
        return;
      }
      prom.reject(new BounceError.UnkwownError());
      expectNever(message.errorType);
      return;
    }
    expectNever(message);
  }

  function incoming(message: any): void {
    if (isDownMessage(message)) {
      handleDownMessage(message);
    }
  }

  function isDownMessage(message: any): message is InternalMessageDown {
    if (message && 'type' in message && 'zenid' in message) {
      if (typeof message.type === 'string' && typeof message.zenid === 'string') {
        if (message.zenid !== zenid) {
          return false;
        }
        if (Object.keys(ALL_MESSAGE_DOWN_TYPES).includes(message.type)) {
          return true;
        } else {
          console.log(message);
          console.warn(`Invalid message.type`);
        }
      }
    }
    return false;
  }
}
