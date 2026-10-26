'use client';
import Link from 'next/link';
import UiIcon from '../../ui/UiIcon';
import {
  groupNavigation,
  type NavigationLink,
} from '../../../routes/navigation';

export default function WorkspaceNavigation({
  links,
  activeHref,
  onNavigate,
  workspace,
}: {
  links: NavigationLink[];
  activeHref: string;
  onNavigate?: () => void;
  workspace?: string;
}) {
  return (
    <>
      {groupNavigation(links).map((group) => (
        <div className="workspace-nav-group" key={group.label}>
          <p className="workspace-nav-group-label">{group.label}</p>
          {group.links.map(([href, icon, label]) => (
            <Link
              key={href}
              href={
                workspace === 'management' &&
                ['/changes', '/problems'].includes(href)
                  ? '/management' + href
                  : workspace &&
                      ((href.startsWith('/admin/') && workspace !== 'admin') ||
                        [
                          '/knowledge',
                          '/catalogue',
                          '/help',
                          '/changes',
                          '/problems',
                          '/service-reports',
                        ].includes(href))
                    ? `${href}?workspace=${workspace}`
                    : href
              }
              aria-current={
                activeHref === href ||
                (workspace === 'management' &&
                  activeHref === '/management' + href)
                  ? 'page'
                  : undefined
              }
              onClick={onNavigate}
            >
              <span className="nav-symbol" aria-hidden="true">
                <UiIcon name={icon} />
              </span>
              <span>{label}</span>
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}
