import type { HardwareProfile, OperatingMode } from '../types';
import './SystemStats.css';

interface SystemStatsProps {
    hardwareProfile: HardwareProfile | null;
    recommendedMode: OperatingMode | null;
    isLoading?: boolean;
}

export function SystemStats({ hardwareProfile, recommendedMode, isLoading }: SystemStatsProps) {
    if (isLoading) {
        return (
            <div className="system-stats">
                <div className="ss-loading">
                    <svg className="ss-spinner" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2" opacity="0.25" />
                        <path fill="none" strokeWidth="2" d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                    <span>Detecting hardware...</span>
                </div>
            </div>
        );
    }

    if (!hardwareProfile) {
        return (
            <div className="system-stats">
                <div className="ss-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    <span>Hardware information unavailable</span>
                </div>
            </div>
        );
    }

    const formatRam = (gb: number) => {
        if (gb >= 1) return `${gb.toFixed(1)} GB`;
        return `${Math.round(gb * 1024)} MB`;
    };

    return (
        <div className="system-stats">
            <div className="ss-header">
                <h3 className="ss-title">System Information</h3>
                <p className="ss-subtitle">Hardware profile and capabilities</p>
            </div>

            <div className="ss-grid">
                {/* RAM */}
                <div className="ss-card">
                    <div className="ss-icon ss-icon--ram">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                            <line x1="8" y1="21" x2="16" y2="21" />
                            <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                    </div>
                    <div className="ss-content">
                        <span className="ss-value">{formatRam(hardwareProfile.ram_gb)}</span>
                        <span className="ss-label">Total RAM</span>
                    </div>
                </div>

                {/* Available RAM */}
                <div className="ss-card">
                    <div className="ss-icon ss-icon--available">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2v20M2 12h20" />
                        </svg>
                    </div>
                    <div className="ss-content">
                        <span className="ss-value">{formatRam(hardwareProfile.available_ram_gb)}</span>
                        <span className="ss-label">Available</span>
                    </div>
                </div>

                {/* CPU */}
                <div className="ss-card">
                    <div className="ss-icon ss-icon--cpu">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
                            <rect x="9" y="9" width="6" height="6" />
                            <line x1="9" y1="1" x2="9" y2="4" />
                            <line x1="15" y1="1" x2="15" y2="4" />
                            <line x1="9" y1="20" x2="9" y2="23" />
                            <line x1="15" y1="20" x2="15" y2="23" />
                            <line x1="20" y1="9" x2="23" y2="9" />
                            <line x1="20" y1="14" x2="23" y2="14" />
                            <line x1="1" y1="9" x2="4" y2="9" />
                            <line x1="1" y1="14" x2="4" y2="14" />
                        </svg>
                    </div>
                    <div className="ss-content">
                        <span className="ss-value">{hardwareProfile.cpu_cores}</span>
                        <span className="ss-label">CPU Cores</span>
                    </div>
                </div>

                {/* GPU */}
                <div className="ss-card">
                    <div className={`ss-icon ${hardwareProfile.has_gpu ? 'ss-icon--gpu-yes' : 'ss-icon--gpu-no'}`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 7h6m-6 5h6m-6 5h6M3 7h2.5a2.5 2.5 0 0 1 0 5H3V7z" />
                            <path d="M3 12h2.5a2.5 2.5 0 0 1 0 5H3v-5z" />
                            <path d="M3 17h2.5a2.5 2.5 0 0 1 0 5H3v-5z" />
                        </svg>
                    </div>
                    <div className="ss-content">
                        <span className="ss-value">
                            {hardwareProfile.has_gpu 
                                ? (hardwareProfile.gpu_type || 'GPU').toUpperCase()
                                : 'None'
                            }
                        </span>
                        <span className="ss-label">GPU</span>
                    </div>
                </div>
            </div>

            {/* ONNX Support */}
            <div className={`ss-onnx-badge ${hardwareProfile.supports_onnx ? 'ss-onnx-badge--yes' : 'ss-onnx-badge--no'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {hardwareProfile.supports_onnx ? (
                        <>
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                        </>
                    ) : (
                        <>
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                        </>
                    )}
                </svg>
                <span>
                    {hardwareProfile.supports_onnx 
                        ? 'ONNX Runtime Available (2-3x faster inference)'
                        : 'ONNX Not Available (using PyTorch fallback)'
                    }
                </span>
            </div>

            {/* Recommendation */}
            {recommendedMode && (
                <div className="ss-recommendation">
                    <div className="ss-rec-header">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                        <span>Recommended Mode</span>
                    </div>
                    <div className="ss-rec-mode">
                        <span className="ss-rec-label">
                            {recommendedMode === 'eco' && '🌱 Eco Mode'}
                            {recommendedMode === 'balanced' && '⚖️ Balanced Mode'}
                            {recommendedMode === 'performance' && '🚀 Performance Mode'}
                        </span>
                        <span className="ss-rec-reason">
                            {recommendedMode === 'eco' && 'Based on limited available RAM (< 2GB)'}
                            {recommendedMode === 'balanced' && 'Optimal for your system (2-4GB available)'}
                            {recommendedMode === 'performance' && 'Your system can handle maximum performance (> 4GB available)'}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
