from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
import sys

# Ensure local services package is importable when running this file directly
# Add the src directory to sys.path BEFORE importing from services
# __file__ is in: src/services/document_loader/loaders/ocr.py
# parents[3] gives us: src/
SRC_DIR = Path(__file__).resolve().parents[3]
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from docling.document_converter import DocumentConverter
from services.milvus import Milvus  # noqa: E402 

@dataclass
class OCRResult:
    file_path: str
    file_name: str
    file_size: int
    markdown: Optional[str]
    success: bool
    error: Optional[str] = None


class DoclingOCRService:

    def __init__(self, converter: Optional[DocumentConverter] = None) -> None:
        # Reuse a single converter for efficiency
        self.converter = converter or DocumentConverter()

    def _validate_path(self, pdf_path: Path) -> Optional[str]:
        if not pdf_path.exists():
            return "file not found"
        if not pdf_path.is_file():
            return "path is not a file"
        if pdf_path.suffix.lower() != ".pdf":
            return "only PDF files are supported"
        return None

    def convert_pdf(self, pdf_path: Path | str) -> OCRResult:
        path = Path(pdf_path)
        validation_error = self._validate_path(path)
        if validation_error:
            return OCRResult(
                file_path=str(path),
                file_name=path.name,
                file_size=0,
                markdown=None,
                success=False,
                error=validation_error,
            )

        try:
            output = self.converter.convert(str(path))
            markdown = output.document.export_to_markdown()
            file_size = path.stat().st_size
            return OCRResult(
                file_path=str(path),
                file_name=path.name,
                file_size=file_size,
                markdown=markdown,
                success=True,
            )
        except Exception as e:
            return OCRResult(
                file_path=str(path),
                file_name=path.name,
                file_size=0,
                markdown=None,
                success=False,
                error=f"unexpected error: {e}",
            )

    def convert_batch(
        self, pdf_paths: Iterable[Path | str], batch_size: int = 4
    ) -> List[OCRResult]:
  
        results: List[OCRResult] = []
        batch: List[Path | str] = []
        for pdf in pdf_paths:
            batch.append(pdf)
            if len(batch) >= batch_size:
                results.extend(self._process_batch(batch))
                batch = []
        if batch:
            results.extend(self._process_batch(batch))
        return results

    def _process_batch(self, batch: List[Path | str]) -> List[OCRResult]:
        return [self.convert_pdf(pdf) for pdf in batch]

    @staticmethod
    def to_milvus_payloads(results: List[OCRResult]) -> List[Dict[str, Any]]:
     
        payloads: List[Dict[str, Any]] = []
        for res in results:
            if not res.success or not res.markdown:
                continue
            payloads.append(
                {
                    "text": res.markdown,
                    "file_name": res.file_name,
                    "file_path": res.file_path,
                    "file_type": "pdf",
                    "file_size": res.file_size,
                }
            )
        return payloads

    def insert_into_milvus(
        self,
        milvus: Optional[Milvus],
        results: List[OCRResult],
    ) -> Dict[str, Any]:

        if milvus is None:
            return {"success": False, "error": "Milvus service not provided"}

        payloads = self.to_milvus_payloads(results)
        if not payloads:
            return {"success": False, "error": "No successful OCR results to insert"}

        insertion = milvus.insert_batch(payloads)
        return {
            "success": insertion.get("success", False),
            "inserted": insertion.get("count", len(payloads)),
            "attempted": len(payloads),
            "errors": [r.error for r in results if r.error],
        }

if __name__ == "__main__":
    ocr_service = DoclingOCRService()
    results = ocr_service.convert_pdf("src/test/new_resume.pdf")
    print(results)