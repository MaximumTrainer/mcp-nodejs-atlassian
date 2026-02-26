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
 * Build proxy agents for axios from environment variables.
 *
 * Resolution order (first match wins):
 *   1. Service-specific variable  (e.g. JIRA_HTTPS_PROXY)
 *   2. Global variable            (e.g. HTTPS_PROXY / https_proxy)
 *
 * When a proxy URL is detected the function returns agent instances and
 * sets `proxy: false` so axios does not apply its own (limited) proxy
 * handling.
 *
 * @param service - 'JIRA' or 'CONFLUENCE'
 */
export function getProxyConfig(service: 'JIRA' | 'CONFLUENCE'): ProxyConfig {
  const httpsProxy =
    process.env[`${service}_HTTPS_PROXY`] ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env[`${service}_HTTP_PROXY`] ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

  if (!httpsProxy) {
    // No proxy configured – return empty config (axios defaults).
    return { proxy: undefined };
  }

  const noProxy =
    process.env[`${service}_NO_PROXY`] ||
    process.env.NO_PROXY ||
    process.env.no_proxy ||
    '';

  logger.info(
    `Proxy configured for ${service}: ${httpsProxy}` +
    (noProxy ? ` (NO_PROXY: ${noProxy})` : '')
  );

  const httpAgent = new HttpProxyAgent(httpsProxy);
  const httpsAgent = new HttpsProxyAgent(httpsProxy);

  return {
    httpAgent,
    httpsAgent,
    proxy: false, // disable axios built-in proxy when using agents
  };
}
