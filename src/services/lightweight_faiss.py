import faiss
import numpy as np
from typing import List, Tuple, Dict, Any
from pathlib import Path
import pickle


class LightweightFAISSIndex:
    def __init__(self, mode: str = "balanced", dim: int = 384, cache_dir: str = "./db"):
        self.mode = mode.lower()
        self.dim = dim
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        self.use_binary = self.mode in ("eco", "balanced")
        self.index = None
        self.id_map = {}  # Maps internal FAISS index to document IDs
        self.next_internal_id = 0
        
        self._init_index()
        self._load_cache()
    
    def _init_index(self):
        if self.use_binary:
            # Binary index: IndexBinaryFlat expects number of BITS (not bytes)
            # For 384-dim float32 -> binary: 384 bits packed into 48 bytes
            self.index = faiss.IndexBinaryFlat(self.dim)
            print(f"Initialized binary FAISS index ({self.dim} bits, 48 bytes per vector)")
        else:
            # Float32 index: 384 * 4 = 1536 bytes per vector
            self.index = faiss.IndexFlatL2(self.dim)
            print(f"Initialized float32 FAISS index (dim={self.dim}, L2 distance)")
    
    def _load_cache(self):
        cache_file = self.cache_dir / "lightweight_faiss.bin"
        id_map_file = self.cache_dir / "lightweight_faiss_ids.pkl"
        
        if cache_file.exists():
            try:
                if self.use_binary:
                    self.index = faiss.read_index_binary(str(cache_file))
                else:
                    self.index = faiss.read_index(str(cache_file))
                print(f"Loaded FAISS index from cache ({self.index.ntotal} vectors)")
                
                # Load ID mapping
                if id_map_file.exists():
                    with open(id_map_file, 'rb') as f:
                        data = pickle.load(f)
                        self.id_map = data.get('id_map', {})
                        self.next_internal_id = data.get('next_id', 0)
                
            except Exception as e:
                print(f"Failed to load cache: {e}, starting fresh")
                self._init_index()
    
    def save_cache(self):
        cache_file = self.cache_dir / "lightweight_faiss.bin"
        id_map_file = self.cache_dir / "lightweight_faiss_ids.pkl"
        
        try:
            if self.use_binary:
                faiss.write_index_binary(self.index, str(cache_file))
            else:
                faiss.write_index(self.index, str(cache_file))
            
            # Save ID mapping
            with open(id_map_file, 'wb') as f:
                pickle.dump({
                    'id_map': self.id_map,
                    'next_id': self.next_internal_id
                }, f)
            
            print(f"Saved FAISS index to cache ({self.index.ntotal} vectors)")
        except Exception as e:
            print(f"Failed to save cache: {e}")
    
    def add(self, embeddings: np.ndarray, doc_ids: List[int]) -> bool:
        if len(embeddings) == 0 or len(doc_ids) == 0:
            return False
        
        if len(embeddings) != len(doc_ids):
            raise ValueError(f"Embeddings count ({len(embeddings)}) != doc_ids count ({len(doc_ids)})")
        
        # Ensure correct data type
        if self.use_binary:
            if embeddings.dtype != np.uint8:
                raise ValueError(f"Binary index requires uint8 embeddings, got {embeddings.dtype}")
        else:
            if embeddings.dtype != np.float32:
                embeddings = embeddings.astype(np.float32)
        
        # Add to index
        self.index.add(embeddings)
        
        # Update ID mapping
        for i, doc_id in enumerate(doc_ids):
            internal_id = self.next_internal_id + i
            self.id_map[internal_id] = doc_id
        
        self.next_internal_id += len(doc_ids)
        return True
    
    def search(self, query_embedding: np.ndarray, k: int = 10) -> Tuple[List[int], List[float]]:
        if self.index.ntotal == 0:
            return [], []
        
        # Ensure query is correct shape and type
        if query_embedding.ndim == 1:
            query_embedding = query_embedding.reshape(1, -1)
        
        if self.use_binary:
            if query_embedding.dtype != np.uint8:
                raise ValueError(f"Binary search requires uint8 query, got {query_embedding.dtype}")
            # Search returns distances (Hamming distance)
            distances, indices = self.index.search(query_embedding, k)
        else:
            if query_embedding.dtype != np.float32:
                query_embedding = query_embedding.astype(np.float32)
            # Search returns distances (L2 distance)
            distances, indices = self.index.search(query_embedding, k)
        
        # Convert internal indices to doc_ids
        doc_ids = []
        valid_distances = []
        
        for idx, dist in zip(indices[0], distances[0]):
            if idx < 0 or idx >= self.next_internal_id:
                continue
            doc_id = self.id_map.get(int(idx))
            if doc_id is not None:
                doc_ids.append(doc_id)
                valid_distances.append(float(dist))
        
        return doc_ids, valid_distances
    
    def remove(self, doc_ids: List[int]) -> int:
        removed_count = 0
        
        # Find internal IDs for these doc_ids
        internal_ids_to_remove = set()
        for internal_id, doc_id in self.id_map.items():
            if doc_id in doc_ids:
                internal_ids_to_remove.add(internal_id)
        
        # Remove from mapping
        for internal_id in internal_ids_to_remove:
            del self.id_map[internal_id]
            removed_count += 1
        
        return removed_count
    
    def clear(self):
        self._init_index()
        self.id_map.clear()
        self.next_internal_id = 0
        print("Cleared FAISS index")
    
    def get_stats(self) -> Dict[str, Any]:
        return {
            "total_vectors": self.index.ntotal if self.index else 0,
            "active_mappings": len(self.id_map),
            "next_internal_id": self.next_internal_id,
            "mode": self.mode,
            "use_binary": self.use_binary,
            "dim": self.dim,
            "bytes_per_vector": 48 if self.use_binary else (self.dim * 4),
            "estimated_size_mb": (
                (self.index.ntotal * (48 if self.use_binary else self.dim * 4)) / (1024 * 1024)
                if self.index else 0
            )
        }
    
    def __len__(self) -> int:
        return self.index.ntotal if self.index else 0
