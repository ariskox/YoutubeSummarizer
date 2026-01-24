export type LogLevel = "info" | "warn" | "error";

const timestamp = () => new Date().toISOString();

const log = (level: LogLevel, message: string) => {
  const prefix = level.toUpperCase().padEnd(5, " ");
  // Compact timestamped logging for CLI visibility.
  // Avoids external logging deps and keeps output predictable for tests.
  // eslint-disable-next-line no-console
  console.log(`[${timestamp()}] ${prefix} ${message}`);
};

export const logger = {
  info: (msg: string) => log("info", msg),
  warn: (msg: string) => log("warn", msg),
  error: (msg: string) => log("error", msg),
};
