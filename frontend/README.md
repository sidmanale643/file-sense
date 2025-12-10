# FileSense Spotlight UI (Vite + React + TS)

## Setup

```bash
cd frontend
npm install
npm run dev
```

The dev server runs on http://localhost:5173 by default.

## API configuration

- Default API base: `http://localhost:8000`
- Override with `VITE_API_BASE_URL` (e.g. `http://localhost:8000`)

## Usage

- Type a query and press Enter — calls `/search`.
- Click **Search inside files** to use `/hybrid_search`.
- `⌘+K` (or `Ctrl+K`) focuses the input quickly.
