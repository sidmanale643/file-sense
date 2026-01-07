import { useState, useCallback, useEffect } from 'react';

interface UseKeyboardNavOptions {
    itemCount: number;
    onSelect?: (index: number) => void;
    onAction?: (index: number) => void;
    onSecondaryAction?: (index: number) => void;
    onEscape?: () => void;
    enabled?: boolean;
}

interface UseKeyboardNavReturn {
    selectedIndex: number;
    setSelectedIndex: (index: number) => void;
    handleKeyDown: (event: React.KeyboardEvent) => void;
}

export function useKeyboardNav({
    itemCount,
    onSelect,
    onAction,
    onSecondaryAction,
    onEscape,
    enabled = true,
}: UseKeyboardNavOptions): UseKeyboardNavReturn {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Reset selection when item count changes
    useEffect(() => {
        if (selectedIndex >= itemCount) {
            setSelectedIndex(Math.max(0, itemCount - 1));
        }
    }, [itemCount, selectedIndex]);

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent) => {
            if (!enabled || itemCount === 0) return;

            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault();
                    setSelectedIndex((prev) => {
                        const next = prev < itemCount - 1 ? prev + 1 : prev;
                        onSelect?.(next);
                        return next;
                    });
                    break;

                case 'ArrowUp':
                    event.preventDefault();
                    setSelectedIndex((prev) => {
                        const next = prev > 0 ? prev - 1 : prev;
                        onSelect?.(next);
                        return next;
                    });
                    break;

                case 'Enter':
                    event.preventDefault();
                    if (event.metaKey || event.ctrlKey) {
                        onSecondaryAction?.(selectedIndex);
                    } else {
                        onAction?.(selectedIndex);
                    }
                    break;

                case 'Escape':
                    event.preventDefault();
                    onEscape?.();
                    break;

                case 'Tab':
                    event.preventDefault();
                    if (event.shiftKey) {
                        setSelectedIndex((prev) => {
                            const next = prev > 0 ? prev - 1 : itemCount - 1;
                            onSelect?.(next);
                            return next;
                        });
                    } else {
                        setSelectedIndex((prev) => {
                            const next = prev < itemCount - 1 ? prev + 1 : 0;
                            onSelect?.(next);
                            return next;
                        });
                    }
                    break;
            }
        },
        [enabled, itemCount, selectedIndex, onSelect, onAction, onSecondaryAction, onEscape]
    );

    return {
        selectedIndex,
        setSelectedIndex,
        handleKeyDown,
    };
}
