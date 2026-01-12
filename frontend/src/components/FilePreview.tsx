import { useState, useEffect } from 'react';
import type { SearchResult, FilePreviewData } from '../types';
import { previewFile, openFile, openFolder } from '../services/api';
import { FileIcon } from './FileIcon';
import { formatFileSize } from '../utils/format';
import './FilePreview.css';

interface FilePreviewProps {
    result: SearchResult | null;
}

function getFilenameFromPath(path: string | null): string {
    if (!path) return 'Unknown';
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
}

export function FilePreview({ result }: FilePreviewProps) {
    const [preview, setPreview] = useState<FilePreviewData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleCopyPath = async () => {
        if (result?.path) {
            try {
                await navigator.clipboard.writeText(result.path);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch (err) {
                console.error('Failed to copy path:', err);
            }
        }
    };

    useEffect(() => {
        if (!result?.path) {
            setPreview(null);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        setError(null);

        previewFile(result.path)
            .then((data) => {
                if (!cancelled) {
                    setPreview(data);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err.message);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [result?.path]);

    const handleOpenFile = async () => {
        if (result?.path) {
            try {
                await openFile(result.path);
            } catch (err) {
                console.error('Failed to open file:', err);
            }
        }
    };

    const handleOpenFolder = async () => {
        if (result?.path) {
            try {
                await openFolder(result.path);
            } catch (err) {
                console.error('Failed to open folder:', err);
            }
        }
    };

    if (!result) {
        return (
            <div className="file-preview file-preview--empty">
                <div className="file-preview__placeholder">
                    <p>Select a file to preview</p>
                </div>
            </div>
        );
    }

    const filename = result.metadata?.file_name || getFilenameFromPath(result.path);
    const isPdf = preview?.contentType?.includes('pdf');
    const isImage = preview?.contentType?.startsWith('image/');

    return (
        <div className="file-preview">
            <div className="file-preview__header">
                <FileIcon filename={filename} size="lg" />
                <div className="file-preview__info">
                    <h3 className="file-preview__name">{filename}</h3>
                    <p className="file-preview__meta">
                        {result.metadata?.file_type?.toUpperCase() || 'File'} - {formatFileSize(result.metadata?.file_size)}
                    </p>
                </div>
            </div>

            <div className="file-preview__actions">
                <button className="file-preview__btn file-preview__btn--primary" onClick={handleOpenFile}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    Open
                </button>
                <button className="file-preview__btn" onClick={handleOpenFolder}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    Reveal
                </button>
            </div>

            <div className="file-preview__content">
                {isLoading && (
                    <div className="file-preview__loading">
                        <div className="file-preview__spinner" />
                    </div>
                )}

                {error && (
                    <div className="file-preview__error">
                        <p>Could not load preview</p>
                    </div>
                )}

                {!isLoading && !error && preview && (
                    <>
                        {isPdf && preview.dataUrl && (
                            <iframe
                                className="file-preview__pdf"
                                src={preview.dataUrl}
                                title={`Preview of ${filename}`}
                            />
                        )}

                        {isImage && preview.dataUrl && (
                            <img
                                className="file-preview__image"
                                src={preview.dataUrl}
                                alt={filename}
                            />
                        )}

                        {!isPdf && !isImage && (
                            <pre className="file-preview__text">
                                <code>{preview.content}</code>
                                {preview.truncated && (
                                    <span className="file-preview__truncated">... content truncated</span>
                                )}
                            </pre>
                        )}
                    </>
                )}

                {result.snippet && !preview && (
                    <div className="file-preview__snippet">
                        <p className="file-preview__snippet-label">Matching content:</p>
                        <p className="file-preview__snippet-text">{result.snippet}</p>
                    </div>
                )}
            </div>

            <div className="file-preview__path">
                <div className="file-preview__path-header">
                    <span className="file-preview__path-label">Path:</span>
                    <button
                        className="file-preview__copy-btn"
                        onClick={handleCopyPath}
                        title="Copy path"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                    </button>
                </div>
                <code className="file-preview__path-value">{result.path}</code>
                {copied && (
                    <div className="file-preview__copy-toast">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Path copied
                    </div>
                )}
            </div>
        </div>
    );
}
