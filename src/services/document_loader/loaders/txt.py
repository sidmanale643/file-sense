import pathlib

class TXTLoader:
    def load_file(self, file_path: str) -> str:
        path = pathlib.Path(file_path)

        try:
            content = path.read_text(encoding="utf-8")
            return content
        except FileNotFoundError:
            return f"File not found: {file_path}"
        except IsADirectoryError:
            return f"Expected a file but found directory: {file_path}"
        except Exception as e:
            return f"Error reading {file_path}: {e}"
