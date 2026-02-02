
import os
import gc
import time
from pathlib import Path
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass
from hashlib import sha256

from src.services.onnx_embedder import ONNXEmbedder
from src.services.paragraph_chunker import ParagraphChunker, create_chunker_for_mode
from src.services.lightweight_faiss import LightweightFAISSIndex
from src.services.lightweight_file_manager import LightweightFileManager


def compute_file_hash(filepath: str) -> str:
    try:
        hasher = sha256()
        with open(filepath, 'rb') as f:
            # Read in chunks to avoid loading large files
            while chunk := f.read(8192):
                hasher.update(chunk)
        return hasher.hexdigest()
    except Exception:
        # Fallback to modified time hash if file can't be read
        stat = os.stat(filepath)
        return sha256(str(stat.st_mtime).encode()).hexdigest()


@dataclass
class ProcessingResult:
    success: bool
    chunks_inserted: int
    mode: str
    time_ms: float
    oom_switched: bool = False
    message: str = ""
    error: Optional[str] = None


class StreamingDocumentProcessor:
    
    def __init__(
        self,
        mode: str = "balanced",
        cache_dir: str = "./db",
        progress_callback: Optional[Callable[[str, int, int], None]] = None
    ):
        self.mode = mode.lower()
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.progress_callback = progress_callback
        
        self.oom_protection = True
        self.mode_switched = False
        
        # Initialize components
        self.embedder: Optional[ONNXEmbedder] = None
        self.chunker: Optional[ParagraphChunker] = None
        self.faiss_index: Optional[LightweightFAISSIndex] = None
        self.file_manager: Optional[LightweightFileManager] = None
        
        self._init_components()
    
    def _init_components(self):
        print(f"Initializing streaming processor in {self.mode} mode...")
        
        # Initialize embedder
        self.embedder = ONNXEmbedder(mode=self.mode)
        
        # Initialize chunker
        self.chunker = create_chunker_for_mode(self.mode)
        
        # Initialize FAISS index
        self.faiss_index = LightweightFAISSIndex(
            mode=self.mode,
            dim=384,
            cache_dir=str(self.cache_dir)
        )
        
        # Initialize file manager
        db_path = self.cache_dir / "lightweight.sqlite3"
        self.file_manager = LightweightFileManager(str(db_path))
        
        print(f"Streaming processor initialized ({self.mode} mode)")
    
    def _clear_memory(self):
        gc.collect()
        
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                torch.mps.empty_cache()
        except ImportError:
            pass
    
    def _switch_to_eco_mode(self):
        print("⚠️  Switching to ECO mode due to memory constraints...")
        
        self._clear_memory()
        
        # Reinitialize in ECO mode
        self.mode = "eco"
        self.mode_switched = True
        
        # Reinitialize components
        self.embedder = ONNXEmbedder(mode="eco")
        self.chunker = create_chunker_for_mode("eco")
        
        print("✓ Switched to ECO mode")
    
    def index_file(
        self,
        filepath: str,
        file_hash: Optional[str] = None
    ) -> ProcessingResult:
        start_time = time.time()
        path = Path(filepath)
        
        if not path.exists():
            return ProcessingResult(
                success=False,
                chunks_inserted=0,
                mode=self.mode,
                time_ms=0,
                error=f"File not found: {filepath}"
            )
        
        try:
            # Compute hash if not provided
            if file_hash is None:
                file_hash = compute_file_hash(filepath)
            
            # Check for duplicates
            if self.file_manager.check_hash_exists(file_hash):
                return ProcessingResult(
                    success=True,
                    chunks_inserted=0,
                    mode=self.mode,
                    time_ms=(time.time() - start_time) * 1000,
                    message="File already indexed (duplicate)"
                )
            
            # Get file metadata
            stat = path.stat()
            file_size = stat.st_size
            modified_date = time.strftime(
                '%Y-%m-%d %H:%M:%S', 
                time.localtime(stat.st_mtime)
            )
            
            # Extract text based on file type
            text = self._extract_text(filepath)
            
            if not text or not text.strip():
                return ProcessingResult(
                    success=False,
                    chunks_inserted=0,
                    mode=self.mode,
                    time_ms=(time.time() - start_time) * 1000,
                    message="No text content extracted"
                )
            
            # Process chunks with OOM protection
            chunks_inserted = self._process_chunks_streaming(
                text=text,
                filepath=str(path),
                filename=path.name,
                file_hash=file_hash,
                file_type=path.suffix.lstrip('.').lower(),
                file_size=file_size,
                modified_date=modified_date
            )
            
            elapsed_ms = (time.time() - start_time) * 1000
            
            return ProcessingResult(
                success=True,
                chunks_inserted=chunks_inserted,
                mode=self.mode,
                time_ms=elapsed_ms,
                oom_switched=self.mode_switched
            )
            
        except MemoryError:
            return self._handle_oom(filepath, 0)
        except Exception as e:
            return ProcessingResult(
                success=False,
                chunks_inserted=0,
                mode=self.mode,
                time_ms=(time.time() - start_time) * 1000,
                error=str(e)
            )
    
    def _process_chunks_streaming(
        self,
        text: str,
        filepath: str,
        filename: str,
        file_hash: str,
        file_type: str,
        file_size: int,
        modified_date: str
    ) -> int:
        chunks_inserted = 0
        chunk_index = 0
        
        # Get starting ID
        start_id = self.file_manager.get_max_id() + 1
        current_id = start_id
        
        try:
            # Process chunks one at a time
            for chunk_text in self.chunker.chunk_streaming(text):
                if not chunk_text.strip():
                    continue
                
                # Encode chunk
                embedding = self.embedder.encode([chunk_text])
                
                # Add to FAISS
                doc_ids = [current_id]
                self.faiss_index.add(embedding, doc_ids)
                
                # Insert to SQLite immediately (WAL mode)
                self.file_manager.insert_chunk({
                    "id": current_id,
                    "file_hash": file_hash,
                    "file_path": filepath,
                    "file_name": filename,
                    "file_type": file_type,
                    "file_size": file_size,
                    "text": chunk_text,
                    "chunk_index": chunk_index,
                    "total_chunks": -1,  # Will update later
                    "modified_date": modified_date
                })
                
                chunks_inserted += 1
                chunk_index += 1
                current_id += 1
                
                # Report progress
                if self.progress_callback:
                    self.progress_callback(filename, chunks_inserted, -1)
                
                # Aggressive GC in ECO mode
                if self.mode == "eco":
                    self._clear_memory()
            
            # Update total_chunks for all inserted chunks
            if chunks_inserted > 0:
                self._update_total_chunks(start_id, chunks_inserted)
            
            # Save FAISS cache periodically (every 100 chunks)
            if chunks_inserted % 100 == 0 or chunks_inserted < 100:
                self.faiss_index.save_cache()
            
            return chunks_inserted
            
        except MemoryError:
            if self.oom_protection and not self.mode_switched:
                self._switch_to_eco_mode()
                # Retry with remaining text
                remaining_text = text[len(text) // 2:]  # Process second half
                if remaining_text.strip():
                    return self._process_chunks_streaming(
                        text=remaining_text,
                        filepath=filepath,
                        filename=filename,
                        file_hash=file_hash,
                        file_type=file_type,
                        file_size=file_size,
                        modified_date=modified_date
                    )
            raise
    
    def _update_total_chunks(self, start_id: int, total_chunks: int):
        try:
            ids = list(range(start_id, start_id + total_chunks))
            for chunk_id in ids:
                # Update each chunk with total count
                with self.file_manager.get_cursor() as cursor:
                    cursor.execute(
                        "UPDATE files SET total_chunks = ? WHERE id = ?",
                        (total_chunks, chunk_id)
                    )
        except Exception as e:
            print(f"Failed to update total chunks: {e}")
    
    def _handle_oom(self, filepath: str, progress: int) -> ProcessingResult:
        if not self.oom_protection:
            return ProcessingResult(
                success=False,
                chunks_inserted=progress,
                mode=self.mode,
                time_ms=0,
                error="Out of memory"
            )
        
        print(f"⚠️  OOM at chunk {progress}, switching to ECO mode...")
        self._switch_to_eco_mode()
        
        # Return result indicating mode switch
        return ProcessingResult(
            success=True,
            chunks_inserted=progress,
            mode="eco",
            time_ms=0,
            oom_switched=True,
            message=f"Switched to ECO mode at chunk {progress}"
        )
    
    def _extract_text(self, filepath: str) -> str:
        path = Path(filepath)
        suffix = path.suffix.lower()
        
        try:
            # Text files
            if suffix in ('.txt', '.md', '.json', '.csv', '.py', '.js', '.html', '.css'):
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    return f.read()
            
            # For now, other file types return empty
            # TODO: Add DOCX, PDF loaders here
            return ""
            
        except Exception as e:
            print(f"Failed to extract text from {filepath}: {e}")
            return ""
    
    def index_directory(
        self,
        dirpath: str,
        recursive: bool = False,
        file_extensions: Optional[List[str]] = None
    ) -> ProcessingResult:
        start_time = time.time()
        path = Path(dirpath)
        
        if not path.exists() or not path.is_dir():
            return ProcessingResult(
                success=False,
                chunks_inserted=0,
                mode=self.mode,
                time_ms=0,
                error=f"Directory not found: {dirpath}"
            )
        
        # Default extensions for text files
        if file_extensions is None:
            file_extensions = ['.txt', '.md', '.py', '.js', '.json', '.csv', '.html', '.css']
        
        # Collect files
        files = []
        if recursive:
            for ext in file_extensions:
                files.extend(path.rglob(f"*{ext}"))
        else:
            for ext in file_extensions:
                files.extend(path.glob(f"*{ext}"))
        
        total_files = len(files)
        if total_files == 0:
            return ProcessingResult(
                success=True,
                chunks_inserted=0,
                mode=self.mode,
                time_ms=0,
                message="No files found to index"
            )
        
        print(f"Indexing {total_files} files from {dirpath}...")
        
        total_chunks = 0
        files_indexed = 0
        errors = []
        
        for i, file_path in enumerate(files):
            try:
                if self.progress_callback:
                    self.progress_callback(
                        file_path.name,
                        i + 1,
                        total_files
                    )
                
                result = self.index_file(str(file_path))
                
                if result.success:
                    total_chunks += result.chunks_inserted
                    if result.chunks_inserted > 0:
                        files_indexed += 1
                else:
                    errors.append(f"{file_path.name}: {result.error or result.message}")
                
                # Handle mode switch from OOM
                if result.oom_switched:
                    self.mode_switched = True
                
            except Exception as e:
                errors.append(f"{file_path.name}: {str(e)}")
        
        # Final save
        self.faiss_index.save_cache()
        self.file_manager.checkpoint()
        
        elapsed_ms = (time.time() - start_time) * 1000
        
        return ProcessingResult(
            success=True,
            chunks_inserted=total_chunks,
            mode=self.mode,
            time_ms=elapsed_ms,
            oom_switched=self.mode_switched,
            message=f"Indexed {files_indexed}/{total_files} files"
        )
    
    def search(self, query: str, k: int = 10) -> List[Dict[str, Any]]:
        # Encode query
        query_embedding = self.embedder.encode([query])
        
        # Search FAISS
        doc_ids, distances = self.faiss_index.search(query_embedding, k)
        
        # Fetch metadata
        results = []
        if doc_ids:
            chunks = self.file_manager.fetch_by_id(doc_ids)
            
            for chunk, doc_id, distance in zip(chunks, doc_ids, distances):
                # Convert distance to similarity score (0-1)
                if self.faiss_index.use_binary:
                    # Hamming distance: max is dim, so normalize
                    max_distance = 384
                    score = 1.0 - (distance / max_distance)
                else:
                    # L2 distance: normalize based on typical range
                    score = 1.0 / (1.0 + distance)
                
                results.append({
                    "id": doc_id,
                    "file_name": chunk.get("file_name"),
                    "file_path": chunk.get("file_path"),
                    "text": chunk.get("text"),
                    "score": round(score, 4)
                })
        
        return results
    
    def delete_by_hash(self, file_hash: str) -> int:
        # Get IDs to delete
        ids = self.file_manager.get_ids_by_hashes([file_hash])
        
        if not ids:
            return 0
        
        # Remove from FAISS
        self.faiss_index.remove(ids)
        
        # Remove from SQLite
        deleted = self.file_manager.delete_by_ids(ids)
        
        # Save updated index
        self.faiss_index.save_cache()
        
        return deleted
    
    def get_stats(self) -> Dict[str, Any]:
        return {
            "mode": self.mode,
            "mode_switched": self.mode_switched,
            "oom_protection": self.oom_protection,
            "chunks_indexed": self.file_manager.count_chunks(),
            "files_indexed": self.file_manager.count_unique_files(),
            "faiss_stats": self.faiss_index.get_stats(),
            "db_metadata": self.file_manager.get_index_metadata()
        }
    
    def clear_all(self) -> bool:
        try:
            # Clear FAISS
            self.faiss_index.clear()
            self.faiss_index.save_cache()
            
            # Clear SQLite
            self.file_manager.clear_all()
            self.file_manager.vacuum()
            
            return True
        except Exception as e:
            print(f"Failed to clear all: {e}")
            return False
    
    def close(self):
        if self.faiss_index:
            self.faiss_index.save_cache()
        if self.file_manager:
            self.file_manager.close()
