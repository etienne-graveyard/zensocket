import { Unsubscribe, Subscription, OnUnsubscribed } from 'suub';
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

type MountResponse = FlowClientMountResponse<any, any>;

type InternalStateStatus =
  | { type: 'Void' }
  | { type: 'Deleted' }
  | { type: 'Subscribing'; messageId: string }
  | { type: 'CancelSubscribing'; messageId: string }
  | { type: 'Subscribed'; store: MountResponse }
  | { type: 'Offline'; store: MountResponse }
  | { type: 'Resubscribing'; store: MountResponse; messageId: string }
  | { type: 'Unsubscribing'; store: MountResponse; messageId: string }
  | { type: 'Error'; error: any; store: MountResponse | null }
  | { type: 'UnsubscribedByServer'; store: MountResponse | null };

interface InternalState {
  event: string;
  query: QueryObj | null;
  keys: Array<any>;
  unsubTimer: null | NodeJS.Timeout;
  sub: Subscription<FlowClientState<any>>;
  status: InternalStateStatus;
  state: FlowClientState<any>;
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

  const connectionStatusSub = Subscription<FlowConnectionStatus>();
  const internal: DeepMap<keyof T, InternalState> = createDeepMap();
  const sentMessages: Map<string, InternalMessageUp> = new Map();

  let connection: Connection = { status: 'Void' };

  return {
    incoming,
    disconnected,
    connected,
    destroy,
    subscribe,
    get,
    connectionStatus: {
      get: () => connection.status,
      subscribe: connectionStatusSub.subscribe
    }
  };

  function destroy(): void {
    console.warn(`Destroy: Should we do something here ?`);
  }

  function getFlowClientState(status: InternalStateStatus): FlowClientState<any> {
    if (status.type === 'Void') {
      return { status: 'Void' };
    }
    if (status.type === 'CancelSubscribing') {
      return { status: 'CancelSubscribing' };
    }
    if (status.type === 'Deleted') {
      return { status: 'Void' };
    }
    if (status.type === 'Offline') {
      return { status: 'Offline', state: status.store.getState() };
    }
    if (status.type === 'Error') {
      return {
        status: 'Error',
        error: status.error,
        state: status.store === null ? null : status.store.getState()
      };
    }
    if (status.type === 'Resubscribing') {
      return { status: 'Resubscribing', state: status.store.getState() };
    }
    if (status.type === 'Subscribed') {
      return { status: 'Subscribed', state: status.store.getState() };
    }
    if (status.type === 'Subscribing') {
      return { status: 'Subscribing' };
    }
    if (status.type === 'UnsubscribedByServer') {
      return {
        status: 'UnsubscribedByServer',
        state: status.store === null ? null : status.store.getState()
      };
    }
    if (status.type === 'Unsubscribing') {
      return { status: 'Unsubscribing', state: status.store.getState() };
    }
    expectNever(status);
    throw new Error('Unhandled state');
  }

  function disconnected(): void {
    if (connection.status === 'Offline') {
      return;
    }
    connection = {
      status: 'Offline'
    };
    connectionStatusSub.emit(connection.status);
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
    connectionStatusSub.emit(connection.status);
    internal.forEach((_event, _keys, state) => {
      update(state);
    });
  }

  function subscribe<K extends keyof T>(
    event: K,
    query: T[K]['query'],
    onState: (state: FlowClientState<T[K]['state']>) => void,
    onUnsubscribed?: OnUnsubscribed
  ): Unsubscribe {
    const state = ensureInternalState(event, queryToKeys(query), query);
    return state.sub.subscribe(onState, onUnsubscribed);
  }

  function get<K extends keyof T>(event: K, query: T[K]['query']): FlowClientState<T[K]['state']> {
    const intern = ensureInternalState(event, queryToKeys(query), query);
    return intern.state;
  }

  function update(intern: InternalState): void {
    if (intern.sub.size() === 0) {
      if (intern.unsubTimer === null) {
        ensureUnsubscribed(intern);
      }
      return;
    }
    ensureSubscribed(intern);
  }

  function ensureSubscribed(intern: InternalState): void {
    if (connection.status === 'Void') {
      if (intern.status.type === 'Void') {
        return;
      }
      // this should not happen
      throw new Error(`Unexpected status with Void connection`);
    }
    if (connection.status === 'Connected') {
      return ensureSubscribedConnected(intern);
    }
    if (connection.status === 'Offline') {
      return ensureSubscribedOffline(intern);
    }
    expectNever(connection);
    return;
  }

