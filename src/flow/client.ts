import { Unsubscribe, Subscription } from 'suub';
import {
  FlowClient,
  Flows,
  QueryObj,
  InternalMessageUp,
  InternalMessageDown,
  InternalMessageUpType,
  ALL_MESSAGE_DOWN_TYPES,
  FLOW_PREFIX,
  FlowClientMountHandlers,
  FlowClientState,
  FlowConnectionStatus,
  FlowClientMountResponse
} from './types';
import cuid from 'cuid';
import { queryToKeys } from './utils';
import { expectNever, DeepMap, createDeepMap } from '../utils';
import { Outgoing } from '../types';

export interface FlowClientOptions<T extends Flows> {
  zenid: string;
  unsubscribeDelay?: number | false;
  mountHandlers: FlowClientMountHandlers<T>;
}

type InternalStateState =
  | {
      type: 'Void';
    }
  | {
      type: 'Deleted';
    }
  | {
      type: 'Subscribing';
      messageId: string;
    }
  | {
      type: 'Subscribed';
      store: FlowClientMountResponse<any, any>;
    }
  | {
      type: 'Offline';
      store: FlowClientMountResponse<any, any>;
    }
  | {
      type: 'Resubscribing';
      store: FlowClientMountResponse<any, any>;
      messageId: string;
    }
  | {
      type: 'Unsubscribing';
      store: FlowClientMountResponse<any, any>;
      messageId: string;
    }
  | {
      type: 'CancelSubscribing';
      messageId: string;
    }
  | {
      type: 'Error';
      error: any;
      store: FlowClientMountResponse<any, any> | null;
    }
  | {
      type: 'UnsubscribedByServer';
      store: FlowClientMountResponse<any, any> | null;
    };

interface InternalState {
  event: string;
  query: QueryObj | null;
  keys: Array<any>;
  sub: Subscription<FlowClientState<any>>;
  status: InternalStateState;
}

type Connection =
  | {
      status: 'Void';
    }
  | {
      status: 'Connected';
      outgoing: Outgoing;
    }
  | {
      status: 'Offline';
    };

