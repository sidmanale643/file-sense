import type { SearchResult } from '../types';
import { FileIcon } from './FileIcon';
import { formatFileSize } from '../utils/format';
import './ResultItem.css';

interface ResultItemProps {
    result: SearchResult;
    isSelected: boolean;
    index: number;
    onClick: () => void;
    onDoubleClick: () => void;
}

function getFilenameFromPath(path: string | null): string {
    if (!path) return 'Unknown';
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
}

function getDirectoryFromPath(path: string | null): string {
    if (!path) return '';
    const parts = path.split('/');
    parts.pop();
    const dir = parts.join('/');
    // Truncate long paths
    if (dir.length > 50) {
        return '...' + dir.slice(-47);
    }
    return dir;
}

export function ResultItem({
    result,
    isSelected,
    index,
    onClick,
    onDoubleClick,
}: ResultItemProps) {
    const filename = result.metadata?.file_name || getFilenameFromPath(result.path);
    const directory = getDirectoryFromPath(result.path);
    const size = formatFileSize(result.metadata?.file_size);

    return (
        <div
            className={`result-item ${isSelected ? 'result-item--selected' : ''}`}
            style={{ animationDelay: `${index * 50}ms` }}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            role="option"
            aria-selected={isSelected}
        >
            <FileIcon filename={filename} size="md" />

            <div className="result-item__content">
                <div className="result-item__name">{filename}</div>
                <div className="result-item__path">{directory}</div>
            </div>

            <div className="result-item__meta">
                {size && <span className="result-item__size">{size}</span>}
                {result.score != null && (
                    <div className="result-item__score" title={`Score: ${result.score.toFixed(3)}`}>
                        <div
                            className="result-item__score-bar"
                            style={{ width: `${Math.min(result.score * 100, 100)}%` }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