  function ensureSubscribedConnected(intern: InternalState): void {
    if (
      intern.status.type === 'Subscribed' ||
      intern.status.type === 'Subscribing' ||
      intern.status.type === 'Resubscribing' ||
      intern.status.type === 'Error' ||
      intern.status.type === 'UnsubscribedByServer' ||
      intern.status.type === 'Deleted'
    ) {
      return;
    }
    if (intern.status.type === 'Void') {
      // sub
      const messageId = sendSubscribeMessage(intern.event, intern.query);
      setStatus(intern, {
        type: 'Subscribing',
        messageId: messageId
      });
      return;
    }
    if (intern.status.type === 'Offline') {
      // reconnect
      const messageId = sendSubscribeMessage(intern.event, intern.query);
      setStatus(intern, {
        type: 'Resubscribing',
        messageId: messageId,
        store: intern.status.store
      });
      return;
    }
    if (intern.status.type === 'CancelSubscribing') {
      popSentMessage(intern.status.messageId, 'Unsubscribe');
      const messageId = sendSubscribeMessage(intern.event, intern.query);
      setStatus(intern, {
        type: 'Subscribing',
        messageId: messageId
      });
      return;
    }
    if (intern.status.type === 'Unsubscribing') {
      popSentMessage(intern.status.messageId, 'Unsubscribe');
      const messageId = sendSubscribeMessage(intern.event, intern.query);
      setStatus(intern, {
        type: 'Resubscribing',
        messageId: messageId,
        store: intern.status.store
      });
      return;
    }
    expectNever(intern.status);
    return;
  }

  function ensureSubscribedOffline(intern: InternalState): void {
    if (
      intern.status.type === 'Void' ||
      intern.status.type === 'UnsubscribedByServer' ||
      intern.status.type === 'Deleted' ||
      intern.status.type === 'Error' ||
      intern.status.type === 'Offline'
    ) {
      return;
    }
    if (intern.status.type === 'Subscribing') {
      // cancel sub
      popSentMessage(intern.status.messageId, 'Subscribe');
      setStatus(intern, {
        type: 'Void'
      });
      return;
    }
    if (intern.status.type === 'Resubscribing') {
      // cancel sub
      popSentMessage(intern.status.messageId, 'Subscribe');
      setStatus(intern, {
        type: 'Offline',
        store: intern.status.store
      });
      return;
    }
    if (intern.status.type === 'Subscribed') {
      setStatus(intern, {
        type: 'Offline',
        store: intern.status.store
      });
      return;
    }
    if (intern.status.type === 'CancelSubscribing' || intern.status.type === 'Unsubscribing') {
      popSentMessage(intern.status.messageId, 'Unsubscribe');
      deleteState(intern);
      return;
    }
    expectNever(intern.status);
    return;
  }

  function ensureUnsubscribed(intern: InternalState): void {
    if (connection.status === 'Void') {
      if (intern.status.type === 'Void') {
        return;
      }
      // this should not happen
      throw new Error(`Unexpected status with Void connection`);
    }
    if (connection.status === 'Offline') {
      return ensureUnsubscribedOffline(intern);
    }
    if (connection.status === 'Connected') {
      return ensureUnsubscribedConnected(intern);
    }
    expectNever(connection);
  }

  function ensureUnsubscribedOffline(intern: InternalState): void {
    if (
      intern.status.type === 'Void' ||
      intern.status.type === 'Offline' ||
      intern.status.type === 'Deleted' ||
      intern.status.type === 'Subscribed' ||
      intern.status.type === 'UnsubscribedByServer' ||
      intern.status.type === 'Error'
    ) {
      deleteState(intern);
      return;
    }
    if (
      intern.status.type === 'Subscribing' ||
      intern.status.type === 'Resubscribing' ||
      intern.status.type === 'CancelSubscribing' ||
      intern.status.type === 'Unsubscribing'
    ) {
      popSentMessage(intern.status.messageId, 'Subscribe');
      deleteState(intern);
      return;
    }
    expectNever(intern.status);
    return;
  }

  function ensureUnsubscribedConnected(intern: InternalState): void {
    if (intern.status.type === 'Unsubscribing' || intern.status.type === 'CancelSubscribing') {
      return;
    }
    if (
      intern.status.type === 'Offline' ||
      intern.status.type === 'UnsubscribedByServer' ||
      intern.status.type === 'Deleted' ||
      intern.status.type === 'Error'
    ) {
      deleteState(intern);
      return;
    }
    if (intern.status.type === 'Resubscribing') {
      popSentMessage(intern.status.messageId, 'Subscribe');
      const messageId = sendUnsubscribeMessage(intern.event, intern.query);
      setStatus(intern, {
        type: 'Unsubscribing',
        store: intern.status.store,
        messageId
      });
      return;
    }
    if (intern.status.type === 'Subscribing') {
      popSentMessage(intern.status.messageId, 'Subscribe');
      const messageId = sendUnsubscribeMessage(intern.event, intern.query);
      intern.status ==
        {
          type: 'CancelSubscribing',
          messageId
        };
      return;
    }
    if (intern.status.type === 'Subscribed') {
      const messageId = sendUnsubscribeMessage(intern.event, intern.query);
      setStatus(intern, {
        type: 'Unsubscribing',
        store: intern.status.store,
        messageId
      });
      return;
    }
    if (intern.status.type === 'Void') {
      deleteState(intern);
      return;
    }
    expectNever(intern.status);
    return;
  }

