import type { MobileAction, Workspace } from './types';

export function createActionTransport(send: (body: MobileAction) => Promise<Workspace>, nextId: () => string) {
  const pending = new Map<string, string>();
  return async (body: MobileAction) => {
    const { language: _language, ...operation } = body;
    const key = JSON.stringify(operation);
    const id = body.requestId ?? pending.get(key) ?? nextId();
    pending.set(key, id);
    const result = await send({ ...body, requestId: id });
    pending.delete(key);
    return result;
  };
}
