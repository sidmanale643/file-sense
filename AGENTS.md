# AGENTS.md - FileSense Repository Guide

This file contains guidelines for AI coding agents working in this repository.

## Project Overview

FileSense is a hybrid search engine combining BM25 and semantic search for local document retrieval. It consists of:
- **Backend**: Python 3.12+ with FastAPI (src/)
- **Frontend**: React 19 + TypeScript + Vite (frontend/)
- **Package Manager**: uv (Python), npm (frontend)

## Build/Lint/Test Commands

### Python Backend
```bash
# Install dependencies
uv sync

# Run the development server
./start.sh
# OR
uv run uvicorn src.main:app --reload

# Run a single Python file
uv run python src/services/hybrid_search.py

# Run tests (no pytest configured, tests are executable scripts)
uv run python tests/test_incremental_bm25.py

# Format code (install ruff first if needed)
ruff check src/
ruff format src/
```

### Frontend
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Lint TypeScript/React
npm run lint

# Preview production build
npm run preview
```

## Code Style Guidelines

### Python

**Imports**:
- Standard library imports first
- Third-party imports second  
- Local imports third (use relative imports: `from .module import X`)
- Group imports with blank lines between groups

**Formatting**:
- 4 spaces for indentation
- Line length: follow existing patterns (no strict limit observed)
- Use double quotes for strings
- Trailing commas in multi-line collections

**Types**:
- Use type hints where practical (typing import: `List`, `Optional`, `Dict`, etc.)
- Pydantic models for API request/response schemas

**Naming**:
- snake_case for functions and variables
- PascalCase for classes
- UPPER_CASE for constants
- Private methods prefixed with `_`

**Error Handling**:
- Use specific exceptions
- Log errors with context: `logger.error(f"[Component] Operation failed: {e}")`
- In FastAPI endpoints, raise HTTPException with appropriate status codes
- Use try/except with specific error handling patterns

**Architecture**:
- Services in `src/services/` with clear separation of concerns
- Use dataclasses for structured data
- Context managers for resource management (database connections)
- Thread-safe operations with locks where needed

### TypeScript/React

**Imports**:
- React imports first
- Third-party libraries second
- Local components/utilities third
- CSS imports last

**Formatting**:
- 4 spaces for indentation
- Single quotes for strings
- Semicolons required

**Types**:
- Use explicit types for props and state
- Define interfaces in component files or types/ directory
- Use `React.FC` or function components with typed props

**Naming**:
- PascalCase for components and interfaces
- camelCase for functions and variables
- CSS modules use kebab-case

**Components**:
- One component per file
- Forward refs with `forwardRef<RefType, PropsType>`
- Use CSS files for component styles (not CSS-in-JS)

**Design Guidelines** (from frontend_guidelines.md):
- Choose a BOLD aesthetic direction (minimalist, maximalist, retro, etc.)
- Never use generic fonts (Arial, Inter, Roboto, system fonts)
- Avoid purple gradients on white backgrounds
- Use CSS variables for theming
- Implement meaningful animations with Motion library
- Create atmosphere with textures, gradients, overlays

## Project Structure

```
file-sense/
├── src/                    # Python backend
│   ├── main.py            # FastAPI application
│   └── services/          # Business logic
│       ├── pipeline.py    # Main indexing/search pipeline
│       ├── hybrid_search.py
│       ├── idx.py         # FAISS index management
│       ├── bm25_ret.py    # BM25 retrieval
│       ├── file_manager.py
│       └── document_loader/
├── frontend/              # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # API clients
│   │   └── types/         # TypeScript types
│   └── package.json
├── tests/                 # Python tests
├── db/                    # Database/cache files
└── docs/                  # Documentation
```

## Key Dependencies

**Backend**:
- FastAPI + uvicorn for API
- sentence-transformers for embeddings
- faiss-cpu for vector search
- elasticsearch for BM25
- docling for document parsing
- chonkie for text chunking

**Frontend**:
- React 19 + TypeScript 5.9
- Framer Motion for animations
- Three.js for 3D effects
- Vite for build tooling
- ESLint + typescript-eslint for linting

## Testing

- Python tests are executable scripts in `tests/`
- No pytest configured; run tests directly: `uv run python tests/<test_file>.py`
- Test fixtures in `tests/fixtures/`
- Frontend testing not currently configured

## Notes

- Uses uv.lock for Python dependency locking
- Python 3.12+ required (check .python-version)
- SQLite database for metadata storage
- Supports multiple document formats: PDF, DOCX, TXT
- Hardware-adaptive modes: eco, balanced, performance
