import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { openFile, openFolder, previewFile, runSearch } from './api';
import type { FilePreview, SearchResult } from './types';

const formatScore = (score?: number) => {
  if (score === undefined || score === null) return '';
  return score.toFixed(3);
};

type RecentFile = {
  name: string;
  path: string;
  icon: string;
  accent: string;
};

type FileType = 'doc' | 'sheet' | 'image' | 'code' | 'other';

const formatBytes = (size?: unknown) => {
  if (typeof size !== 'number' || Number.isNaN(size)) return '';
  if (size === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const num = size / 1024 ** exponent;
  return `${num.toFixed(num >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightText = (text: string, term: string) => {
  if (!term.trim()) return text;
  const regex = new RegExp(escapeRegExp(term), 'gi');
  const parts = text.split(regex);
  const matches = text.match(regex) || [];

  return parts.flatMap((part, idx) => {
    const match = matches[idx];
    return [
      <span key={`part-${idx}`}>{part}</span>,
      match ? (
        <mark className="highlight" key={`match-${idx}`}>
          {match}
        </mark>
      ) : null,
    ].filter(Boolean);
  });
};

const getFileName = (path?: string) => {
  if (!path) return 'Unknown file';
  const parts = path.split(/[\\/]/);
  return parts.pop() || 'Unknown file';
};

const getFileType = (path?: string): FileType => {
  if (!path) return 'other';
  const ext = path.split('.').pop()?.toLowerCase();
  if (!ext) return 'other';

  if (['doc', 'docx', 'pdf', 'txt', 'md', 'rtf'].includes(ext)) return 'doc';
  if (['xls', 'xlsx', 'csv', 'tsv', 'ods'].includes(ext)) return 'sheet';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) return 'image';
  if (
    ['js', 'ts', 'tsx', 'jsx', 'py', 'go', 'java', 'rb', 'php', 'c', 'cpp', 'h', 'cs', 'rs', 'swift', 'kt', 'm', 'sh', 'pl'].includes(
      ext
    )
  )
    return 'code';

  return 'other';
};

const getFileIcon = (type: FileType) => {
  switch (type) {
    case 'doc':
      return { symbol: '📄', className: 'doc' };
    case 'sheet':
      return { symbol: '📊', className: 'sheet' };
    case 'image':
      return { symbol: '🖼️', className: 'image' };
    case 'code':
      return { symbol: '💻', className: 'code' };
    default:
      return { symbol: '📁', className: 'other' };
  }
};

type PreviewMode = 'text' | 'pdf' | 'image' | 'binary';

const detectPreviewMode = (contentType?: string | null): PreviewMode => {
  const type = contentType?.toLowerCase() ?? '';
  if (!type) return 'text';
  if (type.includes('pdf')) return 'pdf';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('text/') || type.includes('json') || type.includes('xml')) return 'text';
  return 'binary';
};

const buildDataUrl = (contentType?: string | null, base64?: string | null): string | null => {
  if (!base64) return null;
  const type = (contentType ?? '').trim() || 'application/octet-stream';
  return `data:${type};base64,${base64}`;
};

export default function App() {
  const recentFiles: RecentFile[] = [
    { name: 'Project Brief.pdf', path: '/docs/Project Brief.pdf', icon: '📄', accent: 'g1' },
    { name: 'Q4 Forecast.xlsx', path: '/finance/Q4 Forecast.xlsx', icon: '📊', accent: 'g2' },
    { name: 'Design Mock.png', path: '/design/Mock.png', icon: '🖼️', accent: 'g3' },
    { name: 'api.ts', path: '/src/api.ts', icon: '💻', accent: 'g4' },
    { name: 'notes.md', path: '/notes/meeting-notes.md', icon: '📄', accent: 'g5' },
    { name: 'users.csv', path: '/exports/users.csv', icon: '📊', accent: 'g6' },
  ];

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewTruncated, setPreviewTruncated] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('text');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const hasQuery = useMemo(() => query.trim().length > 0, [query]);
  const panelTitle = useMemo(() => {
    if (results.length) return `${results.length} matches`;
    if (hasQuery && !loading && !error) return 'No matches yet';
    return 'Type to search your files…';
  }, [results.length, hasQuery, loading, error]);

  const searchNow = useCallback(
    async (term: string, hybrid: boolean) => {
      if (!term.trim()) {
        setResults([]);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await runSearch(term, hybrid);
        setResults(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Request failed';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      searchNow(query, false);
    },
    [query, searchNow]
  );

  const onSearchInside = useCallback(() => {
    searchNow(query, true);
  }, [query, searchNow]);

  const handleOpen = useCallback(
    async (path?: string) => {
      if (!path) {
        setError('No file path to open');
        return;
      }

      try {
        setError(null);
        await openFile(path);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to open file';
        setError(message);
      }
    },
    [setError]
  );

  const handleOpenFolder = useCallback(
    async (path?: string) => {
      if (!path) {
        setError('No folder to open');
        return;
      }
      try {
        setError(null);
        await openFolder(path);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to open folder';
        setError(message);
      }
    },
    [setError]
  );

  const handleCopyPath = useCallback(
    async (path?: string) => {
      if (!path) {
        setError('No path to copy');
        return;
      }
      try {
        await navigator.clipboard.writeText(path);
        setCopiedPath(path);
        setTimeout(() => setCopiedPath((current) => (current === path ? null : current)), 1500);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to copy path';
        setError(message);
      }
    },
    [setError]
  );

  const handlePreview = useCallback(
    async (path?: string) => {
      if (!path) {
        setPreviewError('No file path to preview');
        return;
      }
      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewContent('');
      setPreviewTruncated(false);
      setPreviewDataUrl(null);
      setPreviewMime(null);
      setPreviewMode('text');
      setPreviewPath(path);
      try {
        const data = await previewFile(path);
        const contentType = (data as FilePreview).contentType || (data as FilePreview).content_type || null;
        const directDataUrl = (data as FilePreview).dataUrl || (data as FilePreview).data_url || null;
        const base64 = (data as FilePreview).dataBase64 || (data as FilePreview).data_base64 || null;
        const inlineDataUrl = directDataUrl || buildDataUrl(contentType, base64);
        const mode = detectPreviewMode(contentType);

        setPreviewPath(data.path || path);
        setPreviewMime(contentType);
        setPreviewMode(mode);
        setPreviewDataUrl(inlineDataUrl);
        setPreviewContent(data.content || (mode === 'text' ? '(empty file)' : ''));
        setPreviewTruncated(Boolean(data.truncated));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load preview';
        setPreviewError(message);
      } finally {
        setPreviewLoading(false);
      }
    },
    []
  );

  const closePreview = useCallback(() => {
    setPreviewPath(null);
    setPreviewContent('');
    setPreviewTruncated(false);
    setPreviewError(null);
    setPreviewDataUrl(null);
    setPreviewMime(null);
    setPreviewMode('text');
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setSpotlightOpen(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [results.length]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const input = document.getElementById('search-box') as HTMLInputElement | null;
      const isInputFocused = document.activeElement === input || document.activeElement === document.body;
      if (!isInputFocused) return;
      if (!results.length) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((prev) => {
          if (prev === -1) return 0;
          return prev + 1 >= results.length ? 0 : prev + 1;
        });
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prev) => {
          if (prev === -1) return results.length - 1;
          return prev - 1 < 0 ? results.length - 1 : prev - 1;
        });
      }

      if (event.key === 'Enter' && selectedIndex >= 0) {
        event.preventDefault();
        const selected = results[selectedIndex];
        handleOpen(selected?.path);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleOpen, results, selectedIndex]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const input = document.getElementById('search-box') as HTMLInputElement | null;
        input?.focus();
        input?.select();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <div className="spotlight">
        <div className="spotlight-window">
          <div className="window-header">
            <div className="brand-badge" aria-label="FileSense brand">
              <span className="brand-icon" aria-hidden>
                ✨
              </span>
              <span className="brand-text">FileSense</span>
            </div>
            <div className="shortcut-hint" aria-label="Keyboard shortcuts">
              <div className="eyebrow">Shortcut</div>
              <div className="hotkey-pill">⌘K</div>
            </div>
          </div>

          <form className={`spotlight-search ${spotlightOpen ? 'is-open' : ''}`} onSubmit={onSubmit}>
            <div className="input-shell">
              <span className="search-icon" aria-hidden>
                🔍
              </span>
              <input
                id="search-box"
                type="text"
                placeholder="Type to search your files…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            <div className="search-actions">
              <button type="button" className="chip toggle" onClick={onSearchInside}>
                Inside files
              </button>
            </div>
          </form>

          <section className="results-shell">
            <div className="results-meta">
              <div className="eyebrow">Results</div>
              <div className="panel-title">{panelTitle}</div>
            </div>

            <div className="results-list">
              {loading && results.length === 0 && (
                <div className="skeletons">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="result-row skeleton-card" aria-hidden="true">
                      <div className="skeleton-line wide" />
                      <div className="skeleton-line" />
                    </div>
                  ))}
                </div>
              )}

              {!hasQuery && !loading && !error && <p className="placeholder-hint">Type to search your files…</p>}

              {hasQuery && results.length === 0 && !loading && !error && (
                <div className="empty recent-empty" role="status">
                  <div className="recent-header">
                    <div className="eyebrow">No results found</div>
                    <div className="recent-title gradient-text">Recent Files</div>
                  </div>
                  <div className="recent-grid" role="list">
                    {recentFiles.map((file) => {
                      const fileType = getFileType(file.path);
                      const fileIcon = getFileIcon(fileType);
                      const typeLabel = fileType === 'other' ? 'File' : fileType;
                      return (
                        <div key={file.path} className={`recent-card ${file.accent}`} role="listitem">
                          <div className="recent-main">
                            <div className={`icon-chip ${file.accent}`} aria-hidden>
                              {fileIcon.symbol}
                            </div>
                            <div className="recent-text">
                              <div className="recent-name">{file.name}</div>
                              <div className="recent-path">{file.path}</div>
                              <div className="recent-meta">
                                <span className="type-pill">{typeLabel}</span>
                                <span className="type-pill faint">Pinned</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="hint-badges" aria-label="Keyboard shortcuts">
                    <span className="hint-badge">⌘K · Focus search</span>
                    <span className="hint-badge">↑ ↓ · Navigate</span>
                    <span className="hint-badge">Enter · Open</span>
                  </div>
                </div>
              )}

              {results.map((result, idx) => {
                const isSelected = selectedIndex === idx;
                const fileType = getFileType(result.path);
                const fileIcon = getFileIcon(fileType);
                const fileName = getFileName(result.path);
                const metadata = (result.metadata ?? {}) as Record<string, unknown>;
                const metaType = typeof metadata.file_type === 'string' ? metadata.file_type : null;
                const metaSize = typeof metadata.file_size === 'number' ? metadata.file_size : null;
                const displaySize = formatBytes(metaSize);
                const snippetText = result.snippet || 'No snippet available.';
                return (
                  <article
                    key={result.id ?? `${idx}-${result.path ?? 'item'}`}
                    className={`result-row ${isSelected ? 'selected' : ''}`}
                    aria-selected={isSelected}
                    tabIndex={0}
                    role="button"
                    onClick={() => handleOpen(result.path)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleOpen(result.path);
                      }
                    }}
                  >
                    <div className="result-main">
                      <div className="file-meta">
                        <span className={`file-icon ${fileIcon.className}`} aria-hidden>
                          {fileIcon.symbol}
                        </span>
                        <div className="file-text">
                          <div className="file-name">{highlightText(fileName, query)}</div>
                          <div className="file-path">{highlightText(result.path ?? 'Unknown path', query)}</div>
                          <div className="file-badges">
                            <span className="type-pill">{metaType || fileType}</span>
                            {displaySize && <span className="type-pill faint">{displaySize}</span>}
                          </div>
                        </div>
                      </div>
                      {formatScore(result.score) && <div className="score">Score {formatScore(result.score)}</div>}
                    </div>
                    <div className={`snippet ${result.snippet ? '' : 'snippet--muted'}`}>{highlightText(snippetText, query)}</div>
                    <div className="result-actions" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpen(result.path);
                        }}
                      >
                        📂 Open
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenFolder(result.path);
                        }}
                      >
                        📁 Open folder
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleCopyPath(result.path);
                        }}
                      >
                        📋 {copiedPath === result.path ? 'Copied' : 'Copy path'}
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handlePreview(result.path);
                        }}
                      >
                        👁️ Preview
                      </button>
                    </div>
                  </article>
                );
              })}

              {error && (
                <div className="empty">
                  <div className="badge warn">Request failed</div>
                  <p>{error}</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {(previewPath || previewLoading) && (
        <div className="preview-overlay" onClick={closePreview} role="presentation">
          <div className="preview-modal" role="dialog" aria-label="File preview" onClick={(event) => event.stopPropagation()}>
            <div className="preview-header">
              <div>
                <div className="eyebrow">Preview</div>
                <div className="preview-title">{previewPath}</div>
              </div>
              <button type="button" className="icon-button" onClick={closePreview}>
                ✖ Close
              </button>
            </div>
            {previewLoading && <div className="preview-status">Loading preview…</div>}
            {previewError && <div className="preview-status warn">{previewError}</div>}
            {!previewLoading && !previewError && (
              <>
                {previewMode === 'pdf' && previewDataUrl && (
                  <object data={previewDataUrl} type={previewMime || 'application/pdf'} className="preview-embed">
                    <div className="preview-status warn">PDF preview is unavailable in this browser.</div>
                  </object>
                )}
                {previewMode === 'image' && previewDataUrl && (
                  <img src={previewDataUrl} alt={`Preview of ${previewPath || 'file'}`} className="preview-image" />
                )}
                {previewMode !== 'text' && !previewDataUrl && (
                  <div className="preview-status">Preview not available for this file type.</div>
                )}
                {previewMode === 'text' && (
                  <pre className="preview-content">
                    {previewContent || '(empty file)'}
                    {previewTruncated && '\n\n…truncated for preview'}
                  </pre>
                )}
                {previewMode !== 'text' && previewTruncated && (
                  <div className="preview-status warn">Preview truncated due to size limits.</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

