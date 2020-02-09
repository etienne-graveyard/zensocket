import {
  FlowServer,
  Flows,
  InternalMessageUp,
  InternalMessageDown,
  HandleSubscribe,
  ALL_MESSAGE_UP_TYPES,
  FLOW_PREFIX
} from './types';
import { queryToKeys } from './utils';
import { expectNever, createDeepMap, DeepMap } from '../utils';
import { Unsubscribe } from 'suub';

export interface FlowServerOptions<T extends Flows> {
  outgoing(message: any): void;
  zenid: string;
  handleSubscribe: HandleSubscribe<T>;
}

export function createFlowServer<T extends Flows>(options: FlowServerOptions<T>): FlowServer<T> {
  const { outgoing, handleSubscribe } = options;
  const zenid = FLOW_PREFIX + options.zenid;

  const internal: DeepMap<keyof T, Unsubscribe> = createDeepMap();

  return {
    incoming,
    // dispatch,
    unsubscribe
  };

  function incoming(message: any): void {
    if (isUpMessage(message)) {
      handleUpMessage(message);
    }
  }

  function dispatch<K extends keyof T>(
    event: K,
    query: T[K]['query'],
    mutation: T[K]['mutations']
  ): void {
    const keys = queryToKeys(query);
    const isSubscribed = internal.get(event, keys);
    if (!isSubscribed) {
      return;
    }
    const mes: InternalMessageDown = {
      zenid,
      type: 'Mutation',
      event: event as any,
      query,
      mutation
    };
    outgoing(mes);
  }

  function unsubscribe<K extends keyof T>(event: K, query: T[K]['query']): void {
    const keys = queryToKeys(query);
    const unsubscribe = internal.get(event, keys);
    if (!unsubscribe) {
      return;
    }
    unsubscribe();
    internal.delete(event, keys);
    const mes: InternalMessageDown = {
      zenid,
      type: 'UnsubscribedByServer',
      event: event as string,
      query
    };
    outgoing(mes);
    return;
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
          console.log(message);
          console.warn(`Invalid message.type`);
        }
      }
    }
    return false;
  }

  async function handleUpMessage(message: InternalMessageUp): Promise<void> {
    const keys = queryToKeys(message.query);
    if (message.type === 'Subscribe') {
      const isSubscribed = internal.get(message.event, keys);
      if (isSubscribed) {
        return;
      }
      try {
        const onSub:
          | HandleSubscribe<T>[keyof HandleSubscribe<T>]
          | undefined = (handleSubscribe as any)[message.event];
        if (!onSub) {
          throw new Error('Missing on sub');
        }
        const { state, unsubscribe } = await onSub(message.query, fragment =>
          dispatch(message.event, message.query, fragment)
        );
        internal.set(message.event, keys, unsubscribe);
        const mes: InternalMessageDown = {
          zenid,
          type: 'Subscribed',
          initialData: state,
          responseTo: message.id
        };
        outgoing(mes);
        return;
      } catch (error) {
        internal.delete(message.event, keys);
        const mes: InternalMessageDown = {
          zenid,
          type: 'Error',
          error,
          responseTo: message.id
        };
        outgoing(mes);
        return;
      }
    }
    if (message.type === 'Unsubscribe') {
      const keys = queryToKeys(message.query);
      const unsubscribe = internal.get(message.event, keys);
      if (!unsubscribe) {
        return;
      }
      unsubscribe();
      internal.delete(message.event, keys);
      const rep: InternalMessageDown = {
        zenid,
        type: 'Unsubscribed',
        responseTo: message.id
      };
      outgoing(rep);
      return;
    }
    expectNever(message);
  }
}
