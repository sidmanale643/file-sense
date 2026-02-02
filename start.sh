#!/bin/bash
# FileSense Backend Startup Script

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Add src to PYTHONPATH
export PYTHONPATH="${PYTHONPATH}:${SCRIPT_DIR}/src"

# Change to project root
cd "$SCRIPT_DIR"

# Run uvicorn with the correct module path
uv run uvicorn src.main:app --reload
