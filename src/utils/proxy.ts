import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';

export interface ClientNetworkConfig {
  httpAgent?: unknown;
  httpsAgent?: unknown;
  proxy?: false;
}

/**
 * Determines whether a URL should bypass the proxy based on a NO_PROXY value.
 */
export function shouldBypassProxy(url: string, noProxy?: string): boolean {
  if (!noProxy) return false;

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }

  const entries = noProxy.split(',').map(e => e.trim().toLowerCase());

  for (const entry of entries) {
    if (!entry) continue;
    if (entry === '*') return true;
    if (hostname === entry) return true;
    if (entry.startsWith('.') && hostname.endsWith(entry)) return true;
    if (!entry.startsWith('.') && hostname.endsWith('.' + entry)) return true;
  }

  return false;
}

/**
 * Builds network configuration (proxy agents and SSL settings) for an Axios client.
 *
 * Resolution order for proxy env vars:
 *   service-specific (e.g. JIRA_HTTPS_PROXY) > global (e.g. HTTPS_PROXY / https_proxy)
 *
 * Proxy precedence: SOCKS > HTTPS > HTTP.
 */
export function getNetworkConfig(service: 'jira' | 'confluence', baseUrl: string): ClientNetworkConfig {
  const prefix = service.toUpperCase();

  // SSL verification (default: true)
  const sslVerifyStr = process.env[`${prefix}_SSL_VERIFY`];
  const sslVerify = sslVerifyStr !== 'false';

  // Proxy env vars – service-specific overrides global
  const httpProxy = process.env[`${prefix}_HTTP_PROXY`] || process.env.HTTP_PROXY || process.env.http_proxy;
  const httpsProxy = process.env[`${prefix}_HTTPS_PROXY`] || process.env.HTTPS_PROXY || process.env.https_proxy;
  const socksProxy = process.env[`${prefix}_SOCKS_PROXY`] || process.env.SOCKS_PROXY || process.env.socks_proxy;
  const noProxy = process.env[`${prefix}_NO_PROXY`] || process.env.NO_PROXY || process.env.no_proxy;

  const useProxy = !shouldBypassProxy(baseUrl, noProxy);
  const config: ClientNetworkConfig = {};

  if (useProxy && socksProxy) {
    const agent = new SocksProxyAgent(socksProxy);
    if (!sslVerify) {
      // SocksProxyAgent types don't expose rejectUnauthorized, but agent-base
      // passes agent.options through to tls.connect at runtime.
      (agent as unknown as { options: Record<string, unknown> }).options.rejectUnauthorized = false;
    }
    config.httpAgent = agent;
    config.httpsAgent = agent;
    config.proxy = false;
  } else if (useProxy && (httpsProxy || httpProxy)) {
    if (httpProxy) {
      config.httpAgent = new HttpProxyAgent(httpProxy);
    }
    const proxyForHttps = httpsProxy || httpProxy;
    if (proxyForHttps) {
      config.httpsAgent = sslVerify
        ? new HttpsProxyAgent(proxyForHttps)
        : new HttpsProxyAgent(proxyForHttps, { rejectUnauthorized: false });
    }
    config.proxy = false;
  } else if (!sslVerify) {
    // No proxy but SSL verification disabled
    config.httpsAgent = new https.Agent({ rejectUnauthorized: false });
  }

  return config;
}
