import {
  FlowServer,
  Flows,
  InternalMessageUp,
  InternalMessageDown,
  InitialData,
  GetInitial
} from './types';
import { Mappemonde } from 'mappemonde';
import { queryToSlug, expectNever } from './utils';

export interface FlowServerOptions<T extends Flows> {
  outgoing(message: any): void;
  zenid: string;
  getInitial: GetInitial<T>;
}

export function createFlowServer<T extends Flows>(options: FlowServerOptions<T>): FlowServer<T> {
  const { outgoing, zenid, getInitial } = options;

  const internal = Mappemonde.create<[keyof T, string], true>();

  return {
    incoming,
    dispatch,
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
    const isSubscribed = internal.has([event, slug]);
    if (!isSubscribed) {
      return;
    }
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
        if (['Subscribe', 'Unsubscribe', 'Request'].includes(message.type)) {
          return true;
        } else {
          console.log(`Invalid type`);
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
        let initialData: InitialData = null;
        const onSub: GetInitial<T>[keyof GetInitial<T>] | undefined = (getInitial as any)[
          message.event
        ];
        if (onSub) {
          initialData = { data: await onSub(message.query) };
        }
        internal.set([message.event, slug], true);
        const mes: InternalMessageDown = {
          zenid,
          type: 'Subscribed',
          initialData,
          responseTo: message.id
        };
        outgoing(mes);
        return;
      } catch (error) {
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
      const isSubscribed = internal.has([message.event, slug]);
      if (isSubscribed === false) {
        return;
      }
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
