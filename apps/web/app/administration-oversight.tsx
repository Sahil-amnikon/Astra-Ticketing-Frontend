import Link from 'next/link';

export default function AdministrationOversight() {
  return (
    <section className="panel" aria-label="Administration oversight">
      <h2>Read-only service oversight</h2>
      <p>
        Review service records and their history here. Manage categories,
        access, SLAs and change policy in Service administration.
      </p>
      <Link className="secondary" href="/admin/service-management">
        Service administration
      </Link>
    </section>
  );
}
