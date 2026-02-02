# FileSense Lightweight Indexing - Implementation Plan

## Overview

**Target**: 4GB RAM minimum devices  
**Approach**: Build from scratch (no migration from existing system)  
**Hardware**: Auto-detect with manual override via UI  
**Search**: Dense-only (no hybrid)  

## Architecture

### Core Philosophy
- **Memory streaming**: Never hold full corpus in memory
- **Aggressive quantization**: 32x memory reduction via binary embeddings  
- **Micro-model**: 384-dim MiniLM (~80MB vs 1.2GB)
- **Simplified chunking**: Paragraph-based (Chonkie optional)
- **Dynamic throttling**: Auto-adjust based on available RAM
- **OOM protection**: Auto-switch to ECO mode on memory errors

---

## Hardware Detection System

### Auto-Detection Logic
```
Available RAM < 2GB  → ECO mode (force)
Available RAM 2-4GB  → BALANCED mode (recommend)
Available RAM > 4GB  → PERFORMANCE mode (recommend)
```

### Detection Components
- **RAM**: Total and available system memory
- **CPU**: Core count and architecture
- **GPU**: CUDA, MPS (Apple Silicon), or none
- **ONNX Support**: Check if onnxruntime available

### Detection Frequency
- Fresh detection on every startup
- No persistence of previous mode selection
- User can manually override via UI/API

---

## Three Operating Modes

| Mode | RAM Target | Batch Size | Embedding | Quantization | ONNX |
|------|-----------|------------|-----------|--------------|------|
| **ECO** | < 500MB | 1-2 | 384-dim MiniLM | Binary (32x) | Yes |
| **BALANCED** | < 1GB | 4-8 | 384-dim MiniLM | Binary (32x) | Yes |
| **PERFORMANCE** | < 2GB | 16 | 384-dim MiniLM | Float32 | Yes |

### Mode Characteristics

**ECO Mode**
- Minimal memory footprint
- Slowest processing (batch size 1)
- Binary quantization (48 bytes per doc vs 1536)
- Aggressive garbage collection
- Paragraph chunking only

**BALANCED Mode**
- Moderate memory usage
- Good processing speed (batch size 4-8)
- Binary quantization for storage
- Standard garbage collection
- Optional Chonkie semantic chunking

**PERFORMANCE Mode**
- Higher memory usage (but still <2GB)
- Fastest processing (batch size 16)
- Float32 embeddings for accuracy
- Minimal garbage collection overhead
- Full Chonkie semantic chunking support

---

## Component Architecture

### 1. Hardware Detector (`src/services/hardware_detector.py`)

```python
class HardwareDetector:
    def detect_profile() -> HardwareProfile:
        """Returns complete hardware profile with recommendations"""
        
    def detect_mode() -> str:
        """Returns recommended mode: 'eco', 'balanced', or 'performance'"""
        
    def get_available_ram() -> float:
        """Returns available RAM in GB"""
```

**Features:**
- Cross-platform (Windows, macOS, Linux)
- GPU detection (CUDA, MPS, ROCm)
- ONNX runtime availability check
- CPU core count and frequency

### 2. ONNX Embedder (`src/services/onnx_embedder.py`)

```python
class ONNXEmbedder:
    MODEL = "sentence-transformers/all-MiniLM-L6-v2"
    DIM = 384
    
    def __init__(self, mode: str):
        # Try ONNX first, fallback to PyTorch
        
    def encode(texts: List[str]) -> np.ndarray:
        # Batch encoding with mode-appropriate batch size
        
    def quantize_binary(embeddings: np.ndarray) -> np.ndarray:
        # Convert float32 (384-dim) to binary (48 bytes)
```

**Binary Quantization:**
- Positive values → 1, negative → 0
- Pack 8 bits into 1 byte
- 384 float32 values (1536 bytes) → 48 bytes
- 32x memory reduction
- Hamming distance for similarity

**ONNX Providers:**
- CPU: `CPUExecutionProvider`
- CUDA: `CUDAExecutionProvider`
- MPS: Not directly supported (fallback to PyTorch)

### 3. Lightweight FAISS Index (`src/services/lightweight_faiss.py`)

