import { useState, useEffect, useRef, useCallback } from 'react';
import {
    getFolders,
    addFolder,
    indexFiles,
    deleteFolder,
    getFolderFiles,
    getFolderStats,
    reindexFolder,
    getIndexStats,
    clearIndex,
    openFolder,
} from '../services/api';
import { FileIcon } from './FileIcon';
import type { Folder, FolderStats, IndexedFile, IndexStats } from '../types';
import './IndexManager.css';

type SelectionMode = 'folder' | 'files';

// File System Entry interface for drag and drop
interface FileSystemEntry {
    isFile: boolean;
    isDirectory: boolean;
    name: string;
}

interface IndexManagerProps {
    onClose: () => void;
    onIndexingStart?: (folderPath: string) => void;
    onIndexingEnd?: () => void;
}

const FILES_PER_PAGE = 20;

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function IndexManager({ onClose, onIndexingStart, onIndexingEnd }: IndexManagerProps) {
    const [folders, setFolders] = useState<Folder[]>([]);
    const [indexStats, setIndexStats] = useState<IndexStats | null>(null);
    const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
    const [folderFiles, setFolderFiles] = useState<IndexedFile[]>([]);
    const [folderStats, setFolderStats] = useState<FolderStats | null>(null);
    const [filePage, setFilePage] = useState(0);
    const [totalFiles, setTotalFiles] = useState(0);

    const [selectionMode, setSelectionMode] = useState<SelectionMode>('folder');
    const [newFolderPath, setNewFolderPath] = useState('');
    const [newFolderRecursive, setNewFolderRecursive] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [showPathDialog, setShowPathDialog] = useState(false);
    const [basePath, setBasePath] = useState('');
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);

    const folderInputRef = useRef<HTMLInputElement>(null);
    const filesInputRef = useRef<HTMLInputElement>(null);
    const dropZoneRef = useRef<HTMLDivElement>(null);

    // Load folders and stats on mount
    useEffect(() => {
        loadFolders();
        loadIndexStats();
    }, []);

    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    const loadFolders = async () => {
        try {
            setIsLoading(true);
            const data = await getFolders();
            setFolders(data);
        } catch (err) {
            setError(`Failed to load folders: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsLoading(false);
        }
    };

    const loadIndexStats = async () => {
        try {
            const stats = await getIndexStats();
            setIndexStats(stats);
        } catch (err) {
            console.error('Failed to load index stats:', err);
        }
    };

    // File selection handlers
    const handleBrowseClick = () => {
        if (selectionMode === 'folder') {
            folderInputRef.current?.click();
        } else {
            filesInputRef.current?.click();
        }
    };

    const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        // Get the folder path from the first file
        // In webkitdirectory, files have webkitRelativePath like "folder/subfolder/file.txt"
        const firstFile = files[0];
        const relativePath = (firstFile as File & { webkitRelativePath?: string }).webkitRelativePath || '';
        const folderName = relativePath.split('/')[0];
        
        // For the path input, we'll show the folder name
        // The actual path will need to be entered manually or handled by backend
        setNewFolderPath(folderName || 'Selected Folder');
        
        // Store the files for potential direct upload/indexing
        setSelectedFiles(Array.from(files));
    };

    const handleFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setSelectedFiles(Array.from(files));
    };

    const clearSelectedFiles = () => {
        setSelectedFiles([]);
        setNewFolderPath('');
    };

    // Drag and drop handlers
    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Only clear if leaving the drop zone (not entering a child)
        if (e.currentTarget === e.target) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const items = e.dataTransfer.items;
        if (!items || items.length === 0) return;

        const files: File[] = [];
        const filePaths: string[] = [];

        // Process dropped items
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            if (item.kind === 'file') {
                const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.() || null;
                
                if (entry) {
                    if (entry.isDirectory) {
                        // For directories, we can't get the real path
                        // User needs to use the browse button or paste path
                        setError('For folders, please use the Browse button or paste the path directly');
                        return;
                    } else {
                        const file = item.getAsFile();
                        if (file) {
                            files.push(file);
                            // Try to get path from the file if available
                            const path = (file as File & { path?: string }).path || file.name;
                            filePaths.push(path);
                        }
                    }
                }
            }
        }

        if (files.length > 0) {
            setSelectionMode('files');
            setSelectedFiles(files);
            setNewFolderPath(`${files.length} file${files.length !== 1 ? 's' : ''} selected`);
        }
    }, []);

    const handleAdd = async () => {
        if (selectionMode === 'folder') {
            await handleAddFolder();
        } else {
            await handleAddFiles();
        }
    };

    const handleAddFiles = async () => {
        if (selectedFiles.length === 0) {
            setError('Please select files to index');
            return;
        }

        // Check if we have full paths or just filenames
        const hasFullPaths = selectedFiles.every(f => {
            const path = (f as File & { path?: string }).path;
            return path && path.includes('/') && path !== f.name;
        });

        if (!hasFullPaths) {
            // Browser doesn't provide full paths, need user to provide base directory
            setPendingFiles(selectedFiles);
            setShowPathDialog(true);
            return;
        }

        await indexPendingFiles(selectedFiles);
    };

    const indexPendingFiles = async (files: File[], baseDir?: string) => {
        try {
            setActionLoading('add');
            setError(null);

            // Extract paths from files
            const filePaths = files.map(f => {
                const fullPath = (f as File & { path?: string }).path;
                if (fullPath && fullPath.includes('/')) {
                    return fullPath;
                }
                // Prepend base directory if provided
                if (baseDir) {
                    return `${baseDir.replace(/\/$/, '')}/${f.name}`;
                }
                return f.name;
            });

            onIndexingStart?.(`Indexing ${files.length} file(s)...`);
            const result = await indexFiles(filePaths);

            setSuccessMessage(`Indexed ${result.inserted} files successfully`);
            clearSelectedFiles();
            setPendingFiles([]);
            setBasePath('');
            await loadFolders();
            await loadIndexStats();
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to index files');
        } finally {
            setActionLoading(null);
            onIndexingEnd?.();
        }
    };

    const handlePathDialogSubmit = async () => {
        if (!basePath.trim()) {
            setError('Please enter a base directory path');
            return;
        }
        setShowPathDialog(false);
        setError(null);
        await indexPendingFiles(pendingFiles, basePath);
    };

    const handlePathDialogCancel = () => {
        setShowPathDialog(false);
        setPendingFiles([]);
        setBasePath('');
    };

    const loadFolderFiles = async (folder: Folder, page: number = 0) => {
        try {
            setActionLoading(folder.path);
            const data = await getFolderFiles(folder.path, FILES_PER_PAGE, page * FILES_PER_PAGE);
            setFolderFiles(data.files);
            setTotalFiles(data.total || 0);
            setFilePage(page);
        } catch (err) {
            setError(`Failed to load folder files: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setActionLoading(null);
        }
    };

    const loadFolderStats = async (folder: Folder) => {
        try {
            const stats = await getFolderStats(folder.path);
            setFolderStats(stats);
        } catch (err) {
            console.error('Failed to load folder stats:', err);
        }
    };

    const handleAddFolder = async () => {
        if (!newFolderPath.trim()) {
            setError('Please enter a folder path');
            return;
        }

        try {
            setActionLoading('add');
            setError(null);
            onIndexingStart?.(newFolderPath);
            const result = await addFolder(newFolderPath, newFolderRecursive);
            setSuccessMessage(`Added folder: ${result.folder} (${result.inserted} files indexed)`);
            setNewFolderPath('');
            setNewFolderRecursive(false);
            setSelectedFiles([]);
            await loadFolders();
            await loadIndexStats();
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add folder');
        } finally {
            setActionLoading(null);
            onIndexingEnd?.();
        }
    };

    const handleDeleteFolder = async (folder: Folder) => {
        console.log('[Delete Folder] Starting delete for folder:', folder.path);
        if (!confirm(`Are you sure you want to remove "${folder.name}" from the index?\n\nThis will remove all indexed files from this folder.`)) {
            console.log('[Delete Folder] User cancelled the deletion');
            return;
        }

        try {
            console.log('[Delete Folder] User confirmed, calling API...');
            setActionLoading(folder.path);
            const result = await deleteFolder(folder.path);
            console.log('[Delete Folder] API response:', result);
            setSuccessMessage(`Removed folder: ${result.folder} (${result.removed} files removed)`);
            if (selectedFolder?.path === folder.path) {
                setSelectedFolder(null);
                setFolderFiles([]);
                setFolderStats(null);
            }
            await loadFolders();
            await loadIndexStats();
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            console.error('[Delete Folder] Error:', err);
            setError(err instanceof Error ? err.message : 'Failed to remove folder');
        } finally {
            setActionLoading(null);
        }
    };

    const handleReindexFolder = async (folder: Folder) => {
        if (!confirm(`Reindex "${folder.name}"?\n\nThis will rescan the folder and update the index.`)) {
            return;
        }

        try {
            setActionLoading(`${folder.path}-reindex`);
            onIndexingStart?.(folder.path);
            const result = await reindexFolder(folder.path, folder.recursive);
            setSuccessMessage(`Reindexed folder: ${result.folder} (${result.inserted} files indexed)`);
            await loadFolders();
            await loadIndexStats();
            if (selectedFolder?.path === folder.path) {
                await loadFolderFiles(folder, filePage);
                await loadFolderStats(folder);
            }
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reindex folder');
        } finally {
            setActionLoading(null);
            onIndexingEnd?.();
        }
    };

    const handleClearIndex = async () => {
        if (!confirm('Are you sure you want to clear the entire index?\n\nThis will remove all indexed folders and files. This action cannot be undone.')) {
            return;
        }

        try {
            setActionLoading('clear');
            const result = await clearIndex();
            setSuccessMessage(result.message);
            setSelectedFolder(null);
            setFolderFiles([]);
            setFolderStats(null);
            await loadFolders();
            await loadIndexStats();
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to clear index');
        } finally {
            setActionLoading(null);
        }
    };

    const handleFolderClick = async (folder: Folder) => {
        if (selectedFolder?.path === folder.path) {
            setSelectedFolder(null);
            setFolderFiles([]);
            setFolderStats(null);
        } else {
            setSelectedFolder(folder);
            await loadFolderFiles(folder, 0);
            await loadFolderStats(folder);
        }
    };

    const handleOpenFolder = async (folder: Folder) => {
        try {
            await openFolder(folder.path);
        } catch (err) {
            console.error('Failed to open folder:', err);
        }
    };

    const handleFilePageChange = (newPage: number) => {
        if (selectedFolder) {
            loadFolderFiles(selectedFolder, newPage);
        }
    };

    return (
        <div className="index-manager">
            {/* Header */}
            <header className="im-header">
                <div className="im-header-content">
                    <h1 className="im-title">Index Manager</h1>
                    <p className="im-subtitle">Manage your indexed folders and documents</p>
                </div>
                <div className="im-header-actions">
                    <button className="im-close-btn" onClick={onClose} aria-label="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* Scrollable Content */}
            <div className="im-content">

                {/* Stats Grid */}
                <div className="im-stats-grid">
                    <div className="im-stat-card">
                        <div className="im-stat-icon im-stat-icon--folders">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
                            </svg>
                        </div>
                        <div className="im-stat-content">
                            <span className="im-stat-value">{indexStats?.total_folders ?? 0}</span>
                            <span className="im-stat-label">Folders</span>
                        </div>
                    </div>

                    <div className="im-stat-card">
                        <div className="im-stat-icon im-stat-icon--files">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                            </svg>
                        </div>
                        <div className="im-stat-content">
                            <span className="im-stat-value">{indexStats?.total_files ?? 0}</span>
                            <span className="im-stat-label">Files</span>
                        </div>
                    </div>

                    <div className="im-stat-card">
                        <div className="im-stat-icon im-stat-icon--chunks">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="7" height="7" />
                                <rect x="14" y="3" width="7" height="7" />
                                <rect x="14" y="14" width="7" height="7" />
                                <rect x="3" y="14" width="7" height="7" />
                            </svg>
                        </div>
                        <div className="im-stat-content">
                            <span className="im-stat-value">{indexStats?.total_chunks ?? 0}</span>
                            <span className="im-stat-label">Chunks</span>
                        </div>
                    </div>

                    <div className="im-stat-card">
                        <div className="im-stat-icon im-stat-icon--size">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            </svg>
                        </div>
                        <div className="im-stat-content">
                            <span className="im-stat-value">{formatBytes(indexStats?.total_size ?? 0)}</span>
                            <span className="im-stat-label">Total Size</span>
                        </div>
                    </div>
                </div>

                {/* Add Section with Mode Toggle */}
                <div className="im-add-section">
                    <label className="im-section-label">Add to Index</label>
                    
                    {/* Mode Toggle */}
                    <div className="im-mode-toggle">
                        <button
                            className={`im-mode-btn ${selectionMode === 'folder' ? 'im-mode-btn--active' : ''}`}
                            onClick={() => {
                                setSelectionMode('folder');
                                clearSelectedFiles();
                            }}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
                            </svg>
                            Folder
                        </button>
                        <button
                            className={`im-mode-btn ${selectionMode === 'files' ? 'im-mode-btn--active' : ''}`}
                            onClick={() => {
                                setSelectionMode('files');
                                clearSelectedFiles();
                            }}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                            </svg>
                            Files
                        </button>
                    </div>

                    {/* Hidden File Inputs */}
                    <input
                        ref={folderInputRef}
                        type="file"
                        style={{ display: 'none' }}
                        {...{ webkitdirectory: 'true', directory: 'true' } as any}
                        onChange={handleFolderSelect}
                    />
                    <input
                        ref={filesInputRef}
                        type="file"
                        style={{ display: 'none' }}
                        multiple
                        onChange={handleFilesSelect}
                    />

                    {/* Input + Browse */}
                    <div className="im-input-group">
                        <svg className="im-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {selectionMode === 'folder' ? (
                                <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
                            ) : (
                                <>
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </>
                            )}
                        </svg>
                        <input
                            type="text"
                            className="im-input"
                            placeholder={selectionMode === 'folder' ? '/path/to/folder' : 'Paste file paths or browse...'}
                            value={newFolderPath}
                            onChange={(e) => setNewFolderPath(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        />
                        <button
                            className="im-browse-btn"
                            onClick={handleBrowseClick}
                            title={selectionMode === 'folder' ? 'Browse for folder' : 'Select files'}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            Browse
                        </button>
                    </div>

                    {/* Recursive checkbox - only for folder mode */}
                    {selectionMode === 'folder' && (
                        <label className="im-checkbox-group">
                            <input
                                type="checkbox"
                                className="im-checkbox"
                                checked={newFolderRecursive}
                                onChange={(e) => setNewFolderRecursive(e.target.checked)}
                            />
                            <span className="im-checkbox-label">Include subdirectories</span>
                        </label>
                    )}

                    {/* Selected Files Preview */}
                    {selectedFiles.length > 0 && (
                        <div className="im-selected-files">
                            <div className="im-selected-header">
                                <span className="im-selected-count">
                                    {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
                                </span>
                                <button 
                                    className="im-clear-selected"
                                    onClick={clearSelectedFiles}
                                    title="Clear selection"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            </div>
                            <div className="im-selected-list">
                                {selectedFiles.slice(0, 5).map((file, idx) => (
                                    <div key={idx} className="im-selected-item">
                                        <FileIcon filename={file.name} size="sm" />
                                        <span className="im-selected-name">{file.name}</span>
                                    </div>
                                ))}
                                {selectedFiles.length > 5 && (
                                    <div className="im-selected-more">
                                        +{selectedFiles.length - 5} more
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Drag & Drop Zone */}
                    <div
                        ref={dropZoneRef}
                        className={`im-drop-zone ${isDragging ? 'im-drop-zone--active' : ''}`}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <span>
                            {isDragging 
                                ? 'Drop files here' 
                                : `or drag & drop ${selectionMode === 'folder' ? 'a folder' : 'files'} here`
                            }
                        </span>
                    </div>

                    {/* Add Button */}
                    <button
                        className="im-add-btn"
                        onClick={handleAdd}
                        disabled={actionLoading === 'add' || (!newFolderPath.trim() && selectedFiles.length === 0)}
                    >
                        {actionLoading === 'add' ? (
                            <>
                                <svg className="im-spinner" viewBox="0 0 24 24">
                                    <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2" opacity="0.25" />
                                    <path fill="none" strokeWidth="2" d="M12 2a10 10 0 0 1 10 10" />
                                </svg>
                                {selectionMode === 'folder' ? 'Adding...' : 'Indexing...'}
                            </>
                        ) : (
                            <>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                                {selectionMode === 'folder' ? 'Add Folder' : 'Index Files'}
                            </>
                        )}
                    </button>
                </div>

                {/* Messages */}
                {error && (
                    <div className="im-message im-message--error">
                        <svg className="im-message-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span className="im-message-text">{error}</span>
                        <button className="im-message-dismiss" onClick={() => setError(null)} aria-label="Dismiss">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                )}

                {successMessage && (
                    <div className="im-message im-message--success">
                        <svg className="im-message-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        <span className="im-message-text">{successMessage}</span>
                        <button className="im-message-dismiss" onClick={() => setSuccessMessage(null)} aria-label="Dismiss">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* Folders List */}
                <div className="im-folders-section">
                    <div className="im-section-header">
                        <div>
                            <h2 className="im-section-title">Indexed Folders</h2>
                            <p className="im-section-subtitle">{folders.length} folder{folders.length !== 1 ? 's' : ''} indexed</p>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="im-loading-state">
                            <svg className="im-spinner im-spinner--large" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2" opacity="0.25" />
                                <path fill="none" strokeWidth="2" d="M12 2a10 10 0 0 1 10 10" />
                            </svg>
                            <p>Loading folders...</p>
                        </div>
                    ) : folders.length === 0 ? (
                        <div className="im-empty-state">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
                            </svg>
                            <p>No folders indexed yet</p>
                            <span className="im-empty-hint">Add a folder above to get started</span>
                        </div>
                    ) : (
                        <div className="im-folders-list">
                            {folders.map((folder) => (
                                <div
                                    key={folder.path}
                                    className={`im-folder-card ${selectedFolder?.path === folder.path ? 'im-folder-card--expanded' : ''}`}
                                >
                                    <div className="im-folder-header" onClick={() => handleFolderClick(folder)}>
                                        <div className="im-folder-main">
                                            <div className="im-folder-icon">
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
                                                </svg>
                                            </div>
                                            <div className="im-folder-info">
                                                <h3 className="im-folder-name">{folder.name}</h3>
                                                <div className="im-folder-meta">
                                                    <span className="im-meta-item">
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                            <polyline points="14 2 14 8 20 8" />
                                                        </svg>
                                                        {folder.indexed_count} files
                                                    </span>
                                                    <span className="im-meta-item">
                                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <circle cx="12" cy="12" r="10" />
                                                            <polyline points="12 6 12 12 16 14" />
                                                        </svg>
                                                        {formatDate(folder.last_indexed)}
                                                    </span>
                                                    {folder.recursive && (
                                                        <span className="im-badge im-badge--recursive" title="Recursive indexing">
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                                                                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                                                            </svg>
                                                            Recursive
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="im-folder-actions">
                                            <button
                                                className="im-action-btn"
                                                onClick={(e) => { e.stopPropagation(); handleOpenFolder(folder); }}
                                                title="Open in Finder"
                                            >
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                                    <polyline points="15 3 21 3 21 9" />
                                                    <line x1="10" y1="14" x2="21" y2="3" />
                                                </svg>
                                            </button>
                                            <button
                                                className="im-action-btn"
                                                onClick={(e) => { e.stopPropagation(); handleReindexFolder(folder); }}
                                                title="Reindex folder"
                                                disabled={actionLoading?.includes(folder.path)}
                                            >
                                                {actionLoading?.includes(`${folder.path}-reindex`) ? (
                                                    <svg className="im-spinner im-spinner--small" viewBox="0 0 24 24">
                                                        <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2" opacity="0.25" />
                                                        <path fill="none" strokeWidth="2" d="M12 2a10 10 0 0 1 10 10" />
                                                    </svg>
                                                ) : (
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                                                    </svg>
                                                )}
                                            </button>
                                            <button
                                                className="im-action-btn im-action-btn--danger"
                                                onClick={(e) => {
                                                    console.log('[Delete Button] Clicked for folder:', folder.path);
                                                    e.stopPropagation();
                                                    handleDeleteFolder(folder);
                                                }}
                                                title="Remove from index"
                                                disabled={actionLoading === folder.path}
                                            >
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <polyline points="3 6 5 6 21 6" />
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Files */}
                                    {selectedFolder?.path === folder.path && (
                                        <div className="im-folder-files">
                                            {folderStats && (
                                                <div className="im-folder-stats">
                                                    <div className="im-folder-stat">
                                                        <span className="im-folder-stat-value">{folderStats.total_files}</span>
                                                        <span className="im-folder-stat-label">Files</span>
                                                    </div>
                                                    <div className="im-folder-stat">
                                                        <span className="im-folder-stat-value">{formatBytes(folderStats.total_size)}</span>
                                                        <span className="im-folder-stat-label">Size</span>
                                                    </div>
                                                    <div className="im-folder-stat">
                                                        <span className="im-folder-stat-value">{formatDate(folderStats.last_modified)}</span>
                                                        <span className="im-folder-stat-label">Last Modified</span>
                                                    </div>
                                                </div>
                                            )}

                                            {actionLoading === folder.path ? (
                                                <div className="im-files-loading">
                                                    <svg className="im-spinner" viewBox="0 0 24 24">
                                                        <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2" opacity="0.25" />
                                                        <path fill="none" strokeWidth="2" d="M12 2a10 10 0 0 1 10 10" />
                                                    </svg>
                                                    <span>Loading files...</span>
                                                </div>
                                            ) : folderFiles.length === 0 ? (
                                                <div className="im-files-empty">No files found in this folder</div>
                                            ) : (
                                                <>
                                                    <div className="im-files-list">
                                                        {folderFiles.map((file) => (
                                                            <div key={file.id} className="im-file-item">
                                                                <FileIcon filename={file.file_name} size="sm" />
                                                                <div className="im-file-info">
                                                                    <span className="im-file-name">{file.file_name}</span>
                                                                    <span className="im-file-meta">
                                                                        {formatBytes(file.file_size)} • {file.chunk_count} chunk{file.chunk_count !== 1 ? 's' : ''}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Pagination */}
                                                    {totalFiles > FILES_PER_PAGE && (
                                                        <div className="im-pagination">
                                                            <button
                                                                className="im-page-btn"
                                                                onClick={() => handleFilePageChange(filePage - 1)}
                                                                disabled={filePage === 0}
                                                            >
                                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                    <polyline points="15 18 9 12 15 6" />
                                                                </svg>
                                                                Previous
                                                            </button>
                                                            <span className="im-page-info">
                                                                {filePage * FILES_PER_PAGE + 1}-{Math.min((filePage + 1) * FILES_PER_PAGE, totalFiles)} of {totalFiles}
                                                            </span>
                                                            <button
                                                                className="im-page-btn"
                                                                onClick={() => handleFilePageChange(filePage + 1)}
                                                                disabled={(filePage + 1) * FILES_PER_PAGE >= totalFiles}
                                                            >
                                                                Next
                                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                    <polyline points="9 18 15 12 9 6" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Clear Index */}
                    {folders.length > 0 && (
                        <div className="im-clear-section">
                            <button
                                className="im-clear-btn"
                                onClick={handleClearIndex}
                                disabled={actionLoading === 'clear'}
                            >
                                {actionLoading === 'clear' ? (
                                    <>
                                        <svg className="im-spinner" viewBox="0 0 24 24">
                                            <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2" opacity="0.25" />
                                            <path fill="none" strokeWidth="2" d="M12 2a10 10 0 0 1 10 10" />
                                        </svg>
                                        Clearing Index...
                                    </>
                                ) : (
                                    <>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="3 6 5 6 21 6" />
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                        </svg>
                                        Clear Entire Index
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Base Path Dialog */}
            {showPathDialog && (
                <div className="im-dialog-overlay" onClick={handlePathDialogCancel}>
                    <div className="im-dialog" onClick={(e) => e.stopPropagation()}>
                        <div className="im-dialog-header">
                            <h3>Enter File Location</h3>
                            <p className="im-dialog-subtitle">
                                Browser security prevents access to full file paths. Please provide the directory where these files are located.
                            </p>
                        </div>
                        <div className="im-dialog-content">
                            <div className="im-input-group">
                                <svg className="im-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
                                </svg>
                                <input
                                    type="text"
                                    className="im-input"
                                    placeholder="/Users/username/Documents"
                                    value={basePath}
                                    onChange={(e) => setBasePath(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handlePathDialogSubmit()}
                                    autoFocus
                                />
                            </div>
                            <div className="im-dialog-files">
                                <span className="im-dialog-label">Files to index:</span>
                                <div className="im-dialog-file-list">
                                    {pendingFiles.slice(0, 5).map((file, idx) => (
                                        <span key={idx} className="im-dialog-file-item">{file.name}</span>
                                    ))}
                                    {pendingFiles.length > 5 && (
                                        <span className="im-dialog-file-more">+{pendingFiles.length - 5} more</span>
                                    )}
                                </div>
                            </div>
                            <div className="im-dialog-hint">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="16" x2="12" y2="12" />
                                    <line x1="12" y1="8" x2="12.01" y2="8" />
                                </svg>
                                <span>Full paths will be: {basePath || '/your/path'}/{pendingFiles[0]?.name || 'file.pdf'}</span>
                            </div>
                        </div>
                        <div className="im-dialog-actions">
                            <button className="im-dialog-btn im-dialog-btn--secondary" onClick={handlePathDialogCancel}>
                                Cancel
                            </button>
                            <button className="im-dialog-btn im-dialog-btn--primary" onClick={handlePathDialogSubmit}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                                Index Files
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
