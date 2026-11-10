import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  HostRpcError,
  createPluginClient,
  type MessagePortLike,
  type RpcMessage
} from '../src/browser.ts';

class FakePort implements MessagePortLike {
  onmessage: ((event: MessageEvent<RpcMessage>) => void) | null = null;
  readonly sent: RpcMessage[] = [];
  onSend?: (message: RpcMessage) => void;

  postMessage(message: RpcMessage) {
    this.sent.push(message);
    this.onSend?.(message);
  }

  start() {}
  close() {}

  receive(message: RpcMessage) {
    this.onmessage?.({ data: message } as MessageEvent<RpcMessage>);
  }
}

describe('plugin browser bridge', () => {
  it('handshakes with a versioned app-scoped JSON-RPC request', async () => {
    const port = new FakePort();
    port.onSend = (message) => {
      if ('id' in message && message.method === 'host.handshake') {
        queueMicrotask(() =>
          port.receive({
            jsonrpc: '2.0',
            id: message.id,
            apiVersion: '1.0',
            appId: 'com.attson.codec',
            result: {
              apiVersion: '1.0',
              capabilities: ['host.theme.read'],
              metadata: { appId: 'com.attson.codec', name: 'AT Codec', version: '0.1.0' },
              theme: 'dark'
            }
          })
        );
      }
    };
    const client = createPluginClient(port, {
      appId: 'com.attson.codec',
      timeoutMs: 100
    });

    const handshake = await client.handshake();

    assert.equal(handshake.theme, 'dark');
    assert.deepEqual(port.sent[0], {
      jsonrpc: '2.0',
      id: '1',
      apiVersion: '1.0',
      appId: 'com.attson.codec',
      method: 'host.handshake',
      params: {}
    });
    client.close();
  });

  it('surfaces stable host errors and cancels timed out requests', async () => {
    const deniedPort = new FakePort();
    deniedPort.onSend = (message) => {
      if ('id' in message) {
        queueMicrotask(() =>
          deniedPort.receive({
            jsonrpc: '2.0',
            id: message.id,
            apiVersion: '1.0',
            appId: 'com.attson.codec',
            error: {
              code: -32003,
              message: 'Permission denied',
              data: { code: 'HOST_PERMISSION_DENIED' }
            }
          })
        );
      }
    };
    const deniedClient = createPluginClient(deniedPort, {
      appId: 'com.attson.codec',
      timeoutMs: 100
    });
    await assert.rejects(
      deniedClient.call('host.file.save', {}),
      (error) => error instanceof HostRpcError && error.code === 'HOST_PERMISSION_DENIED'
    );

    const timeoutPort = new FakePort();
    const timeoutClient = createPluginClient(timeoutPort, {
      appId: 'com.attson.codec',
      timeoutMs: 5
    });
    await assert.rejects(
      timeoutClient.call('host.theme.get', {}),
      (error) => error instanceof HostRpcError && error.code === 'HOST_TIMEOUT'
    );
    assert.equal(timeoutPort.sent[1]?.method, '$/cancelRequest');
    timeoutClient.close();
  });
});
