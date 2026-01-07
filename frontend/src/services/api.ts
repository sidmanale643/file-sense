import type { SearchResult, FilePreviewData, SearchOptions } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function hybridSearch(
    query: string,
    options: SearchOptions = {},
    signal?: AbortSignal
): Promise<SearchResult[]> {
    const response = await fetch(`${API_BASE}/hybrid_search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query,
            k: options.k ?? 10,
            alpha: options.alpha ?? 0.5,
            deduplicate: options.deduplicate ?? true,
            rerank: options.rerank ?? false,
        }),
        signal,
    });

    if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
    }

    return response.json();
}

export async function previewFile(path: string): Promise<FilePreviewData> {
    const response = await fetch(`${API_BASE}/preview_file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
    });

    if (!response.ok) {
        throw new Error(`Preview failed: ${response.statusText}`);
    }

    return response.json();
}

export async function openFile(path: string): Promise<void> {
    const response = await fetch(`${API_BASE}/open_file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
    });

    if (!response.ok) {
        throw new Error(`Open file failed: ${response.statusText}`);
    }
}

export async function openFolder(path: string): Promise<void> {
    const response = await fetch(`${API_BASE}/open_folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
    });

    if (!response.ok) {
        throw new Error(`Open folder failed: ${response.statusText}`);
    }
}

export async function filenameSearch(
    query: string,
    signal?: AbortSignal
): Promise<SearchResult[]> {
    const response = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query,
            is_path: false,
            k: 10,
            use_regex: false,
        }),
        signal,
    });

    if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
    }

    return response.json();
}
