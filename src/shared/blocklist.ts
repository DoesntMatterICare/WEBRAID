// Sites where WEBRAID refuses to start (PROJECT.md §8).

const BLOCKED_HOSTS: RegExp[] = [
  // Browser stores
  /^chromewebstore\.google\.com$/,
  /^chrome\.google\.com$/,
  /^microsoftedge\.microsoft\.com$/,
  /^addons\.mozilla\.org$/,
  // Payments, banking, crypto, brokers
  /bank/,
  /(^|\.)paypal\.com$/,
  /(^|\.)stripe\.com$/,
  /(^|\.)venmo\.com$/,
  /(^|\.)wise\.com$/,
  /(^|\.)revolut\.com$/,
  /(^|\.)chase\.com$/,
  /(^|\.)wellsfargo\.com$/,
  /(^|\.)citi\.com$/,
  /(^|\.)capitalone\.com$/,
  /(^|\.)americanexpress\.com$/,
  /(^|\.)hsbc\./,
  /(^|\.)barclays\./,
  /(^|\.)santander\./,
  /(^|\.)coinbase\.com$/,
  /(^|\.)binance\.com$/,
  /(^|\.)kraken\.com$/,
  /(^|\.)robinhood\.com$/,
  // Email
  /^mail\./,
  /^outlook\.(live|office|office365)\.com$/,
  /(^|\.)proton\.me$/,
  /(^|\.)protonmail\.com$/,
  // Sign-in hosts
  /^(accounts|login|signin|auth|id|sso)\./,
  // Government and health
  /\.gov(\.[a-z]{2})?$/,
  /\.gob\.[a-z]{2}$/,
  /\.gouv\.[a-z]{2}$/,
  /\.nhs\.uk$/,
  /(^|\.)mychart\./,
];

const BLOCKED_PATH =
  /\/(checkout|payment|payments|billing|pay|signin|sign-in|login|log-in|wallet)(\/|$)/i;

export const SAFE_ZONE_MESSAGE = 'This site is a safe zone. Go raid something else.';

/** Returns a reason string if WEBRAID must not run on this URL, else null. */
export function safeZoneReason(rawUrl: string | undefined): string | null {
  if (!rawUrl) return 'unsupported';
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return 'unsupported';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'file:') {
    return 'unsupported';
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.some((re) => re.test(host))) return 'safe-zone';
  if (BLOCKED_PATH.test(url.pathname)) return 'safe-zone';
  return null;
}
