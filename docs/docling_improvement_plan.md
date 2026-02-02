# Docling Pipeline Improvement Plan

**Status:** Planned  
**Last Updated:** 2026-02-01  
**Priority:** High

## Executive Summary

This document outlines a comprehensive plan to optimize the Docling OCR service pipeline for improved performance, memory efficiency, and scalability.

## Current Issues Identified

### 1. Converter per Process (Critical)
- **Problem**: Each parallel worker creates a new `DoclingOCRService` instance, losing the benefit of converter reuse
- **Location**: `pipeline.py:55` in `_load_file_worker()`
- **Impact**: High memory overhead (AI models loaded multiple times)

### 2. No Batch OCR Utilization (High)
- **Problem**: The `convert_batch()` API exists but isn't leveraged - files are processed individually
- **Location**: `ocr.py:80-96` - batch method defined but unused
- **Impact**: Missing Docling's internal batch optimizations

### 3. PDF-Specific Bottleneck (High)
- **Problem**: PDFs are processed one-by-one even in parallel mode
- **Impact**: Suboptimal throughput for PDF-heavy workloads

### 4. Memory Overhead (Medium)
- **Problem**: Creating multiple DocumentConverter instances wastes memory
- **Impact**: Each converter loads OCR models into memory

### 5. No Async Support (Low)
- **Problem**: Synchronous processing blocks the pipeline
- **Impact**: API endpoints block during file indexing

## Proposed Improvements

---

### Phase 1: Singleton Converter with Process Pool ✅ IMPLEMENTED
**Priority:** HIGH | **Complexity:** Medium | **Expected Speedup:** 40-60% | **Status:** COMPLETE

#### Goal
Share DocumentConverter across workers using a singleton pattern with process initialization.

#### Implementation ✅
1. ✅ Created `initialize_worker_converter()` function that sets up a module-level singleton
2. ✅ Updated ProcessPoolExecutor to use `initializer` parameter
3. ✅ Each worker process now gets one converter, reused for all files

#### Changes Made

**`src/services/document_loader/loaders/ocr.py`:**
- Added module-level `_worker_converter: Optional[DocumentConverter] = None` singleton
- Added `initialize_worker_converter()` function for ProcessPoolExecutor initializer
- Added `get_worker_ocr_service()` to access singleton-backed service
- Added `load_pdf_worker()` convenience function

**`src/services/pipeline.py`:**
- Updated import to include `initialize_worker_converter`
- Modified `_load_file_worker()` to use `get_worker_ocr_service()` instead of creating new instances
- Updated both ProcessPoolExecutor calls (lines 262, 680) to use `initializer=initialize_worker_converter`

#### Benefits
- Eliminates per-file converter creation overhead
- Significant memory savings (model loaded once per worker, not once per file)
- Substantial speedup for large batches (estimated 40-60%)
- Backward compatible: non-parallel code still works as before

#### Trade-offs
- Workers become stateful (need careful cleanup)
- Longer initial worker startup time (one-time cost per worker)

---

### Phase 2: Batch Processing for PDFs
**Priority:** HIGH | **Complexity:** Medium | **Expected Speedup:** 30-50%

#### Goal
Group PDFs and process them using Docling's batch API.

#### Implementation
1. Modify `_load_file_worker()` to accept batches of files instead of single files
2. Separate PDFs from other file types before parallel processing
3. Use `DoclingOCRService.convert_batch()` for PDF groups
4. Keep sequential processing for TXT/DOCX (fast enough)

#### Benefits
- Reduces DocumentConverter instantiation overhead
- Leverages Docling's internal optimizations
- Significant speedup for PDF-heavy workloads

#### Trade-offs
- Slightly more complex worker logic
- Need to handle mixed file types differently

#### Files to Modify
- `src/services/pipeline.py` - Refactor file grouping and batch processing logic
- `src/services/document_loader/loaders/ocr.py` - Optimize batch method

---

### Phase 3: Smart File Type Routing
**Priority:** MEDIUM | **Complexity:** Medium | **Expected Improvement:** 20-30%

#### Goal
Optimize routing based on file characteristics for optimal resource utilization.

#### Implementation
1. Route small TXT/DOCX files to sequential processing (low overhead)
2. Route PDFs and large files to parallel batch processing
3. Add file size thresholds (e.g., >1MB files get parallel treatment)
4. Prioritize by file type: TXT (fast) → DOCX (medium) → PDF (slow)

#### Benefits
- Optimal resource utilization
- Reduces process pool overhead for trivial files
- Adaptive to workload characteristics

#### Trade-offs
- Requires profiling to determine optimal thresholds
- More complex scheduling logic

#### Files to Modify
- `src/services/pipeline.py` - Add routing logic to `index_dir()` and `index_files_parallel()`
- May need new configuration constants

---

### Phase 4: Async Docling Wrapper
**Priority:** MEDIUM | **Complexity:** High | **Expected Improvement:** Better responsiveness

#### Goal
Add async support to prevent blocking during OCR operations.

#### Implementation
1. Create `AsyncDoclingOCRService` wrapper using `asyncio` + `run_in_executor()`
2. Integrate with FastAPI endpoints for non-blocking file indexing
3. Add concurrent PDF limit to prevent memory exhaustion

#### Benefits
- Better responsiveness in API endpoints
- Can handle multiple indexing requests concurrently
- Fits FastAPI's async paradigm

#### Trade-offs
- Requires refactoring of pipeline methods
- More complex error handling

