import { useEffect, useState } from 'react';
import { uiLabel } from '../ui-label';
import { useWorkspace, WorkspaceFrame } from '../workspace-tools';
import { formatApiDate } from '../api-time';
import '../personal-profile.css';
import Link from '../../navigation/link';
import ProfileActivity from './profile-activity';
type Row = Record<string, unknown>;
type Profile = { person: Row; roles: Row[]; msps: Row[]; departments: Row[]; workload: Row; resolved: Row[]; qa: Row };
export const metadata = { title: 'My profile | ASTRA' };
export default function PersonalProfile() {
  const workspace = useWorkspace();
  const [data, setData] = useState<Profile>();
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [missingPhoto, setMissingPhoto] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    if (!workspace.session) return;
    void workspace.request(`/profile?offset=${-new Date().getTimezoneOffset()}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setData(result as Profile); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [workspace.session, workspace.request]);
  async function upload(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError('Choose a JPEG or PNG photo smaller than 2 MB.'); return; }
    setUploading(true); setError('');
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Could not read the photo.')); reader.readAsDataURL(file);
      });
      await workspace.request('/profile/photo', { method: 'PUT', body: JSON.stringify({ contentBase64 }) });
      setMissingPhoto(false); setPhotoVersion(Date.now());
      window.dispatchEvent(new Event('astra-profile-photo-changed'));
    } catch (e) { setError(e instanceof Error ? e.message : 'Photo upload failed.'); }
    finally { setUploading(false); }
  }
  const names = (items?: Row[]) => items?.map(row => uiLabel(row.name)).join(', ') || 'Not assigned';
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const today = dateKey(new Date());
  const days = Array.from({ length: 14 }, (_, i) => { const date = new Date(); date.setDate(date.getDate() - 13 + i); const key = dateKey(date); return { key, label: date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), count: Number(data?.resolved.find(row => row.day === key)?.resolved ?? 0) }; });
  const max = Math.max(1, ...days.map(day => day.count));
  const total30 = data?.resolved.reduce((sum, row) => sum + Number(row.resolved), 0) ?? 0;
  return <WorkspaceFrame title="My profile" user={workspace.session?.user} csrfToken={workspace.session?.csrfToken} error={error || workspace.error}>
    {!data ? <p role="status">{workspace.session ? 'Loading your profile…' : 'Sign in to view your profile.'}</p> : <div className="personal-profile">
      {['INTERNAL', 'BOTH'].includes(workspace.session?.user.workScope ?? '') && <div><Link className="primary" href="/client?workspace=client">My internal requests</Link></div>}
      <section className="panel personal-profile-hero">
        <div className="personal-profile-cover" />
        <div className="personal-profile-summary">
          <div className="personal-profile-photo">{missingPhoto ? <span>{String(data.person.display_name).slice(0, 1)}</span> : <img src={`/api/profile/photo?v=${photoVersion}`} alt="Your profile" onError={() => setMissingPhoto(true)} />}</div>
          <div><h1>{String(data.person.display_name)}</h1><p>{names(data.roles)}</p><p>{names(data.msps)}</p></div>
          <label className="secondary personal-photo-upload">{uploading ? 'Uploading…' : 'Change photo'}<input type="file" accept="image/jpeg,image/png" disabled={uploading} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
        </div>
      </section>
      {workspace.session?<ProfileActivity key={workspace.session.user.id} request={workspace.request} roles={workspace.session.user.roles} workspace={workspace.session.user.workspace??'operations'} offset={-new Date().getTimezoneOffset()} metrics={{resolvedToday:Number(data.resolved.find(row=>row.day===today)?.resolved??0),average30:(total30/30).toFixed(1),openAssigned:Number(data.workload.open),qa:data.qa.rating_percent==null?'Not rated':`${Math.round(Number(data.qa.rating_percent))}%`}}/>:null}
      <div className="personal-profile-columns">
        <section className="panel"><h2>Personal information</h2><dl className="personal-profile-details">
          {[['Email', data.person.email], ['Role', names(data.roles)], ['MSP access', names(data.msps)], ['Departments', names(data.departments)], ['Account created', formatApiDate(data.person.created_at)], ['Status', 'Active']].map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{String(value ?? 'Not recorded')}</dd></div>)}
        </dl></section>
        <section className="panel"><h2>Tickets resolved by you</h2><p className="personal-profile-help">Daily counts for the last 14 days, in your local time. Each ticket is counted once per day.</p>
          <div className="personal-resolution-chart" role="img" aria-label={days.map(day => `${day.label}: ${day.count}`).join('; ')}>{days.map(day => <div key={day.key} title={`${day.label}: ${day.count} resolved`}><strong>{day.count}</strong><span style={{ height: `${Math.max(2, day.count / max * 110)}px` }} /><small>{day.label}</small></div>)}</div>
          <p className="personal-profile-help">{total30} daily resolutions in the last 30 days. QA average uses the latest rated review per ticket, credited to its assignee at review time.</p>
        </section>
      </div>
      <section className="panel personal-profile-work"><h2>Current workload</h2><p>In progress: <strong>{Number(data.workload.in_progress)}</strong> · Waiting: <strong>{Number(data.workload.waiting)}</strong> · Rated tickets: <strong>{Number(data.qa.reviewed_tickets)}</strong></p></section>
    </div>}
  </WorkspaceFrame>;
}
