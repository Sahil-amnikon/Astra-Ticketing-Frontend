import type { AnchorHTMLAttributes } from 'react';
import { Link as RouterLink } from 'react-router-dom';

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  prefetch?: boolean;
};

export default function Link({ href, prefetch: _prefetch, ...props }: LinkProps) {
  // Authentication, downloads, and external destinations require a full request.
  if (!href.startsWith('/') || href.startsWith('/api/') || props.download) {
    return <a href={href} {...props} />;
  }
  return <RouterLink to={href} {...props} />;
}
