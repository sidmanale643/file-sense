# FileSense Frontend

React + TypeScript + Vite frontend for the FileSense hybrid search engine.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

## Development

The frontend connects to the backend API at `http://localhost:8000`. The Vite dev server runs on `http://localhost:5173` by default.

## Architecture

- **Spotlight.tsx** — Main search interface with keyboard navigation
- **SearchInput.tsx** — Debounced search input component
- **ResultsList.tsx** — Results display with scoring
- **useSearch.ts** — Search state management hook
- **api.ts** — Centralized API client

## Design

The UI follows bold, distinctive aesthetics with CSS-only animations. See `frontend_guidelines.md` for design philosophy.
