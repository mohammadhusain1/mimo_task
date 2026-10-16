import { BadRequestError } from '../utils/errors';
import { env } from '../config/env';
import { Logger } from '../utils/logger';

export interface PageCountResult {
  pageCount: number;
  source: 'PROCESSED' | 'MOCK_PROVIDER';
}

export class FilePageCounterService {
  /**
   * Helper to check if an IPv4 address is in private, loopback, link-local, or restricted range
   */
  private static isRestrictedIpv4(host: string): boolean {
    const parts = host.split('.');
    if (parts.length !== 4) return false;

    const octets = parts.map(p => Number(p));
    if (octets.some(n => isNaN(n) || n < 0 || n > 255)) return false;

    const [o1, o2, o3] = octets;

    // 0.0.0.0/8 - Current network
    if (o1 === 0) return true;
    // 10.0.0.0/8 - Private Class A
    if (o1 === 10) return true;
    // 127.0.0.0/8 - Loopback
    if (o1 === 127) return true;
    // 169.254.0.0/16 - Link-local / Cloud metadata (AWS, GCP, Azure, OpenStack)
    if (o1 === 169 && o2 === 254) return true;
    // 172.16.0.0/12 - Private Class B (172.16.0.0 - 172.31.255.255)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    // 192.168.0.0/16 - Private Class C
    if (o1 === 192 && o2 === 168) return true;
    // 100.64.0.0/10 - Shared address space (Carrier-Grade NAT)
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;
    // 192.0.0.0/24, 192.0.2.0/24 (TEST-NET-1), 198.51.100.0/24 (TEST-NET-2), 203.0.113.0/24 (TEST-NET-3)
    if (o1 === 192 && o2 === 0 && (o3 === 0 || o3 === 2)) return true;
    if (o1 === 198 && o2 === 51 && o3 === 100) return true;
    if (o1 === 203 && o2 === 0 && o3 === 113) return true;
    // 224.0.0.0/4 - Multicast & 240.0.0.0/4 - Reserved
    if (o1 >= 224) return true;

    return false;
  }

  /**
   * Helper to check if a numeric IP representation (decimal, hex, octal) represents a restricted IP
   */
  private static isNumericOrEncodedRestrictedIp(host: string): boolean {
    // Pure decimal notation: e.g. 2130706433 (127.0.0.1) or 2852039166 (169.254.169.254)
    if (/^\d+$/.test(host)) {
      const num = Number(host);
      if (!isNaN(num) && num >= 0 && num <= 4294967295) {
        const o1 = (num >>> 24) & 255;
        const o2 = (num >>> 16) & 255;
        const o3 = (num >>> 8) & 255;
        const o4 = num & 255;
        return this.isRestrictedIpv4(`${o1}.${o2}.${o3}.${o4}`);
      }
    }

    // Hex notation: e.g. 0x7f000001
    if (/^0x[0-9a-f]+$/i.test(host)) {
      const num = parseInt(host, 16);
      if (!isNaN(num) && num >= 0 && num <= 4294967295) {
        const o1 = (num >>> 24) & 255;
        const o2 = (num >>> 16) & 255;
        const o3 = (num >>> 8) & 255;
        const o4 = num & 255;
        return this.isRestrictedIpv4(`${o1}.${o2}.${o3}.${o4}`);
      }
    }

    return false;
  }

  /**
   * Validate URL against SSRF and ensure it uses HTTP/HTTPS with allowlisted hosts
   */
  static validateUrlSafety(fileUrl: string): void {
    if (!fileUrl || typeof fileUrl !== 'string') {
      throw new BadRequestError('File URL is required');
    }

    let parsed: URL;
    try {
      parsed = new URL(fileUrl);
    } catch {
      throw new BadRequestError('Invalid file URL format');
    }

    // 1. Enforce strict HTTP/HTTPS protocol
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestError('File URL must use HTTP or HTTPS protocol');
    }

    // 2. Reject credentials embedded in URL
    if (parsed.username || parsed.password) {
      throw new BadRequestError('Credentials in file URL are not permitted');
    }

