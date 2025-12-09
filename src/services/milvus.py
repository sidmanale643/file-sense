from typing import List, Dict, Any, Optional
from pathlib import Path
from pymilvus import MilvusClient
from pymilvus.model.sparse import BM25EmbeddingFunction
from pymilvus import CollectionSchema, FieldSchema, DataType
from embedding import EmbeddingService

class Milvus:
    def __init__(self) -> None:
        # Always resolve the DB file under the project root and ensure the folder exists
        base_dir = Path(__file__).resolve().parents[1]
        db_path = base_dir / "db"
        db_path.mkdir(parents=True, exist_ok=True)
        self.address = str(db_path / "milvus_demo.db")

        self.client = MilvusClient(self.address)
        self.collection = "file_sense_test"
        self.embedding_service = EmbeddingService()

        self.bm25 = BM25EmbeddingFunction()
        
        # Field names
        self.dense_field = "dense_vector"
        self.sparse_field = "sparse_vector"

        # Make sure default collection exists before any inserts/searches
        self._ensure_collection_exists()
    
    def create_collection(
        self,
        collection_name: str,
        dimension: Optional[int] = None,
        metric_type: str = "COSINE",
        auto_id: bool = True,
        drop_existing: bool = True
    ) -> bool:
            # Auto-detect dimension from embedding service if not provided
            if dimension is None:
                dimension = self.embedding_service.get_dimension()
                print(f"Auto-detected embedding dimension: {dimension}")

            # Drop or protect any pre-existing collection to avoid conflicting schemas
            if self.client.has_collection(collection_name):
                if drop_existing:
                    self.client.drop_collection(collection_name)
                else:
                    raise ValueError(
                        f"Collection {collection_name} already exists with different parameters"
                    )

            # Define explicit fields for hybrid search (dense + sparse)
            fields = [
                FieldSchema(
                    name="id",
                    dtype=DataType.INT64,
                    is_primary=True,
                    auto_id=auto_id,
                ),
                FieldSchema(
                    name=self.dense_field,
                    dtype=DataType.FLOAT_VECTOR,
                    dim=dimension,
                ),
                FieldSchema(
                    name=self.sparse_field,
                    dtype=DataType.SPARSE_FLOAT_VECTOR,
                ),
                FieldSchema(
                    name="text",
                    dtype=DataType.VARCHAR,
                    max_length=65535,  # Required for BM25 indexing
                ),
                FieldSchema(
                    name="file_name",
                    dtype=DataType.VARCHAR,
                    max_length=512,
                ),
                FieldSchema(
                    name="file_path",
                    dtype=DataType.VARCHAR,
                    max_length=1024,
                ),
                FieldSchema(
                    name="file_type",
                    dtype=DataType.VARCHAR,
                    max_length=50,
                ),
                FieldSchema(
                    name="file_size",
                    dtype=DataType.INT32,
                ),
            ]

            schema = CollectionSchema(
                fields=fields,
                description="Hybrid search collection with vector and BM25 support",
                enable_dynamic_field=True,  # Allow additional metadata fields
            )

            self.client.create_collection(
                collection_name=collection_name,
                schema=schema,
                dimension=dimension,
            )

            # Create indexes for vector fields
            # Index for dense vector field
            self.client.prepare_index_params()
            index_params = self.client.prepare_index_params()
            
            index_params.add_index(
                field_name=self.dense_field,
                index_type="AUTOINDEX",  # or "IVF_FLAT", "HNSW", etc.
                metric_type=metric_type,
            )
            
            # Index for sparse vector field (BM25)
            index_params.add_index(
                field_name=self.sparse_field,
                index_type="SPARSE_INVERTED_INDEX",
                metric_type="IP",  # Inner Product for sparse vectors
            )
            
            self.client.create_index(
                collection_name=collection_name,
                index_params=index_params
            )

            # Track the active collection for later inserts/searches
            self.collection = collection_name
    
    def _ensure_collection_exists(self) -> None:
        """
        Ensure the default collection exists before any insert/search.
        Keeps existing data by not dropping when already present.
        """
        if self.client.has_collection(self.collection):
            return
        self.create_collection(collection_name=self.collection, drop_existing=False)

    def fit_bm25(self, corpus: List[str]):
        """
        Fit BM25 on document corpus.
        Call this once with all your documents before inserting.
        """
        self.bm25.fit(corpus)
        print(f"BM25 fitted on {len(corpus)} documents")
    
    def insert(self, data: Dict[str, Any]):
      
        if not isinstance(data, dict):
            raise TypeError("data is not a dict")
        
        if "text" not in data:
            raise ValueError("data must contain 'text' field")
        
        try:
            self._ensure_collection_exists()
            # Generate dense vector
            dense_vec = self.embedding_service.embed_single(text=data["text"])
            
            # Generate sparse vector (BM25)
            # encode_documents returns a scipy sparse matrix with shape (1, vocab_size)
            # Milvus requires shape[0] = 1, so we keep it as-is (don't index with [0])
            sparse_vec = self.bm25.encode_documents([data["text"]])
            
            # Prepare insert data
            insert_data = {
                **data,
                self.dense_field: dense_vec,
                self.sparse_field: sparse_vec
            }
            
            self.client.insert(
                collection_name=self.collection,
                data=[insert_data]
            )
            
            return {"success": True}
            
        except Exception as e:
            return {"success": False, "error": f"Insert failed: {e}"}
    
    def insert_batch(self, data_list: List[Dict[str, Any]]):
        """Batch insert for better performance"""
        if not isinstance(data_list, list):
            raise TypeError("data_list must be a list")
        
        try:
            self._ensure_collection_exists()
            texts = [item["text"] for item in data_list]
            
            # Batch embeddings
            dense_vecs = [self.embedding_service.embed_single(text=t) for t in texts]
            
            # For BM25, encode each document individually to get proper format
            # Milvus requires each sparse vector to have shape[0] = 1 (scipy sparse matrix with 1 row)
            # encode_documents([text]) returns shape (1, vocab_size) which is what we need
            sparse_vecs = []
            for text in texts:
                # Encode single document - returns scipy sparse matrix with shape (1, vocab_size)
                sparse_vec = self.bm25.encode_documents([text])
                sparse_vecs.append(sparse_vec)
            
            # Prepare data
            insert_data = []
            for i, item in enumerate(data_list):
                insert_data.append({
                    **item,
                    self.dense_field: dense_vecs[i],
                    self.sparse_field: sparse_vecs[i]
                })
            
            self.client.insert(
                collection_name=self.collection,
                data=insert_data
            )
            
            return {"success": True, "count": len(data_list)}
            
        except Exception as e:
            return {"success": False, "error": f"Batch insert failed: {e}"}
    
    def search(
        self,
        query: str,
        limit: int = 10,
        output_fields: List[str] = None,
        filter_expr: str = "",
        rerank_params: Optional[Dict] = None
    ):
        
       
        if output_fields is None:
            output_fields = ["file_path", "file_type", "file_size", "text"]
        
        try:
            # Generate query embeddings
            dense_query = self.embedding_service.embed_single(text=query)
            
            # Perform hybrid search
            results = self.client.search(
                collection_name=self.collection,
                data=[dense_query],  # Dense search
                anns_field=self.dense_field,
                limit=limit,
                output_fields=output_fields,
                filter=filter_expr if filter_expr else None,
                # For hybrid search with sparse vectors
                search_params={
                    "metric_type": "COSINE", 
                    "params": {}
                }
            )
            
            return {"success": True, "results": results}
            
        except Exception as e:
            error_msg = f"Search failed on collection {self.collection}: {e}"
            print(error_msg)
            return {"success": False, "error": error_msg}
    
    def hybrid_search(
        self,
        query: str,
        limit: int = 10,
        output_fields: List[str] = None,
        filter_expr: str = "",
        dense_weight: float = 0.5,
        sparse_weight: float = 0.5
    ):
        """
        Explicit hybrid search combining dense and sparse (BM25) results.
        
        Args:
            query: Search query
            limit: Number of results
            output_fields: Fields to return
            filter_expr: Filter expression
            dense_weight: Weight for dense vector search (0-1)
            sparse_weight: Weight for sparse/BM25 search (0-1)
        """
        if output_fields is None:
            output_fields = ["file_path", "file_type", "file_size", "text"]
        
        try:
            # Generate embeddings
            dense_query = self.embedding_service.embed_single(text=query)
            sparse_query = self.bm25.encode_queries([query])
            
            # Milvus Lite native hybrid search
            results = self.client.hybrid_search(
                collection_name=self.collection,
                reqs=[
                    {
                        "data": [dense_query],
                        "anns_field": self.dense_field,
                        "param": {"metric_type": "COSINE"},
                        "limit": limit,
                        "expr": filter_expr if filter_expr else None
                    },
                    {
                        "data": sparse_query,
                        "anns_field": self.sparse_field,
                        "param": {"metric_type": "IP"},  # Inner product for sparse
                        "limit": limit,
                        "expr": filter_expr if filter_expr else None
                    }
                ],
                rerank={
                    "strategy": "weighted",  # or "rrf" for Reciprocal Rank Fusion
                    "params": {
                        "weights": [dense_weight, sparse_weight]
                    }
                },
                limit=limit,
                output_fields=output_fields
            )
            
            return {"success": True, "results": results}
            
        except Exception as e:
            error_msg = f"Hybrid search failed: {e}"
            print(error_msg)
            return {"success": False, "error": error_msg}
    
    def collection_is_empty(self) -> bool:
        """
        Lightweight check to see if the active collection has any rows.
        This helps us decide whether we need to reinsert documents even if
        the local SQLite index claims they are already present.
        """
        try:
            stats = self.client.get_collection_stats(collection_name=self.collection)
            row_count = int(stats.get("row_count", 0))
            return row_count == 0
        except Exception:
            # If stats fail, assume empty so upstream logic can attempt reindexing.
            return True
    
    def prepare_dense(self, query: str, expr: str = ""):
        """Prepare dense vector for search"""
        query_embedding = self.embedding_service.embed_single(text=query)
        return query_embedding
    
    def prepare_sparse(self, query: str, expr: str = ""):
        """Prepare sparse (BM25) vector for search"""
        sparse_embedding = self.bm25.encode_queries([query])
        return sparse_embedding

if __name__ == "__main__":

    ms = Milvus()
    query = "Sidhant"

    # Create collection (dimension will be auto-detected from embedding model)
    ms.create_collection(collection_name= "file_sense_test1")
    
    # Sample documents for testing
    sample_docs = [
        {
            "text": "Sidhant is a software engineer working on AI applications",
            "file_name": "doc1.txt",
            "file_path": "/path/to/doc1.txt",
            "file_type": "txt",
            "file_size": 100
        },
        {
            "text": "This document contains information about machine learning",
            "file_name": "doc2.txt",
            "file_path": "/path/to/doc2.txt",
            "file_type": "txt",
            "file_size": 200
        },
        {
            "text": "Python programming is essential for data science",
            "file_name": "doc3.txt",
            "file_path": "/path/to/doc3.txt",
            "file_type": "txt",
            "file_size": 150
        }
    ]
    
    # Fit BM25 on the corpus
    corpus = [doc["text"] for doc in sample_docs]
    ms.fit_bm25(corpus)
    
    # Insert sample documents
    print("Inserting documents...")
    result = ms.insert_batch(sample_docs)
    print(f"Insert result: {result}")
    
    # Now search
    print(f"\nSearching for: {query}")
    results = ms.search(query=query)
    print(results)

