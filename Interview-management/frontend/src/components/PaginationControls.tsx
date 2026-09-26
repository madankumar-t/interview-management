const PAGE_SIZES = [10, 20, 50, 100] as const;

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export function PaginationControls({ page, pageSize, total, onPageChange, onPageSizeChange }: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstRecord = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRecord = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2">
        <label htmlFor="page-size">Rows per page</label>
        <select
          id="page-size"
          aria-label="Rows per page"
          className="rounded border px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        <span>{firstRecord === 0 ? "0 records" : `${firstRecord}-${lastRecord} of ${total}`}</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
        <span>Page {page} of {totalPages}</span>
        <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}