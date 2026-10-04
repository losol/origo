import { describe, it, expect } from 'vitest';
import { Logger } from '../Logger.js';
import { PinoTransport, type PinoTransportOptions } from './pino.js';

/** A transport whose output lines are collected, parsed, in `lines`. */
function capture(options: PinoTransportOptions = {}) {
  const lines: Record<string, any>[] = [];
  const transport = new PinoTransport({
    ...options,
    destinationStream: { write: (chunk) => lines.push(JSON.parse(String(chunk))) },
  });
  return { transport, lines };
}

describe('PinoTransport', () => {
  it('creates with default options', () => {
    const transport = new PinoTransport();
    expect(transport.pino).toBeDefined();
    expect(transport.pino.level).toBe('info');
  });

  it('respects custom log level', () => {
    const transport = new PinoTransport({ level: 'debug' });
    expect(transport.pino.level).toBe('debug');
  });

  it('logs at the specified level', () => {
    const transport = new PinoTransport({ level: 'trace' });
    // Pino won't throw when we call log methods
    expect(() => {
      transport.log('info', { key: 'value' }, 'test message');
      transport.log('error', { err: 'something' });
      transport.log('trace', {}, 'trace message');
    }).not.toThrow();
  });

  it('creates a child transport with bindings', () => {
    const transport = new PinoTransport();
    const child = transport.child({ namespace: 'test' });

    expect(child).toBeDefined();
    // Child should also implement LogTransport
    expect(child.log).toBeTypeOf('function');
    expect(child.child).toBeTypeOf('function');
  });

  it('child transport chains bindings', () => {
    const transport = new PinoTransport();
    const child = transport.child({ a: 1 }).child({ b: 2 });

    expect(() => {
      child.log('info', {}, 'nested child');
    }).not.toThrow();
  });

  it('flush does not throw', async () => {
    const transport = new PinoTransport();
    await expect(transport.flush()).resolves.toBeUndefined();
  });

  it('accepts raw pinoOptions', () => {
    const transport = new PinoTransport({
      pinoOptions: { name: 'my-app' },
    });
    // Pino stores the name in bindings
    expect(transport.pino).toBeDefined();
  });

  it('configures redaction', () => {
    const transport = new PinoTransport({
      redact: ['password', 'secret'],
    });
    // Pino should be configured — just verify it doesn't error
    expect(() => {
      transport.log('info', { password: 'hunter2', ok: true }, 'redact test');
    }).not.toThrow();
  });

  describe('errors', () => {
    it('keeps the message and stack of an Error under `error`', () => {
      const { transport, lines } = capture();
      transport.log('error', { error: new Error('boom'), id: 1 }, 'failed');
      expect(lines[0]).toMatchObject({
        error: { type: 'Error', message: 'boom', stack: expect.stringContaining('boom') },
        id: 1,
        msg: 'failed',
      });
    });

    it('still serializes `err`', () => {
      const { transport, lines } = capture();
      transport.log('error', { err: new Error('boom') });
      expect(lines[0].err).toMatchObject({ type: 'Error', message: 'boom' });
    });

    it('keeps the cause', () => {
      const { transport, lines } = capture();
      const error = new Error('outer', { cause: new TypeError('inner') });
      transport.log('error', { error });
      // Pino's serializer folds the cause into the message and stack.
      expect(lines[0].error.message).toBe('outer: inner');
      expect(lines[0].error.stack).toContain('caused by: TypeError: inner');
    });

    it('leaves anything else under `error` as it is', () => {
      const { transport, lines } = capture();
      transport.log('error', { error: 'plain' });
      transport.log('error', { error: { code: 'E1' } });
      expect(lines[0].error).toBe('plain');
      expect(lines[1].error).toEqual({ code: 'E1' });
    });

    it('serializes errors in child transports too', () => {
      const { transport, lines } = capture();
      transport.child({ namespace: 'test' }).log('error', { error: new Error('boom') });
      expect(lines[0]).toMatchObject({ namespace: 'test', error: { message: 'boom' } });
    });

    it("keeps a caller's own serializers, alongside `error`", () => {
      const { transport, lines } = capture({
        pinoOptions: { serializers: { user: (u: { id: number }) => ({ id: u.id }) } },
      });
      transport.log('error', { user: { id: 7, secret: 'x' }, error: new Error('boom') });
      expect(lines[0].user).toEqual({ id: 7 });
      expect(lines[0].error.message).toBe('boom');
    });

    it('serializes what Logger#error and #fatal pass for an Error', () => {
      const { transport, lines } = capture({ level: 'trace' });
      Logger.configure({ transport });
      const logger = Logger.create({ namespace: 'test' });
      logger.error(new Error('boom'), 'failed');
      logger.fatal(new Error('down'));
      expect(lines[0]).toMatchObject({ error: { message: 'boom' }, msg: 'failed' });
      expect(lines[1]).toMatchObject({ error: { message: 'down' } });
    });
  });
});
