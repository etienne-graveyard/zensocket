import { createBidimensionalMap } from "./BidimensionalMap";
import { Subscription } from "suub";

const EVENT = Symbol("EVENT");

export type EventDefAny = EventDef<any, any>;
export type EventsDef = { [key: string]: EventDefAny };

type QueryObj = { [key: string]: string };

export interface EventDef<Result, Query extends QueryObj | null = null> {
  [EVENT]: true;
  query: Query;
  result: Result;
}

export interface Event<E extends EventDefAny> {
  data: E["result"];
}

export interface UnsubscribedEvent {}

export interface ServerEvent<E extends EventDefAny> {
  query: E["query"];
}

export type CreateEvents<E extends EventsDef> = E;

type WithNoQuery<E extends EventsDef> = {
  [J in {
    [K in keyof E]: E[K] extends EventDef<any, null> ? K : never;
  }[keyof E]]: E[J];
};

type WithQuery<E extends EventsDef> = {
  [J in {
    [K in keyof E]: E[K] extends EventDef<any, null> ? never : K;
  }[keyof E]]: E[J];
};

type Unsubscribe = () => void;

type Listener<E extends EventDefAny> = (event: Event<E>) => void;

type UnsubscribedListener = (event: UnsubscribedEvent) => void;

export type Client<E extends EventsDef> = {
  subscribe<K extends keyof WithQuery<E>>(
    event: K,
    query: E[K]["query"],
    listener: Listener<E[K]>,
    onUnsubscribed: UnsubscribedListener
  ): Unsubscribe;
  subscribe<K extends keyof WithNoQuery<E>>(
    event: K,
    listener: Listener<E[K]>,
    onUnsubscribed: UnsubscribedListener
  ): Unsubscribe;
};

type UnsubscribeHandler = void | (() => void);

export type Server<E extends EventsDef> = {
  on<K extends keyof E>(
    event: K,
    handler: (event: ServerEvent<E[K]>) => UnsubscribeHandler
  ): void;
  emit<K extends keyof E>(event: K, data: E[K]["result"]): void;
};

export function createClient<E extends EventsDef>(): Client<E> {
  const listeners = createBidimensionalMap<Subscription<any>>();

  return {
    subscribe
  };

  function subscribe<K extends keyof WithNoQuery<E>>(
    event: K,
    listener: Listener<E[K]>,
    onUnsubscribed?: UnsubscribedListener
  ): Unsubscribe;
  function subscribe<K extends keyof WithQuery<E>>(
    event: K,
    query: E[K]["query"],
    listener: Listener<E[K]>,
    onUnsubscribed?: UnsubscribedListener
  ): Unsubscribe;
  function subscribe<K extends keyof WithNoQuery<E>>(
    event: K,
    arg2: E[K]["query"] | Listener<E[K]>,
    arg3?: Listener<E[K]> | UnsubscribedListener,
    arg4?: UnsubscribedListener
  ): Unsubscribe {
    const [e, query, listener, onUnsubscribed] =
      typeof arg2 === "function"
        ? [event, null, arg2, arg3]
        : ([event, arg2, arg3, arg4] as [
            keyof E,
            any,
            Listener<EventDefAny>,
            UnsubscribedListener
          ]);
  }
}

export function createServer<E extends EventsDef>(): Server<E> {
  return {} as any;
}

function serializeQuery(query: QueryObj | null): string {
  if (query === null) {
    return "";
  }
  return;
}
