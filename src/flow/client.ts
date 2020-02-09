import { Unsubscribe } from 'suub';
import {
  FlowClient,
  FlowStatus,
  Flows,
  FlowState,
  QueryObj,
  InternalMessageUp,
  InternalMessageDown,
  InternalMessageUpType,
  ALL_MESSAGE_DOWN_TYPES,
  FLOW_PREFIX,
  FlowRef,
  HandleMutation
} from './types';
import cuid from 'cuid';
import { queryToKeys } from './utils';
import { expectNever, DeepMap, createDeepMap } from '../utils';
import { Outgoing } from '../types';

export interface FlowClientOptions<T extends Flows> {
  zenid: string;
  unsubscribeDelay?: number | false;
  handleMutations: HandleMutation<T>;
}

interface SubRequestsState {
  query: QueryObj | null;
  subs: Set<Unsubscribe>;
}

export function createFlowClient<T extends Flows>(options: FlowClientOptions<T>): FlowClient<T> {
  const { unsubscribeDelay = false, handleMutations } = options;
  const zenid = FLOW_PREFIX + options.zenid;

  let outgoing: Outgoing | null = null;

  // keep the state
  const internal: DeepMap<keyof T, FlowState<any>> = createDeepMap();
  // keep the requested state
  const subRequests: DeepMap<keyof T, SubRequestsState> = createDeepMap();

  const emptyState: FlowState<any> = {
    status: FlowStatus.Void
  };

  const sentMessages: Map<string, InternalMessageUp> = new Map();

  return {
    // base
    incoming,
    disconnected,
    connected,
    // manage
    subscribe,
    getState: internal.getState,
    subscribeState: internal.subscribe,
    ref
  };

  function ref<K extends keyof T>(event: K, query: QueryObj | null = null): FlowRef<T, K> {
    return {
      event: event as any,
      query,
      is: n => n === event
    };
  }

  function disconnected(): void {
    outgoing = null;
  }

  function connected(out: (msg: any) => void): void {
    outgoing = out;
    // sub what need to be
    subRequests.forEach((event, keys, state) => {
      if (state.subs.size > 0) {
        setTimeout(() => {
          // force sub on connect
          update(event, keys, state.query, true);
        });
      }
    });
  }

  function subscribe<K extends keyof T>(event: K, query: QueryObj | null = null): Unsubscribe {
    const keys = queryToKeys(query);
    const sub = ensureSubRequest(event, keys, query);
    const unsub = () => {
      const sub = subRequests.get(event, keys);
      if (sub) {
        if (unsubscribeDelay) {
          setTimeout(() => {
            sub.subs.delete(unsub);
            update(event, keys, query, false);
          }, unsubscribeDelay);
        } else {
          sub.subs.delete(unsub);
          setTimeout(() => {
            update(event, keys, query, false);
          });
        }
      }
    };
    sub.subs.add(unsub);
    setTimeout(() => {
      update(event, keys, query, false);
    });
    return unsub;
  }

  function ensureSubRequest<K extends keyof T>(
    event: K,
    keys: Array<any>,
    query: QueryObj | null
  ): SubRequestsState {
    const sub = subRequests.get(event, keys);
    if (sub) {
      return sub;
    }
    const created: SubRequestsState = {
      query,
      subs: new Set<Unsubscribe>()
    };
    subRequests.set(event, keys, created);
    return created;
  }

  function update<K extends keyof T>(
    event: K,
    keys: Array<any>,
    query: QueryObj | null,
    forceSub: boolean
  ): void {
    const sub = subRequests.get(event, keys);
    if (!sub || sub.subs.size === 0) {
      if (sub && sub.subs.size === 0) {
        subRequests.delete(event, keys);
      }
      unsubscribeInternal(event, keys, query);
      return;
    }
    subscribeInternal(event, keys, query, forceSub);
  }

  function subscribeInternal<K extends keyof T>(
    event: K,
    keys: Array<any>,
    query: QueryObj | null,
    forceSub: boolean
  ): void {
    if (outgoing === null) {
      return;
    }
    const intern = ensureInternalState(event, keys);
    if (intern.status === FlowStatus.Subscribing) {
      return;
    }
    // if Unsubscribing cancel the unsubscription
    if (intern.status === FlowStatus.Unsubscribing) {
      const out = getSentMessage(intern.messageId, 'Unsubscribe');
      if (out) {
        sentMessages.delete(intern.messageId);
      }
    }
    if (intern.status === FlowStatus.Subscribed && forceSub) {
      const message: InternalMessageUp = {
        zenid,
        type: 'Subscribe',
        id: cuid.slug(),
        event: event as string,
        query
      };
      sentMessages.set(message.id, message);
      setInternalState(event, keys, {
        status: FlowStatus.Resubscribing,
        data: intern.data,
        messageId: message.id
      });
      outgoing(message);
      return;
    }
    if (intern.status === FlowStatus.Void) {
      const message: InternalMessageUp = {
        zenid,
        type: 'Subscribe',
        id: cuid.slug(),
        event: event as string,
        query
      };
      sentMessages.set(message.id, message);
      setInternalState(event, keys, {
        status: FlowStatus.Subscribing,
        messageId: message.id
      });
      outgoing(message);
      return;
    }
  }

  function unsubscribeInternal<K extends keyof T>(
    event: K,
    keys: Array<any>,
    query: QueryObj | null
  ): void {
    if (outgoing === null) {
      return;
    }
    const intern = getInternalState(event, keys);
    if (intern === null) {
      return;
    }
    // is Subscribing => cancel
    if (intern.status === FlowStatus.Subscribing) {
      const out = getSentMessage(intern.messageId, 'Subscribe');
      if (out) {
        sentMessages.delete(intern.messageId);
      }
    }
    if (intern.status === FlowStatus.Subscribed) {
      const message: InternalMessageUp = {
        zenid,
        type: 'Unsubscribe',
        id: cuid.slug(),
        event: event as string,
        query
      };
      sentMessages.set(message.id, message);
      setInternalState(event, keys, {
        status: FlowStatus.Unsubscribing,
        messageId: message.id
      });
      outgoing(message);
      return;
    }
  }

  function handleDownMessage(message: InternalMessageDown): void {
    if (message.type === 'Subscribed') {
      const out = getSentMessage(message.responseTo, 'Subscribe');
      if (!out) {
        // canceled
        return;
      }
      const keys = queryToKeys(out.query);
      const state = getInternalState(out.event, keys);
      if (!state) {
        return;
      }
      if (state.status !== FlowStatus.Subscribing) {
        return;
      }
      setInternalState(out.event, keys, {
        status: FlowStatus.Subscribed,
        data: message.initialData
      });
      return;
    }
    if (message.type === 'Unsubscribed') {
      const out = getSentMessage(message.responseTo, 'Unsubscribe');
      if (!out) {
        // canceled
        return;
      }
      const keys = queryToKeys(out.query);
      const state = getInternalState(out.event, keys);
      if (!state || state.status !== FlowStatus.Unsubscribing) {
        return;
      }
      setInternalState(out.event, keys, { status: FlowStatus.Void });
      return;
    }
    if (message.type === 'Error') {
      const out = sentMessages.get(message.responseTo);
      if (!out) {
        // canceled
        return;
      }
      const keys = queryToKeys(out.query);
      if (out.type === 'Subscribe') {
        const state = getInternalState(out.event, keys);
        if (!state || state.status !== FlowStatus.Subscribing) {
          return;
        }
        setInternalState(out.event, keys, {
          status: FlowStatus.Error,
          errorType: 'Subscribing',
          error: message.error
        });
        return;
      }
      if (out.type === 'Unsubscribe') {
        const state = getInternalState(out.event, keys);
        if (!state || state.status !== FlowStatus.Unsubscribing) {
          return;
        }
        setInternalState(out.event, keys, {
          status: FlowStatus.Error,
          errorType: 'Unsubscribing',
          error: message.error
        });
        return;
      }
      return;
    }
    if (message.type === 'Mutation') {
      const keys = queryToKeys(message.query);
      const state = getInternalState(message.event, keys);
      if (!state || state.status !== FlowStatus.Subscribed) {
        return;
      }
      const hanlder = handleMutations[message.event];
      if (!hanlder) {
        throw new Error(`Missing mutation handler for ${message.event}`);
      }
      const prevState = state.data;
      const nextState = hanlder(prevState, message.mutation);
      if (prevState !== nextState) {
        setInternalState(message.event, keys, {
          status: FlowStatus.Subscribed,
          data: nextState
        });
      }
      return;
    }
    if (message.type === 'UnsubscribedByServer') {
      const keys = queryToKeys(message.query);
      const state = getInternalState(message.event, keys);
      if (!state) {
        return;
      }
      setInternalState(message.event, keys, { status: FlowStatus.UnsubscribedByServer });
      return;
    }
    expectNever(message);
  }

  function getSentMessage<K extends InternalMessageUpType>(
    id: string,
    expectedType: K
  ): InternalMessageUp<K> | null {
    const out = sentMessages.get(id);
    if (!out) {
      return null;
    }
    sentMessages.delete(id);
    if (out.type !== expectedType) {
      return null;
    }
    return out as any;
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

  // function getState<K extends keyof T>(
  //   event: K,
  //   query: QueryObj | null = null
  // ): FlowState<T[K]['initial']> {
  //   const keys = queryToKeys(query);
  //   const intern = getInternalState(event, keys);
  //   if (intern === null) {
  //     return emptyState;
  //   }
  //   return intern;
  // }

  function getInternalState<K extends keyof T>(event: K, keys: Array<any>): FlowState<any> | null {
    const eventState = internal.get(event, keys);
    if (!eventState) {
      return null;
    }
    return eventState;
  }

  function setInternalState<K extends keyof T>(
    event: K,
    keys: Array<any>,
    state: FlowState<any>
  ): void {
    internal.set(event, keys, state);
  }

  function ensureInternalState<K extends keyof T>(event: K, keys: Array<any>): FlowState<any> {
    let eventState = internal.get(event, keys);
    if (!eventState) {
      eventState = emptyState;
      internal.set(event, keys, eventState);
    }
    return eventState;
  }
}
