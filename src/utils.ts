import { MessageInternal } from './types';

export function isMessage(message: any): message is MessageInternal {
  if ('type' in message && 'kind' in message && 'id' in message && 'data' in message) {
    const mess = message as any;
    if (
      typeof mess.type === 'string' &&
      typeof mess.id === 'string' &&
      ['EMIT', 'REQUEST', 'RESPONSE'].indexOf(mess.kind) >= 0
    ) {
      return true;
    }
  }
  return false;
}
