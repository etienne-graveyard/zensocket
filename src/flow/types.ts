import { Unsubscribe, SubscribeMethod } from 'suub';
import { ZensocketClient, ZensocketServer } from '../types';

/**
 * GLOBAL
 */

const FLOW = Symbol.for('ZENSOCKET_FLOW');

export const FLOW_PREFIX = 'FLOW__';

export type QueryObj = { [key: string]: string | number | null | boolean };

export interface Flow<Query extends QueryObj | null, Initial, Message, State> {
  [FLOW]: true;
  query: Query;
  initial: Initial;
  message: Message;
  state: State;
}

export type FlowAny = Flow<any, any, any, any>;
export type Flows = { [key: string]: FlowAny };

/**
 * Server
 */

export interface FlowServer<T extends Flows> extends ZensocketServer {
  // force unmount a flow (send an UnsubscribedByServer)
  unmount<K extends keyof T>(event: K, query: T[K]['query']): void;
}

export interface FlowServerMountParams<Query, Message, Context> {
  emitMessage: (message: Message) => void;
  query: Query;
  context: Context;
}

export interface FlowServerMountResult<Initial> {
  getInitial: () => Initial;
  unmount: () => void;
}

export type FlowServerMountHandlers<T extends Flows, Context> = {
  [K in keyof T]: (
    data: FlowServerMountParams<T[K]['query'], T[K]['message'], Context>
  ) => Promise<FlowServerMountResult<T[K]['initial']>>;
};

/**
 * Client
 */

export interface FlowClient<T extends Flows> extends ZensocketClient {
  subscribe<K extends keyof T>(
    event: K,
    query: T[K]['query'],
    onState: (state: FlowClientState<T[K]['state']>) => void
  ): Unsubscribe;
  get<K extends keyof T>(event: K, query: T[K]['query']): FlowClientState<T[K]['state']>;
  connectionStatus: {
    get(): FlowConnectionStatus;
    subscribe: SubscribeMethod<FlowConnectionStatus>;
  };
}

export type FlowConnectionStatus = 'Void' | 'Connected' | 'Offline';

export type FlowClientState<State> =
  | { status: 'Void' }
  | { status: 'Subscribing' }
  | { status: 'Subscribed'; state: State }
  | { status: 'Offline'; state: State }
  | { status: 'Resubscribing'; state: State }
  | { status: 'Unsubscribing'; state: State }
  | { status: 'CancelSubscribing' }
  | { status: 'Error'; error: any; state: State | null }
  | { status: 'UnsubscribedByServer'; state: State | null };

export interface FlowClientMountParams<Initial, Query> {
  initial: Initial;
  stateChanged: () => void;
  query: Query;
}

export interface FlowClientMountResponse<Message, State> {
  getState: () => State;
  onMessage: (message: Message) => void;
  unmount: () => void;
}

export type FlowClientMountHandlers<T extends Flows> = {
  [K in keyof T]: (
    data: FlowClientMountParams<T[K]['initial'], T[K]['query']>
  ) => FlowClientMountResponse<T[K]['message'], T[K]['state']>;
};

/**
 * Internal
 */

type InternalMessageDownData = {
  Subscribed: {
    responseTo: string;
    initial: any;
  };
  SubscribeError: {
    responseTo: string;
    error: any;
  };
  Unsubscribed: {
    responseTo: string;
  };
  UnsubscribedByServer: {
    responseTo: string | null;
    event: string;
    query: QueryObj | null;
  };
  Message: {
    event: string;
    query: QueryObj | null;
    message: any;
  };
};

export const ALL_MESSAGE_DOWN_TYPES: { [K in keyof InternalMessageDownData]: null } = {
  SubscribeError: null,
  Message: null,
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
