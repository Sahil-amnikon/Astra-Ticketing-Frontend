import { useEffect, useState } from 'react';
import Link from '../navigation/link';
import './personal-profile.css';
export default function ProfileIdentity({ name, workspace }: { name: string; workspace?: string }) {
  const [missing, setMissing] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const changed = () => { setMissing(false); setVersion(Date.now()); };
    window.addEventListener('astra-profile-photo-changed', changed);
    return () => window.removeEventListener('astra-profile-photo-changed', changed);
  }, []);
  return <Link className="profile-identity-link" href={`/profile?workspace=${encodeURIComponent(workspace ?? new URLSearchParams(window.location.search).get('workspace') ?? (window.location.pathname.startsWith('/admin') ? 'admin' : window.location.pathname.startsWith('/management') ? 'management' : 'operations'))}`} aria-label={`Open profile for ${name}`}>
    <span className="avatar">{missing ? name.slice(0, 1) : <img src={`/api/profile/photo?v=${version}`} alt="" onError={() => setMissing(true)} />}</span>
    <span>{name}</span>
  </Link>;
}
