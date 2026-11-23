import { StrictMode, type ComponentType, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Outlet, useLocation, isRouteErrorResponse, useRouteError } from 'react-router-dom';
import ThemeControl from './pages/theme-control';
import SelectMenus from './pages/select-menus';
import './pages/globals.css';
import './pages/corporate-workspace.css';
import './pages/astra-workspace.css';
import './pages/spark-access.css';
import './pages/dark-mode.css';
import './pages/typography-floor.css';
import './pages/spark-typography.css';
import './pages/update-review.css';
import './pages/spark-ui-theme.css';
import './pages/responsive-workspace.css';
import './pages/presentation-finish.css';

type PageModule = { default: ComponentType; metadata?: { title?: string } };
const pages = import.meta.glob<PageModule>('./pages/**/page.tsx');

function PageTitle({ title, children }: { title?: string; children: React.ReactNode }) {
  useEffect(() => { document.title = title || 'ASTRA | Ticketing System'; }, [title]);
  return children;
}

function RootLayout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return <><Outlet /><ThemeControl /><SelectMenus key={pathname} /></>;
}

function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return <main><h1>{notFound ? 'Page not found' : 'Unable to load this page'}</h1><a href="/">Return to sign in</a></main>;
}

const router = createBrowserRouter([{
  element: <RootLayout />,
  errorElement: <RouteError />,
  children: Object.entries(pages).map(([file, load]) => ({
    path: file.replace('./pages', '').replace('/page.tsx', '')
      .replace(/\[(\w+)\]/g, ':$1') || '/',
    lazy: async () => {
      const page = await load();
      const Component = page.default;
      return { Component: () => <PageTitle title={page.metadata?.title}><Component /></PageTitle> };
    },
  })),
}]);

createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
