from typing import Literal
import torch


def estimate_memory(device: Literal["cpu", "cuda", "mps"]):
    """Estimate available memory for the given device."""
    if device == "cuda":
        if torch.cuda.is_available():
            available_memory = torch.cuda.get_device_properties(0).total_memory
            return available_memory / (1024**3)  # Convert to GB
        return 0.0
    elif device == "mps":
        if torch.backends.mps.is_available():
            return 8.0  # Default estimate for MPS
        return 0.0
    else:
        import psutil
        return psutil.virtual_memory().total / (1024**3)  # CPU RAM in GB
