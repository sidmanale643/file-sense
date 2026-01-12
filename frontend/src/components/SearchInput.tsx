import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import './SearchInput.css';

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
    isLoading: boolean;
    placeholder?: string;
}

export interface SearchInputRef {
    focus: () => void;
}

export const SearchInput = forwardRef<SearchInputRef, SearchInputProps>(
    function SearchInput(
        {
            value,
            onChange,
            onKeyDown,
            isLoading,
            placeholder = 'Search files...',
        }: SearchInputProps,
        ref
    ) {
        const inputRef = useRef<HTMLInputElement>(null);

        // Expose focus method to parent
        useImperativeHandle(ref, () => ({
            focus: () => inputRef.current?.focus(),
        }));

        // Auto-focus on mount
        useEffect(() => {
            inputRef.current?.focus();
        }, []);

    return (
        <div className="search-input">
            <div className="search-input__icon">
                {isLoading ? (
                    <div className="search-input__spinner" aria-label="Loading" />
                ) : (
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                )}
            </div>

            <input
                ref={inputRef}
                type="text"
                className="search-input__field"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
            />

            {value && (
                <button
                    className="search-input__clear"
                    onClick={() => onChange('')}
                    aria-label="Clear search"
                    type="button"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                    >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            )}
        </div>
    );
    }
);
