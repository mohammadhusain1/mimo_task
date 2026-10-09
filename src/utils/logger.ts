export class Logger {
  private static sanitize(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitize(item));
    }

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('authorization')
      ) {
        sanitized[key] = '***REDACTED***';
      } else if (lowerKey.includes('url') && typeof value === 'string') {
        // Redact potential access tokens or query params from URLs
        try {
          const parsed = new URL(value);
          if (parsed.search) {
            sanitized[key] = `${parsed.origin}${parsed.pathname}?***REDACTED***`;
          } else {
            sanitized[key] = value;
          }
        } catch {
          sanitized[key] = value;
        }
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  static info(message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    if (meta) {
      console.log(`[${timestamp}] [INFO] ${message}`, JSON.stringify(this.sanitize(meta)));
    } else {
      console.log(`[${timestamp}] [INFO] ${message}`);
    }
  }

  static warn(message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    if (meta) {
      console.warn(`[${timestamp}] [WARN] ${message}`, JSON.stringify(this.sanitize(meta)));
    } else {
      console.warn(`[${timestamp}] [WARN] ${message}`);
    }
  }

  static error(message: string, error?: any): void {
    const timestamp = new Date().toISOString();
    if (error instanceof Error) {
      console.error(`[${timestamp}] [ERROR] ${message}: ${error.message}`);
      if (process.env.NODE_ENV !== 'production' && error.stack) {
        console.error(error.stack);
      }
    } else if (error) {
      console.error(`[${timestamp}] [ERROR] ${message}`, JSON.stringify(this.sanitize(error)));
    } else {
      console.error(`[${timestamp}] [ERROR] ${message}`);
    }
  }
}
