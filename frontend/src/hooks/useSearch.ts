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

            // Apply client-side filters
            const filteredResults = searchResults.filter((result) => {
                // File type filter
                if (options.fileTypes && options.fileTypes.length > 0) {
                    const rawFileType = result.metadata?.file_type?.toLowerCase() || '';

                    // Handle MIME types (e.g., "application/pdf" -> "pdf")
                    let fileType = rawFileType;
                    if (rawFileType.includes('/')) {
                        fileType = rawFileType.split('/').pop() || rawFileType;
                    } else {
                        // Handle extensions with dots (e.g., ".pdf" -> "pdf")
                        fileType = rawFileType.replace('.', '');
                    }

                    if (!fileType || !options.fileTypes.includes(fileType)) {
                        return false;
                    }
                }

                // File size filter
                const fileSize = result.metadata?.file_size || 0;
                if (options.minSize !== undefined && fileSize < options.minSize) {
                    return false;
                }
                if (options.maxSize !== undefined && fileSize > options.maxSize) {
                    return false;
                }

                // Date range filter - only apply if dates are actually set (non-empty)
                const dateFrom = options.dateFrom?.trim();
                const dateTo = options.dateTo?.trim();

                if (dateFrom || dateTo) {
                    const modifiedDate = result.metadata?.modified_date;

                    // If the result has no modified_date, we can't filter by date - include it anyway
                    // This handles files indexed before the modified_date column was added
                    if (!modifiedDate) {
                        return true; // Include results without dates when date filter is active
                    }

                    const fileDate = new Date(modifiedDate);

                    if (dateFrom) {
                        const fromDate = new Date(dateFrom);
                        fromDate.setHours(0, 0, 0, 0); // Start of the day
                        if (fileDate < fromDate) {
                            return false;
                        }
                    }

                    if (dateTo) {
                        const toDate = new Date(dateTo);
                        toDate.setHours(23, 59, 59, 999); // End of the day
                        if (fileDate > toDate) {
                            return false;
                        }
                    }
                }

                return true;
            });

            setResults(filteredResults);
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
    }, [debouncedQuery, searchInsideFiles, options]); // Re-run when search mode or filters change

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
