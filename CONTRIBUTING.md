# Contributing to FileSense

Thank you for your interest in contributing to FileSense! This document provides guidelines and instructions for contributing.

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code. Please read our [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs

Before creating a bug report, please check if the issue already exists. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Environment details** (OS, Python version, etc.)
- **Screenshots** if applicable

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. Include:

- **Clear description of the enhancement**
- **Why it would be useful**
- **Possible implementation approach**

### Pull Requests

1. Fork the repository
2. Create a branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting
5. Commit with clear messages
6. Push to your fork
7. Open a Pull Request

## Development Setup

### Prerequisites

- Python 3.12+
- Node.js 18+
- [uv](https://github.com/astral-sh/uv)

### Backend Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/file-sense.git
cd file-sense

# Install dependencies
uv sync

# Run tests
uv run python tests/test_incremental_bm25.py
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

## Code Style

### Python
- Follow PEP 8
- Use type hints where practical
- 4 spaces for indentation
- Use `ruff` for linting and formatting

### TypeScript/React
- 4 spaces for indentation
- Use explicit types for props
- PascalCase for components
- Use `npm run lint` for checking

## Testing

- Write tests for new features
- Ensure all tests pass before submitting PR
- Test on different hardware modes if applicable

## Commit Messages

Use clear, descriptive commit messages:

- `feat: add new search filter`
- `fix: resolve indexing crash on large PDFs`
- `docs: update API documentation`
- `refactor: optimize vector search`

## Questions?

Feel free to open an issue for any questions about contributing!

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
