"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from "react";
import { searchFiles, type SearchResult } from "@/lib/search";
import styles from "./CommandPalette.module.css";

type CommandPaletteProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function CommandPalette({ isOpen, onOpenChange }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        onOpenChange(true);
      }
      if (key === "escape") {
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange]);

  useEffect(() => {
    if (isOpen) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }

    const reset = setTimeout(() => {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
    }, 0);

    return () => clearTimeout(reset);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      searchFiles(query).then((res) => {
        if (cancelled) return;
        setResults(res);
        setActiveIndex(0);
        setLoading(false);
      });
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, isOpen]);

  const handleSelect = useCallback(
    async (result: SearchResult) => {
      onOpenChange(false);
      const message = `Path copied: ${result.path}`;
      try {
        await navigator.clipboard?.writeText(result.path);
        setStatus(message);
      } catch (error) {
        console.warn("Clipboard unavailable", error);
        setStatus(result.path);
      }
    },
    [onOpenChange],
  );

  const onKeyNav = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((idx) => Math.min(idx + 1, results.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((idx) => Math.max(idx - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = results[activeIndex];
      if (target) handleSelect(target);
    }
  };

  const onBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onOpenChange(false);
    }
  };

  return (
    <div
      className={`${styles.overlay} ${!isOpen ? styles.hidden : ""}`}
      aria-hidden={!isOpen}
      onMouseDown={onBackdropClick}
    >
      <div
        className={styles.container}
        role="dialog"
        aria-modal="true"
        aria-label="Search files"
        onKeyDown={onKeyNav}
      >
        <div className={styles.header}>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search files, paths, or descriptions…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className={styles.statusRow}>
          <span>{results.length ? `${results.length} result${results.length === 1 ? "" : "s"}` : "Type to search"}</span>
          {loading && <span className={styles.loading}>Searching…</span>}
        </div>
        <div className={styles.list}>
          {!loading && results.length === 0 ? (
            <div className={styles.empty}>
              No matches yet. Try keywords like “vector”, “loader”, or “prompt”.
            </div>
          ) : (
            results.map((result, idx) => (
              <button
                key={result.id}
                type="button"
                className={`${styles.result} ${idx === activeIndex ? styles.active : ""}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => handleSelect(result)}
              >
                <div>
                  <div className={styles.resultTitle}>{result.title}</div>
                  <div className={styles.resultPath}>{result.path}</div>
                  <div className={styles.snippet}>{result.snippet}</div>
                  <div className={styles.meta}>
                    {result.tags?.map((tag) => (
                      <span key={tag} className={styles.tag}>
                        {tag}
                      </span>
                    ))}
                    {result.updatedAt && <span className={styles.updated}>Updated {result.updatedAt}</span>}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
        <div className={styles.footer}>
          <div className={styles.shortcutRow}>
            <span className={styles.keycap}>⌘</span>
            <span className={styles.keycap}>K</span>
            <span>or</span>
            <span className={styles.keycap}>Ctrl</span>
            <span className={styles.keycap}>K</span>
          </div>
          <div className={styles.shortcutRow}>
            <span className={styles.keycap}>↑</span>
            <span className={styles.keycap}>↓</span>
            <span className={styles.keycap}>Enter</span>
          </div>
          <div className={styles.status} aria-live="polite">
            {status || "Enter to copy path to clipboard"}
          </div>
        </div>
      </div>
    </div>
  );
}

