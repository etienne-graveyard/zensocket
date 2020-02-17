import { InternalMessageUp, InternalMessageDown, PING_PREFIX, PingServer } from './types';

export interface PingServerOptions {
  outgoing(message: any): void;
  zenid: string;
}

export function createPingServer(options: PingServerOptions): PingServer {
  const { outgoing } = options;
  const zenid = PING_PREFIX + options.zenid;

  return {
    incoming,
    destroy
  };

  function destroy(): void {}

  function incoming(message: any): void {
    if (isUpMessage(message)) {
      handleUpMessage(message);
    }
  }

  function isUpMessage(message: any): message is InternalMessageUp {
    if ('zenid' in message && message.zenid === zenid) {
      return true;
    }
    return false;
  }

  function handleUpMessage(_message: InternalMessageUp) {
    if (!outgoing) {
      return;
    }
    const mes: InternalMessageDown = {
      zenid
    };
    outgoing(mes);
  }
}