  function deleteState(intern: InternalState) {
    if (intern.status.type === 'Deleted') {
      return;
    }
    if (intern.status.type === 'Error' || intern.status.type === 'UnsubscribedByServer') {
      if (intern.status.store) {
        intern.status.store.unmount();
      }
    } else if (
      intern.status.type === 'Offline' ||
      intern.status.type === 'Resubscribing' ||
      intern.status.type === 'Subscribed' ||
      intern.status.type === 'Unsubscribing'
    ) {
      intern.status.store.unmount();
    } else if (
      intern.status.type === 'CancelSubscribing' ||
      intern.status.type === 'Subscribing' ||
      intern.status.type === 'Void'
    ) {
      // No store => do nothing
    } else {
      expectNever(intern.status);
    }
    setStatus(intern, {
      type: 'Deleted'
    });
    internal.delete(intern.event, intern.keys);
  }

  function sendMessage(message: InternalMessageUp) {
    if (connection.status === 'Connected') {
      connection.outgoing(message);
      sentMessages.set(message.id, message);
      return;
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

  function setStatus(intern: InternalState, status: InternalStateStatus) {
    intern.status = status;
    stateChanged(intern);
  }

  function stateChanged(intern: InternalState): void {
    if (intern.status.type === 'Error') {
      return;
    }
    if (
      intern.status.type === 'Offline' ||
      intern.status.type === 'Resubscribing' ||
      intern.status.type === 'Unsubscribing' ||
      intern.status.type === 'Subscribed' ||
      intern.status.type === 'UnsubscribedByServer' ||
      intern.status.type === 'Subscribing' ||
      intern.status.type === 'Void' ||
      intern.status.type === 'CancelSubscribing' ||
      intern.status.type === 'Deleted'
    ) {
      intern.state = getFlowClientState(intern.status);
      intern.sub.emit(intern.state);
      return;
    }
    expectNever(intern.status);
  }

  function handleDownMessage(message: InternalMessageDown): void {
    return internFromMessageDown(message, intern => {
      if (message.type === 'Subscribed') {
        if (intern.status.type === 'Subscribing' || intern.status.type === 'Resubscribing') {
          const mount = mountHandlers[intern.event];
          if (!mount) {
            throw new Error(`Missing mutation handler for ${intern.event}`);
          }
          if (intern.status.type === 'Resubscribing') {
            // unmount => remount
            intern.status.store.unmount();
          }
          const store = mount({
            stateChanged: () => stateChanged(intern),
            initial: message.initial,
            query: intern.query
          });
          setStatus(intern, {
            type: 'Subscribed',
            store
          });
          return;
        }
        if (
          intern.status.type === 'Subscribed' ||
          intern.status.type === 'Void' ||
          intern.status.type === 'Offline' ||
          intern.status.type === 'CancelSubscribing' ||
          intern.status.type === 'Deleted' ||
          intern.status.type === 'Unsubscribing' ||
          intern.status.type === 'Error' ||
          intern.status.type === 'UnsubscribedByServer'
        ) {
          throw new Error(`Unexpected intern`);
        }
        expectNever(intern.status);
        return;
      }
      if (message.type === 'SubscribeError') {
        return handleSubscribeError(intern, message.error);
      }
      if (message.type === 'Unsubscribed') {
        if (intern.status.type === 'CancelSubscribing' || intern.status.type === 'Unsubscribing') {
          deleteState(intern);
          return;
        }
        if (
          intern.status.type === 'Offline' ||
          intern.status.type === 'Resubscribing' ||
          intern.status.type === 'Void' ||
          intern.status.type === 'Subscribed' ||
          intern.status.type === 'Subscribing' ||
          intern.status.type === 'Deleted' ||
          intern.status.type === 'Error' ||
          intern.status.type === 'UnsubscribedByServer'
        ) {
          throw new Error(
            `Unexpected intern on Unsubscribed message. Message should have been canceled`
          );
        }
        expectNever(intern.status);
        return;
      }
      if (message.type === 'Message') {
        if (
          intern.status.type === 'Offline' ||
          intern.status.type === 'Resubscribing' ||
          intern.status.type === 'Subscribed' ||
          intern.status.type === 'Unsubscribing'
        ) {
          intern.status.store.onMessage(message.message);
          return;
        }
        if (
          intern.status.type === 'CancelSubscribing' ||
          intern.status.type === 'Subscribing' ||
          intern.status.type === 'Void' ||
          intern.status.type === 'Deleted' ||
          intern.status.type === 'UnsubscribedByServer' ||
          intern.status.type === 'Error'
        ) {
          throw new Error(`Unexpected intern on Message.`);
        }
        expectNever(intern.status);
        return;
      }
      if (message.type === 'UnsubscribedByServer') {
        if (
          intern.status.type === 'CancelSubscribing' ||
          intern.status.type === 'Unsubscribing' ||
          intern.status.type === 'Void'
        ) {
          deleteState(intern);
          return;
        }
        if (
          intern.status.type === 'Offline' ||
          intern.status.type === 'Resubscribing' ||
          intern.status.type === 'Subscribed'
        ) {
          setStatus(intern, {
            type: 'UnsubscribedByServer',
            store: intern.status.store
          });
          return;
        }
        if (intern.status.type === 'Subscribing') {
          setStatus(intern, {
            type: 'UnsubscribedByServer',
            store: null
          });
          return;
        }
        if (
          intern.status.type === 'Deleted' ||
          intern.status.type === 'Error' ||
          intern.status.type === 'UnsubscribedByServer'
        ) {
          throw new Error(
            `Unexpected intern on Unsubscribed message. Message should have been canceled`
          );
        }
        expectNever(intern.status);
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
      const out = popSentMessage(message.responseTo, 'Unsubscribe');
      if (!out) {
        return; // canceled
      }
      return withUp(out);
    }
    if (message.type === 'UnsubscribedByServer') {
      if (message.responseTo === null) {
        return withUp(null);
      }
      const out = popSentMessage(message.responseTo, null);
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

  function internFromMessageDown(
    message: InternalMessageDown,
    withIntern: (intern: InternalState) => void
  ): void {
    if (message.type === 'Message') {
      const keys = queryToKeys(message.query);
      const intern = getInternalState(message.event, keys);
      if (!intern) {
        return;
      }
      return withIntern(intern);
    }
    return messageUpFromMessageDown(message, upMessage => {
      if (upMessage === null) {
        if (message.type === 'UnsubscribedByServer') {
          const keys = queryToKeys(message.query);
          const intern = getInternalState(message.event, keys);
          if (!intern) {
            return;
          }
          return withIntern(intern);
        }
        return;
      }
      const keys = queryToKeys(upMessage.query);
      const intern = getInternalState(upMessage.event, keys);
      if (!intern) {
        return;
      }
      return withIntern(intern);
    });
  }

  function handleSubscribeError(intern: InternalState, error: any) {
    if (intern.status.type === 'Subscribing' || intern.status.type === 'Resubscribing') {
      const store = intern.status.type === 'Resubscribing' ? intern.status.store : null;
      setStatus(intern, {
        type: 'Error',
        store,
        error
      });
      return;
    }
    if (
      intern.status.type === 'Deleted' ||
      intern.status.type === 'CancelSubscribing' ||
      intern.status.type === 'Error' ||
      intern.status.type === 'Offline' ||
      intern.status.type === 'Subscribed' ||
      intern.status.type === 'Unsubscribing' ||
      intern.status.type === 'Void' ||
      intern.status.type === 'UnsubscribedByServer'
    ) {
      throw new Error(
        `Unexpected intern on SubscribeError message. Message should have been canceled`
      );
    }
    expectNever(intern.status);
    return;
  }

  function popSentMessage<K extends InternalMessageUpType = InternalMessageUpType>(
    id: string,
    expectedType: K | null
  ): InternalMessageUp<K> | null {
    const out = sentMessages.get(id);
    if (!out) {
      return null;
    }
    sentMessages.delete(id);
    if (expectedType === null) {
      return out as any;
    }
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
    const status: InternalStateStatus = {
      type: 'Void'
    };
    const intern: InternalState = {
      event: event as any,
      query,
      keys,
      status,
      unsubTimer: null,
      state: getFlowClientState(status),
      sub: Subscription({
        onFirstSubscription: () => {
          if (intern.unsubTimer !== null) {
            clearTimeout(intern.unsubTimer);
            intern.unsubTimer = null;
          }
          update(intern);
        },
        onLastUnsubscribe: () => {
          if (unsubscribeDelay === false) {
            update(intern);
            return;
          }
          intern.unsubTimer = setTimeout(() => {
            intern.unsubTimer = null;
            update(intern);
          }, unsubscribeDelay);
        }
      })
    };
    internal.set(event, keys, intern);
    return intern;
  }
}
