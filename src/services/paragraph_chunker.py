import re
import mmap
from typing import Generator
from pathlib import Path


class ParagraphChunker:

    def __init__(
        self,
        max_chunk_size: int = 512,
        overlap: int = 50,
        min_chunk_size: int = 100
    ):
        self.max_chunk_size = max_chunk_size
        self.overlap = overlap
        self.min_chunk_size = min_chunk_size

    def chunk_streaming(self, text: str) -> Generator[str, None, None]:
        if not text or not text.strip():
            return
        
        # Split into paragraphs (double newline)
        paragraphs = re.split(r'\n\s*\n', text)
        
        current_chunk = ""
        
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            
            # If single paragraph is too large, split it
            if len(para) > self.max_chunk_size:
                # Yield current chunk if exists
                if current_chunk:
                    yield current_chunk.strip()
                    current_chunk = ""
                
                # Split large paragraph
                for sub_chunk in self._split_large_paragraph(para):
                    yield sub_chunk
            else:
                # Try to add to current chunk
                if len(current_chunk) + len(para) + 2 <= self.max_chunk_size:
                    if current_chunk:
                        current_chunk += "\n\n" + para
                    else:
                        current_chunk = para
                else:
                    # Yield current chunk and start new one
                    if current_chunk:
                        yield current_chunk.strip()
                    
                    # Include overlap from previous chunk
                    if self.overlap > 0 and current_chunk:
                        overlap_text = self._get_overlap_text(current_chunk)
                        current_chunk = overlap_text + "\n\n" + para if overlap_text else para
                    else:
                        current_chunk = para
        
        # Yield final chunk
        if current_chunk:
            yield current_chunk.strip()

    def chunk_file(self, filepath: str) -> Generator[str, None, None]:
        path = Path(filepath)
        
        if not path.exists():
            raise FileNotFoundError(f"File not found: {filepath}")
        
        # For small files (< 10MB), read normally
        if path.stat().st_size < 10 * 1024 * 1024:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                text = f.read()
                yield from self.chunk_streaming(text)
        else:
            # Memory-mapped reading for large files
            yield from self._chunk_file_mmap(filepath)
    
    def _chunk_file_mmap(self, filepath: str) -> Generator[str, None, None]:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            with mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as mm:
                # Process in chunks to find paragraphs
                buffer = ""
                chunk_start = 0
                
                while chunk_start < len(mm):
                    # Read a chunk
                    chunk_end = min(chunk_start + 1024 * 1024, len(mm))  # 1MB at a time
                    buffer += mm[chunk_start:chunk_end].decode('utf-8', errors='ignore')
                    
                    # Find last complete paragraph in buffer
                    last_para_end = buffer.rfind('\n\n')
                    
                    if last_para_end != -1:
                        # Process complete paragraphs
                        text_to_chunk = buffer[:last_para_end]
                        yield from self.chunk_streaming(text_to_chunk)
                        
                        # Keep remainder (might be partial paragraph)
                        buffer = buffer[last_para_end:]
                    
                    chunk_start = chunk_end
                
                # Process remaining buffer
                if buffer.strip():
                    yield from self.chunk_streaming(buffer)

    def _split_large_paragraph(self, para: str) -> Generator[str, None, None]:
        # Try to split at sentence boundaries
        sentences = re.split(r'(?<=[.!?])\s+', para)
        
        current_chunk = ""
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            
            if len(sentence) > self.max_chunk_size:
                # Even a single sentence is too long - split by words
                if current_chunk:
                    yield current_chunk.strip()
                    current_chunk = ""
                
                yield from self._split_by_words(sentence)
            elif len(current_chunk) + len(sentence) + 1 <= self.max_chunk_size:
                if current_chunk:
                    current_chunk += " " + sentence
                else:
                    current_chunk = sentence
            else:
                # Yield current and start new
                if current_chunk:
                    yield current_chunk.strip()
                current_chunk = sentence
        
        if current_chunk:
            yield current_chunk.strip()
    
    def _split_by_words(self, text: str) -> Generator[str, None, None]:
        words = text.split()
        current_chunk = ""
        
        for word in words:
            if len(current_chunk) + len(word) + 1 <= self.max_chunk_size:
                if current_chunk:
                    current_chunk += " " + word
                else:
                    current_chunk = word
            else:
                if current_chunk:
                    yield current_chunk.strip()
                
                # If single word is too long, just yield it anyway
                current_chunk = word
        
        if current_chunk:
            yield current_chunk.strip()
    
    def _get_overlap_text(self, text: str) -> str:
        if not text:
            return ""
        
        # Try to find a good break point (end of sentence or word)
        if len(text) <= self.overlap:
            return text
        
        # Get last N characters
        overlap_start = len(text) - self.overlap
        overlap_text = text[overlap_start:]
        
        # Try to find start of sentence in overlap region
        sentence_start = overlap_text.find('. ') + 2
        if sentence_start > 2:
            return overlap_text[sentence_start:]
        
        # Try start of word
        word_start = overlap_text.find(' ') + 1
        if word_start > 0:
            return overlap_text[word_start:]
        
        return overlap_text

    def chunk_count(self, text: str) -> int:
        return sum(1 for _ in self.chunk_streaming(text))


def create_chunker_for_mode(mode: str) -> ParagraphChunker:
    settings = {
        "eco": {"max_chunk_size": 512, "overlap": 50, "min_chunk_size": 100},
        "balanced": {"max_chunk_size": 1000, "overlap": 100, "min_chunk_size": 200},
        "performance": {"max_chunk_size": 1000, "overlap": 100, "min_chunk_size": 200}
    }
    
    config = settings.get(mode, settings["balanced"])
    return ParagraphChunker(**config)
