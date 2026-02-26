import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Logger } from './logger.js';

const logger = new Logger('proxy');

export interface ProxyConfig {
  httpAgent?: HttpProxyAgent<string>;
  httpsAgent?: HttpsProxyAgent<string>;
  proxy: false | undefined;
}

/**
 * Check whether a target hostname should bypass the proxy according to
 * a comma-separated NO_PROXY string.  Supports exact hostnames and
 * domain suffixes starting with a dot (e.g. `.internal.example.com`).
 */
function shouldBypassProxy(targetUrl: string, noProxy: string): boolean {
  if (!noProxy) return false;

  let hostname: string;
  try {
    hostname = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return false;
  }

  const entries = noProxy.split(',').map(e => e.trim().toLowerCase());
  for (const entry of entries) {
    if (!entry) continue;
    if (hostname === entry) return true;
    if (entry.startsWith('.') && hostname.endsWith(entry)) return true;
    if (hostname.endsWith(`.${entry}`)) return true;
  }
  return false;
}

/**
 * Build proxy agents for axios from environment variables.
 *
 * Resolution order (first match wins):
 *   1. Service-specific variable  (e.g. JIRA_HTTPS_PROXY)
 *   2. Global variable            (e.g. HTTPS_PROXY / https_proxy)
 *
 * The target URL is checked against the NO_PROXY list; if it matches,
 * no proxy is used.
 *
 * When a proxy URL is detected the function returns agent instances and
 * sets `proxy: false` so axios does not apply its own (limited) proxy
 * handling.
 *
 * @param service   - 'JIRA' or 'CONFLUENCE'
 * @param targetUrl - The base URL of the target service (e.g. JIRA_URL)
 */
export function getProxyConfig(service: 'JIRA' | 'CONFLUENCE', targetUrl: string): ProxyConfig {
  const proxyUrl =
    process.env[`${service}_HTTPS_PROXY`] ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env[`${service}_HTTP_PROXY`] ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  if (!proxyUrl) {
    // No proxy configured – return empty config (axios defaults).
    return { proxy: undefined };
  }

  const noProxy =
    process.env[`${service}_NO_PROXY`] ||
    process.env.NO_PROXY ||
    process.env.no_proxy ||
    '';

  if (shouldBypassProxy(targetUrl, noProxy)) {
    logger.info(`Proxy bypass for ${service}: ${targetUrl} matches NO_PROXY`);
    return { proxy: undefined };
  }

  logger.info(
    `Proxy configured for ${service}: ${proxyUrl}` +
    (noProxy ? ` (NO_PROXY: ${noProxy})` : '')
  );

  const httpAgent = new HttpProxyAgent(proxyUrl);
  const httpsAgent = new HttpsProxyAgent(proxyUrl);

  return {
    httpAgent,
    httpsAgent,
    proxy: false, // disable axios built-in proxy when using agents
  };
}
