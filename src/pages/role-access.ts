export const hasFullAccessRole = (role: string): boolean => role === 'ADMIN' || role === 'MANAGER';
export const hasFullAccess = (roles: readonly string[] | undefined): boolean => roles?.some(hasFullAccessRole) ?? false;
