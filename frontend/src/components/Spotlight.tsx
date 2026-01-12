import { useCallback, useState, useEffect, useRef } from 'react';
import { useSearch } from '../hooks/useSearch';
import { useKeyboardNav } from '../hooks/useKeyboardNav';
import { useGlobalShortcuts } from '../hooks/useGlobalShortcuts';
import { openFile, openFolder } from '../services/api';
import { SearchInput, type SearchInputRef } from './SearchInput';
import { ResultsList } from './ResultsList';
import { FilePreview } from './FilePreview';
import { FilterPanel } from './FilterPanel';
import { IndexManager } from './IndexManager';
import TrueFocus from './TrueFocus';
import PixelSnow from './PixelSnow';
import type { SearchResult, SearchOptions } from '../types';
import './Spotlight.css';

type Theme = 'matrix' | 'minimal';

export function Spotlight() {
    const searchInputRef = useRef<SearchInputRef>(null);
    const [showPreview, setShowPreview] = useState(true);
    const [showFilters, setShowFilters] = useState(false);
    const [showIndexManager, setShowIndexManager] = useState(false);
    const [filters, setFilters] = useState<SearchOptions>({});
    const [theme, setTheme] = useState<Theme>(() => {
        const saved = localStorage.getItem('filesense-theme');
        return (saved === 'minimal' || saved === 'matrix') ? saved : 'matrix';
    });
    const { query, setQuery, results, isLoading, error, clearSearch, searchInsideFiles, setSearchInsideFiles } = useSearch(filters);


    // Apply theme to document and persist to localStorage
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('filesense-theme', theme);
    }, [theme]);

    const toggleTheme = useCallback(() => {
        setTheme(prev => prev === 'matrix' ? 'minimal' : 'matrix');
    }, []);

    // Global keyboard shortcuts
    useGlobalShortcuts({
        onFocusSearch: useCallback(() => {
            searchInputRef.current?.focus();
        }, []),
        onClear: useCallback(() => {
            clearSearch();
        }, [clearSearch]),
        onTogglePreview: useCallback(() => {
            if (results.length > 0) {
                setShowPreview(prev => !prev);
            }
        }, [results.length]),
        onToggleIndexManager: useCallback(() => {
            setShowIndexManager(prev => {
                const newValue = !prev;
                // Close filters if opening index manager
                if (newValue) {
                    setShowFilters(false);
                }
                return newValue;
            });
        }, []),
        enabled: true,
    });

    const handleOpenFile = useCallback(async (result: SearchResult) => {
        if (result.path) {
            try {
                await openFile(result.path);
            } catch (err) {
                console.error('Failed to open file:', err);
            }
        }
    }, []);

    const handleOpenFolder = useCallback(async (result: SearchResult) => {
        if (result.path) {
            try {
                await openFolder(result.path);
            } catch (err) {
                console.error('Failed to open folder:', err);
            }
        }
    }, []);

    const { selectedIndex, setSelectedIndex, handleKeyDown } = useKeyboardNav({
        itemCount: results.length,
        onAction: (index) => {
            if (results[index]) {
                handleOpenFile(results[index]);
            }
        },
        onSecondaryAction: (index) => {
            if (results[index]) {
                handleOpenFolder(results[index]);
            }
        },
        onEscape: () => {
            if (query) {
                clearSearch();
            }
        },
        enabled: results.length > 0,
    });

    const selectedResult = results[selectedIndex] || null;

    return (
        <div className="spotlight">
            <PixelSnow
                className="spotlight__backdrop"
                color={theme === 'matrix' ? '#00ff41' : '#ffffff'}
                flakeSize={0.008}
                minFlakeSize={1.0}
                pixelResolution={150}
                speed={0.8}
                depthFade={6}
                farPlane={15}
                brightness={theme === 'matrix' ? 0.6 : 0.3}
                gamma={0.6}
                density={0.25}
                variant="snowflake"
                direction={125}
            />

            <div className={`spotlight__container ${showPreview ? 'spotlight__container--with-preview' : ''}`}>
                <div className="spotlight__inner">
                    <div className="spotlight__main">
                    <div className="spotlight__title">
                        <TrueFocus
                            sentence="FILE SENSE"
                            separator=" "
                            manualMode={false}
                            blurAmount={3}
                            borderColor="#ffffff"
                            glowColor="rgba(255, 255, 255, 0.6)"
                            animationDuration={0.4}
                            pauseBetweenAnimations={0.8}
                        />
                    </div>
                    <button
                        className="spotlight__theme-toggle"
                        onClick={toggleTheme}
                        title={theme === 'matrix' ? 'Switch to minimal theme' : 'Switch to matrix theme'}
                    >
                        {theme === 'matrix' ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="5"/>
                                <line x1="12" y1="1" x2="12" y2="3"/>
                                <line x1="12" y1="21" x2="12" y2="23"/>
                                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                                <line x1="1" y1="12" x2="3" y2="12"/>
                                <line x1="21" y1="12" x2="23" y2="12"/>
                                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                            </svg>
                        ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                            </svg>
                        )}
                    </button>
                    <SearchInput
                        ref={searchInputRef}
                        value={query}
                        onChange={setQuery}
                        onKeyDown={handleKeyDown}
                        isLoading={isLoading}
                        placeholder="Search files..."
                    />

                    {error && (
                        <div className="spotlight__error">
                            <p>{error}</p>
                        </div>
                    )}

                    <ResultsList
                        results={results}
                        selectedIndex={selectedIndex}
                        onSelect={setSelectedIndex}
                        onOpen={handleOpenFile}
                        isLoading={isLoading}
                        query={query}
                    />

                    <div className="spotlight__footer">
                        <span className="spotlight__hint">
                            <kbd>/</kbd> Focus
                        </span>
                        <span className="spotlight__hint">
                            <kbd>↑</kbd><kbd>↓</kbd> Navigate
                        </span>
                        <span className="spotlight__hint">
                            <kbd>↵</kbd> Open
                        </span>
                        <span className="spotlight__hint">
                            <kbd>⌘</kbd><kbd>K</kbd> Clear
                        </span>
                        {results.length > 0 && (
                            <span className="spotlight__hint">
                                <kbd>Space</kbd> Preview
                            </span>
                        )}
                        <button
                            className={`spotlight__mode-toggle ${searchInsideFiles ? 'active' : ''}`}
                            onClick={() => setSearchInsideFiles(!searchInsideFiles)}
                            title={searchInsideFiles ? 'Switch to filename search' : 'Switch to content search'}
                        >
                            <span className="spotlight__mode-toggle-icon">
                                {searchInsideFiles ? '📄' : '📁'}
                            </span>
                            <span className="spotlight__mode-toggle-text">
                                {searchInsideFiles ? 'Inside Files' : 'Filenames'}
                            </span>
                        </button>
                        {results.length > 0 && (
                            <button
                                className="spotlight__preview-toggle"
                                onClick={() => setShowPreview(!showPreview)}
                                title={showPreview ? 'Hide preview' : 'Show preview'}
                            >
                                {showPreview ? 'Hide Preview' : 'Show Preview'}
                            </button>
                        )}
                        <button
                            className={`spotlight__filter-toggle ${showFilters ? 'active' : ''}`}
                            onClick={() => {
                                setShowFilters(prev => {
                                    const newValue = !prev;
                                    // Close index manager if opening filters
                                    if (newValue) {
                                        setShowIndexManager(false);
                                    }
                                    return newValue;
                                });
                            }}
                            title="Toggle filters"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                            Filters
                        </button>
                        <button
                            className={`spotlight__index-toggle ${showIndexManager ? 'active' : ''}`}
                            onClick={() => {
                                setShowIndexManager(prev => {
                                    const newValue = !prev;
                                    // Close filters if opening index manager
                                    if (newValue) {
                                        setShowFilters(false);
                                    }
                                    return newValue;
                                });
                            }}
                            title="Toggle index manager"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
                            </svg>
                            Index
                        </button>
                    </div>
                </div>
                </div>

                {results.length > 0 && showPreview && (
                    <div className="spotlight__preview">
                        <FilePreview result={selectedResult} />
                    </div>
                )}

                {showFilters && (
                    <div className="spotlight__filters">
                        <FilterPanel
                            filters={filters}
                            onFiltersChange={setFilters}
                            onClear={() => setFilters({})}
                            onClose={() => setShowFilters(false)}
                        />
                    </div>
                )}

                {showIndexManager && (
                    <div className="spotlight__index-manager">
                        <IndexManager onClose={() => setShowIndexManager(false)} />
                    </div>
                )}
            </div>
        </div>
    );
}
