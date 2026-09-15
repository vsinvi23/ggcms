import apiClient from '@/api/client';

export interface LogMetadata {
  [key: string]: unknown;
}

class ClientLogger {
  private sendLog(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, metadata?: LogMetadata) {
    // Fire and forget — never block client execution
    apiClient
      .post('/logs/client', {
        level,
        message,
        metadata: {
          url: window.location.href,
          userAgent: navigator.userAgent,
          ...metadata,
        },
      })
      .catch(() => {
        // Silently ignore client logging delivery errors
      });
  }

  info(message: string, metadata?: LogMetadata) {
    console.log(`[INFO] ${message}`, metadata || '');
    this.sendLog('INFO', message, metadata);
  }

  warn(message: string, metadata?: LogMetadata) {
    console.warn(`[WARN] ${message}`, metadata || '');
    this.sendLog('WARN', message, metadata);
  }

  error(message: string, metadata?: LogMetadata) {
    console.error(`[ERROR] ${message}`, metadata || '');
    this.sendLog('ERROR', message, metadata);
  }

  debug(message: string, metadata?: LogMetadata) {
    console.debug(`[DEBUG] ${message}`, metadata || '');
    this.sendLog('DEBUG', message, metadata);
  }
}

export const logger = new ClientLogger();
