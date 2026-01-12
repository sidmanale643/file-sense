/**
 * Format file size in bytes to human-readable format
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 MB", "500 KB", "—")
 */
export function formatFileSize(bytes: number | undefined | null): string {
    if (bytes === undefined || bytes === null || bytes === 0) {
        return '—';
    }

    const units = ['B', 'KB', 'MB', 'GB'] as const;
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    // Remove unnecessary trailing zeros
    const formattedSize = Number.isInteger(size) ? size : size.toFixed(1);

    return `${formattedSize} ${units[unitIndex]}`;
}
