import {
  FlowServer,
  Flows,
  InternalMessageUp,
  InternalMessageDown,
  HandleSubscribe,
  Unsubscribe,
  ALL_MESSAGE_UP_TYPES
} from './types';
import { Mappemonde } from 'mappemonde';
import { queryToSlug, expectNever } from './utils';

export interface FlowServerOptions<T extends Flows> {
  outgoing(message: any): void;
  zenid: string;
  handleSubscribe: HandleSubscribe<T>;
}

export function createFlowServer<T extends Flows>(options: FlowServerOptions<T>): FlowServer<T> {
  const { outgoing, zenid, handleSubscribe } = options;

  const internal = Mappemonde.create<[keyof T, string], Unsubscribe>();

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
    fragment: T[K]['fragment']
  ): void {
    const slug = queryToSlug(query);
    const isSubscribed = internal.has([event, slug]);
    if (!isSubscribed) {
      return;
    }
    const mes: InternalMessageDown = {
      zenid,
      type: 'Event',
      event: event as any,
      query,
      fragment
    };
    outgoing(mes);
  }

  function unsubscribe<K extends keyof T>(event: K, query: T[K]['query']): void {
    const slug = queryToSlug(query);
    const unsubscribe = internal.get([event, slug]);
    if (!unsubscribe) {
      return;
    }
    unsubscribe();
    internal.delete([event, query]);
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
    const slug = queryToSlug(message.query);
    if (message.type === 'Subscribe') {
      const isSubscribed = internal.has([message.event, slug]);
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
        internal.set([message.event, slug], unsubscribe);
        const mes: InternalMessageDown = {
          zenid,
          type: 'Subscribed',
          initialData: state,
          responseTo: message.id
        };
        outgoing(mes);
        return;
      } catch (error) {
        internal.delete([message.event, slug]);
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
      const slug = queryToSlug(message.query);
      const unsubscribe = internal.get([message.event, slug]);
      if (!unsubscribe) {
        return;
      }
      unsubscribe();
      internal.delete([message.event, slug]);
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
