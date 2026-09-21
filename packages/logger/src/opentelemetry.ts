/**
 * OpenTelemetry integration for @eventuras/logger
 *
 * Sends logs to any OpenTelemetry-compatible backend (Sentry, Grafana, the
 * Aspire dashboard, etc.) without vendor lock-in.
 *
 * Every line the Pino transport writes — after redaction, from every logger,
 * including ones created before setup — is also emitted as an OpenTelemetry
 * log record. The logger bridges this itself rather than through
 * `@opentelemetry/instrumentation-pino`, which only patches Pino when it is
 * loaded through an import-in-the-middle loader hook, and so never saw this
 * package's ESM import of Pino.
 *
 * `@opentelemetry/sdk-logs` is an optional peer dependency, needed only when
 * passing `logRecordProcessor` — which comes from that package anyway, so the
 * app already has it and the logger uses the app's copy.
 *
 * Setup never throws or rejects: if it can't start, it logs an error and
 * leaves logging to stdout untouched.
 *
 * @example
 * // In your app's instrumentation.ts or main entry point
 * import { setupOpenTelemetryLogger } from '@eventuras/logger/opentelemetry';
 * import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
 * import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
 *
 * await setupOpenTelemetryLogger({
 *   logRecordProcessor: new BatchLogRecordProcessor({
 *     exporter: new OTLPLogExporter(), // reads OTEL_EXPORTER_OTLP_* env vars
 *   }),
 * });
 *
 * @example
 * // Then use logger as normal
 * import { Logger } from '@eventuras/logger';
 *
 * const logger = Logger.create({ namespace: 'MyService' });
 * logger.error({ error: err }, 'Something failed'); // Sent to OpenTelemetry backend
 */

import { logs } from '@opentelemetry/api-logs';
import { Logger } from './Logger';
import { setLogLineSink } from './sink';
import { PinoTransport } from './transports/pino';

/**
 * Minimal interface for an OpenTelemetry LogRecordProcessor.
 * Compatible with `@opentelemetry/sdk-logs` `LogRecordProcessor`.
 * Defined locally to avoid requiring OTel types at compile time.
 */
export interface LogRecordProcessor {
  onEmit(logRecord: unknown, context?: unknown): void;
  shutdown(): Promise<void>;
  forceFlush(): Promise<void>;
}

/**
 * Minimal shape of an OpenTelemetry log record, as emitted by this package.
 * Loosely typed so the SDK's own `LogRecord` type is assignable to it.
 */
export type OTelLogRecord = {
  timestamp?: unknown;
  severityNumber?: number;
  severityText?: string;
  body?: unknown;
  attributes?: Record<string, unknown>;
};

/**
 * Minimal interface for an OpenTelemetry Logger.
 * Compatible with `@opentelemetry/api-logs` `Logger`.
 */
export interface OTelLogger {
  emit(record: OTelLogRecord): void;
}

/**
 * Minimal interface for an OpenTelemetry LoggerProvider.
 * Compatible with `@opentelemetry/sdk-logs` `LoggerProvider` and the global
 * provider from `@opentelemetry/api-logs`.
 */
export interface OTelLoggerProvider {
  getLogger(name: string, version?: string): OTelLogger;
  shutdown?(): Promise<void>;
  forceFlush?(): Promise<void>;
}

/**
 * Options for OpenTelemetry logger integration
 */
export type OpenTelemetryLoggerOptions = {
  /**
   * Log record processor (e.g., BatchLogRecordProcessor with an exporter).
   * A LoggerProvider is created for it. Requires `@opentelemetry/sdk-logs`.
   */
  logRecordProcessor?: LogRecordProcessor;

  /**
   * Logger provider to emit to, e.g. one your app already configured with a
   * resource and processors. Takes precedence over `logRecordProcessor`.
   *
   * With neither option, the globally registered provider is used (as set up
   * by `@opentelemetry/sdk-node`, for instance).
   */
  loggerProvider?: OTelLoggerProvider;

  /**
   * Service name attached to every log record as the `service.name` attribute.
   * Defaults to the `OTEL_SERVICE_NAME` environment variable, or `'unknown-service'`.
   */
  serviceName?: string;

  /**
   * Whether to enable the integration. Default: true
   */
  enabled?: boolean;
};

const NAMESPACE = 'logger:otel';
const INSTRUMENTATION_SCOPE = '@eventuras/logger';

/** OpenTelemetry severity numbers for each level (logs data model). */
const SEVERITY_NUMBERS: Record<string, number> = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  fatal: 21,
};

/** Pino's numeric levels, for when `formatters.level` has been overridden. */
const PINO_LEVEL_LABELS: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

let loggerProvider: OTelLoggerProvider | null = null;
/** Whether `loggerProvider` was created here — only then is it ours to shut down. */
let ownsLoggerProvider = false;

async function loadPeer<T>(name: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`${name} could not be loaded (${reason}). Install it to export logs with OpenTelemetry.`, {
      cause,
    });
  }
}

async function resolveLoggerProvider(
  options: OpenTelemetryLoggerOptions,
): Promise<{ provider: OTelLoggerProvider; owned: boolean }> {
  if (options.loggerProvider) {
    return { provider: options.loggerProvider, owned: false };
  }

  if (options.logRecordProcessor) {
    const { LoggerProvider } = await loadPeer('@opentelemetry/sdk-logs', () => import('@opentelemetry/sdk-logs'));
    return { provider: new LoggerProvider({ processors: [options.logRecordProcessor] }), owned: true };
  }

  return { provider: logs.getLoggerProvider(), owned: false };
}

