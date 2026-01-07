import { useCallback, useState } from 'react';
import { useSearch } from '../hooks/useSearch';
import { useKeyboardNav } from '../hooks/useKeyboardNav';
import { openFile, openFolder } from '../services/api';
import { SearchInput } from './SearchInput';
import { ResultsList } from './ResultsList';
import { FilePreview } from './FilePreview';
import type { SearchResult } from '../types';
import './Spotlight.css';

export function Spotlight() {
    const { query, setQuery, results, isLoading, error, clearSearch, searchInsideFiles, setSearchInsideFiles } = useSearch();
    const [showPreview, setShowPreview] = useState(true);

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
            <div className="spotlight__backdrop" />

            <div className="spotlight__container">
                <div className="spotlight__main">
                    <div className="spotlight__title">
                        <h1>FileSense</h1>
                    </div>
                    <SearchInput
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
                            <kbd>↑</kbd><kbd>↓</kbd> Navigate
                        </span>
                        <span className="spotlight__hint">
                            <kbd>↵</kbd> Open
                        </span>
                        <span className="spotlight__hint">
                            <kbd>⌘</kbd><kbd>↵</kbd> Reveal
                        </span>
                        <span className="spotlight__hint">
                            <kbd>esc</kbd> Clear
                        </span>
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
                    </div>
                </div>

                {results.length > 0 && showPreview && (
                    <div className="spotlight__preview">
                        <FilePreview result={selectedResult} />
                    </div>
                )}
            </div>
        </div>
    );
}