    // 3. Reject non-standard ports to prevent internal service port scanning
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
      throw new BadRequestError('Non-standard ports are not permitted in file URL');
    }

    // Normalize hostname: strip IPv6 brackets if present, convert to lowercase
    let rawHost = parsed.hostname.toLowerCase();
    if (rawHost.startsWith('[') && rawHost.endsWith(']')) {
      rawHost = rawHost.slice(1, -1);
    }

    // 4. Block known loopback and internal hostnames
    const blockedHostnames = [
      'localhost',
      'localhost.localdomain',
      'ip6-localhost',
      'ip6-loopback',
      'metadata.google.internal',
      'metadata.internal',
      'instance-data',
    ];

    if (
      blockedHostnames.includes(rawHost) ||
      rawHost.endsWith('.localhost') ||
      rawHost.endsWith('.internal') ||
      rawHost.endsWith('.local') && rawHost !== 'cdn.smartprint.local'
    ) {
      throw new BadRequestError('Access to private, loopback, or metadata network addresses is blocked (SSRF protection)');
    }

    // 5. Block private and restricted IPv4 addresses
    if (this.isRestrictedIpv4(rawHost) || this.isNumericOrEncodedRestrictedIp(rawHost)) {
      throw new BadRequestError('Access to private, loopback, or metadata network addresses is blocked (SSRF protection)');
    }

    // 6. Block IPv6 loopback, unspecified, link-local, and unique local addresses
    if (
      rawHost === '::1' ||
      rawHost === '::' ||
      rawHost.startsWith('fe80:') ||
      rawHost.startsWith('fc00:') ||
      rawHost.startsWith('fd00:') ||
      rawHost.startsWith('::ffff:')
    ) {
      throw new BadRequestError('Access to private, loopback, or metadata network addresses is blocked (SSRF protection)');
    }

    // 7. Strictly enforce storage domain allowlist
    const allowedHosts = env.FILE_STORAGE_ALLOWLIST.split(',')
      .map(h => h.trim().toLowerCase())
      .filter(Boolean);

    const isAllowed = allowedHosts.some(allowed => {
      if (allowed === '*') return true;
      return rawHost === allowed || rawHost.endsWith('.' + allowed);
    });

    if (!isAllowed) {
      Logger.warn(`Rejected file URL with unapproved host: ${rawHost}`);
      throw new BadRequestError(`File URL domain '${rawHost}' is not in the allowed storage domain list`);
    }
  }

  /**
   * Determine page count via processing component or mock page-count provider.
   * If URL has ?pages=N query param, uses N.
   * Otherwise uses deterministic heuristic based on filename or fallback mock provider (e.g. 3 pages default).
   */
  static async getPageCount(fileUrl: string): Promise<PageCountResult> {
    this.validateUrlSafety(fileUrl);

    try {
      const parsed = new URL(fileUrl);
      const queryPages = parsed.searchParams.get('pages') || parsed.searchParams.get('pageCount');
      if (queryPages && !isNaN(parseInt(queryPages, 10)) && parseInt(queryPages, 10) > 0) {
        return {
          pageCount: parseInt(queryPages, 10),
          source: 'PROCESSED',
        };
      }

      // Check if file extension is present
      const pathname = parsed.pathname.toLowerCase();
      if (pathname.endsWith('.pdf') || pathname.endsWith('.docx') || pathname.endsWith('.doc')) {
        // Explicit mock page provider for development
        // Uses document name length or predictable calculation
        const cleanName = pathname.split('/').pop() || '';
        const seed = cleanName.length > 0 ? (cleanName.length % 5) + 2 : 3;
        return {
          pageCount: seed,
          source: 'MOCK_PROVIDER',
        };
      }

      return {
        pageCount: env.PAGE_COUNT_DEFAULT > 1 ? env.PAGE_COUNT_DEFAULT : 2,
        source: 'MOCK_PROVIDER',
      };
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw error;
      }
      Logger.error('Error determining document page count', error);
      throw new BadRequestError('Unable to process document for page count verification');
    }
  }
}
