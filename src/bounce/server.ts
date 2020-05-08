import {
  Bounces,
  BounceHandleRequest,
  BounceServer,
  InternalMessageUp,
  ALL_MESSAGE_UP_TYPES,
  InternalMessageDown,
  BounceErrorType,
  BOUNCE_PREFIX
} from './types';
import { expectNever } from '../utils';

export interface BounceServerOptions<T extends Bounces, Context> {
  outgoing(message: any): void;
  zenid: string;
  context: Context;
  handleRequest: BounceHandleRequest<T, Context>;
}

export function createBounceServer<T extends Bounces, Context>(
  options: BounceServerOptions<T, Context>
): BounceServer {
  const { outgoing, handleRequest, context } = options;
  const zenid = BOUNCE_PREFIX + options.zenid;

  const pendingRequests = new Set<string>();

  return {
    incoming,
    destroy
  };

  function destroy(): void {
    // cancel all
    pendingRequests.clear();
  }

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
          console.warn(message);
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
        const res = await handler({
          data: message.data,
          canceled: () => canceled(message.id),
          context
        });
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
        console.error(error);
        console.error(`Error in ${message.bounce}, see above`);
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