#### Files to Modify
- `src/services/document_loader/loaders/ocr.py` - Add async wrapper class
- `src/main.py` - Update API endpoints to use async
- `src/services/pipeline.py` - Consider async variants of indexing methods

---

### Phase 5: Docling Pipeline Configuration
**Priority:** LOW | **Complexity:** Low | **Expected Improvement:** Customizable performance

#### Goal
Expose Docling-specific options for power users.

#### Implementation
1. Add environment variables:
   - `DOCLING_BATCH_SIZE` - Control batch size (default: 4)
   - `DOCLING_NUM_THREADS` - Control Docling internal parallelism
   - `DOCLING_DEVICE` - GPU/CPU selection
2. Support Docling's native GPU acceleration options
3. Allow custom DocumentConverter configuration (OCR engines, models, etc.)

#### Benefits
- User-customizable performance
- Can leverage GPU for OCR if available
- Future-proof for Docling updates

#### Trade-offs
- More configuration complexity
- Testing matrix expansion

#### Files to Modify
- `src/services/document_loader/loaders/ocr.py` - Add configuration support
- Environment/config files for new variables
- Documentation

---

## Recommended Implementation Order

1. **Phase 2** (Singleton Converter) - Biggest impact, relatively straightforward
2. **Phase 1** (Batch Processing) - Builds on Phase 2, clear performance gain
3. **Phase 3** (Smart Routing) - Optimizes the overall approach
4. **Phase 4** (Async) - If API responsiveness is a priority
5. **Phase 5** (Configuration) - Nice-to-have customization

## Testing Strategy

### Benchmarks Required
- [ ] Test with 50+ PDFs of varying sizes (1MB to 50MB)
- [ ] Memory profiling before/after each phase
- [ ] Compare sequential vs parallel vs batch modes
- [ ] Test with mixed file types (TXT/DOCX/PDF in various ratios)
- [ ] Stress test with 1000+ files

### Metrics to Track
- **Throughput**: Files processed per second
- **Memory Usage**: Peak memory consumption
- **Latency**: Time to first result
- **Error Rate**: Failed OCR operations
- **CPU Utilization**: Core usage efficiency

### Test Scenarios
1. Single large PDF (100+ pages)
2. 100 small PDFs (< 1MB each)
3. Mixed workload: 50% TXT, 30% DOCX, 20% PDF
4. Concurrent indexing requests

## Files to Modify

### Core Implementation
- `src/services/document_loader/loaders/ocr.py` - Docling service improvements
- `src/services/pipeline.py` - Pipeline integration (lines 26-68, 255-260, 668-672)

### Supporting Changes
- `src/services/memory_manager.py` - Worker memory management adjustments
- `src/main.py` - API endpoint updates (for async)
- Configuration files - Environment variables

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Memory leaks in worker processes | Medium | High | Implement proper cleanup, set process recycling |
| Backwards compatibility breaks | Low | High | Maintain existing API, add new methods |
| Docling version compatibility | Medium | Medium | Pin version, test before upgrades |
| Performance regression for small batches | Low | Medium | A/B testing, threshold tuning |

## Success Criteria

- [ ] 40%+ improvement in PDF processing throughput
- [ ] 30%+ reduction in memory usage for large batches
- [ ] No breaking changes to existing API
- [ ] All existing tests pass
- [ ] New benchmarks documented

## Notes

- Current parallel mode is disabled by default in `index_dir()` due to OOM concerns
- Batch flush size is configurable via `FILESENSE_BATCH_FLUSH_SIZE` (default: 20)
- Docling's DocumentConverter supports GPU acceleration - should be leveraged in Phase 5
- ProcessPoolExecutor already used at lines 255-260 and 668-672

## References

- Current Docling service: `src/services/document_loader/loaders/ocr.py`
- Pipeline implementation: `src/services/pipeline.py`
- Memory management: `src/services/memory_manager.py`
- Docling documentation: https://github.com/DS4SD/docling

---

## Implementation Log

### Phase 1 (Singleton Converter) - Completed 2026-02-01

**Summary:** Implemented singleton DocumentConverter pattern for worker processes to eliminate per-file converter instantiation overhead.

**Files Modified:**
1. `src/services/document_loader/loaders/ocr.py` (+62 lines)
   - Added `_worker_converter` module-level singleton
   - Added `initialize_worker_converter()` for ProcessPoolExecutor initializer
   - Added `get_worker_ocr_service()` for accessing singleton-backed service
   - Added `load_pdf_worker()` convenience function

2. `src/services/pipeline.py` (+8 lines, modified 4 lines)
   - Updated imports to include `initialize_worker_converter`
   - Modified `_load_file_worker()` to use `get_worker_ocr_service()`
   - Added `initializer=initialize_worker_converter` to both ProcessPoolExecutor calls
   - Added explanatory comments

**Key Technical Details:**
- Module-level singleton `_worker_converter` persists across all files processed by a single worker process
- `initialize_worker_converter()` is called once per worker via ProcessPoolExecutor's `initializer` parameter
- `get_worker_ocr_service()` returns a `DoclingOCRService` instance backed by the shared converter
- If `initialize_worker_converter()` hasn't been called, falls back to creating a new converter (backward compatible)

**Performance Impact:**
- Estimated 40-60% speedup for PDF-heavy workloads
- Significant memory reduction (OCR model loaded once per worker, not once per file)
- One-time initialization cost per worker process (minimal impact for large batches)

**Next Steps:**
- Benchmark with 50+ PDFs to measure actual performance gains
- Monitor memory usage during large batch processing
- Consider implementing Phase 3 (Smart File Type Routing) for optimal resource allocation
