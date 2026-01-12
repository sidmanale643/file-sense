import { useState } from 'react';
import type { SearchOptions } from '../types';
import './FilterPanel.css';

interface FilterPanelProps {
    filters: SearchOptions;
    onFiltersChange: (filters: SearchOptions) => void;
    onClear: () => void;
    onClose: () => void;
}

type SizeUnit = 'B' | 'KB' | 'MB' | 'GB';

const FILE_TYPE_OPTIONS = [
    { value: 'pdf', label: 'PDF', icon: '📄' },
    { value: 'doc', label: 'Documents', icon: '📝' },
    { value: 'code', label: 'Code', icon: '💻' },
    { value: 'text', label: 'Text', icon: '📃' },
    { value: 'image', label: 'Images', icon: '🖼️' },
];

const SIZE_PRESETS = [
    { label: 'Any', value: 0 },
    { label: '>', value: 100 * 1024 }, // > 100KB
    { label: '>', value: 1024 * 1024 }, // > 1MB
    { label: '>', value: 10 * 1024 * 1024 }, // > 10MB
    { label: '>', value: 100 * 1024 * 1024 }, // > 100MB
];

function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function parseFileSize(sizeStr: string): number {
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = (match[2] || 'B').toUpperCase() as SizeUnit;
    const multipliers: Record<SizeUnit, number> = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
    return value * multipliers[unit];
}

export function FilterPanel({ filters, onFiltersChange, onClear, onClose }: FilterPanelProps) {
    const [minSizeInput, setMinSizeInput] = useState('');
    const [maxSizeInput, setMaxSizeInput] = useState('');

    const hasActiveFilters =
        (filters.fileTypes && filters.fileTypes.length > 0) ||
        filters.minSize !== undefined ||
        filters.maxSize !== undefined ||
        filters.dateFrom !== undefined ||
        filters.dateTo !== undefined;

    const handleFileTypeToggle = (fileType: string) => {
        const current = filters.fileTypes || [];
        const updated = current.includes(fileType)
            ? current.filter(t => t !== fileType)
            : [...current, fileType];
        onFiltersChange({ ...filters, fileTypes: updated.length > 0 ? updated : undefined });
    };

    const handleMinSizeChange = (value: string) => {
        setMinSizeInput(value);
        const parsed = parseFileSize(value);
        onFiltersChange({ ...filters, minSize: parsed > 0 ? parsed : undefined });
    };

    const handleMaxSizeChange = (value: string) => {
        setMaxSizeInput(value);
        const parsed = parseFileSize(value);
        onFiltersChange({ ...filters, maxSize: parsed > 0 ? parsed : undefined });
    };

    const handleDateFromChange = (value: string) => {
        onFiltersChange({ ...filters, dateFrom: value || undefined });
    };

    const handleDateToChange = (value: string) => {
        onFiltersChange({ ...filters, dateTo: value || undefined });
    };

    return (
        <div className="filter-panel">
            <div className="filter-panel__header">
                <h3 className="filter-panel__title">Filters</h3>
                <div className="filter-panel__actions">
                    {hasActiveFilters && (
                        <button className="filter-panel__clear" onClick={onClear}>
                            Clear All
                        </button>
                    )}
                    <button className="filter-panel__close" onClick={onClose} aria-label="Close filters">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="filter-panel__content">
                {/* File Type Filter */}
                <div className="filter-panel__section">
                    <label className="filter-panel__label">File Type</label>
                    <div className="filter-panel__chips">
                        {FILE_TYPE_OPTIONS.map((option) => {
                            const isActive = filters.fileTypes?.includes(option.value);
                            return (
                                <button
                                    key={option.value}
                                    className={`filter-chip ${isActive ? 'filter-chip--active' : ''}`}
                                    onClick={() => handleFileTypeToggle(option.value)}
                                    type="button"
                                >
                                    <span className="filter-chip__icon">{option.icon}</span>
                                    <span className="filter-chip__label">{option.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* File Size Filter */}
                <div className="filter-panel__section">
                    <label className="filter-panel__label">File Size</label>
                    <div className="filter-panel__size-inputs">
                        <div className="filter-panel__size-input">
                            <label className="filter-panel__size-label">Min</label>
                            <input
                                type="text"
                                className="filter-panel__input"
                                placeholder="e.g. 100 KB"
                                value={minSizeInput}
                                onChange={(e) => handleMinSizeChange(e.target.value)}
                            />
                            {filters.minSize && (
                                <span className="filter-panel__size-hint">{formatFileSize(filters.minSize)}</span>
                            )}
                        </div>
                        <div className="filter-panel__size-input">
                            <label className="filter-panel__size-label">Max</label>
                            <input
                                type="text"
                                className="filter-panel__input"
                                placeholder="e.g. 10 MB"
                                value={maxSizeInput}
                                onChange={(e) => handleMaxSizeChange(e.target.value)}
                            />
                            {filters.maxSize && (
                                <span className="filter-panel__size-hint">{formatFileSize(filters.maxSize)}</span>
                            )}
                        </div>
                    </div>
                    <div className="filter-panel__presets">
                        {SIZE_PRESETS.slice(1).map((preset) => (
                            <button
                                key={preset.value}
                                className="filter-panel__preset"
                                onClick={() => handleMinSizeChange(formatFileSize(preset.value))}
                                type="button"
                            >
                                {preset.label} {formatFileSize(preset.value)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Date Range Filter */}
                <div className="filter-panel__section">
                    <label className="filter-panel__label">Date Modified</label>
                    <div className="filter-panel__date-inputs">
                        <div className="filter-panel__date-input">
                            <label className="filter-panel__date-label">From</label>
                            <input
                                type="date"
                                className="filter-panel__input"
                                value={filters.dateFrom || ''}
                                onChange={(e) => handleDateFromChange(e.target.value)}
                            />
                        </div>
                        <div className="filter-panel__date-input">
                            <label className="filter-panel__date-label">To</label>
                            <input
                                type="date"
                                className="filter-panel__input"
                                value={filters.dateTo || ''}
                                onChange={(e) => handleDateToChange(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
