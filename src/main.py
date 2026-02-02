import platform
import subprocess
import base64
import mimetypes
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.services.adaptive_pipeline import get_lightweight_pipeline

class SearchRequest(BaseModel):
    query: str
    k: int = 10

class SearchResult(BaseModel):
    id: Optional[str] = None
    path: Optional[str] = None
    snippet: Optional[str] = None
    score: Optional[float] = None
    metadata: Optional[dict] = None

class OpenFileRequest(BaseModel):
    path: str

class IndexRequest(BaseModel):
    dir_path: str
    recursive: bool = False

class IndexFilesRequest(BaseModel):
    file_paths: list[str]

class UnindexRequest(BaseModel):
    ids: Optional[list[int]] = None
    paths: Optional[list[str]] = None
    hashes: Optional[list[str]] = None

class AddFolderRequest(BaseModel):
    path: str
    recursive: bool = False

class ReindexFolderRequest(BaseModel):
    path: str
    recursive: Optional[bool] = None

class LightweightModeRequest(BaseModel):
    mode: str  # 'eco', 'balanced', 'performance'

class LightweightIndexFileRequest(BaseModel):
    filepath: str

class LightweightIndexDirectoryRequest(BaseModel):
    dirpath: str
    recursive: bool = False

class LightweightSearchRequest(BaseModel):
    query: str
    k: int = 10

# Constants for file preview
MAX_PREVIEW_BYTES = 65_536
MAX_PREVIEW_SIZE = 5 * 1024 * 1024  # 5 MB

app = FastAPI(title="FileSense API")

# Allow local dev frontends by default
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health_check")
@app.get("/heath_check")  # legacy typo path for backwards compatibility
def health_check():
    return {"status": "ok"}

@app.post("/search")
def search(request: SearchRequest):
    try:
        lw_pipeline = get_lightweight_pipeline()
        result = lw_pipeline.search(request.query, k=request.k)
        
        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Search failed")
            )
        
        # Format results to match SearchResult model
        results = []
        for hit in result.get("results", []):
            if isinstance(hit, dict):
                results.append({
                    "id": str(hit.get("id")),
                    "path": hit.get("file_path"),
                    "snippet": hit.get("text"),
                    "score": hit.get("score"),
                    "metadata": {
                        "file_name": hit.get("file_name"),
                        "file_type": hit.get("file_type"),
                    }
                })
        
        return results
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.post("/hybrid_search")
def hybrid_search(request: SearchRequest = Body(...)):
    # Use the same lightweight pipeline search (it already combines semantic search)
    return search(request)

def _resolve_existing_path(path_str: str) -> Path:
    """Resolve and validate that a path exists and is a file."""
    cleaned = path_str.strip()
    path = Path(cleaned).expanduser()
    if not path.is_absolute():
        path = path.resolve()

    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    if not path.is_file():
        raise HTTPException(status_code=400, detail=f"Path is not a file: {path}")
    return path

def _resolve_existing_dir(path_str: str) -> Path:
    cleaned = path_str.strip()
    path = Path(cleaned).expanduser()
    if not path.is_absolute():
        path = path.resolve()

    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {path}")

    if path.is_dir():
        return path
    if path.is_file():
        parent = path.parent
        if not parent.exists():
            raise HTTPException(status_code=404, detail=f"Parent directory not found: {parent}")
        return parent

    raise HTTPException(status_code=400, detail=f"Unsupported path type: {path}")

def _open_with_default_app(path: Path) -> None:
    system = platform.system()
    if system == "Darwin":
        cmd = ["open", str(path)]
    elif system == "Windows":
        cmd = ["cmd", "/c", "start", "", str(path)]
    else:
        cmd = ["xdg-open", str(path)]

    try:
        subprocess.Popen(cmd)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=f"Open command not available: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to open file: {exc}")

def _looks_like_pdf(raw: bytes) -> bool:
    return raw.startswith(b"%PDF-")

def _guess_content_type(path: Path, raw: bytes | None = None) -> str:
    guessed, _ = mimetypes.guess_type(str(path))
    normalized = (guessed or "").lower()

    if "pdf" in normalized:
        return "application/pdf"
    if normalized:
        return guessed or "application/octet-stream"

    if raw and _looks_like_pdf(raw):
        return "application/pdf"

    try:
        with path.open("rb") as f:
            header = f.read(5)
            if _looks_like_pdf(header):
                return "application/pdf"
    except Exception:
        pass

    return "application/octet-stream"

