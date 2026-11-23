/** Display enum codes as readable labels without changing stored values or user-entered text. */
export function uiLabel(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '—';
  if (!/^[A-Z][A-Z0-9_ .-]*$/.test(text) || /\d{4,}/.test(text)) return text;
  const names: Record<string, string> = {
    ADMIN: 'Administrator', USER: 'Employee', TEAM_LEAD: 'Team Lead',
    WAITING_FOR_CLIENT: 'Waiting for Client', WAITING_FOR_VENDOR: 'Waiting for Vendor',
    MICROSOFT_365: 'Microsoft 365', CLIENT_PORTAL: 'Client Portal',
  };
  if (names[text]) return names[text];
  const acronyms = new Set(['SLA', 'QA', 'IT', 'VPN', 'CRM', 'ERP', 'DNS', 'DHCP', 'API', 'SMTP', 'TLS', 'MFA', 'SSO', 'CSV', 'PDF', 'P1', 'P2', 'P3', 'P4']);
  return text.split(/[_.\s]+/).map(word => acronyms.has(word) ? word : word.charAt(0) + word.slice(1).toLowerCase()).join(' ');
}