```python
class LightweightFAISSIndex:
    def __init__(self, mode: str, dim: int = 384):
        # ECO/BALANCED: IndexBinaryFlat
        # PERFORMANCE: IndexFlatL2
        
    def add(texts: List[str], ids: List[int]) -> None:
        # Encode, optionally quantize, add to index
        
    def search(query: str, k: int = 10) -> Tuple[np.ndarray, np.ndarray]:
        # Dense search only, returns distances and indices
        
    def remove(ids: List[int]) -> int:
        # Remove vectors by ID
```

**Index Types:**
- **Binary (ECO/BALANCED)**: `faiss.IndexBinaryFlat(dim // 8)`
  - 48 bytes per vector
  - Hamming distance computation
  - Memory-mapped loading
  
- **Float32 (PERFORMANCE)**: `faiss.IndexFlatL2(dim)`
  - 1536 bytes per vector  
  - L2 distance computation
  - Direct memory loading

### 4. Paragraph Chunker (`src/services/paragraph_chunker.py`)

```python
class ParagraphChunker:
    def __init__(self, max_chunk_size: int = 512, overlap: int = 50):
        
    def chunk_streaming(text: str) -> Generator[str, None, None]:
        """Yield chunks one at a time without loading all into memory"""
        
    def chunk_file(filepath: str) -> Generator[str, None, None]:
        """Stream chunks from file with memory-mapped reading"""
```

**Chunking Strategy:**
1. Split on double newlines (paragraphs)
2. For large paragraphs (>max_chunk_size):
   - Split at sentence boundaries (.!?)
   - Further split at word boundaries if needed
3. Combine small paragraphs up to max_chunk_size
4. Generator pattern - yield one chunk at a time

**Memory Efficiency:**
- Never hold full text in memory
- Memory-mapped file reading for large files (>10MB)
- Streaming generator pattern
- No dependencies (optional Chonkie for semantic mode)

### 5. Streaming Document Processor (`src/services/streaming_processor.py`)

```python
class StreamingDocumentProcessor:
    def __init__(self, mode: str, enable_chonkie: bool = False):
        
    def index_file_streaming(filepath: str) -> Dict:
        """
        Process file without batching:
        1. Stream read file
        2. For each chunk:
           - Embed
           - Quantize (if binary mode)
           - Write to FAISS immediately
           - Write to SQLite immediately (WAL mode)
           - Clear from memory
        3. Return result
        """
        
    def _handle_oom(self, filepath: str, progress: int) -> Dict:
        """Auto-switch to ECO mode and retry"""
```

**OOM Protection:**
- Try/catch MemoryError around processing loop
- On OOM:
  1. Clear all memory (gc.collect, cache clear)
  2. Switch to ECO mode
  3. Reduce chunk size
  4. Retry from last successful chunk
  5. Return result with mode_switched flag

**SQLite Optimizations:**
- WAL (Write-Ahead Logging) mode enabled
- Immediate commit per chunk (no batch transactions)
- Memory-mapped I/O (mmap_size = 256MB)
- Synchronous = NORMAL (performance/safety balance)

### 6. Adaptive Pipeline (`src/services/adaptive_pipeline.py`)

```python
class AdaptivePipeline:
    def __init__(self, mode: str = None, enable_chonkie: bool = False):
        # mode=None triggers auto-detection
        # Initialize components based on mode
        
    def index_file(self, filepath: str) -> Dict:
        # Single file indexing with OOM protection
        
    def index_directory(self, dirpath: str, recursive: bool = False) -> Dict:
        # Directory indexing with progress tracking
        
    def search(self, query: str, k: int = 10) -> List[Dict]:
        # Dense search only
        
    def switch_mode(self, new_mode: str) -> Dict:
        # Manual mode switch at runtime
        # Reinitialize components
        # Convert index if needed (binary <-> float32)
        
    def get_stats(self) -> Dict:
        # Return current RAM usage, mode, index size, etc.
```

---

## API Endpoints

### Hardware & Mode Management

