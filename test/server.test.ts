import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handle } from '../src/server.js';

describe('server', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer(handle);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('GET /hello responds 200 with the greeting', async () => {
    const res = await fetch(`${base}/hello`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'Hello, world' });
  });
});
