

import sqlite3
import re
from sqlite3 import Connection
from typing import List, Optional, Dict, Any
from contextlib import contextmanager
from threading import Lock
from pathlib import Path
from datetime import datetime


class LightweightFileManager:

    def __init__(self, db_path: str = "./db/lightweight.sqlite3"):
        self.path = db_path
        self.cache_dir = Path(db_path).parent
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Open connection with WAL mode optimizations
        self.conn: Connection = sqlite3.connect(
            self.path, 
            check_same_thread=False,
            isolation_level=None  # Autocommit mode for immediate writes
        )
        
        # Enable WAL mode and optimizations
        self._setup_wal_mode()
        
        # Create REGEXP function
        self.conn.create_function(
            "REGEXP", 
            2, 
            lambda expr, item: 1 if item and re.search(expr, item, re.IGNORECASE) else 0
        )
        
        self._lock = Lock()
        self.create_tables()

    def _setup_wal_mode(self):
        cursor = self.conn.cursor()
        
        # Enable WAL mode for better concurrency and performance
        cursor.execute("PRAGMA journal_mode = WAL")
        
        # Set synchronous to NORMAL (balance between safety and performance)
        cursor.execute("PRAGMA synchronous = NORMAL")
        
        # Memory-map the database (256MB)
        cursor.execute("PRAGMA mmap_size = 268435456")
        
        # Increase cache size (speeds up reads, uses more RAM)
        cursor.execute("PRAGMA cache_size = -8192")  # 8MB cache (negative = pages)
        
        # Enable foreign keys
        cursor.execute("PRAGMA foreign_keys = ON")
        
        cursor.close()
        print(f"SQLite WAL mode enabled at {self.path}")

    @contextmanager
    def get_cursor(self):
        cursor = self.conn.cursor()
        try:
            yield cursor
        finally:
            cursor.close()

    @contextmanager
    def transaction(self):
        cursor = self.conn.cursor()
        try:
            cursor.execute("BEGIN IMMEDIATE")
            yield cursor
            cursor.execute("COMMIT")
        except Exception as e:
            cursor.execute("ROLLBACK")
            raise e
        finally:
            cursor.close()
    
    def close(self):
        if hasattr(self, 'conn') and self.conn:
            # Checkpoint WAL before closing
            try:
                cursor = self.conn.cursor()
                cursor.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                cursor.close()
            except Exception:
                pass
            self.conn.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
    
    def __del__(self):
        self.close()
    
    def create_tables(self):
        try:
            with self.transaction() as cursor:
                # Main files table - optimized for chunk storage
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS files (
                        id INTEGER PRIMARY KEY,
                        file_hash TEXT NOT NULL,
                        file_path TEXT NOT NULL,
                        file_name TEXT NOT NULL,
                        file_type TEXT,
                        file_size INTEGER,
                        text TEXT,
                        chunk_index INTEGER DEFAULT 0,
                        total_chunks INTEGER DEFAULT 1,
                        modified_date TEXT,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                
                # Indexes for fast lookups
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_hash ON files (file_hash)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_path ON files (file_path)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_files_name ON files (file_name)")
                
                # Folders table for tracking indexed directories
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS folders (
                        id INTEGER PRIMARY KEY,
                        path TEXT UNIQUE NOT NULL,
                        name TEXT NOT NULL,
                        recursive BOOLEAN DEFAULT 0,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        last_indexed TEXT,
                        indexed_count INTEGER DEFAULT 0
                    )
                """)
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_folders_path ON folders (path)")
                
                # Index metadata table for tracking FAISS index info
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS index_metadata (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        mode TEXT NOT NULL,
                        use_binary BOOLEAN DEFAULT 1,
                        dim INTEGER DEFAULT 384,
                        total_vectors INTEGER DEFAULT 0,
                        last_updated TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                
            return {"success": True, "message": "Tables created"}
            
        except Exception as e:
            return {"success": False, "message": f"Failed to create tables: {e}"}
    
    def insert_chunk(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        try:
            with self.get_cursor() as cursor:
                cursor.execute("""
                    INSERT INTO files 
                    (id, file_hash, file_path, file_name, file_type, file_size, 
                     text, chunk_index, total_chunks, modified_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    metadata.get("id"),
                    metadata.get("file_hash", ""),
                    metadata.get("file_path", ""),
                    metadata.get("file_name", ""),
                    metadata.get("file_type", ""),
                    metadata.get("file_size", 0),
                    metadata.get("text", ""),
                    metadata.get("chunk_index", 0),
                    metadata.get("total_chunks", 1),
                    metadata.get("modified_date")
                ))
                
                return {
                    "success": True,
                    "id": cursor.lastrowid if not metadata.get("id") else metadata["id"]
                }
                
        except Exception as e:
            return {"success": False, "message": f"Failed to insert chunk: {e}"}
    
    def batch_insert_chunks(self, metadata_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not metadata_list:
            return {"success": True, "count": 0}
        
        try:
            with self.transaction() as cursor:
                data_tuples = [
                    (
                        m.get("id"),
                        m.get("file_hash", ""),
                        m.get("file_path", ""),
                        m.get("file_name", ""),
                        m.get("file_type", ""),
                        m.get("file_size", 0),
                        m.get("text", ""),
                        m.get("chunk_index", 0),
                        m.get("total_chunks", 1),
                        m.get("modified_date")
                    )
                    for m in metadata_list
                ]
                
                cursor.executemany("""
                    INSERT INTO files 
                    (id, file_hash, file_path, file_name, file_type, file_size, 
                     text, chunk_index, total_chunks, modified_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, data_tuples)
                
            return {"success": True, "count": len(metadata_list)}
            
        except Exception as e:
            return {"success": False, "message": f"Failed to batch insert: {e}"}
    
    def fetch_by_id(self, ids: List[int]) -> List[Dict[str, Any]]:
        if not ids:
            return []
        
        try:
            placeholders = ','.join('?' * len(ids))
            query = f"""
                SELECT id, file_hash, file_path, file_name, file_type, 
                       file_size, text, chunk_index, total_chunks, modified_date
                FROM files WHERE id IN ({placeholders})
            """
            
            with self.get_cursor() as cursor:
                cursor.execute(query, ids)
                columns = [desc[0] for desc in cursor.description]
                return [dict(zip(columns, row)) for row in cursor.fetchall()]
                
        except Exception as e:
            print(f"Failed to fetch by ID: {e}")
            return []
    
    def check_hash_exists(self, file_hash: str) -> bool:
        try:
            with self.get_cursor() as cursor:
                cursor.execute(
                    "SELECT 1 FROM files WHERE file_hash = ? LIMIT 1", 
                    (file_hash,)
                )
                return cursor.fetchone() is not None
        except Exception as e:
            print(f"Failed to check hash: {e}")
            return False
    
    def get_ids_by_hashes(self, file_hashes: List[str]) -> List[int]:
        if not file_hashes:
            return []
        
        try:
            placeholders = ','.join('?' * len(file_hashes))
            query = f"SELECT id FROM files WHERE file_hash IN ({placeholders})"
            
            with self.get_cursor() as cursor:
                cursor.execute(query, file_hashes)
                return [row[0] for row in cursor.fetchall()]
                
        except Exception as e:
            print(f"Failed to get IDs by hashes: {e}")
            return []
    
    def get_ids_by_path(self, path_prefix: str) -> List[int]:
        try:
            normalized_path = str(Path(path_prefix).expanduser().resolve())
            pattern = f"{normalized_path}%"
            
            with self.get_cursor() as cursor:
                cursor.execute(
                    "SELECT id FROM files WHERE file_path LIKE ?", 
                    (pattern,)
                )
                return [row[0] for row in cursor.fetchall()]
                
        except Exception as e:
            print(f"Failed to get IDs by path: {e}")
            return []
    
    def delete_by_ids(self, ids: List[int]) -> int:
        if not ids:
            return 0
        
        try:
            placeholders = ','.join('?' * len(ids))
            query = f"DELETE FROM files WHERE id IN ({placeholders})"
            
            with self.get_cursor() as cursor:
                cursor.execute(query, ids)
                return cursor.rowcount
                
        except Exception as e:
            print(f"Failed to delete by IDs: {e}")
            return 0
    
    def delete_by_hashes(self, file_hashes: List[str]) -> int:
        if not file_hashes:
            return 0
        
        try:
            placeholders = ','.join('?' * len(file_hashes))
            query = f"DELETE FROM files WHERE file_hash IN ({placeholders})"
            
            with self.get_cursor() as cursor:
                cursor.execute(query, file_hashes)
                return cursor.rowcount
                
        except Exception as e:
            print(f"Failed to delete by hashes: {e}")
            return 0
    
    def get_max_id(self) -> int:
        try:
            with self.get_cursor() as cursor:
                cursor.execute("SELECT MAX(id) FROM files")
                result = cursor.fetchone()
                return result[0] if result and result[0] else 0
        except Exception as e:
            print(f"Failed to get max ID: {e}")
            return 0
    
    def count_chunks(self) -> int:
        try:
            with self.get_cursor() as cursor:
                cursor.execute("SELECT COUNT(*) FROM files")
                result = cursor.fetchone()
                return result[0] if result else 0
        except Exception as e:
            print(f"Failed to count chunks: {e}")
            return 0
    
    def count_unique_files(self) -> int:
        try:
            with self.get_cursor() as cursor:
                cursor.execute("SELECT COUNT(DISTINCT file_hash) FROM files")
                result = cursor.fetchone()
                return result[0] if result else 0
        except Exception as e:
            print(f"Failed to count unique files: {e}")
            return 0
    
    def update_index_metadata(self, mode: str, use_binary: bool, dim: int, total_vectors: int):
        try:
            with self.get_cursor() as cursor:
                cursor.execute("""
                    INSERT OR REPLACE INTO index_metadata 
                    (id, mode, use_binary, dim, total_vectors, last_updated)
                    VALUES (1, ?, ?, ?, ?, ?)
                """, (mode, use_binary, dim, total_vectors, datetime.utcnow().isoformat()))
        except Exception as e:
            print(f"Failed to update metadata: {e}")
    
    def get_index_metadata(self) -> Optional[Dict[str, Any]]:
        try:
            with self.get_cursor() as cursor:
                cursor.execute("SELECT * FROM index_metadata WHERE id = 1")
                row = cursor.fetchone()
                if row:
                    columns = [desc[0] for desc in cursor.description]
                    return dict(zip(columns, row))
                return None
        except Exception as e:
            print(f"Failed to get metadata: {e}")
            return None
    
    def clear_all(self) -> bool:
        try:
            with self.transaction() as cursor:
                cursor.execute("DELETE FROM files")
                cursor.execute("DELETE FROM folders")
                cursor.execute("DELETE FROM index_metadata")
            return True
        except Exception as e:
            print(f"Failed to clear all: {e}")
            return False
    
    def vacuum(self) -> bool:
        try:
            with self.get_cursor() as cursor:
                cursor.execute("VACUUM")
            return True
        except Exception as e:
            print(f"Failed to vacuum: {e}")
            return False
    
    def checkpoint(self) -> bool:
        try:
            with self.get_cursor() as cursor:
                cursor.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            return True
        except Exception as e:
            print(f"Failed to checkpoint: {e}")
            return False
