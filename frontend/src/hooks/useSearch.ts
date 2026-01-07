import { useState, useCallback, useRef, useEffect } from 'react';
import { hybridSearch, filenameSearch } from '../services/api';
import type { SearchResult, SearchOptions } from '../types';
import { useDebounce } from './useDebounce';

interface UseSearchReturn {
    query: string;
    setQuery: (query: string) => void;
    results: SearchResult[];
    isLoading: boolean;
    error: string | null;
    clearSearch: () => void;
    searchInsideFiles: boolean;
    setSearchInsideFiles: (enabled: boolean) => void;
}

export function useSearch(options: SearchOptions = {}): UseSearchReturn {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchInsideFiles, setSearchInsideFiles] = useState(true); // ON by default

    const abortControllerRef = useRef<AbortController | null>(null);
    const debouncedQuery = useDebounce(query, 200);

    const performSearch = useCallback(async (searchQuery: string) => {
        if (!searchQuery.trim()) {
            setResults([]);
            setError(null);
            return;
        }

        // Cancel any pending request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        abortControllerRef.current = new AbortController();
        setIsLoading(true);
        setError(null);

        try {
            let searchResults: SearchResult[];
            if (searchInsideFiles) {
                searchResults = await hybridSearch(
                    searchQuery,
                    options,
                    abortControllerRef.current.signal
                );
            } else {
                searchResults = await filenameSearch(
                    searchQuery,
                    abortControllerRef.current.signal
                );
            }
            setResults(searchResults);
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                return; // Ignore aborted requests
            }
            setError(err instanceof Error ? err.message : 'Search failed');
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    }, [options, searchInsideFiles]);

    useEffect(() => {
        performSearch(debouncedQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedQuery, searchInsideFiles]); // Re-run when search mode changes

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    const clearSearch = useCallback(() => {
        setQuery('');
        setResults([]);
        setError(null);
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    return {
        query,
        setQuery,
        results,
        isLoading,
        error,
        clearSearch,
        searchInsideFiles,
        setSearchInsideFiles,
    };
}