```python
# Get hardware profile and recommendations
GET /system/hardware
Response: {
    "detected": {
        "ram_gb": 16,
        "available_ram_gb": 5.2,
        "cpu_cores": 8,
        "has_gpu": true,
        "gpu_type": "mps",
        "supports_onnx": true
    },
    "current_mode": "balanced",
    "recommended_mode": "performance"
}

# Get current mode and stats
GET /system/mode
Response: {
    "mode": "balanced",
    "auto_detected": true,
    "oom_protection": true,
    "stats": {
        "ram_used_mb": 850,
        "ram_available_mb": 5200,
        "index_size": 2340,
        "using_onnx": true,
        "using_binary": true
    }
}

# Manual mode switch
POST /system/mode
Body: {"mode": "eco"}
Response: {
    "success": true,
    "previous_mode": "balanced",
    "new_mode": "eco",
    "message": "Switched to eco mode"
}

# Re-detect hardware and set recommended mode
POST /system/mode/auto
Response: {
    "success": true,
    "detected_mode": "performance",
    "message": "Auto-detected and switched to performance mode"
}
```

### Indexing

```python
# Index single file
POST /index/file
Body: {"filepath": "/path/to/file.pdf"}
Response: {
    "success": true,
    "chunks_inserted": 5,
    "mode": "balanced",
    "time_ms": 1250
}

# Index directory
POST /index/directory
Body: {"dirpath": "/path/to/docs", "recursive": true}
Response: {
    "success": true,
    "files_indexed": 42,
    "chunks_inserted": 156,
    "mode": "balanced",
    "oom_switched": false
}

# Clear all indexed data
POST /index/clear
Response: {"success": true, "message": "Index cleared"}
```

### Search

```python
# Dense search only
GET /search?query=machine+learning&k=10
Response: {
    "success": true,
    "query": "machine learning",
    "results": [
        {
            "id": 1,
            "file_name": "ml_guide.pdf",
            "file_path": "/docs/ml_guide.pdf",
            "text": "...",
            "score": 0.92
        }
    ],
    "mode": "balanced"
}
```

---

## Frontend UI Components

### Mode Selector Component

```typescript
interface ModeSelectorProps {
  currentMode: 'eco' | 'balanced' | 'performance';
  stats: SystemStats;
  onModeChange: (mode: string) => void;
  onAutoDetect: () => void;
}

// Visual elements:
// - Mode cards with icons (💚 Eco, 💛 Balanced, ❤️ Performance)
// - RAM usage bar (used / available)
// - Recommended badge based on hardware
// - OOM protection indicator
// - Auto-detect button
```

### Settings Panel Integration

```
┌─────────────────────────────────────┐
│ ⚙️ Indexing Settings                │
├─────────────────────────────────────┤
│ Performance Mode                    │
│                                     │
│ 💚 Eco Mode              [Select]   │
│    < 500MB RAM, Binary   ✓ Rec.    │
│                                     │
│ 💛 Balanced Mode         [Select]   │
│    < 1GB RAM, Binary                │
│                                     │
│ ❤️ Performance Mode      [Select]   │
│    < 2GB RAM, Float32               │
│                                     │
├─────────────────────────────────────┤
│ RAM Usage: 850MB / 5.2GB available  │
│ Mode: Balanced (auto-detected)      │
│ OOM Protection: ON ✓                │
│                                     │
│ [🔄 Auto-Detect Hardware]           │
└─────────────────────────────────────┘
```

---

## File Structure

```
src/
├── services/
│   ├── hardware_detector.py       # Hardware detection
│   ├── onnx_embedder.py           # ONNX + 384-dim embeddings
│   ├── lightweight_faiss.py       # Binary/Float32 FAISS
│   ├── paragraph_chunker.py       # Lightweight chunking
│   ├── streaming_processor.py     # Stream document processing
│   ├── adaptive_pipeline.py       # Main orchestrator
│   └── config_manager.py          # Settings persistence
├── api/
│   └── routes.py                  # FastAPI endpoints
├── main.py                        # FastAPI app entry
└── types/
    └── hardware.py                # Type definitions

frontend/src/
├── components/
│   ├── ModeSelector.tsx           # Mode selection UI
│   ├── SystemStats.tsx            # Hardware stats display
│   └── SettingsPanel.tsx          # Settings integration
└── api/
    └── system.ts                  # System API calls
```

---

## Dependencies

