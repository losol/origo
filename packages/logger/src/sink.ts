/**
 * Process-wide hook for the serialized log lines Pino writes.
 *
 * `PinoTransport` hands every line (after redaction) to the sink, and
 * `@eventuras/logger/opentelemetry` sets the sink to forward lines as
 * OpenTelemetry log records.
 *
 * The sink lives on `globalThis` rather than in module state because a
 * bundler can load this package more than once in one process — Next.js
 * compiles `instrumentation.ts` into its own layer — and the copy that sets
 * the sink up is not necessarily the one whose loggers write the lines.
 */

export type LogLineSink = (line: string) => void;

const SINK_KEY = Symbol.for('@eventuras/logger:line-sink');

type SinkHolder = { [SINK_KEY]?: LogLineSink };

export function setLogLineSink(sink: LogLineSink | undefined): void {
  (globalThis as SinkHolder)[SINK_KEY] = sink;
}

/** Forward a line to the sink, if any. Never throws — telemetry must not break logging. */
export function forwardLogLine(line: string): void {
  const sink = (globalThis as SinkHolder)[SINK_KEY];
  if (!sink) return;
  try {
    sink(line);
  } catch {
    // Dropped: a failing exporter or an unparseable line must not stop the
    // line from reaching the primary destination.
  }
}
