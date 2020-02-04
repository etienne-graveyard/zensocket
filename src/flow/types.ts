import { SubscriptionCallback } from 'suub';

const EVENT = Symbol('EVENT');

export type FlowAny = Flow<any, any, any>;
export type Flows = { [key: string]: FlowAny };

export type QueryObj = { [key: string]: string | number | null | boolean };

export interface Flow<Query extends QueryObj | null, Initial = null, Fragment = null> {
  [EVENT]: true;
  query: Query;
  initial: Initial;
  fragment: Fragment;
}

export interface FlowEventBase<T extends Flows, K extends keyof T> {
  event: K;
  query: T[K]['query'];
}

export interface FlowEventInitial<T extends Flows, K extends keyof T> extends FlowEventBase<T, K> {
  type: 'Initial';
  data: T[K]['initial'];
  is<J extends K>(type: J): this is FlowEventInitial<T, J>;
  isOneOf<J extends K>(...types: ReadonlyArray<J>): this is FlowEventInitial<T, J>;
}

export interface FlowEventFragment<T extends Flows, K extends keyof T> extends FlowEventBase<T, K> {
  type: 'Fragment';
  data: T[K]['fragment'];
  is<J extends K>(type: J): this is FlowEventFragment<T, J>;
  isOneOf<J extends K>(...types: ReadonlyArray<J>): this is FlowEventFragment<T, J>;
}

export type FlowEvent<T extends Flows, K extends keyof T> =
  | FlowEventInitial<T, K>
  | FlowEventFragment<T, K>;

export interface UnsubscribedEvent {}

export type FlowListener<T extends Flows> = (event: FlowEvent<T, keyof T>) => void;

export type QueryParam<E extends FlowAny> = E['query'] extends null ? [] : [E['query']];

export enum FlowStatus {
  Void = 'Void',
  Subscribing = 'Subscribing',
  Subscribed = 'Subscribed',
  Unsubscribing = 'Unsubscribing',
  Error = 'Error',
  UnsubscribedByServer = 'UnsubscribedByServer'
}

export type FlowState =
  | {
      status: FlowStatus.Void;
    }
  | {
      status: FlowStatus.Subscribed;
    }
  | {
      status: FlowStatus.Unsubscribing;
      messageId: string;
    }
  | {
      status: FlowStatus.Subscribing;
      messageId: string;
    }
  | {
      status: FlowStatus.UnsubscribedByServer;
    }
  | {
      status: FlowStatus.Error;
      error: any;
      errorType: 'Subscribing' | 'Unsubscribing';
    };

export type Unsubscribe = () => void;

export type FlowClient<T extends Flows> = {
  incoming(message: any): void;
  subscribe<K extends keyof T>(event: K, ...query: QueryParam<T[K]>): void;
  unsubscribe<K extends keyof T>(event: K, ...query: QueryParam<T[K]>): void;
  state<K extends keyof T>(event: K, ...query: QueryParam<T[K]>): FlowState;
  on(listener: FlowListener<T>): Unsubscribe;
  onStateChange(listener: SubscriptionCallback<void>): Unsubscribe;
};

export type FlowServer<T extends Flows> = {
  incoming(message: any): void;
  // dispatch<K extends keyof T>(event: K, query: T[K]['query'], fragment: T[K]['fragment']): void;
  unsubscribe<K extends keyof T>(event: K, query: T[K]['query']): void;
};

export type WithInitial<T extends Flows> = {
  [K in keyof T]: T[K]['initial'] extends null ? never : K;
}[keyof T];

export type HandleSubscribe<T extends Flows> = {
  [K in WithInitial<T>]: (
    query: T[K]['query'],
    dispatch: (fragment: T[K]['fragment']) => void
  ) => Promise<{ state: T[K]['initial']; unsubscribe: () => void }>;
};

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
  Event: {
    event: string;
    query: QueryObj | null;
    fragment: any;
  };
  Error: {
    responseTo: string;
    error: any;
  };
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
