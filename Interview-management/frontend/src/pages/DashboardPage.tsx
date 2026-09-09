import { PageShell } from "../components/PageShell";
import { RequirementReport } from "../components/RequirementReport";

export function DashboardPage() {
  return (
    <PageShell title="Dashboard">
      <RequirementReport />
    </PageShell>
  );
}