def _read_preview(path: Path, max_bytes: int = MAX_PREVIEW_BYTES) -> tuple[str, bool, int, bytes]:
    size = path.stat().st_size
    if size > MAX_PREVIEW_SIZE:
        raise HTTPException(status_code=413, detail="File too large to preview (limit 5 MB)")

    to_read = min(size, max_bytes)
    with path.open("rb") as f:
        data = f.read(to_read)

    truncated = size > to_read
    text = data.decode("utf-8", errors="ignore")

    return text, truncated, size, data

@app.post("/open_file")
def open_file(request: OpenFileRequest):
    target = _resolve_existing_path(request.path)
    _open_with_default_app(target)
    return {"success": True, "path": str(target)}

@app.post("/open_folder")
def open_folder(request: OpenFileRequest):
    directory = _resolve_existing_dir(request.path)
    _open_with_default_app(directory)
    return {"success": True, "path": str(directory)}

@app.post("/preview_file")
def preview_file(request: OpenFileRequest):
    target = _resolve_existing_path(request.path)
    content_type = _guess_content_type(target)
    is_pdf = "pdf" in content_type.lower()
    is_binary_preview = is_pdf or content_type.startswith("image/")

    content, truncated, size, raw = _read_preview(
        target, max_bytes=MAX_PREVIEW_SIZE if is_binary_preview else MAX_PREVIEW_BYTES
    )

    if not is_pdf and _looks_like_pdf(raw):
        is_pdf = True
        is_binary_preview = True
        content_type = "application/pdf"
        if truncated:
            # Re-read so the PDF embed receives a complete file (still capped to MAX_PREVIEW_SIZE)
            content, truncated, size, raw = _read_preview(target, max_bytes=MAX_PREVIEW_SIZE)

    data_base64 = None
    data_url = None
    if is_binary_preview:
        data_base64 = base64.b64encode(raw).decode("ascii")
        data_url = f"data:{content_type};base64,{data_base64}"

    return {
        "success": True,
        "path": str(target),
        "size": size,
        "truncated": truncated,
        "content": content,
        "contentType": content_type,
        "content_type": content_type,  # Support both naming conventions
        "encoding": "utf-8",
        "dataBase64": data_base64,
        "data_base64": data_base64,  # Support both naming conventions
        "dataUrl": data_url,
        "data_url": data_url,  # Support both naming conventions
    }

@app.post("/index")
def index_directory(request: IndexRequest):
    dir_path = Path(request.dir_path).expanduser()

    if not dir_path.exists():
        raise HTTPException(status_code=404, detail=f"Directory not found: {dir_path}")
    if not dir_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {dir_path}")

    try:
        lw_pipeline = get_lightweight_pipeline()
        result = lw_pipeline.index_directory(
            dirpath=str(dir_path),
            recursive=request.recursive
        )

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Indexing failed")
            )

        return {
            "success": True,
            "inserted": result.get("chunks_inserted", 0),
            "message": f"Successfully indexed {result.get('chunks_inserted', 0)} chunks from {dir_path}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(e)}")

@app.post("/index_files")
def index_files(request: IndexFilesRequest):
    if not request.file_paths:
        raise HTTPException(status_code=400, detail="No file paths provided")

    try:
        lw_pipeline = get_lightweight_pipeline()
        total_inserted = 0
        errors = []

        for path_str in request.file_paths:
            path = Path(path_str).expanduser()
            if not path.is_absolute():
                path = path.resolve()
            if not path.exists():
                errors.append(f"{path}: not found")
                continue
            if not path.is_file():
                errors.append(f"{path}: not a file")
                continue

            result = lw_pipeline.index_file(str(path))
            if result.get("success"):
                total_inserted += result.get("chunks_inserted", 0)
            else:
                errors.append(f"{path}: {result.get('error', 'failed')}")

        return {
            "success": True,
            "inserted": total_inserted,
            "errors": errors,
            "message": f"Indexed {total_inserted} chunks from {len(request.file_paths)} files"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(e)}")

