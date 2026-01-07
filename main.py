import platform
import subprocess
import base64
import mimetypes
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.pp import Pipeline
 
class SearchRequest(BaseModel):
    query: str
    is_path: bool = False
    k: int = 10
    deduplicate: bool = True
    rerank: bool = False
    alpha: float = 0.5
    filter: str = ""
    use_regex: bool = False


class SearchResult(BaseModel):
 
    id: Optional[str] = None
    path: Optional[str] = None
    snippet: Optional[str] = None
    score: Optional[float] = None
    metadata: Optional[dict] = None


class OpenFileRequest(BaseModel):
    """Request payload for opening a file from the frontend."""

    path: str


class IndexRequest(BaseModel):
    """Request payload for indexing a directory."""

    dir_path: str


class IndexFilesRequest(BaseModel):
    """Request payload for indexing specific files."""
    
    file_paths: list[str]


class UnindexRequest(BaseModel):
    """Request payload for unindexing files."""
    
    ids: list[int] = None
    paths: list[str] = None
    hashes: list[str] = None


# Constants for file preview
MAX_PREVIEW_BYTES = 65_536
MAX_PREVIEW_SIZE = 5 * 1024 * 1024  # 5 MB


app = FastAPI(title="FileSense API")
pipeline = Pipeline()

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
    """Legacy search endpoint that combines filename search and hybrid search."""
    results = pipeline.search_both(request.query, request.is_path, request.k, request.use_regex)

    
    # Format results to match SearchResult model
    formatted = []
    for hit in results:
        formatted.append({
            "id": hit.get("file_hash"),
            "path": hit.get("file_path"),
            "snippet": None,
            "score": None,
            "metadata": hit
        })
    return formatted


@app.post("/hybrid_search")
def hybrid_search(request: SearchRequest = Body(...)):
    """Perform hybrid search combining BM25 and dense vector search.
    
    Request body should be JSON with the following structure:
    {
        "query": "search term",  # Required
        "k": 10,                 # Optional, default: 10
        "deduplicate": true,     # Optional, default: true
        "rerank": false,          # Optional, default: false
        "alpha": 0.5              # Optional, default: 0.5
    }
    """
    result = pipeline.hybrid_search_file(
        query=request.query,
        k=request.k,
        deduplicate=request.deduplicate,
        rerank=request.rerank,
        alpha=request.alpha
    )
    
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Hybrid search failed")
        )
    
    # Format results to match SearchResult model
    results = []
    for hit in result.get("results", []):
        if isinstance(hit, dict):
            results.append({
                "id": hit.get("id") or hit.get("file_hash") or hit.get("file_path"),
                "path": hit.get("file_path"),
                "snippet": hit.get("text") or hit.get("snippet"),
                "score": hit.get("score"),
                "metadata": {
                    "file_name": hit.get("file_name"),
                    "file_type": hit.get("file_type"),
                    "file_size": hit.get("file_size"),
                    "file_hash": hit.get("file_hash"),
                }
            })
    
    return results


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
    """Resolve and validate that a path exists and is a directory (or return parent of file)."""
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
    """Open a file or folder using the system's default application."""
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
    """Detect PDFs by magic number."""
    return raw.startswith(b"%PDF-")


def _guess_content_type(path: Path, raw: bytes | None = None) -> str:
    """Guess content type using extensions and magic bytes."""
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
    """Read a preview of the file."""
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
    """Open a file in the system's default application."""
    target = _resolve_existing_path(request.path)
    _open_with_default_app(target)
    return {"success": True, "path": str(target)}


@app.post("/open_folder")
def open_folder(request: OpenFileRequest):
    """Open a folder in the system's file manager."""
    directory = _resolve_existing_dir(request.path)
    _open_with_default_app(directory)
    return {"success": True, "path": str(directory)}


@app.post("/preview_file")
def preview_file(request: OpenFileRequest):
    """Preview a file with content, metadata, and base64 encoding for images/PDFs."""
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
    """Index documents from a directory into FAISS and the database."""
    dir_path = Path(request.dir_path).expanduser()
    
    if not dir_path.exists():
        raise HTTPException(status_code=404, detail=f"Directory not found: {dir_path}")
    if not dir_path.is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {dir_path}")
    
    result = pipeline.index_dir(str(dir_path))
    
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Indexing failed")
        )
    
    return {
        "success": True,
        "inserted": result.get("inserted", 0),
        "message": f"Successfully indexed {result.get('inserted', 0)} documents from {dir_path}"
    }


@app.post("/index_files")
def index_files(request: IndexFilesRequest):
    """Index specific files into FAISS and the database."""
    if not request.file_paths:
        raise HTTPException(status_code=400, detail="No file paths provided")
    
    # Validate and expand paths
    validated_paths = []
    for path_str in request.file_paths:
        path = Path(path_str).expanduser()
        if not path.is_absolute():
            path = path.resolve()
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {path}")
        if not path.is_file():
            raise HTTPException(status_code=400, detail=f"Path is not a file: {path}")
        validated_paths.append(str(path))
    
    result = pipeline.index_files(validated_paths)
    
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Indexing failed")
        )
    
    return {
        "success": True,
        "inserted": result.get("inserted", 0),
        "skipped": result.get("skipped", []),
        "errors": result.get("errors", []),
        "message": f"Indexed {result.get('inserted', 0)} file chunks"
    }


@app.post("/unindex")
def unindex_files(request: UnindexRequest):
    """Remove files from the index by ID, path, or hash."""
    if not request.ids and not request.paths and not request.hashes:
        raise HTTPException(
            status_code=400, 
            detail="Must provide at least one of: ids, paths, or hashes"
        )
    
    results = {"success": True}
    
    if request.ids:
        result = pipeline.unindex_by_ids(request.ids)
        results["by_ids"] = result
        if not result.get("success"):
            results["success"] = False
    
    if request.paths:
        result = pipeline.unindex_by_paths(request.paths)
        results["by_paths"] = result
        if not result.get("success"):
            results["success"] = False
    
    if request.hashes:
        result = pipeline.unindex_by_hashes(request.hashes)
        results["by_hashes"] = result
        if not result.get("success"):
            results["success"] = False
    
    return results


@app.get("/indexed_files")
def get_indexed_files(
    limit: Optional[int] = Query(None, description="Maximum number of files to return"),
    offset: int = Query(0, description="Offset for pagination")
):
    """List all indexed files with metadata."""
    result = pipeline.get_indexed_files(limit=limit, offset=offset)
    
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Failed to get indexed files")
        )
    
    return result


@app.get("/file_types")
def get_file_types():
    """Get list of distinct file types in the index."""
    result = pipeline.get_file_types()
    
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Failed to get file types")
        )
    
    return result


@app.get("/duplicates")
def get_duplicates():
    """Find duplicate files based on hash."""
    result = pipeline.find_duplicates()
    
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Failed to get duplicates")
        )
    
    return result