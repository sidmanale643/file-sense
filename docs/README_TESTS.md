# Hybrid Search Tests

This directory contains test files for the hybrid search functionality.

## Test Files

### `test_hybrid_search_simple.py`
**Standalone test script** - Can be run without any dependencies installed.

**Usage:**
```bash
cd src/services
python3 test_hybrid_search_simple.py
```

**What it tests:**
- Deduplication logic with overlapping results
- Deduplication logic with no overlap
- Deduplication with empty results
- Hybrid search logic with deduplication enabled
- Hybrid search logic with deduplication disabled
- Empty results handling
- Error handling structure

### `test_hybrid_search.py`
**Full unittest suite** - Requires dependencies to be installed but provides comprehensive mocking.

**Usage:**
```bash
cd src/services
python3 test_hybrid_search.py
```

**What it tests:**
- All the logic tests from the simple version
- Method signature verification
- Mocked integration tests for the full Search class
- Exception handling in hybrid search

## Test Coverage

The tests cover:

1. **Deduplication Logic** (`_deduplicate` method):
   - Combining BM25 and dense results
   - Prioritizing BM25 results first
   - Removing duplicates while preserving order

2. **Hybrid Search Logic** (`hybrid_search` method):
   - Integration of BM25 and dense search
   - Deduplication toggle functionality
   - Metadata fetching simulation
   - Error handling and response formatting

3. **Edge Cases**:
   - Empty result sets
   - Overlapping vs non-overlapping results
   - Exception handling

## Running Tests

### Option 1: Simple Tests (Recommended)
```bash
cd src/services
python3 test_hybrid_search_simple.py
```

### Option 2: Full Test Suite (Requires Dependencies)
First install dependencies:
```bash
pip install -r requirements.txt
# or
uv sync
```

Then run:
```bash
cd src/services
python3 test_hybrid_search.py
```

## Expected Output

Both test scripts should show:
```
🎉 All tests passed! The hybrid search logic is working correctly.
```

With a summary of what was tested.
