export interface SearchResult {
    id: string | null;
    path: string | null;
    snippet: string | null;
    score: number | null;
    metadata: FileMetadata | null;
}

export interface FileMetadata {
    file_name: string;
    file_type: string;
    file_size: number;
    file_hash?: string;  // Optional since not all search methods include it
    modified_date?: string;  // ISO 8601 date string
}

export interface FilePreviewData {
    success: boolean;
    path: string;
    size: number;
    truncated: boolean;
    content: string;
    contentType: string;
    encoding: string;
    dataBase64: string | null;
    dataUrl: string | null;
}

export interface SearchOptions {
    k?: number;
    alpha?: number;
    deduplicate?: boolean;
    rerank?: boolean;
    fileTypes?: string[];
    minSize?: number;
    maxSize?: number;
    dateFrom?: string;
    dateTo?: string;
}

export type FileType = 'pdf' | 'doc' | 'code' | 'text' | 'image' | 'unknown';

export function getFileType(filename: string): FileType {
    const ext = filename.split('.').pop()?.toLowerCase() || '';

    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'doc';
    if (['js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'c', 'cpp', 'h', 'java', 'swift', 'kt', 'css', 'html', 'json', 'yaml', 'yml', 'toml', 'xml', 'sh', 'bash', 'zsh'].includes(ext)) return 'code';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext)) return 'image';
    if (['txt', 'md', 'markdown', 'rst', 'log'].includes(ext)) return 'text';

    return 'unknown';
}

// ========== Folder Management Types ==========

export interface Folder {
    id: number;
    path: string;
    name: string;
    recursive: boolean;
    created_at: string;
    last_indexed: string | null;
    indexed_count: number;
}

export interface FolderNode {
    name: string;
    path: string;
    recursive: boolean;
    indexed_count: number;
    last_indexed: string | null;
    children: FolderNode[];
    isExpanded?: boolean;
}

export interface FolderStats {
    path: string;
    total_files: number;
    total_size: number;
    file_types: Record<string, number>;
    last_modified: string | null;
    recursive: boolean;
    last_indexed: string | null;
}

export interface IndexStats {
    total_folders: number;
    total_files: number;
    total_chunks: number;
    total_size: number;
    file_types: Record<string, number>;
    last_updated: string | null;
}

export interface IndexedFile {
    file_hash: string;
    file_name: string;
    file_path: string;
    file_size: number;
    file_type: string;
    chunk_count: number;
    id: number;
    modified_date?: string;
}
