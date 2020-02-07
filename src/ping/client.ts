import { PingClient, InternalMessageDown, PING_PREFIX, InternalMessageUp } from './types';
import { Outgoing } from '../types';

export interface PingClientOptions {
  zenid: string;
  pingInterval?: number | null;
}

export function createPingClient(options: PingClientOptions): PingClient {
  const { pingInterval = 10000 } = options;

  const zenid = PING_PREFIX + options.zenid;
  let outgoing: Outgoing | null = null;
  let pingTimer: NodeJS.Timeout | null = null;

  return {
    connected,
    disconnected,
    incoming
  };

  function disconnected(): void {
    outgoing = null;
    if (pingTimer !== null) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function connected(out: (msg: any) => void): void {
    outgoing = out;
    pingTimer = setInterval(() => {
      if (!outgoing) {
        return;
      }
      const mes: InternalMessageUp = {
        zenid
      };
      outgoing(mes);
    }, pingInterval);
  }

  function incoming(message: any): void {
    if (isDownMessage(message)) {
      handleDownMessage(message);
    }
  }

  function handleDownMessage(message: InternalMessageDown): void {
    // do nothing on pong
  }

  function isDownMessage(message: any): message is InternalMessageDown {
    if ('zenid' in message && message.zenid === zenid) {
      return true;
    }
    return false;
  }
}
