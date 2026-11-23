export const AMNIKON_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000132';
export function isEmployeeUser(role: string, email: string): boolean {
  return role === 'USER' && (!email.trim() || /^[^@\s<>]+@(?:amnikon|amnikontechnologies)\.com$/i.test(email.trim()));
}
