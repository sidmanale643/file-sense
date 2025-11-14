from docling.document_converter import DocumentConverter

class OCR:
    def __init__(self):
        self.doc_converter = DocumentConverter()
    
    def ocr(self, files):

        if len(files) > 1:
            batch_results = self.doc_converter.convert_all(files, raises_on_error=False)
            markdown_outputs = []

            for r in batch_results:
                markdown_outputs.append(r.document.export_to_markdown())
                
        else:
            markdown_outputs = self.doc_converter.convert(files[0]).document.export_to_markdown()

        return markdown_outputs
