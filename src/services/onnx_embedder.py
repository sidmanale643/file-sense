import os
import gc
import numpy as np
from typing import List, Optional, Union


class ONNXEmbedder:

    MODEL = "sentence-transformers/all-MiniLM-L6-v2"
    DIM = 384
    MAX_LENGTH = 512

    def __init__(self, mode: str = "balanced", batch_size: Optional[int] = None):
        self.mode = mode.lower()
        self.batch_size = batch_size or self._get_batch_size_for_mode()
        self.use_binary = self.mode in ("eco", "balanced")
        self.use_onnx = True
        
        self.tokenizer = None
        self.onnx_session = None
        self.pytorch_model = None
        
        self._initialized = False
        self._init_model()

    def _get_batch_size_for_mode(self) -> int:
        sizes = {
            "eco": 1,
            "balanced": 4,
            "performance": 16
        }
        return sizes.get(self.mode, 4)
    
    def _init_model(self):
        try:
            self._init_onnx()
            print(f"ONNX Embedder initialized in {self.mode} mode (batch_size={self.batch_size})")
            if self.use_binary:
                print("Using binary quantization (32x memory reduction)")
        except Exception as e:
            print(f"ONNX initialization failed: {e}, falling back to PyTorch")
            self._init_pytorch()
            self.use_onnx = False

    def _init_onnx(self):
        from transformers import AutoTokenizer
        import onnxruntime as ort
        
        # Check available providers
        available_providers = ort.get_available_providers()
        print(f"Available ONNX providers: {available_providers}")
        
        # Select provider
        providers = []
        if "CUDAExecutionProvider" in available_providers:
            providers.append("CUDAExecutionProvider")
        providers.append("CPUExecutionProvider")
        
        # Load model - try to find ONNX version
        model_path = self._get_onnx_model_path()
        
        self.tokenizer = AutoTokenizer.from_pretrained(self.MODEL)
        self.onnx_session = ort.InferenceSession(
            model_path,
            providers=providers
        )
        
        self._initialized = True

    def _get_onnx_model_path(self) -> str:
        import huggingface_hub
        
        # Try to download ONNX model from HuggingFace
        try:
            # Look for ONNX model in the repo
            onnx_path = huggingface_hub.hf_hub_download(
                repo_id=self.MODEL,
                filename="onnx/model.onnx",
                cache_dir=os.path.join(os.path.expanduser("~"), ".cache", "filesense", "models")
            )
            return onnx_path
        except Exception:
            pass
        
        # Try alternative ONNX paths
        try:
            onnx_path = huggingface_hub.hf_hub_download(
                repo_id=self.MODEL,
                filename="model.onnx",
                cache_dir=os.path.join(os.path.expanduser("~"), ".cache", "filesense", "models")
            )
            return onnx_path
        except Exception:
            pass
        
        # If no ONNX model found, we need to convert or use PyTorch
        raise RuntimeError("No ONNX model available for " + self.MODEL)
    
    def _init_pytorch(self):
        from sentence_transformers import SentenceTransformer
        
        device = self._detect_device()
        self.pytorch_model = SentenceTransformer(
            self.MODEL,
            device=device
        )
        self.pytorch_model.eval()
        
        # Disable tokenizer parallelism to avoid fork issues
        os.environ["TOKENIZERS_PARALLELISM"] = "false"
        
        self._initialized = True

    def _detect_device(self) -> str:
        try:
            import torch
            if torch.cuda.is_available():
                return "cuda"
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                return "mps"
        except ImportError:
            pass
        return "cpu"

    def encode(self, texts: Union[str, List[str]], show_progress: bool = False) -> np.ndarray:
        if isinstance(texts, str):
            texts = [texts]
        
        if not texts:
            return np.array([])
        
        # Process in batches
        all_embeddings = []
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i:i + self.batch_size]
            
            if self.use_onnx:
                batch_embeddings = self._encode_onnx(batch)
            else:
                batch_embeddings = self._encode_pytorch(batch)
            
            all_embeddings.append(batch_embeddings)
            
            # Aggressive GC in ECO mode
            if self.mode == "eco":
                gc.collect()
        
        embeddings = np.vstack(all_embeddings) if len(all_embeddings) > 1 else all_embeddings[0]
        
        # Apply binary quantization if needed
        if self.use_binary:
            embeddings = self.quantize_binary(embeddings)
        
        return embeddings
    
    def _encode_onnx(self, texts: List[str]) -> np.ndarray:
        # Tokenize
        inputs = self.tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=self.MAX_LENGTH,
            return_tensors="np"
        )
        
        # Run inference
        input_names = [inp.name for inp in self.onnx_session.get_inputs()]
        input_feed = {
            name: inputs[name] for name in input_names if name in inputs
        }
        
        outputs = self.onnx_session.run(None, input_feed)
        
        # Extract embeddings (first output is usually embeddings)
        embeddings = outputs[0]
        
        # Normalize
        embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)
        
        return embeddings.astype(np.float32)

    def _encode_pytorch(self, texts: List[str]) -> np.ndarray:
        import torch
        
        with torch.no_grad():
            embeddings = self.pytorch_model.encode(
                texts,
                batch_size=len(texts),
                show_progress_bar=False,
                convert_to_numpy=True,
                normalize_embeddings=True
            )
        
        return embeddings.astype(np.float32)

    @staticmethod
    def quantize_binary(embeddings: np.ndarray) -> np.ndarray:
        # Threshold: positive -> 1, negative -> 0
        binary_bits = (embeddings > 0).astype(np.uint8)
        
        # Pack 8 bits into 1 byte
        n_samples, n_dims = binary_bits.shape
        packed_dims = n_dims // 8
        
        # Reshape to [n, 48, 8] and pack
        binary_bits = binary_bits.reshape(n_samples, packed_dims, 8)
        
        # Use bit shifting to pack bits
        packed = np.zeros((n_samples, packed_dims), dtype=np.uint8)
        for i in range(8):
            packed |= (binary_bits[:, :, i] << (7 - i))
        
        return packed

    @staticmethod
    def hamming_distance(binary_a: np.ndarray, binary_b: np.ndarray) -> np.ndarray:
        # XOR to find differing bits
        xor_result = binary_a[:, np.newaxis, :] ^ binary_b[np.newaxis, :, :]
        
        # Count set bits in each byte
        def popcount_uint8(x):
            x = x - ((x >> 1) & 0x55)
            x = (x & 0x33) + ((x >> 2) & 0x33)
            x = (x + (x >> 4)) & 0x0F
            return x
        
        return np.sum(popcount_uint8(xor_result), axis=2)

    def get_embedding_dim(self) -> int:
        return self.DIM // 8 if self.use_binary else self.DIM

    def get_byte_size(self) -> int:
        return 48 if self.use_binary else (self.DIM * 4)

    def clear_memory(self):
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                torch.mps.empty_cache()
        except ImportError:
            pass
