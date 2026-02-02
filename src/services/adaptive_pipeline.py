import gc
import threading
from pathlib import Path
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass

from src.services.streaming_processor import StreamingDocumentProcessor
from src.services.hardware_detector import HardwareDetector, OperatingMode, get_mode_settings


@dataclass
class PipelineStats:
    mode: str
    auto_detected: bool
    oom_protection: bool
    ram_used_mb: float
    ram_available_mb: float
    index_size: int
    chunks_indexed: int
    files_indexed: int
    using_onnx: bool
    using_binary: bool


class AdaptivePipeline:
    def __init__(
        self,
        mode: Optional[str] = None,
        cache_dir: str = "./db",
        enable_chonkie: bool = False,
        progress_callback: Optional[Callable[[str, int, int], None]] = None
    ):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.enable_chonkie = enable_chonkie
        self.progress_callback = progress_callback
        
        # Mode management
        self._auto_detected = mode is None
        self._current_mode = None
        self._mode_switched = False
        
        # Initialize processor
        self.processor: Optional[StreamingDocumentProcessor] = None
        
        # Set mode (auto-detect if not specified)
        if mode is None:
            mode = HardwareDetector.detect_mode()
        
        self._init_mode(mode)
    
    def _init_mode(self, mode: str):
        mode = mode.lower()
        if mode not in ('eco', 'balanced', 'performance'):
            mode = 'balanced'
        
        self._current_mode = mode
        
        # Initialize processor with mode
        self.processor = StreamingDocumentProcessor(
            mode=mode,
            cache_dir=str(self.cache_dir),
            progress_callback=self.progress_callback
        )
        
        print(f"AdaptivePipeline initialized in {mode.upper()} mode")
        print(f"  Auto-detected: {self._auto_detected}")
        print(f"  OOM protection: {self.processor.oom_protection}")
    
    def index_file(self, filepath: str) -> Dict[str, Any]:
        result = self.processor.index_file(filepath)
        
        # Track mode switch
        if result.oom_switched:
            self._mode_switched = True
            self._current_mode = 'eco'
        
        return {
            "success": result.success,
            "chunks_inserted": result.chunks_inserted,
            "mode": result.mode,
            "time_ms": round(result.time_ms, 2),
            "oom_switched": result.oom_switched,
            "message": result.message,
            "error": result.error
        }
    
    def index_directory(
        self,
        dirpath: str,
        recursive: bool = False,
        file_extensions: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        result = self.processor.index_directory(
            dirpath=dirpath,
            recursive=recursive,
            file_extensions=file_extensions
        )
        
        # Track mode switch
        if result.oom_switched:
            self._mode_switched = True
            self._current_mode = 'eco'
        
        return {
            "success": result.success,
            "files_indexed": getattr(result, 'files_indexed', 0),
            "chunks_inserted": result.chunks_inserted,
            "mode": result.mode,
            "time_ms": round(result.time_ms, 2),
            "oom_switched": result.oom_switched,
            "message": result.message,
            "error": result.error
        }
    
    def search(self, query: str, k: int = 10) -> Dict[str, Any]:
        try:
            results = self.processor.search(query, k=k)
            
            return {
                "success": True,
                "query": query,
                "results": results,
                "count": len(results),
                "mode": self._current_mode
            }
        except Exception as e:
            return {
                "success": False,
                "query": query,
                "results": [],
                "count": 0,
                "mode": self._current_mode,
                "error": str(e)
            }
    
    def switch_mode(self, new_mode: str) -> Dict[str, Any]:
        new_mode = new_mode.lower()
        if new_mode not in ('eco', 'balanced', 'performance'):
            return {
                "success": False,
                "error": f"Invalid mode: {new_mode}. Must be 'eco', 'balanced', or 'performance'"
            }

        if new_mode == self._current_mode:
            return {
                "success": True,
                "previous_mode": self._current_mode,
                "new_mode": new_mode,
                "message": f"Already in {new_mode} mode",
                "index_converted": False
            }

        previous_mode = self._current_mode

        # Clear memory before switching
        gc.collect()

        # Check if we need to convert index
        needs_conversion = self._needs_index_conversion(previous_mode, new_mode)

        # Reinitialize processor in new mode
        try:
            self._init_mode(new_mode)
            self._auto_detected = False

            result = {
                "success": True,
                "previous_mode": previous_mode,
                "new_mode": new_mode,
                "message": f"Switched to {new_mode} mode",
                "index_converted": needs_conversion
            }

            if needs_conversion:
                result["conversion_note"] = (
                    f"Index converted from "
                    f"{'binary' if previous_mode in ('eco', 'balanced') else 'float32'} "
                    f"to {'binary' if new_mode in ('eco', 'balanced') else 'float32'}"
                )

            return result

        except Exception as e:
            # Revert to previous mode on failure
            self._init_mode(previous_mode)
            return {
                "success": False,
                "error": f"Failed to switch mode: {str(e)}"
            }

    def _needs_index_conversion(self, old_mode: str, new_mode: str) -> bool:
        """Check if index conversion is needed when switching modes.
        
        Args:
            old_mode: Previous mode
            new_mode: New mode
            
        Returns:
            True if index needs conversion
        """
        old_binary = old_mode in ('eco', 'balanced')
        new_binary = new_mode in ('eco', 'balanced')
        return old_binary != new_binary

    def auto_detect_mode(self) -> Dict[str, Any]:
        detected_mode = HardwareDetector.detect_mode()

        result = {
            "detected_mode": detected_mode,
            "hardware": self.get_hardware_profile(),
            "switched": False
        }

        if detected_mode != self._current_mode:
            switch_result = self.switch_mode(detected_mode)
            result["switched"] = switch_result["success"]
            result["switch_details"] = switch_result

        result["current_mode"] = self._current_mode
        result["auto_detected"] = True

        return result

    def get_hardware_profile(self) -> Dict[str, Any]:
        profile = HardwareDetector.detect_profile()
        return profile.to_dict()
    
    def get_stats(self) -> PipelineStats:
        import psutil

        mem = psutil.virtual_memory()
        ram_used_mb = mem.used / (1024 * 1024)
        ram_available_mb = mem.available / (1024 * 1024)

        processor_stats = self.processor.get_stats()
        faiss_stats = processor_stats.get('faiss_stats', {})

        return PipelineStats(
            mode=self._current_mode,
            auto_detected=self._auto_detected,
            oom_protection=processor_stats.get('oom_protection', True),
            ram_used_mb=round(ram_used_mb, 2),
            ram_available_mb=round(ram_available_mb, 2),
            index_size=faiss_stats.get('total_vectors', 0),
            chunks_indexed=processor_stats.get('chunks_indexed', 0),
            files_indexed=processor_stats.get('files_indexed', 0),
            using_onnx=processor_stats.get('mode') != 'performance' or faiss_stats.get('mode') != 'performance',
            using_binary=faiss_stats.get('use_binary', self._current_mode in ('eco', 'balanced'))
        )

    def get_stats_dict(self) -> Dict[str, Any]:
        stats = self.get_stats()
        return {
            "mode": stats.mode,
            "auto_detected": stats.auto_detected,
            "oom_protection": stats.oom_protection,
            "ram": {
                "used_mb": stats.ram_used_mb,
                "available_mb": stats.ram_available_mb
            },
            "index": {
                "size": stats.index_size,
                "chunks": stats.chunks_indexed,
                "files": stats.files_indexed
            },
            "features": {
                "using_onnx": stats.using_onnx,
                "using_binary": stats.using_binary
            }
        }
    
    def get_mode_settings(self) -> Dict[str, Any]:
        mode_enum = OperatingMode(self._current_mode)
        settings = get_mode_settings(mode_enum)
        settings['mode'] = self._current_mode
        return settings

    def clear_index(self) -> Dict[str, Any]:
        try:
            success = self.processor.clear_all()
            return {
                "success": success,
                "message": "Index cleared" if success else "Failed to clear index"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def delete_by_hash(self, file_hash: str) -> Dict[str, Any]:
        try:
            deleted = self.processor.delete_by_hash(file_hash)
            return {
                "success": True,
                "deleted": deleted,
                "message": f"Deleted {deleted} chunks"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    def close(self):
        if self.processor:
            self.processor.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


# Global pipeline instance for API usage
_lightweight_pipeline: Optional[AdaptivePipeline] = None
_pipeline_lock = threading.Lock()


def get_lightweight_pipeline(
    mode: Optional[str] = None,
    cache_dir: str = "./db"
) -> AdaptivePipeline:
    global _lightweight_pipeline
    
    with _pipeline_lock:
        if _lightweight_pipeline is None:
            _lightweight_pipeline = AdaptivePipeline(mode=mode, cache_dir=cache_dir)
    
    return _lightweight_pipeline


def reset_lightweight_pipeline():
    global _lightweight_pipeline
    
    if _lightweight_pipeline:
        _lightweight_pipeline.close()
    
    _lightweight_pipeline = None
