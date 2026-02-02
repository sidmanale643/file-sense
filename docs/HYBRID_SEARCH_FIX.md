# Hybrid Search Fix

## Problem
Hybrid search was returning empty results even though documents were indexed in the database.

## Root Causes

### 1. BM25 Flag Not Set After Loading from Cache
**Issue**: The `Search` class initialized `bm25_fitted = False`, but when `BM25()` loaded an index from cache, this flag wasn't updated.

**Fix**: Modified `Search.__init__()` to check if BM25 corpus was loaded:
```python
self.bm25_fitted = self.bm_25_retriever.corpus is not None and len(self.bm_25_retriever.corpus) > 0
```

### 2. FAISS Index Not Persisted
**Issue**: FAISS index was stored in-memory only. When the application restarted:
- SQLite database retained all records ✓
- BM25 was cached and restored ✓
- FAISS index was reset to empty ✗

**Fix**: Added persistence for FAISS index:
- Added `_save_cache()` method to save index to `./db/faiss_index.bin`
- Added `_load_cache()` method to restore index on initialization
- Modified `index()` and `index_document()` to auto-save after indexing

## Changes Made

### `/src/services/hybrid_search.py`
1. Updated `Search.__init__()` to check BM25 corpus on initialization
2. Added initialization status logging (BM25 + FAISS status)
3. Added FAISS empty check in `dense_search()` with helpful error message

### `/src/services/idx.py`
1. Imported `write_index` and `read_index` from FAISS
2. Added `cache_dir` and `cache_path` parameters to `FaissIndex.__init__()`
3. Added `_save_cache()` method to persist FAISS index
4. Added `_load_cache()` method to restore FAISS index
5. Added `clear_cache()` method to reset FAISS index
6. Modified `index()` to save after batch indexing
7. Modified `index_document()` to save after single document indexing

### `/src/services/test.ipynb`
Added diagnostic cells:
1. Cell to check search system status (BM25, FAISS, database)
2. Cell to re-index from database if needed

## How to Use

### First Time Setup
```python
from pp import Pipeline

pipeline = Pipeline()
pipeline.index_dir("test")  # This now saves both BM25 and FAISS to cache
```

### Subsequent Sessions
```python
from pp import Pipeline

pipeline = Pipeline()  # Automatically loads BM25 and FAISS from cache
result = pipeline.hybrid_search_file("your query")
```

### If FAISS Index is Missing
Run the re-indexing cell in the notebook to rebuild FAISS from database records.

## Verification

Check the initialization output:
```
Search initialized:
  - BM25: ✓ Loaded from cache (5 documents)
  - FAISS: 5 vectors indexed
```

Both should show non-zero values for hybrid search to work properly.

## Cache Files
The system now creates these cache files in `./db/`:
- `bm25_cache.pkl` - BM25 retriever state
- `faiss_index.bin` - FAISS vector index

Both are automatically managed (save on index, load on init).


