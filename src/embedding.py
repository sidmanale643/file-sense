from typing import List, Union
from sentence_transformers import SentenceTransformer
from constants import EMBEDDING_MODEL

class EmbeddingService:
    def __init__(self):
        
        self.model_name = EMBEDDING_MODEL
        self.model = SentenceTransformer(self.model_name)
        self.device = "mps"
        self.batch_size = 32
        self.normalize_embeddings = True  
    
    def embed(
        self,
        documents : Union[List["str"], "str"],
        show_progress_bar : bool = True,
    ):
    
        embeddings = self.model.encode(
            sentences= documents,
            batch_size= self.batch_size,
            show_progress_bar= show_progress_bar,
            device = self.device,
            normalize_embeddings= self.normalize_embeddings
        )

        return embeddings

