import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import https from 'node:https';
import { Logger } from './logger.js';

const logger = new Logger('proxy');

/**
 * Checks if a target URL should bypass the proxy based on NO_PROXY settings.
 */
function shouldBypassProxy(targetUrl: string, noProxy: string): boolean {
  if (!noProxy) return false;

  let hostname: string;
  try {
    hostname = new URL(targetUrl).hostname;
  } catch {
    return false;
  }

  const entries = noProxy.split(',').map(e => e.trim().toLowerCase());
  const lowerHost = hostname.toLowerCase();

  for (const entry of entries) {
    if (!entry) continue;
    if (entry === '*') return true;
    if (lowerHost === entry) return true;
    if (entry.startsWith('.') && lowerHost.endsWith(entry)) return true;
    if (lowerHost.endsWith('.' + entry)) return true;
  }
  return false;
}

export interface ProxyConfig {
  httpAgent?: HttpProxyAgent<string>;
  httpsAgent?: HttpsProxyAgent<string> | https.Agent;
}

/**
 * Returns proxy agent configuration for axios based on environment variables.
 *
 * Supports global env vars (HTTP_PROXY, HTTPS_PROXY, NO_PROXY),
 * service-specific overrides (e.g. JIRA_HTTPS_PROXY, CONFLUENCE_NO_PROXY),
 * and Node/npm config variables (npm_config_proxy, npm_config_https_proxy,
 * npm_config_noproxy) as fallbacks for corporate firewall environments.
 *
 * @param service - 'jira', 'confluence', or 'atlassian' (for auth endpoints)
 * @param targetUrl - The base URL of the target service
 * @param sslVerify - Whether to verify SSL certificates (default: true)
 */
export function getProxyConfig(
  service: 'jira' | 'confluence' | 'atlassian',
  targetUrl: string,
  sslVerify: boolean = true
): ProxyConfig {
  const prefix = service.toUpperCase();

  // Service-specific env vars take precedence, then global, then npm/node config
  const httpProxy = process.env[`${prefix}_HTTP_PROXY`] || process.env.HTTP_PROXY || process.env.npm_config_proxy || '';
  const httpsProxy = process.env[`${prefix}_HTTPS_PROXY`] || process.env.HTTPS_PROXY || process.env.npm_config_https_proxy || '';
  const noProxy = process.env[`${prefix}_NO_PROXY`] || process.env.NO_PROXY || process.env.npm_config_noproxy || '';

  const config: ProxyConfig = {};
  const isHttps = targetUrl.startsWith('https');

  // Check if target should bypass the proxy
  if (shouldBypassProxy(targetUrl, noProxy)) {
    logger.info(`${service}: target ${targetUrl} matches NO_PROXY, skipping proxy`);
    // Still apply SSL verification setting even when bypassing proxy
    if (!sslVerify) {
      config.httpsAgent = new https.Agent({ rejectUnauthorized: false });
      logger.info(`${service}: SSL verification disabled`);
    }
    return config;
  }

  // Select the proxy URL appropriate for the target protocol
  const proxyUrl = isHttps ? (httpsProxy || httpProxy) : (httpProxy || httpsProxy);

  if (!proxyUrl) {
    // No proxy configured; only handle SSL verification
    if (!sslVerify) {
      config.httpsAgent = new https.Agent({ rejectUnauthorized: false });
      logger.info(`${service}: SSL verification disabled`);
    }
    return config;
  }

  logger.info(`${service}: using proxy ${proxyUrl}`);

  if (!isHttps && httpProxy) {
    config.httpAgent = new HttpProxyAgent(httpProxy);
  }

  if (isHttps) {
    config.httpsAgent = new HttpsProxyAgent(proxyUrl, {
      rejectUnauthorized: sslVerify
    });
    if (!sslVerify) {
      logger.info(`${service}: SSL verification disabled`);
    }
  }

  return config;
}
