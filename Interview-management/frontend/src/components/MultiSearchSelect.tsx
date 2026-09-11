import { ReactNode, useEffect, useRef, useState } from "react";

interface MultiSearchSelectProps<T> {
  label: string;
  placeholder?: string;
  selected: T[];
  onChange: (value: T[]) => void;
  fetchOptions: () => Promise<T[]>;
  getOptionLabel: (option: T) => string;
  getOptionKey: (option: T) => string;
  renderOption?: (option: T) => ReactNode;
  required?: boolean;
  helperText?: string;
}

export function MultiSearchSelect<T>({
  label,
  placeholder,
  selected,
  onChange,
  fetchOptions,
  getOptionLabel,
  getOptionKey,
  renderOption,
  required,
  helperText,
}: MultiSearchSelectProps<T>) {
  const [query, setQuery] = useState("");
  const [allOptions, setAllOptions] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!open || loadedRef.current) {
      return;
    }
    loadedRef.current = true;
    setLoading(true);
    fetchOptions()
      .then(setAllOptions)
      .finally(() => setLoading(false));
  }, [open, fetchOptions]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedKeys = new Set(selected.map(getOptionKey));
  const filtered = allOptions.filter((option) => getOptionLabel(option).toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative" ref={containerRef}>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <div
        className="flex flex-wrap gap-1 rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
        onClick={() => setOpen(true)}
      >
        {selected.map((option) => (
          <span
            key={getOptionKey(option)}
            className="flex items-center gap-1 rounded-full bg-sky-100 px-2 py-1 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-200"
          >
            {getOptionLabel(option)}
            <button
              type="button"
              className="text-sky-600 hover:text-sky-900"
              onClick={(event) => {
                event.stopPropagation();
                onChange(selected.filter((item) => getOptionKey(item) !== getOptionKey(option)));
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="min-w-[8rem] flex-1 border-none bg-transparent p-1 text-sm outline-none"
          placeholder={selected.length === 0 ? placeholder : ""}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
      </div>
      {helperText && <p className="mt-1 text-xs text-slate-500">{helperText}</p>}
      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-slate-300 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {loading && <p className="p-2 text-sm text-slate-500">Loading…</p>}
          {!loading && filtered.length === 0 && <p className="p-2 text-sm text-slate-500">No matches found.</p>}
          {!loading &&
            filtered.map((option) => {
              const isSelected = selectedKeys.has(getOptionKey(option));
              return (
                <button
                  type="button"
                  key={getOptionKey(option)}
                  className={`block w-full p-2 text-left text-sm hover:bg-sky-50 dark:hover:bg-slate-800 ${
                    isSelected ? "bg-sky-50 dark:bg-slate-800" : ""
                  }`}
                  onClick={() => {
                    if (isSelected) {
                      onChange(selected.filter((item) => getOptionKey(item) !== getOptionKey(option)));
                    } else {
                      onChange([...selected, option]);
                    }
                    setQuery("");
                  }}
                >
                  {isSelected ? "✓ " : ""}
                  {renderOption ? renderOption(option) : getOptionLabel(option)}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
