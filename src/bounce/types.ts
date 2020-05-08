import { ZensocketClient, ZensocketServer } from '../types';

const BOUNCE = Symbol.for('ZENSOCKET_BOUNCE');

export const BOUNCE_PREFIX = 'BOUNCE__';

export interface Bounce<Request, Response> {
  [BOUNCE]: true;
  request: Request;
  response: Response;
}

export type BounceAny = Bounce<any, any>;
export type Bounces = { [key: string]: BounceAny };

export interface BounceHandleRequestData<Data, Context> {
  data: Data;
  context: Context;
  canceled: () => Boolean;
}

export type BounceHandleRequest<T extends Bounces, Context> = {
  [K in keyof T]: (
    data: BounceHandleRequestData<T[K]['request'], Context>
  ) => Promise<T[K]['response']>;
};

export interface BounceRequestOptions {
  timeout?: number | null;
}

export type BounceCancellable<T extends BounceAny> = {
  cancel: () => void;
  response: Promise<T['response']>;
};

export interface BounceServer extends ZensocketServer {}

export interface BounceClient<T extends Bounces> extends ZensocketClient {
  bounces: {
    cancellable<K extends keyof T>(
      event: K,
      data: T[K]['request'],
      options?: BounceRequestOptions
    ): BounceCancellable<T[K]>;
    request<K extends keyof T>(
      event: K,
      data: T[K]['request'],
      options?: BounceRequestOptions
    ): Promise<T[K]['response']>;
  };
}

/**
 * Internal
 */

export enum BounceErrorType {
  MissingServerHandler = 'MissingServerHandler',
  ServerHandlerError = 'ServerHandlerError'
}

type InternalMessageDownData = {
  Success: {
    responseTo: string;
    data: any;
  };
  Error: {
    responseTo: string;
    errorType: BounceErrorType;
  };
};

export const ALL_MESSAGE_DOWN_TYPES: { [K in keyof InternalMessageDownData]: null } = {
  Success: null,
  Error: null
};

type InternalMessageDownObj = {
  [K in keyof InternalMessageDownData]: {
    type: K;
    zenid: string;
  } & InternalMessageDownData[K];
};

export type InternalMessageDown<
  K extends keyof InternalMessageDownObj = keyof InternalMessageDownObj
> = InternalMessageDownObj[K];

type InternalMessageUpData = {
  Request: {
    id: string;
    bounce: string;
    data: any;
  };
  Cancel: {
    requestId: string;
  };
};

export const ALL_MESSAGE_UP_TYPES: { [K in keyof InternalMessageUpData]: null } = {
  Request: null,
  Cancel: null
};

type InternalMessageUpType = keyof InternalMessageUpData;

type InternalMessageUpObj = {
  [K in InternalMessageUpType]: {
    type: K;
    zenid: string;
  } & InternalMessageUpData[K];
};

export type InternalMessageUp<
  K extends InternalMessageUpType = InternalMessageUpType
> = InternalMessageUpObj[K];
