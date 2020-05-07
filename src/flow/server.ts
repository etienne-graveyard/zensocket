import {
  FlowServer,
  Flows,
  InternalMessageUp,
  InternalMessageDown,
  FlowServerMountHandlers,
  ALL_MESSAGE_UP_TYPES,
  FLOW_PREFIX
} from './types';
import { queryToKeys } from './utils';
import { expectNever, createDeepMap, DeepMap } from '../utils';

export interface FlowServerOptions<T extends Flows, Context> {
  zenid: string;
  context: Context;
  outgoing(message: any): void;
  mountHandlers: FlowServerMountHandlers<T, Context>;
}

type InternalState =
  | {
      status: 'mounting';
      cancel: () => void;
      messageId: string;
    }
  | {
      status: 'mounted';
      unmount: () => void;
      getInitial: () => any;
    };

export function createFlowServer<T extends Flows, Context>(
  options: FlowServerOptions<T, Context>
): FlowServer<T> {
  const { outgoing, mountHandlers, context } = options;
  const zenid = FLOW_PREFIX + options.zenid;

  const internal: DeepMap<keyof T, InternalState> = createDeepMap();

  return {
    incoming,
    destroy,
    unmount
  };

  function destroy(): void {
    internal.forEach((event, keys) => {
      unmount(event, keys);
    });
  }

  function incoming(message: any): void {
    if (isUpMessage(message)) {
      handleUpMessage(message);
    }
  }

  function emitMessage<K extends keyof T>(
    event: K,
    query: T[K]['query'],
    message: T[K]['message']
  ): void {
    const keys = queryToKeys(query);
    const state = internal.get(event, keys);
    if (!state) {
      return;
    }
    if (state.status === 'mounting') {
      console.warn(`emitMessage while mounting ??`);
      return;
    }
    const mes: InternalMessageDown = {
      zenid,
      type: 'Message',
      event: event as any,
      query,
      message
    };
    outgoing(mes);
  }

  function unmount<K extends keyof T>(event: K, query: T[K]['query']): void {
    const keys = queryToKeys(query);
    const state = internal.get(event, keys);
    if (!state) {
      return;
    }
    if (state.status === 'mounted') {
      state.unmount();
      internal.delete(event, keys);
      const mes: InternalMessageDown = {
        zenid,
        type: 'UnsubscribedByServer',
        event: event as string,
        query,
        responseTo: null
      };
      outgoing(mes);
      return;
    }
    if (state.status === 'mounting') {
      state.cancel();
      internal.delete(event, keys);
      const mes: InternalMessageDown = {
        zenid,
        type: 'UnsubscribedByServer',
        event: event as string,
        query,
        responseTo: state.messageId
      };
      outgoing(mes);
      return;
    }
    throw new Error('Unhandled');
  }

  async function safeRun<T>(
    exec: () => Promise<T>
  ): Promise<{ type: 'result'; value: T } | { type: 'error'; error: any }> {
    try {
      const res = await exec();
      return {
        type: 'result',
        value: res
      };
    } catch (error) {
      return {
        type: 'error',
        error
      };
    }
  }

  async function handleUpMessage(message: InternalMessageUp): Promise<void> {
    const keys = queryToKeys(message.query);
    if (message.type === 'Subscribe') {
      const state = internal.get(message.event, keys);
      if (state) {
        return;
      }
      let canceled = false;
      const onSub = mountHandlers[message.event];
      if (!onSub) {
        throw new Error('Missing on sub');
      }
      internal.set(message.event, keys, {
        status: 'mounting',
        messageId: message.id,
        cancel: () => {
          canceled = true;
        }
      });
      const res = await safeRun(() =>
        onSub({
          query: message.query,
          context,
          emitMessage: message => emitMessage(message.event, message.query, message)
        })
      );
      if (canceled) {
        return;
      }
      if (res.type === 'error') {
        internal.delete(message.event, keys);
        const mes: InternalMessageDown = {
          zenid,
          type: 'SubscribeError',
          error: String(res.error),
          responseTo: message.id
        };
        outgoing(mes);
        return;
      }
      // no error
      const { getInitial, unmount } = res.value;
      internal.set(message.event, keys, {
        status: 'mounted',
        unmount,
        getInitial
      });
      const mes: InternalMessageDown = {
        zenid,
        type: 'Subscribed',
        initial: getInitial(),
        responseTo: message.id
      };
      outgoing(mes);
      return;
    }
    if (message.type === 'Unsubscribe') {
      const keys = queryToKeys(message.query);
      const state = internal.get(message.event, keys);
      if (!state) {
        return;
      }
      if (state.status === 'mounting') {
        state.cancel();
        internal.delete(message.event, keys);
        // fisrt respond to Subscribe with an Unsubscribed
        const subResponse: InternalMessageDown = {
          zenid,
          type: 'Unsubscribed',
          responseTo: state.messageId
        };
        outgoing(subResponse);
        // then respond to Unsubscribe with an 'Unsubscribed'
        const mes: InternalMessageDown = {
          zenid,
          type: 'Unsubscribed',
          responseTo: message.id
        };
        outgoing(mes);
        return;
      }
      if (state.status === 'mounted') {
        state.unmount();
        internal.delete(message.event, keys);
        const mes: InternalMessageDown = {
          zenid,
          type: 'Unsubscribed',
          responseTo: message.id
        };
        outgoing(mes);
        return;
      }
      throw new Error('Unhandled case');
    }
    expectNever(message);
  }

  function isUpMessage(message: any): message is InternalMessageUp {
    if (message && 'type' in message && 'zenid' in message) {
      if (typeof message.type === 'string' && typeof message.zenid === 'string') {
        if (message.zenid !== zenid) {
          return false;
        }
        if (Object.keys(ALL_MESSAGE_UP_TYPES).includes(message.type)) {
          return true;
        } else {
          console.warn(message);
          console.warn(`Invalid message.type`);
        }
      }
    }
    return false;
  }
}
