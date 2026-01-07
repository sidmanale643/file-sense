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
    file_hash: string;
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
