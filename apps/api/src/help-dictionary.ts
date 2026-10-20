export const HELP_SYNONYMS: Record<string, string[]> = {
  outlook: ['microsoft outlook', 'office outlook', 'mail client', 'email client'],
  email: ['mail', 'outlook', 'microsoft 365', 'exchange', 'smtp'],
  password: ['credentials', 'sign in', 'login', 'authentication', 'auth'],
  login: ['sign in', 'authentication', 'credentials'],
  vpn: ['virtual private network', 'remote access', 'tunnel', 'vpn client'],
  printer: ['printing', 'print', 'print queue', 'printer offline'],
  dns: ['name resolution', 'resolver', 'dns lookup', 'domain name system'],
  network: ['connectivity', 'connection', 'internet', 'lan', 'wifi', 'wi-fi'],
  internet: ['network', 'connectivity', 'wan'],
  offline: ['unavailable', 'disconnected', 'not connected'],
  disconnect: ['drops', 'dropped', 'connection lost', 'disconnects'],
  slow: ['latency', 'performance', 'slow performance', 'delay'],
  error: ['failure', 'failed', 'problem', 'issue'],
  send: ['outbound', 'sending', 'smtp', 'mail delivery'],
  receive: ['inbound', 'receiving', 'mail delivery'],
  microsoft365: ['microsoft 365', 'office 365', 'm365', 'o365'],
  m365: ['microsoft 365', 'office 365', 'microsoft365'],
  o365: ['microsoft 365', 'office 365', 'm365'],
};

export const HELP_PRODUCTS: Record<string, string[]> = {
  outlook: ['outlook', 'microsoft outlook', 'office outlook'],
  microsoft365: ['microsoft 365', 'office 365', 'm365', 'o365', 'exchange'],
  vpn: ['vpn', 'virtual private network', 'remote access'],
  printer: ['printer', 'printing', 'print queue'],
  dns: ['dns', 'resolver', 'name resolution'],
  network: ['network', 'wifi', 'wi-fi', 'internet', 'connectivity'],
};

export const HELP_SYMPTOMS: Record<string, string[]> = {
  password_prompt: ['password', 'password prompt', 'keeps asking', 'credential', 'sign in'],
  offline: ['offline', 'unavailable', 'not connected', 'disconnected'],
  disconnecting: ['disconnect', 'disconnects', 'drops', 'dropped', 'connection lost'],
  cannot_send: ['cannot send', 'can\'t send', 'unable to send', 'send email', 'outbound'],
  dns_failure: ['dns', 'not resolving', 'name resolution', 'lookup failed', 'cannot resolve'],
  slow: ['slow', 'latency', 'delay', 'performance'],
  error: ['error', 'failed', 'failure', 'broken', 'issue', 'problem'],
};

export const HELP_TYPO_TERMS = [
  'outlook', 'microsoft', 'password', 'printer', 'printing', 'vpn', 'network',
  'internet', 'disconnect', 'disconnected', 'offline', 'email', 'exchange',
  'microsoft365', 'resolver', 'resolution', 'dns', 'sending', 'receiving',
];
