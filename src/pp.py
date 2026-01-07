from .services import FileManager, FileMetadataExtractor, Search, TXTLoader, DocxLoader, DoclingOCRService, TextChunker, Document
import os
import pathlib
import torch
import gc

class Pipeline:
    def __init__(self, enable_chunking: bool = False):
        self.db = FileManager()
        self.index = Search()
        self.enable_chunking = enable_chunking
        
        self.chunker = TextChunker(
            chunk_size=1000,  
            chunk_overlap=100,
            min_chunk_size=50,
            max_tokens=2000
        )
    
    def index_dir(self, dir_path : str):
    
        gc.collect()
        
        try:
            if torch.backends.mps.is_available() and torch.backends.mps.is_built():
                torch.mps.empty_cache()
        except Exception:
            pass 
            
        all_texts = [] 
        all_chunks_to_index = []
        db_records = []
        next_id = self.db.count_files() + 1  

        for file in os.listdir(dir_path):
            file_path = os.path.join(dir_path, file)
            
            if not os.path.isfile(file_path):
                continue

            metadata = self.extract_metadata(file_path)
            
            # Check if file already indexed (skip if hash exists)
            if self.db.check_hash_exists(metadata["file_hash"]):
                print(f"File {file_path} already indexed (hash exists)")
                continue
           
            text_content = self.read_file_text(file_path)
            if not text_content.strip():
                print(f"Skipping {file_path}: no readable text content")
                continue
  
            chunks = self.chunker.smart_chunk(text_content, force_chunk=self.enable_chunking, max_chunk_chars=8000)
            
            all_texts.extend(chunks)

            print(f"Indexing file {file_path} ({len(chunks)} chunk{'s' if len(chunks) != 1 else ''})")

            for chunk_idx, chunk in enumerate(chunks):
                chunk_id = next_id
                next_id += 1
                
                db_records.append({
                    "id": chunk_id,
                    "file_name": metadata["file_name"],
                    "file_path": metadata["absolute_path"],
                    "file_size": metadata["file_size_bytes"],
                    "file_type": metadata["file_type"],
                    "file_hash": metadata["file_hash"],
                    "text": chunk,
                    "chunk_index": chunk_idx,
                    "total_chunks": len(chunks),
                })
                
                # Prepare for vector indexing
                all_chunks_to_index.append({
                    "id": chunk_id,
                    "text": chunk,
                    "file_name": metadata["file_name"],
                    "file_path": metadata["absolute_path"],
                    "file_type": metadata["file_type"],
                    "file_size": metadata["file_size_bytes"],
                    "chunk_index": chunk_idx,
                    "total_chunks": len(chunks),
                })

        if not all_chunks_to_index:
            print("No new files to index.")
            return {"success": True, "inserted": 0}

        if all_texts:
            print(f"Fitting BM25 on {len(all_texts)} text chunks...")
            # For BM25 to work properly, we need to refit on ALL documents (existing + new)
            # because BM25 doesn't support incremental updates like FAISS

            # Check if there are existing documents
            existing_count = self.db.count_files()
            if existing_count > 0:
                print(f"Loading {existing_count} existing documents from database...")
                # Get all existing documents
                existing_docs = self.db.get_all_files()

                # Extract text and IDs from existing documents
                existing_texts = []
                existing_ids = []

                for doc in existing_docs:
                    # doc structure: [id, file_name, file_path, file_size, file_type, file_hash, text, chunk_index, total_chunks]
                    doc_id = doc[0]
                    text = doc[6]
                    existing_ids.append(doc_id)
                    existing_texts.append(text)

                print(f"Loaded {len(existing_texts)} existing documents")

                # Combine existing + new documents
                combined_texts = existing_texts + all_texts
                combined_ids = existing_ids + [chunk["id"] for chunk in all_chunks_to_index]

                print(f"Fitting BM25 on total of {len(combined_texts)} documents...")
                self.index.fit_bm25(combined_texts, doc_ids=combined_ids)
            else:
                # First time indexing - just use the new documents
                doc_ids = [chunk["id"] for chunk in all_chunks_to_index]
                self.index.fit_bm25(all_texts, doc_ids=doc_ids)
        

        print(f"Indexing {len(all_chunks_to_index)} chunks in vector store...")
        try:
            
            documents = [
                Document(
                    id=chunk["id"],
                    file_name=chunk["file_name"],
                    file_path=chunk["file_path"],
                    file_type=chunk["file_type"],
                    file_size=chunk["file_size"],
                    chunk_index=chunk.get("chunk_index"),
                    total_chunks=chunk.get("total_chunks"),
                    text=chunk["text"]
                )
                for chunk in all_chunks_to_index
            ]
            
            self.index.idx.index(documents)
            
        except Exception as e:
            print(f"Vector indexing failed: {e}")
            return {"success": False, "error": str(e)}

        print(f"Storing {len(db_records)} chunks in database...")
        result = self.db.batch_insert_files(db_records)
        print(result)

        return {"success": True, "inserted": len(db_records)}
     
    def extract_metadata(self, file_path : str):

        return FileMetadataExtractor(file_path).extract_metadata()
    
    def read_file_text(self, file_path: str) -> str:
    
        path = pathlib.Path(file_path)
        suffix = path.suffix.lower()

        try:
            if suffix == ".txt":
                return TXTLoader().load_file(file_path)
            if suffix == ".docx":
                return DocxLoader().load_file(file_path)
            if suffix == ".pdf":
                return DoclingOCRService().load_file(file_path)

            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        except Exception:
            return ""
    
    def search_file(self, query : str, is_path : bool = False, use_regex : bool = False):
        print(f"Searching for {query} (regex={use_regex})")
        results = self.db.search_file(query=query, is_path=is_path, use_regex=use_regex)
        return results


    def hybrid_search_file(self, query: str, k: int = 2, deduplicate: bool = True, rerank: bool = False, alpha: float = 0.5):
  
        results = self.index.hybrid_search(query=query, k=k, deduplicate=deduplicate, rerank=rerank, alpha=alpha)
        return results

    def search_both(self, query: str, is_path: bool = False, k: int = 10, use_regex: bool = False):
        direct_results = self.db.search_file(query=query, is_path=is_path, use_regex=use_regex)

        hybrid_search_response = self.hybrid_search_file(query, k=k, deduplicate=True)
        
        if not hybrid_search_response.get("success"):
            print(f"Hybrid search failed: {hybrid_search_response.get('error', 'Unknown error')}")
        

        results_by_hash = {}
   
        for row in direct_results:
            file_hash = row[5]
            if file_hash and file_hash not in results_by_hash:
                results_by_hash[file_hash] = {
                    'file_name': row[1],
                    'file_path': row[2],
                    'file_size': row[3],
                    'file_type': row[4],
                    'file_hash': file_hash,
                    'source': 'direct'  
                }

        if hybrid_search_response.get("success"):
            for hit in hybrid_search_response.get("results", []):
                if isinstance(hit, dict):
                    file_hash = hit.get("file_hash", "")
                    if file_hash and file_hash not in results_by_hash:
                        results_by_hash[file_hash] = {
                            'file_name': hit.get("file_name", ""),
                            'file_path': hit.get("file_path", ""),
                            'file_size': hit.get("file_size", 0),
                            'file_type': hit.get("file_type", ""),
                            'file_hash': file_hash,
                            'source': 'hybrid'  
                        }
        
        unique_results = list(results_by_hash.values())
        
        print(f"Found {len(unique_results)} unique results ({len(direct_results)} direct, {len(hybrid_search_response.get('results', []))} hybrid)")
        
        return unique_results

    def index_files(self, file_paths: list):
        """Index a list of specific file paths.
        
        Args:
            file_paths: List of absolute file paths to index
            
        Returns:
            Dict with success status and count of inserted documents
        """
        gc.collect()
        
        try:
            if torch.backends.mps.is_available() and torch.backends.mps.is_built():
                torch.mps.empty_cache()
        except Exception:
            pass 
            
        all_texts = [] 
        all_chunks_to_index = []
        db_records = []
        next_id = self.db.count_files() + 1
        skipped = []
        errors = []

        for file_path in file_paths:
            if not os.path.isfile(file_path):
                errors.append(f"{file_path}: not a file")
                continue

            metadata = self.extract_metadata(file_path)
            
            # Check if file already indexed (skip if hash exists)
            if self.db.check_hash_exists(metadata["file_hash"]):
                skipped.append(file_path)
                continue
           
            text_content = self.read_file_text(file_path)
            if not text_content.strip():
                errors.append(f"{file_path}: no readable text content")
                continue
  
            chunks = self.chunker.smart_chunk(text_content, force_chunk=self.enable_chunking, max_chunk_chars=8000)
            all_texts.extend(chunks)

            print(f"Indexing file {file_path} ({len(chunks)} chunk{'s' if len(chunks) != 1 else ''})")

            for chunk_idx, chunk in enumerate(chunks):
                chunk_id = next_id
                next_id += 1
                
                db_records.append({
                    "id": chunk_id,
                    "file_name": metadata["file_name"],
                    "file_path": metadata["absolute_path"],
                    "file_size": metadata["file_size_bytes"],
                    "file_type": metadata["file_type"],
                    "file_hash": metadata["file_hash"],
                    "text": chunk,
                    "chunk_index": chunk_idx,
                    "total_chunks": len(chunks),
                })
                
                all_chunks_to_index.append({
                    "id": chunk_id,
                    "text": chunk,
                    "file_name": metadata["file_name"],
                    "file_path": metadata["absolute_path"],
                    "file_type": metadata["file_type"],
                    "file_size": metadata["file_size_bytes"],
                    "chunk_index": chunk_idx,
                    "total_chunks": len(chunks),
                })

        if not all_chunks_to_index:
            return {"success": True, "inserted": 0, "skipped": skipped, "errors": errors}

        if all_texts:
            print(f"Fitting BM25 on {len(all_texts)} text chunks...")
            # For BM25 to work properly, we need to refit on ALL documents (existing + new)
            # because BM25 doesn't support incremental updates like FAISS

            # Check if there are existing documents (excluding the ones we're about to add)
            existing_count = self.db.count_files()
            if existing_count > 0:
                print(f"Loading {existing_count} existing documents from database...")
                # Get all existing documents
                existing_docs = self.db.get_all_files()

                # Extract text and IDs from existing documents
                existing_texts = []
                existing_ids = []

                for doc in existing_docs:
                    # doc structure: [id, file_name, file_path, file_size, file_type, file_hash, text, chunk_index, total_chunks]
                    doc_id = doc[0]
                    text = doc[6]
                    existing_ids.append(doc_id)
                    existing_texts.append(text)

                print(f"Loaded {len(existing_texts)} existing documents")

                # Combine existing + new documents
                combined_texts = existing_texts + all_texts
                combined_ids = existing_ids + [chunk["id"] for chunk in all_chunks_to_index]

                print(f"Fitting BM25 on total of {len(combined_texts)} documents...")
                self.index.fit_bm25(combined_texts, doc_ids=combined_ids)
            else:
                # First time indexing - just use the new documents
                doc_ids = [chunk["id"] for chunk in all_chunks_to_index]
                self.index.fit_bm25(all_texts, doc_ids=doc_ids)

        print(f"Indexing {len(all_chunks_to_index)} chunks in vector store...")
        try:
            documents = [
                Document(
                    id=chunk["id"],
                    file_name=chunk["file_name"],
                    file_path=chunk["file_path"],
                    file_type=chunk["file_type"],
                    file_size=chunk["file_size"],
                    chunk_index=chunk.get("chunk_index"),
                    total_chunks=chunk.get("total_chunks"),
                    text=chunk["text"]
                )
                for chunk in all_chunks_to_index
            ]
            
            self.index.idx.index(documents)
            
        except Exception as e:
            print(f"Vector indexing failed: {e}")
            return {"success": False, "error": str(e)}

        print(f"Storing {len(db_records)} chunks in database...")
        result = self.db.batch_insert_files(db_records)
        print(result)

        return {
            "success": True, 
            "inserted": len(db_records), 
            "skipped": skipped, 
            "errors": errors
        }

    def unindex_by_ids(self, ids: list):
        """Remove specific chunk IDs from both SQLite and FAISS.
        
        Args:
            ids: List of chunk IDs to remove
            
        Returns:
            Dict with success status and counts
        """
        try:
            if not ids:
                return {"success": True, "removed": 0}
            
            # Remove from FAISS
            faiss_removed = self.index.idx.remove_ids(ids)
            
            # Remove from SQLite
            db_result = self.db.batch_delete_by_ids(ids)
            
            print(f"Unindexed {faiss_removed} vectors from FAISS, DB result: {db_result}")
            
            return {
                "success": True,
                "faiss_removed": faiss_removed,
                "db_result": db_result
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def unindex_by_paths(self, paths: list):
        """Remove all chunks for given file paths.
        
        Args:
            paths: List of file paths to unindex
            
        Returns:
            Dict with success status and counts
        """
        try:
            all_ids = []
            for path in paths:
                ids = self.db.get_ids_by_path(path)
                all_ids.extend(ids)
            
            if not all_ids:
                return {"success": True, "removed": 0, "message": "No matching files found"}
            
            return self.unindex_by_ids(all_ids)
        except Exception as e:
            return {"success": False, "error": str(e)}

    def unindex_by_hashes(self, hashes: list):
        """Remove all chunks for given file hashes.
        
        Args:
            hashes: List of file hashes to unindex
            
        Returns:
            Dict with success status and counts
        """
        try:
            ids = self.db.get_ids_by_hashes(hashes)
            
            if not ids:
                return {"success": True, "removed": 0, "message": "No matching files found"}
            
            # Remove from FAISS
            faiss_removed = self.index.idx.remove_ids(ids)
            
            # Remove from SQLite by hashes directly
            db_result = self.db.batch_delete_by_hashes(hashes)
            
            return {
                "success": True,
                "faiss_removed": faiss_removed,
                "db_result": db_result
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_indexed_files(self, limit: int = None, offset: int = 0):
        """List all indexed files with metadata.
        
        Args:
            limit: Maximum number of files to return
            offset: Offset for pagination
            
        Returns:
            Dict with success status, files list, and total count
        """
        try:
            files = self.db.get_unique_files(limit=limit, offset=offset)
            total = self.db.count_unique_files()
            
            return {
                "success": True,
                "files": files,
                "total": total,
                "limit": limit,
                "offset": offset
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_file_types(self):
        """Get list of distinct file types in the index.
        
        Returns:
            Dict with success status and file types list
        """
        try:
            file_types = self.db.get_file_types()
            return {"success": True, "file_types": file_types}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def find_duplicates(self):
        """Find duplicate files in the index."""
        try:
            duplicates = self.db.find_duplicates()
            return {"success": True, "duplicates": duplicates}
        except Exception as e:
            return {"success": False, "error": str(e)}