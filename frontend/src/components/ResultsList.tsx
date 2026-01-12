import { useRef, useEffect, useMemo } from 'react';
import type { SearchResult } from '../types';
import { ResultItem } from './ResultItem';
import './ResultsList.css';

interface ResultsListProps {
    results: SearchResult[];
    selectedIndex: number;
    onSelect: (index: number) => void;
    onOpen: (result: SearchResult) => void;
    isLoading: boolean;
    query: string;
}

export function ResultsList({
    results,
    selectedIndex,
    onSelect,
    onOpen,
    isLoading,
    query,
}: ResultsListProps) {
    const listRef = useRef<HTMLDivElement>(null);

    // Generate animation version key based on query to trigger re-animation on new searches
    const animationVersion = useMemo(() => ({
        query,
        timestamp: Date.now(),
    }), [query]);

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current) {
            const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
            selectedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [selectedIndex]);

    // Empty state
    if (!query.trim()) {
        return (
            <div className="results-list results-list--empty">
                <div className="results-list__hint">
                    <span className="results-list__hint-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                    </span>
                    <p>Type to search your files</p>
                    <p className="results-list__hint-sub">Semantic search across all indexed documents</p>
                </div>
            </div>
        );
    }

    // Loading state
    if (isLoading && results.length === 0) {
        return (
            <div className="results-list results-list--loading">
                <div className="results-list__loader">
                    <div className="results-list__loader-dot" />
                    <div className="results-list__loader-dot" />
                    <div className="results-list__loader-dot" />
                </div>
            </div>
        );
    }

    // No results
    if (!isLoading && results.length === 0) {
        return (
            <div className="results-list results-list--empty">
                <div className="results-list__no-results">
                    <p>No results for "{query}"</p>
                    <p className="results-list__hint-sub">Try a different search term</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="results-list__count">
                {results.length} {results.length === 1 ? 'result' : 'results'} found
            </div>
            <div className="results-list" ref={listRef} role="listbox">
                {results.map((result, index) => (
                <ResultItem
                    key={`${result.id || result.path || index}-${animationVersion.timestamp}`}
                    result={result}
                    isSelected={index === selectedIndex}
                    index={index}
                    onClick={() => onSelect(index)}
                    onDoubleClick={() => onOpen(result)}
                />
            ))}
            </div>
        </>
    );
}
