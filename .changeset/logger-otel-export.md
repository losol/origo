---
'@eventuras/logger': minor
---

Fix OpenTelemetry log export, which never worked. `setupOpenTelemetryLogger` crashed with `addLogRecordProcessor is not a function` on `@opentelemetry/sdk-logs` 0.200 and later, and even before that, `@opentelemetry/instrumentation-pino` could not patch the logger's ESM import of Pino, so no log record was ever emitted. The logger now bridges Pino output to OpenTelemetry itself: every line — after redaction, from every logger, including ones created before setup — is emitted as a log record.

Breaking changes:

- `@opentelemetry/instrumentation-pino` and `@opentelemetry/api` are no longer peer dependencies, and `@opentelemetry/api-logs` is now a regular dependency. `@opentelemetry/sdk-logs` stays an optional peer, needed only with `logRecordProcessor`.
- `OTelLoggerProvider` now describes `getLogger()` instead of `addLogRecordProcessor()`.
- With neither `logRecordProcessor` nor `loggerProvider`, logs go to the globally registered LoggerProvider.
- `shutdownOpenTelemetryLogger()` shuts down only a provider it created; a provider passed in, or the global one, is flushed instead.
- Setup never rejects: if it can't start, it logs an error.
