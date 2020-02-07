import { ZensocketClient, ZensocketServer } from '../types';

export const PING_PREFIX = 'PING__';

export interface PingClient extends ZensocketClient {}

export interface PingServer extends ZensocketServer {}

export type InternalMessageDown = {
  zenid: string;
};

export type InternalMessageUp = {
  zenid: string;
};
