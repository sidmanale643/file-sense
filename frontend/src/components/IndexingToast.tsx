interface IndexingToastProps {
    isVisible: boolean;
    folderPath?: string;
    fileName?: string;
}

export function IndexingToast({ isVisible, folderPath, fileName }: IndexingToastProps) {
    if (!isVisible) return null;

    const displayName = fileName || folderPath || 'files';
    const displayPath = fileName ? folderPath : undefined;

    return (
        <div className="indexing-toast">
            <div className="indexing-toast__content">
                <div className="indexing-toast__icon">
                    <svg className="indexing-toast__spinner" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2" opacity="0.25" />
                        <path fill="none" strokeWidth="2" d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                </div>
                <div className="indexing-toast__message">
                    <span className="indexing-toast__primary">Indexing {displayName}...</span>
                    {displayPath && (
                        <span className="indexing-toast__secondary">{displayPath}</span>
                    )}
                </div>
            </div>
        </div>
    );
}
