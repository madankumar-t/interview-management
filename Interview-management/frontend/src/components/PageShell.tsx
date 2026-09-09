import { PropsWithChildren } from "react";

export function PageShell({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-sky-800 dark:text-sky-300">{title}</h2>
      <div className="rounded border border-sky-200 bg-white p-4 shadow-sm dark:border-sky-900 dark:bg-slate-950">{children}</div>
    </section>
  );
}
