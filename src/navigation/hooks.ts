import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(() => ({
    push: (path: string) => navigate(path),
    replace: (path: string) => navigate(path, { replace: true }),
    back: () => navigate(-1),
    refresh: () => window.location.reload(),
  }), [navigate]);
}

export function usePathname() {
  return useLocation().pathname;
}

export function useSearchParams() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function notFound(): never {
  throw new Response('Not found', { status: 404 });
}
