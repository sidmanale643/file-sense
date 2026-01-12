import type { SearchResult, FilePreviewData, SearchOptions, Folder, FolderNode, FolderStats, IndexStats, IndexedFile } from '../types';

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

// ========== Folder Management API Functions ==========

export async function getFolders(): Promise<Folder[]> {
    const response = await fetch(`${API_BASE}/folders`);

    if (!response.ok) {
        throw new Error(`Failed to fetch folders: ${response.statusText}`);
    }

    return response.json();
}

export async function addFolder(path: string, recursive: boolean = false): Promise<{ success: boolean; inserted: number; folder: string; recursive: boolean }> {
    const response = await fetch(`${API_BASE}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, recursive }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `Failed to add folder: ${response.statusText}`);
    }

    return response.json();
}

export async function deleteFolder(path: string): Promise<{ success: boolean; removed: number; folder: string }> {
    const response = await fetch(`${API_BASE}/folders/${encodeURIComponent(path)}`, {
        method: 'DELETE',
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `Failed to delete folder: ${response.statusText}`);
    }

    return response.json();
}

export async function getFolderTree(): Promise<FolderNode[]> {
    const response = await fetch(`${API_BASE}/folders/tree`);

    if (!response.ok) {
        throw new Error(`Failed to fetch folder tree: ${response.statusText}`);
    }

    return response.json();
}

export async function getFolderFiles(
    path: string,
    limit?: number,
    offset: number = 0
): Promise<{ files: IndexedFile[]; total: number; limit?: number; offset: number }> {
    const url = new URL(`${API_BASE}/folders/${encodeURIComponent(path)}/files`);
    if (limit !== undefined) {
        url.searchParams.set('limit', limit.toString());
    }
    url.searchParams.set('offset', offset.toString());

    const response = await fetch(url.toString());

    if (!response.ok) {
        throw new Error(`Failed to fetch folder files: ${response.statusText}`);
    }

    return response.json();
}

export async function getFolderStats(path: string): Promise<FolderStats> {
    const response = await fetch(`${API_BASE}/folders/${encodeURIComponent(path)}/stats`);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `Failed to fetch folder stats: ${response.statusText}`);
    }

    return response.json();
}

export async function getIndexStats(): Promise<IndexStats> {
    const response = await fetch(`${API_BASE}/index_stats`);

    if (!response.ok) {
        throw new Error(`Failed to fetch index stats: ${response.statusText}`);
    }

    return response.json();
}

export async function reindexFolder(
    path: string,
    recursive?: boolean
): Promise<{ success: boolean; inserted: number; folder: string; recursive: boolean }> {
    const response = await fetch(`${API_BASE}/folders/${encodeURIComponent(path)}/reindex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recursive !== undefined ? { path, recursive } : {}),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `Failed to reindex folder: ${response.statusText}`);
    }

    return response.json();
}

export async function clearIndex(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/index/clear`, {
        method: 'POST',
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `Failed to clear index: ${response.statusText}`);
    }

    return response.json();
}
