import { ReactNode, useEffect, useRef, useState } from "react";

interface SearchSelectProps<T> {
  label: string;
  placeholder?: string;
  value: T | null;
  onChange: (value: T | null) => void;
  fetchOptions: (query: string) => Promise<T[]>;
  getOptionLabel: (option: T) => string;
  getOptionKey: (option: T) => string;
  renderOption?: (option: T) => ReactNode;
  required?: boolean;
  helperText?: string;
}

export function SearchSelect<T>({
  label,
  placeholder,
  value,
  onChange,
  fetchOptions,
  getOptionLabel,
  getOptionKey,
  renderOption,
  required,
  helperText,
}: SearchSelectProps<T>) {
  const [query, setQuery] = useState(value ? getOptionLabel(value) : "");
  const [options, setOptions] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      setQuery(getOptionLabel(value));
    }
  }, [value, getOptionLabel]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    setLoading(true);
    const handle = setTimeout(() => {
      fetchOptions(query)
        .then((results) => {
          if (active) {
            setOptions(results);
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query, open, fetchOptions]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <input
        className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
        placeholder={placeholder}
        value={query}
        required={required}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (value) {
            onChange(null);
          }
        }}
      />
      {helperText && <p className="mt-1 text-xs text-slate-500">{helperText}</p>}
      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-slate-300 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {loading && <p className="p-2 text-sm text-slate-500">Searching…</p>}
          {!loading && options.length === 0 && <p className="p-2 text-sm text-slate-500">No matches found.</p>}
          {!loading &&
            options.map((option) => (
              <button
                type="button"
                key={getOptionKey(option)}
                className="block w-full p-2 text-left text-sm hover:bg-sky-50 dark:hover:bg-slate-800"
                onClick={() => {
                  onChange(option);
                  setQuery(getOptionLabel(option));
                  setOpen(false);
                }}
              >
                {renderOption ? renderOption(option) : getOptionLabel(option)}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