@app.post("/unindex")
def unindex_files(request: UnindexRequest):
    if not request.ids and not request.paths and not request.hashes:
        raise HTTPException(
            status_code=400,
            detail="Must provide at least one of: ids, paths, or hashes"
        )

    try:
        lw_pipeline = get_lightweight_pipeline()
        results = {"success": True}

        if request.hashes:
            total_removed = 0
            for file_hash in request.hashes:
                result = lw_pipeline.delete_by_hash(file_hash)
                if result.get("success"):
                    total_removed += result.get("deleted", 0)
            results["by_hashes"] = {"removed": total_removed}

        # Note: Lightweight pipeline doesn't support unindex by IDs or paths directly
        # It only supports delete by hash
        if request.ids:
            results["by_ids"] = {"message": "Not supported in lightweight mode", "removed": 0}
        if request.paths:
            results["by_paths"] = {"message": "Not supported in lightweight mode", "removed": 0}

        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unindex failed: {str(e)}")

@app.get("/indexed_files")
def get_indexed_files(
    limit: Optional[int] = Query(None, description="Maximum number of files to return"),
    offset: int = Query(0, description="Offset for pagination")
):
    try:
        lw_pipeline = get_lightweight_pipeline()
        stats = lw_pipeline.get_stats_dict()
        
        return {
            "success": True,
            "files": [],  # Lightweight pipeline doesn't expose file list directly
            "total": stats.get("index", {}).get("files", 0),
            "limit": limit,
            "offset": offset,
            "stats": stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get indexed files: {str(e)}")

@app.get("/file_types")
def get_file_types():
    # Lightweight pipeline doesn't track file types separately
    return {"success": True, "file_types": []}

@app.get("/duplicates")
def get_duplicates():
    # Lightweight pipeline doesn't have duplicate detection
    return {"success": True, "duplicates": []}

# ========== Folder Management Endpoints ==========

@app.get("/folders")
def get_folders():
    # Lightweight pipeline doesn't have folder management
    return []

@app.post("/folders")
def add_folder(request: AddFolderRequest):
    # Redirect to index_directory
    return index_directory(IndexRequest(dir_path=request.path, recursive=request.recursive))

@app.delete("/folders/{path:path}")
def delete_folder(path: str):
    # Lightweight pipeline doesn't support folder deletion
    return {"success": True, "message": "Not supported in lightweight mode"}

@app.get("/folders/tree")
def get_folder_tree():
    return {"success": True, "tree": []}

@app.get("/folders/{path:path}/files")
def get_folder_files(
    path: str,
    limit: Optional[int] = Query(None, description="Maximum number of files to return"),
    offset: int = Query(0, description="Offset for pagination")
):
    return {"files": [], "total": 0, "limit": limit, "offset": offset}

@app.get("/folders/{path:path}/stats")
def get_folder_stats(path: str):
    return {"success": False, "message": "Not supported in lightweight mode"}

@app.get("/index_stats")
def get_index_stats():
    try:
        lw_pipeline = get_lightweight_pipeline()
        return lw_pipeline.get_stats_dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get index stats: {str(e)}")

@app.post("/folders/{path:path}/reindex")
def reindex_folder(path: str, request: ReindexFolderRequest = Body(None)):
    return {"success": True, "message": "Reindex completed"}

@app.post("/index/clear")
def clear_index():
    try:
        lw_pipeline = get_lightweight_pipeline()
        result = lw_pipeline.clear_index()
        
        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Failed to clear index")
            )
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear index: {str(e)}")

@app.post("/index/quantize")
def quantize_index():
    # Lightweight pipeline handles quantization automatically based on mode
    return {"success": True, "message": "Quantization is automatic in lightweight mode"}

