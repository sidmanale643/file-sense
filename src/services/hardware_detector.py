import platform
import psutil
from dataclasses import dataclass
from typing import Optional, Dict, Any
from enum import Enum


class OperatingMode(Enum):
    ECO = "eco"
    BALANCED = "balanced"
    PERFORMANCE = "performance"


@dataclass
class HardwareProfile:
    # RAM
    total_ram_gb: float
    available_ram_gb: float
    
    # CPU
    cpu_cores: int
    cpu_threads: int
    cpu_architecture: str
    
    # GPU
    has_gpu: bool
    gpu_type: Optional[str]  # 'cuda', 'mps', 'rocm', None
    gpu_count: int
    
    # Runtime
    platform: str  # 'Windows', 'Darwin', 'Linux'
    supports_onnx: bool
    
    @property
    def recommended_mode(self) -> OperatingMode:
        if self.available_ram_gb < 2.0:
            return OperatingMode.ECO
        elif self.available_ram_gb < 4.0:
            return OperatingMode.BALANCED
        else:
            return OperatingMode.PERFORMANCE
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "ram_gb": round(self.total_ram_gb, 2),
            "available_ram_gb": round(self.available_ram_gb, 2),
            "cpu_cores": self.cpu_cores,
            "cpu_threads": self.cpu_threads,
            "cpu_architecture": self.cpu_architecture,
            "has_gpu": self.has_gpu,
            "gpu_type": self.gpu_type,
            "gpu_count": self.gpu_count,
            "platform": self.platform,
            "supports_onnx": self.supports_onnx,
            "recommended_mode": self.recommended_mode.value
        }


class HardwareDetector:

    @staticmethod
    def detect_profile() -> HardwareProfile:
        # RAM detection
        mem = psutil.virtual_memory()
        total_ram_gb = mem.total / (1024 ** 3)
        available_ram_gb = mem.available / (1024 ** 3)
        
        # CPU detection
        cpu_cores = psutil.cpu_count(logical=False) or 1
        cpu_threads = psutil.cpu_count(logical=True) or cpu_cores
        cpu_arch = platform.machine()
        
        # GPU detection
        gpu_type, gpu_count = HardwareDetector._detect_gpu()
        has_gpu = gpu_type is not None
        
        # Platform detection
        system = platform.system()
        
        # ONNX support detection
        supports_onnx = HardwareDetector._check_onnx_support()
        
        return HardwareProfile(
            total_ram_gb=total_ram_gb,
            available_ram_gb=available_ram_gb,
            cpu_cores=cpu_cores,
            cpu_threads=cpu_threads,
            cpu_architecture=cpu_arch,
            has_gpu=has_gpu,
            gpu_type=gpu_type,
            gpu_count=gpu_count,
            platform=system,
            supports_onnx=supports_onnx
        )
    
    @staticmethod
    def detect_mode() -> str:
        profile = HardwareDetector.detect_profile()
        return profile.recommended_mode.value
    
    @staticmethod
    def get_available_ram() -> float:
        mem = psutil.virtual_memory()
        return mem.available / (1024 ** 3)
    
    @staticmethod
    def _detect_gpu() -> tuple:
        # Try CUDA first
        try:
            import torch
            if torch.cuda.is_available():
                return ("cuda", torch.cuda.device_count())
        except ImportError:
            pass
        
        # Try MPS (Apple Silicon)
        try:
            import torch
            if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                return ("mps", 1)
        except ImportError:
            pass
        
        # Try ROCm (AMD)
        try:
            import torch
            if hasattr(torch.version, "hip") and torch.version.hip is not None:
                return ("rocm", torch.cuda.device_count())
        except ImportError:
            pass
        
        return (None, 0)
    
    @staticmethod
    def _check_onnx_support() -> bool:
        try:
            import onnxruntime as ort  # noqa: F401
            return True
        except ImportError:
            return False


def get_mode_settings(mode: OperatingMode) -> Dict[str, Any]:
    settings = {
        OperatingMode.ECO: {
            "batch_size": 1,
            "embedding_dim": 384,
            "quantization": "binary",
            "use_onnx": True,
            "max_chunk_size": 512,
            "overlap": 50,
            "ram_target_mb": 500,
            "use_chonkie": False,
            "aggressive_gc": True
        },
        OperatingMode.BALANCED: {
            "batch_size": 4,
            "embedding_dim": 384,
            "quantization": "binary",
            "use_onnx": True,
            "max_chunk_size": 1000,
            "overlap": 100,
            "ram_target_mb": 1024,
            "use_chonkie": True,
            "aggressive_gc": False
        },
        OperatingMode.PERFORMANCE: {
            "batch_size": 16,
            "embedding_dim": 384,
            "quantization": "float32",
            "use_onnx": True,
            "max_chunk_size": 1000,
            "overlap": 100,
            "ram_target_mb": 2048,
            "use_chonkie": True,
            "aggressive_gc": False
        }
    }
    return settings.get(mode, settings[OperatingMode.BALANCED])
