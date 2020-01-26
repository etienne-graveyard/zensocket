const EVENT = Symbol("EVENT");

export type EventDefAny = EventDef<any, any>;
export type EventsDef = { [key: string]: EventDefAny };

export interface EventDef<Result, Query = null> {
  [EVENT]: true;
  query: Query;
  result: Result;
}

export interface Event<E extends EventDefAny> {
  data: E["result"];
}

export interface UnsubscribedEvent<E extends EventDefAny> {}

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
type UnsubscribedListener<E extends EventDefAny> = (
  event: UnsubscribedEvent<E>
) => void;

export type Client<E extends EventsDef> = {
  subscribe<K extends keyof WithQuery<E>>(
    event: K,
    query: E[K]["query"],
    listener: Listener<E[K]>
  ): Unsubscribe;
  subscribe<K extends keyof WithNoQuery<E>>(
    event: K,
    listener: Listener<E[K]>
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
  const listeners: Map<keyof E, Array<Listener<EventDefAny>>> = new Map();

  return {
    subscribe
  };

  function subscribe<K extends keyof WithNoQuery<E>>(
    event: K,
    listener: Listener<E[K]>
  ): Unsubscribe;
  function subscribe<K extends keyof WithQuery<E>>(
    event: K,
    query: E[K]["query"],
    listener: Listener<E[K]>
  ): Unsubscribe;
  function subscribe<K extends keyof WithNoQuery<E>>(
    event: K,
    query: E[K]["query"] | Listener<E[K]>,
    listener?: Listener<E[K]>
  ): Unsubscribe {}
}

export function createServer<E extends EventsDef>(): Server<E> {
  return {} as any;
}
