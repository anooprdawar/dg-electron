type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export class Logger {
  private level: number;
  private prefix: string;

  constructor(prefix: string, level: LogLevel = "warn") {
    this.prefix = `[@deepgram/electron:${prefix}]`;
    this.level = LOG_LEVELS[level];
  }

  setLevel(level: LogLevel): void {
    this.level = LOG_LEVELS[level];
  }

  debug(...args: unknown[]): void {
    if (this.level <= LOG_LEVELS.debug) {
      console.debug(this.prefix, ...args);
    }
  }

  info(...args: unknown[]): void {
    if (this.level <= LOG_LEVELS.info) {
      console.info(this.prefix, ...args);
    }
  }

  warn(...args: unknown[]): void {
    if (this.level <= LOG_LEVELS.warn) {
      console.warn(this.prefix, ...args);
    }
  }

  error(...args: unknown[]): void {
    if (this.level <= LOG_LEVELS.error) {
      console.error(this.prefix, ...args);
    }
  }
}
