import type { OperatingMode, ModeInfo, SystemMode, HardwareProfile } from '../types';
import './ModeSelector.css';

interface ModeSelectorProps {
    currentMode: OperatingMode;
    systemMode: SystemMode | null;
    hardwareProfile: HardwareProfile | null;
    onModeChange: (mode: OperatingMode) => void;
    isLoading?: boolean;
}

const MODES: ModeInfo[] = [
    {
        id: 'eco',
        label: 'Eco Mode',
        description: 'Minimal memory footprint for low-end devices',
        ramTarget: '< 500MB',
        features: ['Binary quantization (32x reduction)', 'Batch size 1-2', 'Paragraph chunking', 'Aggressive GC'],
        icon: '🌱',
    },
    {
        id: 'balanced',
        label: 'Balanced Mode',
        description: 'Good performance with moderate memory usage',
        ramTarget: '< 1GB',
        features: ['Binary quantization (32x reduction)', 'Batch size 4-8', 'Semantic chunking', 'Standard GC'],
        icon: '⚖️',
    },
    {
        id: 'performance',
        label: 'Performance Mode',
        description: 'Fastest processing with higher memory usage',
        ramTarget: '< 2GB',
        features: ['Float32 embeddings', 'Batch size 16', 'Full semantic chunking', 'Minimal GC overhead'],
        icon: '🚀',
    },
];

export function ModeSelector({ currentMode, systemMode, hardwareProfile, onModeChange, isLoading }: ModeSelectorProps) {
    const recommendedMode = hardwareProfile 
        ? hardwareProfile.available_ram_gb < 2 ? 'eco' 
        : hardwareProfile.available_ram_gb < 4 ? 'balanced' 
        : 'performance'
        : null;

    return (
        <div className="mode-selector">
            <div className="ms-header">
                <h3 className="ms-title">Performance Mode</h3>
                <p className="ms-subtitle">Select indexing and search performance profile</p>
            </div>

            <div className="ms-modes-grid">
                {MODES.map((mode) => {
                    const isSelected = currentMode === mode.id;
                    const isRecommended = recommendedMode === mode.id;

                    return (
                        <div
                            key={mode.id}
                            className={`ms-mode-card ${isSelected ? 'ms-mode-card--selected' : ''} ${isRecommended && !isSelected ? 'ms-mode-card--recommended' : ''}`}
                            onClick={() => !isLoading && onModeChange(mode.id)}
                        >
                            <div className="ms-mode-header">
                                <span className="ms-mode-icon">{mode.icon}</span>
                                <div className="ms-mode-badges">
                                    {isSelected && (
                                        <span className="ms-badge ms-badge--active">Active</span>
                                    )}
                                    {isRecommended && !isSelected && (
                                        <span className="ms-badge ms-badge--recommended">Recommended</span>
                                    )}
                                </div>
                            </div>

                            <div className="ms-mode-content">
                                <h4 className="ms-mode-label">{mode.label}</h4>
                                <p className="ms-mode-description">{mode.description}</p>
                                
                                <div className="ms-mode-specs">
                                    <div className="ms-spec">
                                        <span className="ms-spec-label">RAM Target</span>
                                        <span className="ms-spec-value">{mode.ramTarget}</span>
                                    </div>
                                    <div className="ms-spec">
                                        <span className="ms-spec-label">Quantization</span>
                                        <span className="ms-spec-value">
                                            {mode.id === 'performance' ? 'Float32' : 'Binary (32x)'}
                                        </span>
                                    </div>
                                </div>

                                <ul className="ms-mode-features">
                                    {mode.features.map((feature, idx) => (
                                        <li key={idx} className="ms-feature">
                                            <svg className="ms-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {isSelected && (
                                <div className="ms-mode-indicator">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" />
                                        <circle cx="12" cy="12" r="4" fill="currentColor" />
                                    </svg>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {systemMode && (
                <div className="ms-current-stats">
                    <div className="ms-stat-row">
                        <span className="ms-stat-label">Current Mode</span>
                        <span className="ms-stat-value ms-stat-value--mode">
                            {systemMode.mode.charAt(0).toUpperCase() + systemMode.mode.slice(1)}
                            {systemMode.auto_detected && <span className="ms-auto-badge">Auto</span>}
                        </span>
                    </div>
                    <div className="ms-stat-row">
                        <span className="ms-stat-label">RAM Usage</span>
                        <span className="ms-stat-value">{systemMode.stats.ram_used_mb} MB / {systemMode.stats.ram_available_mb} MB</span>
                    </div>
                    <div className="ms-stat-row">
                        <span className="ms-stat-label">Index Size</span>
                        <span className="ms-stat-value">{systemMode.stats.index_size.toLocaleString()} docs</span>
                    </div>
                    <div className="ms-stat-row">
                        <span className="ms-stat-label">Backend</span>
                        <span className="ms-stat-value">
                            {systemMode.stats.using_onnx ? 'ONNX Runtime' : 'PyTorch'}
                            {systemMode.stats.using_binary && ' + Binary'}
                        </span>
                    </div>
                    {systemMode.oom_protection && (
                        <div className="ms-oom-badge">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                            OOM Protection Active
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
