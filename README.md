# 📁 FileSense

**A local-first semantic file search engine** that combines traditional keyword search (BM25) with AI-powered semantic search (FAISS + sentence embeddings) to help you find your documents instantly.

![Python](https://img.shields.io/badge/python-3.12+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.124+-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## ✨ Features

- **🔍 Hybrid Search** — Combines BM25 lexical search with dense vector search for best-of-both-worlds retrieval
- **📄 Multi-format Support** — Index and search TXT, DOCX, and PDF files (with OCR via Docling)
- **🧠 Semantic Understanding** — Uses sentence-transformers for meaning-based search, not just keyword matching
- **⚡ Fast Retrieval** — FAISS vector index for millisecond-level search across thousands of documents
- **🔄 Smart Chunking** — Intelligent text chunking to handle large documents effectively
- **🖥️ Modern UI** — React + TypeScript frontend with file preview capabilities
- **📂 File Actions** — Open files and folders directly from the search interface
- **💾 Persistent Index** — BM25 and FAISS indices are cached to disk for fast startup

## 🚀 Quick Start

### Prerequisites

- Python 3.12+
- [uv](https://github.com/astral-sh/uv) package manager (recommended) or pip
- Node.js 18+ (for frontend)

### Backend Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/file-sense.git
cd file-sense

# Create virtual environment and install dependencies
uv sync

# Activate the virtual environment
source .venv/bin/activate

# Start the API server
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`.

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The UI will be available at `http://localhost:5173`.

## 📖 Usage

### 1. Index Your Documents

First, index a directory of documents:

```python
from src.pp import Pipeline

pipeline = Pipeline()
result = pipeline.index_dir("/path/to/your/documents")
print(f"Indexed {result['inserted']} documents")
```

Or via the API:

```bash
curl -X POST http://localhost:8000/index \
  -H "Content-Type: application/json" \
  -d '{"dir_path": "/path/to/your/documents"}'
```

### 2. Search Your Documents

**Hybrid Search** (recommended):
```bash
curl -X POST http://localhost:8000/hybrid_search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "machine learning concepts",
    "k": 10,
    "alpha": 0.5
  }'
```

**Search Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Search query |
| `k` | int | 10 | Number of results to return |
| `alpha` | float | 0.5 | Balance between BM25 (0) and dense (1) |
| `deduplicate` | bool | true | Remove duplicate chunks from same file |
| `rerank` | bool | false | Apply reranking to results |

## 🏗️ Architecture

```
file-sense/
├── main.py              # FastAPI endpoints
├── src/
│   ├── pp.py            # Pipeline orchestrator
│   └── services/
│       ├── bm25_ret.py      # BM25 retriever
│       ├── idx.py           # FAISS vector index
│       ├── hybrid_search.py # Hybrid search logic
│       ├── emb.py           # Sentence embeddings
│       ├── text_chunker.py  # Smart text chunking
│       ├── file_manager.py  # SQLite database
│       ├── reranker.py      # Result reranking
│       └── document_loader/ # File loaders (TXT, DOCX, PDF)
├── frontend/            # React + TypeScript UI
└── db/                  # Cached indices & SQLite DB
```

## 🔧 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health_check` | GET | Health check |
| `/search` | POST | Basic file search |
| `/hybrid_search` | POST | Hybrid BM25 + dense search |
| `/index` | POST | Index documents from directory |
| `/preview_file` | POST | Preview file content |
| `/open_file` | POST | Open file in default app |
| `/open_folder` | POST | Open folder in file manager |

## 🛠️ Tech Stack

- **Backend**: Python 3.12, FastAPI, Uvicorn
- **Search**: FAISS, BM25s, Sentence Transformers
- **Document Processing**: Docling (PDF OCR), python-docx
- **Database**: SQLite
- **Frontend**: React, TypeScript, Vite

## 📝 Cache Files

The system automatically creates these cache files in `./db/`:
- `bm25_cache.pkl` — BM25 retriever state
- `faiss_index.bin` — FAISS vector index
- `db.sqlite3` — Document metadata and text

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