### Required
```
faiss-cpu>=1.7.4       # CPU-only FAISS
numpy>=1.24.0
sqlite3
psutil>=5.9.0          # System metrics
sentence-transformers>=2.2.0  # Fallback embedder
```

### Optional
```
onnxruntime>=1.15.0    # 2-3x faster CPU inference
chonkie>=0.1.0         # Semantic chunking (optional)
pytorch>=2.0.0         # Required if no ONNX
```

### Platform-Specific
```
# macOS (MPS)
torch torchvision torchaudio

# CUDA
onnxruntime-gpu  # Use GPU provider
```

---

## Memory Benchmarks (Estimated)

| Operation | ECO Mode | BALANCED Mode | PERFORMANCE Mode |
|-----------|----------|---------------|------------------|
| **Base RAM** | 200MB | 400MB | 800MB |
| **Per 1K docs** | +50MB | +100MB | +1.5GB |
| **Peak Indexing** | 400MB | 800MB | 2GB |
| **Search Query** | +20MB | +40MB | +80MB |

**Notes:**
- Binary quantization: 48 bytes per document
- Float32 embeddings: 1536 bytes per document  
- ONNX runtime adds ~100MB base overhead
- PyTorch fallback adds ~300MB base overhead

---

## Implementation Phases

### Phase 1: Foundation (Day 1-2)
- [ ] Hardware detection module
- [ ] ONNX embedder with PyTorch fallback
- [ ] Paragraph chunker (no dependencies)
- [ ] Configuration manager

### Phase 2: Index & Storage (Day 3-4)
- [ ] Binary FAISS index implementation
- [ ] SQLite WAL optimizations
- [ ] Streaming processor with OOM handling
- [ ] File metadata extraction

### Phase 3: Pipeline & API (Day 5)
- [ ] Adaptive pipeline orchestrator
- [ ] API endpoints (system, index, search)
- [ ] Mode switching logic
- [ ] Stats and monitoring

### Phase 4: Frontend (Day 6)
- [ ] Mode selector component
- [ ] System stats display
- [ ] Settings panel integration
- [ ] Error handling and notifications

---

## OOM Recovery Flow

```
1. Processing chunk N...
2. MemoryError raised
3. Catch exception
4. Clear memory:
   - gc.collect()
   - torch.cuda.empty_cache() / torch.mps.empty_cache()
   - Delete all temporary objects
5. Log OOM event
6. Switch to ECO mode:
   - Reinitialize embedder (batch_size=1)
   - Reinitialize FAISS (binary mode)
   - Reduce chunk size
7. Retry from chunk N
8. Return result with mode_switched=True
```

---

## Testing Checklist

### Hardware Detection
- [ ] Detects correct RAM on Windows/macOS/Linux
- [ ] Detects CUDA availability
- [ ] Detects MPS (Apple Silicon) availability
- [ ] Recommends correct mode based on RAM
- [ ] Handles permission errors gracefully

### ONNX Embedder
- [ ] Loads ONNX model successfully
- [ ] Falls back to PyTorch if ONNX fails
- [ ] Binary quantization produces correct shape
- [ ] Hamming distance search works
- [ ] Batch sizes appropriate per mode

### Streaming Processor
- [ ] Processes files without loading fully into memory
- [ ] Memory-mapped reading works for large files
- [ ] OOM auto-recovery switches to ECO mode
- [ ] SQLite WAL writes are immediate
- [ ] Handles corrupted/empty files gracefully

### Mode Switching
- [ ] Auto-detects on startup
- [ ] Manual switch updates all components
- [ ] Index conversion binary <-> float32 works
- [ ] Stats reflect new mode
- [ ] UI updates immediately

### End-to-End
- [ ] Index 1000 documents in each mode
- [ ] Search returns correct results
- [ ] Memory stays within targets
- [ ] No crashes on 4GB RAM device
- [ ] Performance acceptable for each mode

---

## Notes

- **No Migration**: Build from scratch, existing indexes not supported
- **Dense Only**: No hybrid search (simplifies architecture)
- **ONNX Preferred**: 2-3x faster than PyTorch on CPU
- **Chonkie Optional**: Semantic chunking available but not required
- **Fresh Detection**: Hardware checked on every startup
- **User Control**: Can manually override auto-detected mode anytime
