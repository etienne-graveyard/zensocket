import {
  Bounces,
  HandleRequest,
  BounceServer,
  InternalMessageUp,
  ALL_MESSAGE_UP_TYPES,
  InternalMessageDown,
  BounceErrorType
} from './types';
import { expectNever } from '../utils';

export interface BounceServerOptions<T extends Bounces> {
  outgoing(message: any): void;
  zenid: string;
  handleRequest: HandleRequest<T>;
}

export function createBounceServer<T extends Bounces>(
  options: BounceServerOptions<T>
): BounceServer {
  const { outgoing, zenid, handleRequest } = options;

  const pendingRequests = new Set<string>();

  return {
    incoming
  };

  function incoming(message: any): void {
    if (isUpMessage(message)) {
      handleUpMessage(message);
    }
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

  function canceled(id: string) {
    return pendingRequests.has(id) === false;
  }

  async function handleUpMessage(message: InternalMessageUp): Promise<void> {
    if (message.type === 'Request') {
      const handler = handleRequest[message.bounce];
      if (!handler) {
        const mes: InternalMessageDown = {
          zenid,
          responseTo: message.id,
          type: 'Error',
          errorType: BounceErrorType.MissingServerHandler
        };
        outgoing(mes);
        return;
      }
      pendingRequests.add(message.id);
      try {
        const res = await handler(message.data, () => canceled(message.id));
        if (pendingRequests.has(message.id)) {
          const mes: InternalMessageDown = {
            zenid,
            responseTo: message.id,
            type: 'Success',
            data: res
          };
          outgoing(mes);
        }
      } catch (error) {
        if (pendingRequests.has(message.id)) {
          const mes: InternalMessageDown = {
            zenid,
            responseTo: message.id,
            type: 'Error',
            errorType: BounceErrorType.ServerHandlerError
          };
          outgoing(mes);
        }
      }
      pendingRequests.delete(message.id);
      return;
    }
    if (message.type === 'Cancel') {
      if (pendingRequests.has(message.requestId)) {
        pendingRequests.delete(message.requestId);
      }
      return;
    }
    expectNever(message);
  }
}