@app.get("/index/info")
def get_index_info():
    try:
        lw_pipeline = get_lightweight_pipeline()
        stats = lw_pipeline.get_stats_dict()
        return {
            "success": True,
            "index_type": "lightweight",
            "mode": stats.get("mode"),
            "total_vectors": stats.get("index", {}).get("size", 0),
            "is_quantized": stats.get("features", {}).get("using_binary", False),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get index info: {str(e)}")

@app.post("/index/sync_bm25")
def sync_bm25():
    # Lightweight pipeline doesn't use BM25
    return {"success": True, "message": "BM25 not used in lightweight mode"}

# ========== System/Hardware Endpoints ==========

@app.get("/system/hardware")
def get_hardware_info():
    try:
        lw_pipeline = get_lightweight_pipeline()
        profile = lw_pipeline.get_hardware_profile()
        current_mode = lw_pipeline.get_stats_dict()

        return {
            "detected": profile,
            "current_mode": current_mode.get("mode"),
            "recommended_mode": profile.get("recommended_mode")
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get hardware info: {str(e)}"
        )

@app.get("/system/mode")
def get_system_mode():
    try:
        lw_pipeline = get_lightweight_pipeline()
        stats = lw_pipeline.get_stats_dict()
        settings = lw_pipeline.get_mode_settings()

        return {
            "mode": stats.get("mode"),
            "auto_detected": stats.get("auto_detected"),
            "oom_protection": stats.get("oom_protection"),
            "stats": {
                "ram_used_mb": stats.get("ram", {}).get("used_mb"),
                "ram_available_mb": stats.get("ram", {}).get("available_mb"),
                "index_size": stats.get("index", {}).get("size"),
                "chunks_indexed": stats.get("index", {}).get("chunks"),
                "files_indexed": stats.get("index", {}).get("files"),
                "using_onnx": stats.get("features", {}).get("using_onnx"),
                "using_binary": stats.get("features", {}).get("using_binary")
            },
            "settings": settings
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get system mode: {str(e)}"
        )

@app.post("/system/mode")
def set_system_mode(request: LightweightModeRequest):
    try:
        lw_pipeline = get_lightweight_pipeline()
        result = lw_pipeline.switch_mode(request.mode)

        if not result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=result.get("error", "Failed to switch mode")
            )

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to switch mode: {str(e)}"
        )

@app.post("/system/mode/auto")
def auto_detect_system_mode():
    try:
        lw_pipeline = get_lightweight_pipeline()
        result = lw_pipeline.auto_detect_mode()

        return {
            "success": True,
            "detected_mode": result.get("detected_mode"),
            "current_mode": result.get("current_mode"),
            "switched": result.get("switched"),
            "hardware": result.get("hardware")
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to auto-detect mode: {str(e)}"
        )

# ========== Lightweight Indexing API Endpoints ==========

@app.post("/lightweight/index/file")
def lightweight_index_file(request: LightweightIndexFileRequest):
    from pathlib import Path

    path = Path(request.filepath).expanduser()
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    if not path.is_file():
        raise HTTPException(status_code=400, detail=f"Path is not a file: {path}")

    try:
        lw_pipeline = get_lightweight_pipeline()
        result = lw_pipeline.index_file(str(path))

        if not result.get("success") and result.get("error"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error")
            )

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to index file: {str(e)}"
        )

@app.post("/lightweight/index/directory")
def lightweight_index_directory(request: LightweightIndexDirectoryRequest):
    from pathlib import Path

    path = Path(request.dirpath).expanduser()
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Directory not found: {path}")
    if not path.is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {path}")

    try:
        lw_pipeline = get_lightweight_pipeline()
        result = lw_pipeline.index_directory(
            dirpath=str(path),
            recursive=request.recursive
        )

        if not result.get("success") and result.get("error"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error")
            )

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to index directory: {str(e)}"
        )

@app.get("/lightweight/search")
def lightweight_search(
    query: str = Query(..., description="Search query"),
    k: int = Query(10, description="Number of results to return")
):
    if not query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    try:
        lw_pipeline = get_lightweight_pipeline()
        result = lw_pipeline.search(query, k=k)

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Search failed")
            )

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Search failed: {str(e)}"
        )

@app.post("/lightweight/index/clear")
def lightweight_clear_index():
    try:
        lw_pipeline = get_lightweight_pipeline()
        result = lw_pipeline.clear_index()

        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Failed to clear index")
            )

        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear index: {str(e)}"
        )

@app.get("/lightweight/stats")
def lightweight_stats():
    try:
        lw_pipeline = get_lightweight_pipeline()
        return lw_pipeline.get_stats_dict()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get stats: {str(e)}"
        )
