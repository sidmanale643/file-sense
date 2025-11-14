from typing import Union, List
from chonkie import RecursiveChunker
from chonkie.types import Chunk


class Chunker:
    
    def __init__(
        self,
        chunk_size: int = 512,
        min_characters_per_chunk: int = 24,
        recipe: str = None,
        lang: str = "en"
    ):
        if recipe:
            self.chunker = RecursiveChunker.from_recipe(recipe, lang=lang)
        else:
            self.chunker = RecursiveChunker(
                chunk_size=chunk_size,
                min_characters_per_chunk=min_characters_per_chunk
            )
        
        self.chunk_size = chunk_size
    
    def chunk(
        self,
        document: Union[str, List[str]],
    ) -> List[Chunk]:
        if not document:
            return []
        
        if isinstance(document, str):
            return self.chunker.chunk(document)
        else:
            return self.chunker.chunk_batch(document)
    
    def __call__(
        self,
        document: Union[str, List[str]]
    ) -> List[Chunk]:
        return self.chunk(document)
