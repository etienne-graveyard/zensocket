import { Subscription } from 'suub';
import {
  FlowClient,
  FlowStatus,
  Flows,
  FlowState,
  QueryObj,
  InternalMessageUp,
  FlowListener,
  FlowEvent,
  Unsubscribe,
  InternalMessageDown,
  InternalMessageUpType,
  FlowEventInitial,
  FlowEventFragment,
  ALL_MESSAGE_DOWN_TYPES,
  FLOW_PREFIX
} from './types';
import cuid from 'cuid';
import { Mappemonde } from 'mappemonde';
import { queryToSlug } from './utils';
import { expectNever } from '../utils';
import { Outgoing } from '../types';

export interface FlowClientOptions {
  zenid: string;
}

interface SubRequestsState {
  query: QueryObj | null;
  subs: Set<Unsubscribe>;
}

export function createFlowClient<T extends Flows>(options: FlowClientOptions): FlowClient<T> {
  const zenid = FLOW_PREFIX + options.zenid;

  let outgoing: Outgoing | null = null;

  const stateChangedSub = Subscription.create();
  const eventSub = Subscription.create<FlowEvent<T, keyof T>>();

  let internal = Mappemonde.create<[keyof T, string], FlowState>();
  const subRequests = Mappemonde.create<[keyof T, string], SubRequestsState>();

  const emptyState: FlowState = {
    status: FlowStatus.Void
  };

  const sentMessages: Map<string, InternalMessageUp> = new Map();

  return {
    state,
    subscribe,
    incoming,
    on,
    disconnected,
    connected,
    onStateChange: stateChangedSub.subscribe
  };

  function disconnected(): void {
    outgoing = null;
    // reset internal state
    internal = Mappemonde.create<[keyof T, string], FlowState>();
    stateChangedSub.call();
  }

  function connected(out: (msg: any) => void): void {
    outgoing = out;
    // sub what need to be
    subRequests.entries().forEach(([keys, state]) => {
      const event = keys[0];
      if (state.subs.size > 0) {
        update(event, state.query);
      }
    });
  }

  function subscribe<K extends keyof T>(event: K, query: QueryObj | null = null): Unsubscribe {
    const sub = ensureSubRequest(event, query);
    const unsub = () => {
      const sub = subRequests.get([event, queryToSlug(query)]);
      if (sub) {
        sub.subs.delete(unsub);
        update(event, query);
      }
    };
    sub.subs.add(unsub);
    update(event, query);
    return unsub;
  }

  function ensureSubRequest<K extends keyof T>(
    event: K,
    query: QueryObj | null = null
  ): SubRequestsState {
    const sub = subRequests.get([event, queryToSlug(query)]);
    if (sub) {
      return sub;
    }
    const created: SubRequestsState = {
      query,
      subs: new Set<Unsubscribe>()
    };
    subRequests.set([event, queryToSlug(query)], created);
    return created;
  }

  function update<K extends keyof T>(event: K, query: QueryObj | null = null): void {
    const sub = subRequests.get([event, queryToSlug(query)]);
    if (!sub || sub.subs.size === 0) {
      if (sub && sub.subs.size === 0) {
        subRequests.delete([event, queryToSlug(query)]);
      }
      unsubscribeInternal(event, query);
      return;
    }
    subscribeInternal(event, query);
  }

  function subscribeInternal<K extends keyof T>(event: K, query: QueryObj | null = null): void {
    if (outgoing === null) {
      return;
    }
    const intern = ensureInternalState(event, query);
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
    if (intern.status === FlowStatus.Void) {
      const message: InternalMessageUp = {
        zenid,
        type: 'Subscribe',
        id: cuid.slug(),
        event: event as string,
        query
      };
      sentMessages.set(message.id, message);
      setInternalState(event, query, {
        status: FlowStatus.Subscribing,
        messageId: message.id
      });
      outgoing(message);
      return;
    }
  }

  function unsubscribeInternal<K extends keyof T>(event: K, query: QueryObj | null = null): void {
    if (outgoing === null) {
      return;
    }
    const intern = getInternalState(event, query);
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
      setInternalState(event, query, {
        status: FlowStatus.Unsubscribing,
        messageId: message.id
      });
      outgoing(message);
      return;
    }
  }

  function on(listener: FlowListener<T>): Unsubscribe {
    return eventSub.subscribe(listener);
  }

  function handleDownMessage(message: InternalMessageDown): void {
    if (message.type === 'Subscribed') {
      const out = getSentMessage(message.responseTo, 'Subscribe');
      if (!out) {
        // canceled
        return;
      }
      const state = getInternalState(out.event, out.query);
      if (!state) {
        return;
      }
      if (state.status !== FlowStatus.Subscribing) {
        return;
      }
      setInternalState(out.event, out.query, { status: FlowStatus.Subscribed });
      const event: FlowEventInitial<T, keyof T> = {
        event: out.event,
        query: out.query,
        type: 'Initial',
        data: message.initialData,
        is: t => t === out.event,
        isOneOf: (...t) => t.includes(out.event as any)
      };
      eventSub.call(event);
      return;
    }
    if (message.type === 'Unsubscribed') {
      const out = getSentMessage(message.responseTo, 'Unsubscribe');
      if (!out) {
        // canceled
        return;
      }
      const state = getInternalState(out.event, out.query);
      if (!state || state.status !== FlowStatus.Unsubscribing) {
        return;
      }
      setInternalState(out.event, out.query, { status: FlowStatus.Void });
      return;
    }
    if (message.type === 'Error') {
      const out = sentMessages.get(message.responseTo);
      if (!out) {
        // canceled
        return;
      }
      if (out.type === 'Subscribe') {
        const state = getInternalState(out.event, out.query);
        if (!state || state.status !== FlowStatus.Subscribing) {
          return;
        }
        setInternalState(out.event, out.query, {
          status: FlowStatus.Error,
          errorType: 'Subscribing',
          error: message.error
        });
        return;
      }
      if (out.type === 'Unsubscribe') {
        const state = getInternalState(out.event, out.query);
        if (!state || state.status !== FlowStatus.Unsubscribing) {
          return;
        }
        setInternalState(out.event, out.query, {
          status: FlowStatus.Error,
          errorType: 'Unsubscribing',
          error: message.error
        });
        return;
      }
      return;
    }
    if (message.type === 'Event') {
      const state = getInternalState(message.event, message.query);
      if (!state || state.status !== FlowStatus.Subscribed) {
        return;
      }
      const event: FlowEventFragment<T, keyof T> = {
        type: 'Fragment',
        event: message.event,
        query: message.query,
        data: message.fragment,
        is: t => t === message.event,
        isOneOf: (...t) => t.includes(message.event as any)
      };
      eventSub.call(event);
      return;
    }
    if (message.type === 'UnsubscribedByServer') {
      const state = getInternalState(message.event, message.query);
      if (!state) {
        return;
      }
      setInternalState(message.event, message.query, { status: FlowStatus.UnsubscribedByServer });
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

  function state<K extends keyof T>(event: K, query: QueryObj | null = null): FlowState {
    const intern = getInternalState(event, query);
    if (intern === null) {
      return emptyState;
    }
    return intern;
  }

  function getInternalState<K extends keyof T>(event: K, query: QueryObj | null): FlowState | null {
    const eventState = internal.get([event, queryToSlug(query)]);
    if (!eventState) {
      return null;
    }
    return eventState;
  }

  function setInternalState<K extends keyof T>(
    event: K,
    query: QueryObj | null,
    state: FlowState
  ): void {
    internal.set([event, queryToSlug(query)], state);
    stateChangedSub.call();
  }

  function ensureInternalState<K extends keyof T>(event: K, query: QueryObj | null): FlowState {
    let eventState = internal.get([event, queryToSlug(query)]);
    if (!eventState) {
      eventState = emptyState;
      internal.set([event, queryToSlug(query)], eventState);
    }
    return eventState;
  }
}