export function createFlowClient<T extends Flows>(options: FlowClientOptions<T>): FlowClient<T> {
  const { unsubscribeDelay = false, mountHandlers } = options;
  const zenid = FLOW_PREFIX + options.zenid;

  const connectionStatusSub = Subscription.create<FlowConnectionStatus>();
  const internal: DeepMap<keyof T, InternalState> = createDeepMap();
  const sentMessages: Map<string, InternalMessageUp> = new Map();

  let connection: Connection = { status: 'Void' };

  return {
    incoming,
    disconnected,
    connected,
    destroy,
    subscribe,
    connectionStatus: {
      get: () => connection.status,
      subscribe: connectionStatusSub.subscribe
    }
  };

  function destroy(): void {
    console.warn(`Destroy: Should we do something here ?`);
  }

  // function getState<K extends keyof T>(event: K, query: QueryObj | null = null): FlowState {
  //   const keys = queryToKeys(query);
  //   const intern = getInternalState(event, keys);
  //   if (intern === null) {
  //     return emptyState;
  //   }
  //   return intern;
  // }

  // function getRef<K extends keyof T>(event: K, query: QueryObj | null = null): FlowRef<T, K> {
  //   return {
  //     event: event as any,
  //     query,
  //     is: n => n === event
  //   };
  // }

  function disconnected(): void {
    if (connection.status === 'Offline') {
      return;
    }
    connection = {
      status: 'Offline'
    };
    connectionStatusSub.call(connection.status);
    internal.forEach((_event, _keys, state) => {
      update(state);
    });
  }

  function connected(out: (msg: any) => void): void {
    if (connection.status === 'Connected') {
      return;
    }
    connection = {
      status: 'Connected',
      outgoing: out
    };
    connectionStatusSub.call(connection.status);
    internal.forEach((_event, _keys, state) => {
      update(state);
    });
  }

  function subscribe<K extends keyof T>(
    event: K,
    query: T[K]['query'],
    onState: (state: FlowClientState<T[K]['state']>) => void
  ): Unsubscribe {
    const state = ensureInternalState(event, queryToKeys(query), query);
    return state.sub.subscribe(onState);
  }

  function update(state: InternalState): void {
    if (state.sub.listenersCount() === 0) {
      ensureUnsubscribed(state);
      return;
    }
    ensureSubscribed(state);
  }

  function ensureSubscribed(state: InternalState): void {
    if (connection.status === 'Void') {
      if (state.status.type === 'Void') {
        return;
      }
      // this should not happen
      throw new Error(`Unexpected status with Void connection`);
    }
    if (connection.status === 'Connected') {
      return ensureSubscribedConnected(state);
    }
    if (connection.status === 'Offline') {
      return ensureSubscribedOffline(state);
    }
    expectNever(connection);
    return;
  }

  function ensureSubscribedConnected(state: InternalState): void {
    if (
      state.status.type === 'Subscribed' ||
      state.status.type === 'Subscribing' ||
      state.status.type === 'Resubscribing' ||
      state.status.type === 'Error' ||
      state.status.type === 'UnsubscribedByServer' ||
      state.status.type === 'Deleted'
    ) {
      return;
    }
    if (state.status.type === 'Void') {
      // sub
      const messageId = sendSubscribeMessage(state.event, state.query);
      state.status = {
        type: 'Subscribing',
        messageId: messageId
      };
      return;
    }
    if (state.status.type === 'Offline') {
      // reconnect
      const messageId = sendSubscribeMessage(state.event, state.query);
      state.status = {
        type: 'Resubscribing',
        messageId: messageId,
        store: state.status.store
      };
      return;
    }
    if (state.status.type === 'CancelSubscribing') {
      popSentMessage(state.status.messageId, 'Unsubscribe');
      const messageId = sendSubscribeMessage(state.event, state.query);
      state.status = {
        type: 'Subscribing',
        messageId: messageId
      };
      return;
    }
    if (state.status.type === 'Unsubscribing') {
      popSentMessage(state.status.messageId, 'Unsubscribe');
      const messageId = sendSubscribeMessage(state.event, state.query);
      state.status = {
        type: 'Resubscribing',
        messageId: messageId,
        store: state.status.store
      };
      return;
    }
    expectNever(state.status);
    return;
  }

  function ensureSubscribedOffline(state: InternalState): void {
    if (
      state.status.type === 'Void' ||
      state.status.type === 'UnsubscribedByServer' ||
      state.status.type === 'Deleted' ||
      state.status.type === 'Error' ||
      state.status.type === 'Offline'
    ) {
      return;
    }
    if (state.status.type === 'Subscribing') {
      // cancel sub
      popSentMessage(state.status.messageId, 'Subscribe');
      state.status = {
        type: 'Void'
      };
      return;
    }
    if (state.status.type === 'Resubscribing') {
      // cancel sub
      popSentMessage(state.status.messageId, 'Subscribe');
      state.status = {
        type: 'Offline',
        store: state.status.store
      };
      return;
    }
    if (state.status.type === 'Subscribed') {
      state.status = {
        type: 'Offline',
        store: state.status.store
      };
      return;
    }
    if (state.status.type === 'CancelSubscribing' || state.status.type === 'Unsubscribing') {
      popSentMessage(state.status.messageId, 'Unsubscribe');
      deleteState(state);
      return;
    }
    expectNever(state.status);
    return;
  }

  function ensureUnsubscribed(state: InternalState): void {
    if (connection.status === 'Void') {
      if (state.status.type === 'Void') {
        return;
      }
      // this should not happen
      throw new Error(`Unexpected status with Void connection`);
    }
    if (connection.status === 'Offline') {
      return ensureUnsubscribedOffline(state);
    }
    if (connection.status === 'Connected') {
      return ensureUnsubscribedConnected(state);
    }
    expectNever(connection);
  }

  function ensureUnsubscribedOffline(state: InternalState): void {
    if (
      state.status.type === 'Void' ||
      state.status.type === 'Offline' ||
      state.status.type === 'Deleted' ||
      state.status.type === 'Subscribed' ||
      state.status.type === 'UnsubscribedByServer' ||
      state.status.type === 'Error'
    ) {
      deleteState(state);
      return;
    }
    if (
      state.status.type === 'Subscribing' ||
      state.status.type === 'Resubscribing' ||
      state.status.type === 'CancelSubscribing' ||
      state.status.type === 'Unsubscribing'
    ) {
      popSentMessage(state.status.messageId, 'Subscribe');
      deleteState(state);
      return;
    }
    expectNever(state.status);
    return;
  }

  function ensureUnsubscribedConnected(state: InternalState): void {
    if (state.status.type === 'Unsubscribing' || state.status.type === 'CancelSubscribing') {
      return;
    }
    if (
      state.status.type === 'Offline' ||
      state.status.type === 'UnsubscribedByServer' ||
      state.status.type === 'Deleted' ||
      state.status.type === 'Error'
    ) {
      deleteState(state);
      return;
    }
    if (state.status.type === 'Resubscribing') {
      popSentMessage(state.status.messageId, 'Subscribe');
      const messageId = sendUnsubscribeMessage(state.event, state.query);
      state.status = {
        type: 'Unsubscribing',
        store: state.status.store,
        messageId
      };
      return;
    }
    if (state.status.type === 'Subscribing') {
      popSentMessage(state.status.messageId, 'Subscribe');
      const messageId = sendUnsubscribeMessage(state.event, state.query);
      state.status ==
        {
          type: 'CancelSubscribing',
          messageId
        };
      return;
    }
    if (state.status.type === 'Subscribed') {
      const messageId = sendUnsubscribeMessage(state.event, state.query);
      state.status = {
        type: 'Unsubscribing',
        store: state.status.store,
        messageId
      };
      return;
    }
    if (state.status.type === 'Void') {
      deleteState(state);
      return;
    }
    expectNever(state.status);
    return;
  }

  function deleteState(state: InternalState) {
    if (state.status.type === 'Deleted') {
      return;
    }
    if (state.status.type === 'Error' || state.status.type === 'UnsubscribedByServer') {
      if (state.status.store) {
        state.status.store.unmount();
      }
    } else if (
      state.status.type === 'Offline' ||
      state.status.type === 'Resubscribing' ||
      state.status.type === 'Subscribed' ||
      state.status.type === 'Unsubscribing'
    ) {
      state.status.store.unmount();
    } else if (
      state.status.type === 'CancelSubscribing' ||
      state.status.type === 'Subscribing' ||
      state.status.type === 'Void'
    ) {
      // No store => do nothing
    } else {
      expectNever(state.status);
    }
    state.status = {
      type: 'Deleted'
    };
    internal.delete(state.event, state.keys);
  }

  function sendMessage(message: InternalMessageUp) {
    if (connection.status === 'Connected') {
      connection.outgoing(message);
      sentMessages.set(message.id, message);
    }
    throw new Error(`Cannot send a message when not connected !`);
  }

  function sendSubscribeMessage(event: keyof T, query: QueryObj | null): string {
    const messageId = cuid.slug();
    sendMessage({
      zenid,
      type: 'Subscribe',
      id: messageId,
      event: event as any,
      query
    });
    return messageId;
  }

  function sendUnsubscribeMessage(event: keyof T, query: QueryObj | null): string {
    const messageId = cuid.slug();
    sendMessage({
      zenid,
      type: 'Unsubscribe',
      id: messageId,
      event: event as any,
      query
    });
    return messageId;
  }

  // function ensureSubRequest<K extends keyof T>(
  //   event: K,
  //   keys: Array<any>,
  //   query: QueryObj | null
  // ): SubRequestsState {
  //   const sub = subRequests.get(event, keys);
  //   if (sub) {
  //     return sub;
  //   }
  //   const created: SubRequestsState = {
  //     query,
  //     subs: new Set<Unsubscribe>()
  //   };
  //   subRequests.set(event, keys, created);
  //   return created;
  // }

  function emitState(internalState: InternalState, nextState: any): void {
    if (
      internalState.status.type === 'Offline' ||
      internalState.status.type === 'Resubscribing' ||
      internalState.status.type === 'Unsubscribing' ||
      internalState.status.type === 'Subscribed'
    ) {
      internalState.sub.call({ resolved: true, state: nextState });
      return;
    }
    if (
      internalState.status.type === 'Subscribing' ||
      internalState.status.type === 'Void' ||
      internalState.status.type === 'CancelSubscribing' ||
      internalState.status.type === 'Deleted' ||
      internalState.status.type === 'Error' ||
      internalState.status.type === 'UnsubscribedByServer'
    ) {
      throw new Error(`Emit state in invalid state`);
    }
    expectNever(internalState.status);
  }

  function handleDownMessage(message: InternalMessageDown): void {
    return stateFromMessageDown(message, state => {
      if (message.type === 'Subscribed') {
        if (state.status.type === 'Subscribing' || state.status.type === 'Resubscribing') {
          const mount = mountHandlers[state.event];
          if (!mount) {
            throw new Error(`Missing mutation handler for ${state.event}`);
          }
          if (state.status.type === 'Resubscribing') {
            // unmount => remount
            state.status.store.unmount();
          }
          const store = mount({
            emitState: nextState => emitState(state, nextState),
            initial: message.initial,
            query: state.query
          });
          state.status = {
            type: 'Subscribed',
            store
          };
          return;
        }
        if (
          state.status.type === 'Subscribed' ||
          state.status.type === 'Void' ||
          state.status.type === 'Offline' ||
          state.status.type === 'CancelSubscribing' ||
          state.status.type === 'Deleted' ||
          state.status.type === 'Unsubscribing' ||
          state.status.type === 'Error' ||
          state.status.type === 'UnsubscribedByServer'
        ) {
          throw new Error(`Unexpected state`);
        }
        expectNever(state.status);
        return;
      }
      if (message.type === 'SubscribeError') {
        return handleSubscribeError(state, message.error);
      }
      if (message.type === 'Unsubscribed') {
        if (state.status.type === 'CancelSubscribing' || state.status.type === 'Unsubscribing') {
          deleteState(state);
          return;
        }
        if (
          state.status.type === 'Offline' ||
          state.status.type === 'Resubscribing' ||
          state.status.type === 'Void' ||
          state.status.type === 'Subscribed' ||
          state.status.type === 'Subscribing' ||
          state.status.type === 'Deleted' ||
          state.status.type === 'Error' ||
          state.status.type === 'UnsubscribedByServer'
        ) {
          throw new Error(
            `Unexpected state on Unsubscribed message. Message should have been canceled`
          );
        }
        expectNever(state.status);
        return;
      }
      if (message.type === 'Message') {
        if (
          state.status.type === 'Offline' ||
          state.status.type === 'Resubscribing' ||
          state.status.type === 'Subscribed' ||
          state.status.type === 'Unsubscribing'
        ) {
          state.status.store.onMessage(message.message);
          return;
        }
        if (
          state.status.type === 'CancelSubscribing' ||
          state.status.type === 'Subscribing' ||
          state.status.type === 'Void' ||
          state.status.type === 'Deleted' ||
          state.status.type === 'UnsubscribedByServer' ||
          state.status.type === 'Error'
        ) {
          throw new Error(`Unexpected state on Message.`);
        }
        expectNever(state.status);
        return;
      }
      if (message.type === 'UnsubscribedByServer') {
        if (
          state.status.type === 'CancelSubscribing' ||
          state.status.type === 'Unsubscribing' ||
          state.status.type === 'Void'
        ) {
          deleteState(state);
          return;
        }
        if (
          state.status.type === 'Offline' ||
          state.status.type === 'Resubscribing' ||
          state.status.type === 'Subscribed'
        ) {
          state.status = {
            type: 'UnsubscribedByServer',
            store: state.status.store
          };
          return;
        }
        if (state.status.type === 'Subscribing') {
          state.status = {
            type: 'UnsubscribedByServer',
            store: null
          };
          return;
        }
        if (
          state.status.type === 'Deleted' ||
          state.status.type === 'Error' ||
          state.status.type === 'UnsubscribedByServer'
        ) {
          throw new Error(
            `Unexpected state on Unsubscribed message. Message should have been canceled`
          );
        }
        expectNever(state.status);
        return;
      }
      expectNever(message);
    });
  }

  function messageUpFromMessageDown(
    message: InternalMessageDown,
    withUp: (message: InternalMessageUp | null) => void
  ): void {
    if (message.type === 'Subscribed' || message.type === 'SubscribeError') {
      const out = popSentMessage(message.responseTo, 'Subscribe');
      if (!out) {
        return; // canceled
      }
      return withUp(out);
    }
    if (message.type === 'Unsubscribed') {
      const out = popSentMessage(message.responseTo, 'Subscribe');
      if (!out) {
        return; // canceled
      }
      return withUp(out);
    }
    if (message.type === 'UnsubscribedByServer') {
      if (message.responseTo === null) {
        return withUp(null);
      }
      const out = popSentMessage(message.responseTo, 'Subscribe');
      if (!out) {
        return; // canceled
      }
      return withUp(out);
    }
    if (message.type === 'Message') {
      return withUp(null);
    }
    expectNever(message);
  }

  function stateFromMessageDown(
    message: InternalMessageDown,
    withState: (state: InternalState) => void
  ): void {
    if (message.type === 'Message') {
      const keys = queryToKeys(message.query);
      const state = getInternalState(message.event, keys);
      if (!state) {
        return;
      }
      return withState(state);
    }
    return messageUpFromMessageDown(message, upMessage => {
      if (upMessage === null) {
        if (message.type === 'UnsubscribedByServer') {
          const keys = queryToKeys(message.query);
          const state = getInternalState(message.event, keys);
          if (!state) {
            return;
          }
          return withState(state);
        }
        return;
      }
      const keys = queryToKeys(upMessage.query);
      const state = getInternalState(upMessage.event, keys);
      if (!state) {
        return;
      }
      return withState(state);
    });
  }

  function handleSubscribeError(state: InternalState, error: any) {
    if (state.status.type === 'Subscribing' || state.status.type === 'Resubscribing') {
      const store = state.status.type === 'Resubscribing' ? state.status.store : null;
      state.status = {
        type: 'Error',
        store,
        error
      };
      return;
    }
    if (
      state.status.type === 'Deleted' ||
      state.status.type === 'CancelSubscribing' ||
      state.status.type === 'Error' ||
      state.status.type === 'Offline' ||
      state.status.type === 'Subscribed' ||
      state.status.type === 'Unsubscribing' ||
      state.status.type === 'Void' ||
      state.status.type === 'UnsubscribedByServer'
    ) {
      throw new Error(
        `Unexpected state on SubscribeError message. Message should have been canceled`
      );
    }
    expectNever(state.status);
    return;
  }

  function popSentMessage<K extends InternalMessageUpType>(
    id: string,
    expectedType: K
  ): InternalMessageUp<K> | null {
    const out = sentMessages.get(id);
    if (!out) {
      return null;
    }
    sentMessages.delete(id);
    if (out.type !== expectedType) {
      throw new Error(`Invalid message type`);
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
          console.warn(message);
          console.warn(`Invalid message.type`);
        }
      }
    }
    return false;
  }

  function getInternalState<K extends keyof T>(event: K, keys: Array<any>): InternalState | null {
    const eventState = internal.get(event, keys);
    if (!eventState) {
      return null;
    }
    return eventState;
  }

  function ensureInternalState<K extends keyof T>(
    event: K,
    keys: Array<any>,
    query: QueryObj | null
  ): InternalState {
    const currentState = internal.get(event, keys);
    if (currentState) {
      return currentState;
    }
    const state: InternalState = {
      event: event as any,
      query,
      keys,
      status: {
        type: 'Void'
      },
      sub: Subscription.create({
        onFirstSubscription: () => {
          update(state);
        },
        onLastUnsubscribe: () => {
          // TODO: handle unsub delay !
          console.log(`TODO: Handle unsubscribeDelay`);
          console.log({ unsubscribeDelay });
          update(state);
        }
      })
    };
    internal.set(event, keys, state);
    return state;
  }
}
