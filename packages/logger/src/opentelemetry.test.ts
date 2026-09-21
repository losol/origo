import { logs } from '@opentelemetry/api-logs';
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from './Logger.js';
import {
  getLoggerProvider,
  setupOpenTelemetryLogger,
  shutdownOpenTelemetryLogger,
} from './opentelemetry.js';
import { PinoTransport } from './transports/pino.js';

const silent = { write() {} };

describe('OpenTelemetry integration', () => {
  let exporter: InMemoryLogRecordExporter;

  /** Exported records, minus the integration's own startup message. */
  const exported = () =>
    exporter.getFinishedLogRecords().filter((record) => record.attributes.namespace !== 'logger:otel');

  const setup = () =>
    setupOpenTelemetryLogger({
      logRecordProcessor: new SimpleLogRecordProcessor({ exporter }),
      serviceName: 'shop',
    });

  beforeEach(() => {
    Logger.configure({ transport: new PinoTransport({ destinationStream: silent }) });
    exporter = new InMemoryLogRecordExporter();
  });

  afterEach(async () => {
    await shutdownOpenTelemetryLogger();
    logs.disable();
  });

  it('exports log records, including from loggers created before setup', async () => {
    const logger = Logger.create({ namespace: 'orders' });
    await setup();

    logger.info({ orderId: 42 }, 'order placed');

    const [record] = exported();
    expect(record).toMatchObject({
      body: 'order placed',
      severityNumber: 9,
      severityText: 'info',
      instrumentationScope: { name: '@eventuras/logger' },
      attributes: { namespace: 'orders', orderId: 42, 'service.name': 'shop' },
    });
    expect(record?.attributes).not.toHaveProperty('pid');
    expect(record?.attributes).not.toHaveProperty('hostname');
  });

  it('exports redacted values, not the originals', async () => {
    Logger.configure({ transport: new PinoTransport({ destinationStream: silent, redact: ['password'] }) });
    await setup();

    Logger.create().info({ password: 'hunter2' }, 'login');

    expect(exported()[0]?.attributes.password).toBe('[REDACTED]');
  });

  it('respects the log level and maps severities', async () => {
    await setup();
    const logger = Logger.create({ namespace: 'levels' });

    logger.debug('below the level');
    logger.error('went wrong');

    expect(exported().map((record) => [record.body, record.severityNumber])).toEqual([['went wrong', 17]]);
  });

  it('joins the message parts of static log calls', async () => {
    await setup();

    Logger.info({ namespace: 'static' }, 'several', 'parts');

    expect(exported()[0]?.body).toBe('several parts');
  });

  it('exports lines written by another copy of the package', async () => {
    await setup();

    // Bundlers can instantiate the package twice in one process (Next.js
    // compiles instrumentation.ts into its own layer).
    vi.resetModules();
    const other = await import('./transports/pino.js');
    expect(other.PinoTransport).not.toBe(PinoTransport);
    new other.PinoTransport({ destinationStream: silent }).log('info', { namespace: 'other' }, 'from another copy');

    expect(exported().map((record) => record.body)).toEqual(['from another copy']);
  });

  it('emits to a provided LoggerProvider and only flushes it on shutdown', async () => {
    const provider = new LoggerProvider({ processors: [new SimpleLogRecordProcessor({ exporter })] });
    await setupOpenTelemetryLogger({ loggerProvider: provider });
    expect(getLoggerProvider()).toBe(provider);

    Logger.create({ namespace: 'provided' }).info('via provider');
    await shutdownOpenTelemetryLogger();
    Logger.create({ namespace: 'provided' }).info('after shutdown');
    provider.getLogger('app').emit({ body: 'app still owns the provider' });

    expect(exported().map((record) => record.body)).toEqual(['via provider', 'app still owns the provider']);
  });

  it('uses the global LoggerProvider when given neither option', async () => {
    logs.setGlobalLoggerProvider(new LoggerProvider({ processors: [new SimpleLogRecordProcessor({ exporter })] }));
    await setupOpenTelemetryLogger();

    Logger.create({ namespace: 'global' }).info('via global provider');

    expect(exported().map((record) => record.body)).toEqual(['via global provider']);
  });

  it('never rejects, and leaves no provider behind, when setup fails', async () => {
    const broken = {
      getLogger(): never {
        throw new Error('boom');
      },
    };

    await expect(setupOpenTelemetryLogger({ loggerProvider: broken })).resolves.toBeUndefined();
    expect(getLoggerProvider()).toBeNull();
  });

  it('keeps writing to the destination when the exporter throws', async () => {
    const lines: string[] = [];
    Logger.configure({ transport: new PinoTransport({ destinationStream: { write: (line: string) => lines.push(line) } }) });
    await setupOpenTelemetryLogger({
      loggerProvider: {
        getLogger: () => ({
          emit() {
            throw new Error('exporter down');
          },
        }),
      },
    });

    expect(() => Logger.create().info('still logged')).not.toThrow();
    expect(lines.some((line) => line.includes('still logged'))).toBe(true);
  });
});
