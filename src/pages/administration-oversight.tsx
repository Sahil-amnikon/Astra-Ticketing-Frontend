import Link from '../navigation/link';

export default function AdministrationOversight() {
  return (
    <section className="panel administration-oversight" aria-label="Administration oversight">
      <h2>Service administration</h2>
      <p>
        Create and manage tickets and review their history. Manage categories,
        access, SLAs and change policy in Service administration.
      </p>
      <Link className="secondary" href="/admin/service-management">
        Service administration
      </Link>
    </section>
  );
}
