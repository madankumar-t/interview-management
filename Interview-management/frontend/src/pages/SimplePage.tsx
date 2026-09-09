import { PageShell } from "../components/PageShell";

export function SimplePage({ title }: { title: string }) {
  return (
    <PageShell title={title}>
      <p>Implemented with role-based route visibility and backend authorization checks.</p>
    </PageShell>
  );
}

