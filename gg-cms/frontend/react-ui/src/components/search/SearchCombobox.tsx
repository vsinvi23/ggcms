import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Clock, FileText, Folder, Hash, Search, TrendingUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { MIN_SUGGEST_LENGTH, useSearchSuggest } from '@/api/hooks/usePublicSearch';
import { addRecentSearch, clearRecentSearches, getRecentSearches } from '@/lib/recentSearches';

type OptionKind = 'search' | 'recent' | 'query' | 'article' | 'course' | 'topic' | 'category';

interface ComboOption {
  id: string;
  kind: OptionKind;
  group: string;
  label: string;
  to?: string;
  query?: string;
}

const KIND_ICON: Record<OptionKind, typeof Search> = {
  search: Search,
  recent: Clock,
  query: TrendingUp,
  article: FileText,
  course: BookOpen,
  topic: Hash,
  category: Folder,
};

interface SearchComboboxProps {
  initialValue?: string;
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
  /** Render the listbox in normal flow (modal) instead of an absolute dropdown. */
  inline?: boolean;
  className?: string;
  inputClassName?: string;
  /** Called with the final query instead of navigating to /search?q=. */
  onSearch?: (query: string) => void;
  /** Called after any navigation or search so a host (modal) can close. */
  onDone?: () => void;
}

export function SearchCombobox({
  initialValue = '',
  placeholder = 'Search courses, articles, topics...',
  label = 'Search',
  autoFocus = false,
  inline = false,
  className,
  inputClassName,
  onSearch,
  onDone,
}: SearchComboboxProps) {
  const navigate = useNavigate();
  const baseId = useId();
  const listId = `${baseId}-list`;
  const [value, setValue] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>(() => getRecentSearches());
  const inputRef = useRef<HTMLInputElement>(null);

  const term = value.trim();
  const debounced = useDebouncedValue(term, 200);
  const suggestActive = debounced.length >= MIN_SUGGEST_LENGTH && term.length >= MIN_SUGGEST_LENGTH;
  const { data, isFetching, isError } = useSearchSuggest(debounced, 5);
  const suggest = suggestActive ? data : undefined;

  const options = useMemo<ComboOption[]>(() => {
    const out: ComboOption[] = [];
    if (term) out.push({ id: 'search', kind: 'search', group: 'Search', label: `Search for “${term}”`, query: term });
    if (term.length < MIN_SUGGEST_LENGTH) {
      recent.forEach((r, i) => out.push({ id: `recent-${i}`, kind: 'recent', group: 'Recent searches', label: r, query: r }));
      return out;
    }
    suggest?.titles.forEach((t) =>
      out.push({ id: `title-${t.type}-${t.id}`, kind: t.type, group: 'Courses and articles', label: t.title, to: t.path }),
    );
    suggest?.topics.forEach((t) =>
      out.push({ id: `topic-${t.id}`, kind: 'topic', group: 'Topics', label: t.name, to: `/topics/${encodeURIComponent(t.slug)}` }),
    );
    suggest?.categories.forEach((c) =>
      out.push({ id: `cat-${c.id}`, kind: 'category', group: 'Categories', label: c.name, to: `/search?category=${encodeURIComponent(c.slug)}` }),
    );
    suggest?.queries.forEach((q, i) => out.push({ id: `q-${i}`, kind: 'query', group: 'Popular searches', label: q, query: q }));
    return out;
  }, [term, recent, suggest]);

  const open = options.length > 0 && (inline || (focused && !dismissed));
  const optionIds = options.map((o) => `${baseId}-opt-${o.id}`);
  const safeActive = active < options.length ? active : -1;

  useEffect(() => {
    setActive(-1);
  }, [term, suggest]);

  const submit = (q: string) => {
    const clean = q.trim();
    if (!clean) return;
    setRecent(addRecentSearch(clean));
    if (onSearch) onSearch(clean);
    else navigate(`/search?q=${encodeURIComponent(clean)}`);
    onDone?.();
  };

  const run = (opt: ComboOption) => {
    if (opt.query !== undefined) {
      submit(opt.query);
      return;
    }
    if (opt.to) {
      if (opt.kind === 'article' || opt.kind === 'course') setRecent(addRecentSearch(opt.label));
      navigate(opt.to);
      onDone?.();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (options.length === 0) return;
      e.preventDefault();
      setDismissed(false);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((cur) => (cur < 0 ? (step === 1 ? 0 : options.length - 1) : (cur + step + options.length) % options.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (safeActive >= 0 && open) run(options[safeActive]);
      else submit(value);
    } else if (e.key === 'Escape') {
      if (open && !inline) {
        e.preventDefault();
        setDismissed(true);
        setActive(-1);
      } else if (value) {
        setValue('');
      }
    }
  };

  const loading = suggestActive && isFetching && !suggest;
  const status = !term
    ? recent.length > 0
      ? `${recent.length} recent searches available`
      : ''
    : loading
      ? 'Loading suggestions'
      : isError && suggestActive
        ? 'Suggestions unavailable. Press Enter to search.'
        : `${options.length} ${options.length === 1 ? 'option' : 'options'} available`;

  const groups = options.reduce<{ name: string; items: { opt: ComboOption; index: number }[] }[]>((acc, opt, index) => {
    const last = acc[acc.length - 1];
    if (last && last.name === opt.group) last.items.push({ opt, index });
    else acc.push({ name: opt.group, items: [{ opt, index }] });
    return acc;
  }, []);

  return (
    <div className={cn('relative', className)}>
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && safeActive >= 0 ? optionIds[safeActive] : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          maxLength={200}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            setDismissed(false);
          }}
          onFocus={() => {
            setFocused(true);
            setDismissed(false);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          className={cn(
            'h-9 w-full rounded-xl border border-border bg-background pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring',
            inputClassName,
          )}
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setValue('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>

      <div
        className={cn(
          open || inline ? 'block' : 'hidden',
          inline ? 'mt-2' : 'absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-border bg-popover p-1 shadow-lg',
        )}
      >
        <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="max-h-[340px] overflow-y-auto">
          {groups.map((g) => (
            <li key={g.name} role="presentation">
              <ul role="group" aria-label={g.name}>
                <li role="presentation" className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {g.name}
                </li>
                {g.items.map(({ opt, index }) => {
                  const Icon = KIND_ICON[opt.kind];
                  const selected = index === safeActive;
                  return (
                    <li
                      key={opt.id}
                      id={optionIds[index]}
                      role="option"
                      aria-selected={selected}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => run(opt)}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm',
                        selected ? 'bg-muted text-foreground' : 'hover:bg-muted/60',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 truncate">{opt.label}</span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        {loading && <p className="px-3 py-2 text-xs text-muted-foreground">Loading suggestions…</p>}
        {isError && suggestActive && (
          <p className="px-3 py-2 text-xs text-muted-foreground">Suggestions are unavailable right now. Press Enter to search.</p>
        )}
        {term.length < MIN_SUGGEST_LENGTH && recent.length > 0 && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              clearRecentSearches();
              setRecent([]);
            }}
            className="mt-1 w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Clear recent searches
          </button>
        )}
      </div>
    </div>
  );
}
