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
  FlowEventFragment
} from './types';
import cuid from 'cuid';
import { Mappemonde } from 'mappemonde';
import { queryToSlug, expectNever } from './utils';

export interface FlowClientOptions {
  outgoing(message: any): void;
  zenid: string;
}

export function createFlowClient<T extends Flows>(options: FlowClientOptions): FlowClient<T> {
  const { outgoing, zenid } = options;

  const stateChangedSub = Subscription.create();
  const eventSub = Subscription.create<FlowEvent<T, keyof T>>();

  const internal = Mappemonde.create<[keyof T, string], FlowState>();

  const emptyState: FlowState = {
    status: FlowStatus.Void
  };

  const sentMessages: Map<string, InternalMessageUp> = new Map();

  return {
    state,
    subscribe,
    unsubscribe,
    incoming,
    on,
    onStateChange: stateChangedSub.subscribe
  };

  function subscribe<K extends keyof T>(event: K, query: QueryObj | null = null): void {
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

  function unsubscribe<K extends keyof T>(event: K, query: QueryObj | null = null): void {
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
        if (
          ['Subscribed', 'Unsubscribed', 'UnsubscribedByServer', 'Event', 'Unsubscribed'].includes(
            message.type
          )
        ) {
          return true;
        } else {
          console.warn(`Invalid type`);
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