function formatBody(msg: unknown): unknown {
  // Static methods (`Logger.info(options, 'a', 'b')`) log `msg` as an array.
  if (Array.isArray(msg)) {
    return msg.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' ');
  }
  return msg;
}

/** Map a serialized Pino line to an OpenTelemetry log record. */
function toLogRecord(line: string, serviceName: string): OTelLogRecord {
  const { level, time, msg, ...attributes } = JSON.parse(line) as Record<string, unknown>;

  // Redundant with the `host.name` and `process.pid` resource attributes.
  delete attributes.pid;
  delete attributes.hostname;

  const label = typeof level === 'number' ? PINO_LEVEL_LABELS[level] : String(level);
  const timestamp = new Date(typeof time === 'string' || typeof time === 'number' ? time : Date.now());

  return {
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    severityNumber: label ? SEVERITY_NUMBERS[label] : undefined,
    severityText: label,
    body: formatBody(msg),
    attributes: { ...attributes, 'service.name': serviceName },
  };
}

/**
 * Set up OpenTelemetry integration for the logger.
 *
 * Call once at application startup. Loggers created before the call are
 * exported too. Calling again replaces the previous setup.
 *
 * @param options - Configuration options
 *
 * @example
 * // Send to Sentry via OTLP
 * import { setupOpenTelemetryLogger } from '@eventuras/logger/opentelemetry';
 * import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
 * import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
 *
 * await setupOpenTelemetryLogger({
 *   logRecordProcessor: new BatchLogRecordProcessor({
 *     exporter: new OTLPLogExporter({
 *       url: process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
 *       headers: {
 *         'x-sentry-auth': `sentry sentry_key=${process.env.SENTRY_KEY}`
 *       }
 *     })
 *   })
 * });
 *
 * @example
 * // Use a provider your app already registered globally (e.g. via NodeSDK)
 * await setupOpenTelemetryLogger();
 */
export async function setupOpenTelemetryLogger(
  options: OpenTelemetryLoggerOptions = {}
): Promise<void> {
  // Check if we're running in a browser environment
  if (typeof window !== 'undefined') {
    Logger.warn({ namespace: NAMESPACE }, 'OpenTelemetry integration is server-side only, skipping');
    return;
  }

  const { serviceName, enabled = true } = options;

  if (!enabled) {
    Logger.debug({ namespace: NAMESPACE }, 'OpenTelemetry integration disabled');
    return;
  }

  try {
    const { provider, owned } = await resolveLoggerProvider(options);
    const otelLogger = provider.getLogger(INSTRUMENTATION_SCOPE);

    // Replace any previous setup, releasing a provider created here.
    setLogLineSink(undefined);
    if (loggerProvider && ownsLoggerProvider && loggerProvider !== provider) {
      await loggerProvider.shutdown?.();
    }
    loggerProvider = provider;
    ownsLoggerProvider = owned;

    const resolvedServiceName =
      serviceName ??
      (typeof process !== 'undefined' ? process.env?.OTEL_SERVICE_NAME : undefined) ??
      'unknown-service';

    setLogLineSink((line) => otelLogger.emit(toLogRecord(line, resolvedServiceName)));

    if (!(Logger.getTransport() instanceof PinoTransport)) {
      Logger.warn(
        { namespace: NAMESPACE },
        'The active transport is not PinoTransport — only PinoTransport output is exported to OpenTelemetry',
      );
    }

    const source = options.loggerProvider
      ? 'loggerProvider'
      : options.logRecordProcessor
        ? 'logRecordProcessor'
        : 'global';
    Logger.info({ namespace: NAMESPACE, context: { source } }, 'OpenTelemetry integration enabled');
  } catch (error) {
    Logger.error(
      { namespace: NAMESPACE, error },
      'OpenTelemetry integration failed to start — logs are not exported',
    );
  }
}

/**
 * Shut down the OpenTelemetry logger integration.
 * Call this when your application is shutting down to flush any pending logs.
 *
 * A provider created from `logRecordProcessor` is shut down. One passed as
 * `loggerProvider`, or the global one, belongs to your app — it is flushed,
 * not shut down.
 *
 * @example
 * process.on('SIGTERM', async () => {
 *   await shutdownOpenTelemetryLogger();
 *   process.exit(0);
 * });
 */
export async function shutdownOpenTelemetryLogger(): Promise<void> {
  // Check if we're running in a browser environment
  if (typeof window !== 'undefined') {
    return;
  }

  setLogLineSink(undefined);

  if (loggerProvider) {
    const provider = loggerProvider;
    loggerProvider = null;
    await (ownsLoggerProvider ? provider.shutdown?.() : provider.forceFlush?.());
  }

  Logger.info({ namespace: NAMESPACE }, 'OpenTelemetry integration shut down');
}

/**
 * Get the active LoggerProvider instance, if any.
 * Useful for advanced use cases or debugging.
 */
export function getLoggerProvider(): OTelLoggerProvider | null {
  // Return null if in browser environment
  if (typeof window !== 'undefined') {
    return null;
  }

  return loggerProvider;
}
