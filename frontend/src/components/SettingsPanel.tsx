import { useState, useEffect, useCallback } from 'react';
import { ModeSelector } from './ModeSelector';
import { SystemStats } from './SystemStats';
import { getHardwareProfile, getSystemMode, setSystemMode as apiSetSystemMode, autoDetectMode } from '../services/api';
import type { HardwareProfile, SystemMode, OperatingMode } from '../types';
import './SettingsPanel.css';

interface SettingsPanelProps {
    onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
    const [hardwareProfile, setHardwareProfile] = useState<HardwareProfile | null>(null);
    const [systemMode, setSystemMode] = useState<SystemMode | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isModeSwitching, setIsModeSwitching] = useState(false);
    const [isAutoDetecting, setIsAutoDetecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

    // Load hardware and mode data
    const loadData = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const [hardwareData, modeData] = await Promise.all([
                getHardwareProfile(),
                getSystemMode(),
            ]);

            setHardwareProfile(hardwareData.detected);
            setSystemMode(modeData);
        } catch (err) {
            setError(`Failed to load system data: ${err instanceof Error ? err.message : 'Unknown error'}`);
            console.error('Failed to load system data:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleModeChange = async (mode: OperatingMode) => {
        if (!systemMode || systemMode.mode === mode) return;

        try {
            setIsModeSwitching(true);
            setError(null);

            const result = await apiSetSystemMode(mode);

            setSuccessMessage(result.message);
            setSystemMode(prev => prev ? { ...prev, mode, auto_detected: false } : null);

            // Refresh to get updated stats
            await loadData();

            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to switch mode');
            console.error('Failed to switch mode:', err);
        } finally {
            setIsModeSwitching(false);
        }
    };

    const handleAutoDetect = async () => {
        try {
            setIsAutoDetecting(true);
            setError(null);

            const result = await autoDetectMode();

            setSuccessMessage(`Switched to ${result.detected_mode} mode`);
            setSystemMode(prev => prev ? { ...prev, mode: result.detected_mode, auto_detected: true } : null);

            // Refresh to get updated stats
            await loadData();

            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to auto-detect mode');
            console.error('Failed to auto-detect mode:', err);
        } finally {
            setIsAutoDetecting(false);
        }
    };

    const getRecommendedMode = (): OperatingMode | null => {
        if (!hardwareProfile) return null;
        if (hardwareProfile.available_ram_gb < 2) return 'eco';
        if (hardwareProfile.available_ram_gb < 4) return 'balanced';
        return 'performance';
    };

    return (
        <div className="settings-panel">
            {/* Header */}
            <header className="sp-header">
                <div className="sp-header-content">
                    <h1 className="sp-title">Settings</h1>
                    <p className="sp-subtitle">Configure indexing and search performance</p>
                </div>
                <div className="sp-header-actions">
                    <button className="sp-close-btn" onClick={onClose} aria-label="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* Scrollable Content */}
            <div className="sp-content">
                {/* Loading State */}
                {isLoading ? (
                    <div className="sp-loading">
                        <svg className="sp-spinner sp-spinner--large" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2" opacity="0.25" />
                            <path fill="none" strokeWidth="2" d="M12 2a10 10 0 0 1 10 10" />
                        </svg>
                        <p>Loading system information...</p>
                    </div>
                ) : (
                    <>
                        {/* Messages */}
                        {error && (
                            <div className="sp-message sp-message--error">
                                <svg className="sp-message-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                <span className="sp-message-text">{error}</span>
                                <button className="sp-message-dismiss" onClick={() => setError(null)} aria-label="Dismiss">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            </div>
                        )}

                        {successMessage && (
                            <div className="sp-message sp-message--success">
                                <svg className="sp-message-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                    <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                                <span className="sp-message-text">{successMessage}</span>
                                <button className="sp-message-dismiss" onClick={() => setSuccessMessage(null)} aria-label="Dismiss">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            </div>
                        )}

                        {/* System Stats Section */}
                        <section className="sp-section">
                            <SystemStats
                                hardwareProfile={hardwareProfile}
                                recommendedMode={getRecommendedMode()}
                                isLoading={isLoading}
                            />
                        </section>

                        {/* Mode Selector Section */}
                        <section className="sp-section">
                            <ModeSelector
                                currentMode={systemMode?.mode || 'balanced'}
                                systemMode={systemMode}
                                hardwareProfile={hardwareProfile}
                                onModeChange={handleModeChange}
                                isLoading={isModeSwitching}
                            />
                        </section>

                        {/* Auto-Detect Button */}
                        <section className="sp-section sp-section--centered">
                            <button
                                className="sp-autodetect-btn"
                                onClick={handleAutoDetect}
                                disabled={isAutoDetecting}
                            >
                                {isAutoDetecting ? (
                                    <>
                                        <svg className="sp-spinner" viewBox="0 0 24 24">
                                            <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2" opacity="0.25" />
                                            <path fill="none" strokeWidth="2" d="M12 2a10 10 0 0 1 10 10" />
                                        </svg>
                                        Detecting...
                                    </>
                                ) : (
                                    <>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                                        </svg>
                                        Auto-Detect Hardware & Set Mode
                                    </>
                                )}
                            </button>
                        </section>

                        {/* Info Section */}
                        <section className="sp-section sp-section--info">
                            <div className="sp-info-box">
                                <h4 className="sp-info-title">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="16" x2="12" y2="12" />
                                        <line x1="12" y1="8" x2="12.01" y2="8" />
                                    </svg>
                                    About Performance Modes
                                </h4>
                                <p className="sp-info-text">
                                    FileSense automatically adapts to your system's capabilities. 
                                    Choose a mode based on your available RAM and performance needs:
                                </p>
                                <ul className="sp-info-list">
                                    <li><strong>Eco Mode:</strong> Best for systems with less than 2GB RAM. Uses binary quantization for 32x memory reduction.</li>
                                    <li><strong>Balanced Mode:</strong> Recommended for most systems. Good balance of speed and memory usage.</li>
                                    <li><strong>Performance Mode:</strong> For systems with 4GB+ RAM. Full precision embeddings for best accuracy.</li>
                                </ul>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}
