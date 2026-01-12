import { useEffect, useCallback } from 'react';

interface UseGlobalShortcutsOptions {
    onFocusSearch?: () => void;
    onClear?: () => void;
    onTogglePreview?: () => void;
    onToggleIndexManager?: () => void;
    enabled?: boolean;
}

/**
 * Global keyboard shortcuts hook
 * Listens for shortcuts at document level:
 * - "/" to focus search
 * - "Cmd+K" or "Ctrl+K" to clear search
 * - "Space" to toggle preview (only when not typing in input)
 * - "Cmd+I" or "Ctrl+I" to toggle index manager
 */
export function useGlobalShortcuts({
    onFocusSearch,
    onClear,
    onTogglePreview,
    onToggleIndexManager,
    enabled = true,
}: UseGlobalShortcutsOptions = {}) {
    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (!enabled) return;

            const target = event.target as HTMLElement;
            const isInputFocused = target.tagName === 'INPUT' ||
                                   target.tagName === 'TEXTAREA' ||
                                   target.isContentEditable;

            // "/" to focus search (only when not already typing in an input)
            if (event.key === '/' && !isInputFocused) {
                event.preventDefault();
                onFocusSearch?.();
                return;
            }

            // Cmd+K or Ctrl+K to clear search
            if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
                event.preventDefault();
                onClear?.();
                return;
            }

            // Space to toggle preview (only when not typing in an input)
            if (event.key === ' ' && !isInputFocused) {
                event.preventDefault();
                onTogglePreview?.();
                return;
            }

            // Cmd+I or Ctrl+I to toggle index manager
            if ((event.metaKey || event.ctrlKey) && event.key === 'i') {
                event.preventDefault();
                onToggleIndexManager?.();
                return;
            }
        },
        [enabled, onFocusSearch, onClear, onTogglePreview, onToggleIndexManager]
    );

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);
}
