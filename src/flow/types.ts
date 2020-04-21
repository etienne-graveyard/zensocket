import { SubscriptionCallback, Unsubscribe } from 'suub';
import { ZensocketClient, ZensocketServer } from '../types';
import { DeepMapState } from '../utils';

const FLOW = Symbol.for('ZENSOCKET_FLOW');

export const FLOW_PREFIX = 'FLOW__';

export type QueryObj = { [key: string]: string | number | null | boolean };

export interface Flow<Query extends QueryObj | null, Initial = null, Mutations = null> {
  [FLOW]: true;
  query: Query;
  initial: Initial;
  mutations: Mutations;
}

export type FlowAny = Flow<any, any, any>;
export type Flows = { [key: string]: FlowAny };

type QueryParam<E extends FlowAny> = E['query'] extends null ? [] : [E['query']];

export interface FlowRef<T extends Flows, K extends keyof T = keyof T> {
  event: K;
  query: T[K]['query'];
  is<J extends keyof T>(name: K): this is FlowRef<T, J>;
}

export enum FlowStatus {
  Void = 'Void',
  Subscribing = 'Subscribing',
  Subscribed = 'Subscribed',
  Offline = 'Offline',
  Unsubscribing = 'Unsubscribing',
  Resubscribing = 'Resubscribing',
  Error = 'Error'
}

export type FlowState<T> =
  | {
      status: FlowStatus.Void;
    }
  | {
      status: FlowStatus.Subscribing;
      messageId: string;
    }
  | {
      status: FlowStatus.Unsubscribing;
      messageId: string;
    }
  | {
      status: FlowStatus.Subscribed;
      data: T;
    }
  | {
      status: FlowStatus.Offline;
      data: T;
    }
  | {
      status: FlowStatus.Resubscribing;
      messageId: string;
      data: T;
    }
  | {
      status: FlowStatus.Error;
      error: any;
      errorType: 'Subscribing' | 'Unsubscribing';
    };

export type FlowClientState<T extends Flows> = {
  data: DeepMapState<keyof T, FlowState<T[keyof T]['initial']>>;
  get<K extends keyof T>(event: K, query: T[K]['query']): FlowState<T[K]['initial']>;
  getVoid<K extends keyof T>(event: K): FlowState<T[K]['initial']>;
};

export interface FlowClient<T extends Flows> extends ZensocketClient {
  getState(): FlowClientState<T>;
  subscribe(listener: SubscriptionCallback<void>): Unsubscribe;
  flows: {
    ref<K extends keyof T>(event: K, ...query: QueryParam<T[K]>): FlowRef<T, K>;
    subscribe<K extends keyof T>(event: K, query: T[K]['query']): Unsubscribe;
  };
}

export interface FlowServer<T extends Flows> extends ZensocketServer {
  flows: {
    unsubscribe<K extends keyof T>(event: K, query: T[K]['query']): void;
  };
}

export type HandleMutation<T extends Flows> = {
  [K in keyof T]: (state: T[K]['initial'], mutation: T[K]['mutations']) => T[K]['initial'];
};

export interface HandleSubscribeData<Query, Mutation, Context> {
  query: Query;
  dispatch: (mutation: Mutation) => void;
  context: Context;
}

export type HandleSubscribe<T extends Flows, Context> = {
  [K in keyof T]: (
    data: HandleSubscribeData<T[K]['query'], T[K]['mutations'], Context>
  ) => Promise<{ state: T[K]['initial']; unsubscribe: () => void }>;
};

export type FlowResoure<T extends Flows, K extends keyof T = keyof T> = {
  [K in keyof T]: {
    event: K;
    query: T[K]['query'];
  };
}[K];

/**
 * Internal
 */

type InternalMessageDownData = {
  Subscribed: {
    responseTo: string;
    initialData: any;
  };
  Unsubscribed: {
    responseTo: string;
  };
  UnsubscribedByServer: {
    event: string;
    query: QueryObj | null;
  };
  Mutation: {
    event: string;
    query: QueryObj | null;
    mutation: any;
  };
  Error: {
    responseTo: string;
    error: any;
  };
};

export const ALL_MESSAGE_DOWN_TYPES: { [K in keyof InternalMessageDownData]: null } = {
  Error: null,
  Mutation: null,
  Subscribed: null,
  Unsubscribed: null,
  UnsubscribedByServer: null
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
  Subscribe: {
    id: string;
    event: string;
    query: QueryObj | null;
  };
  Unsubscribe: {
    id: string;
    event: string;
    query: QueryObj | null;
  };
};

export const ALL_MESSAGE_UP_TYPES: { [K in keyof InternalMessageUpData]: null } = {
  Subscribe: null,
  Unsubscribe: null
};

export type InternalMessageUpType = keyof InternalMessageUpData;

type InternalMessageUpObj = {
  [K in InternalMessageUpType]: {
    type: K;
    zenid: string;
  } & InternalMessageUpData[K];
};

export type InternalMessageUp<
  K extends InternalMessageUpType = InternalMessageUpType
> = InternalMessageUpObj[K];
