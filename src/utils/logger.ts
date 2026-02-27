import winston from 'winston';

export class Logger {
  private static globalLevel: string = 'info';
  private logger: winston.Logger;

  constructor(private context: string) {
    const logFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.context}]`;
        return stack ? `${prefix} ${message}\n${stack} ${metaStr}` : `${prefix} ${message} ${metaStr}`;
      })
    );

    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ];

    if (process.env.MCP_LOG_FILE === 'true') {
      const filePath = process.env.MCP_LOG_FILE_PATH || 'mcp-atlassian.log';
      transports.push(new winston.transports.File({ filename: filePath }));
    }

    this.logger = winston.createLogger({
      level: Logger.globalLevel,
      format: logFormat,
      transports
    });
  }

  static setLevel(level: string): void {
    Logger.globalLevel = level;
  }

  debug(message: string, ...meta: any[]): void {
    this.logger.debug(message, ...meta);
  }

  info(message: string, ...meta: any[]): void {
    this.logger.info(message, ...meta);
  }

  warn(message: string, ...meta: any[]): void {
    this.logger.warn(message, ...meta);
  }

  error(message: string, ...meta: any[]): void {
    this.logger.error(message, ...meta);
  }
} 