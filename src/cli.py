#!/usr/bin/env python3
"""
FileSense CLI - Start both backend and frontend services.
"""

import os
import signal
import subprocess
import sys
from pathlib import Path

import typer
from typing_extensions import Annotated

app = typer.Typer(help="FileSense - Hybrid search engine CLI")


def get_project_root() -> Path:
    """Get the project root directory (where this script is located)."""
    return Path(__file__).parent.parent


def colorize(text: str, color: str) -> str:
    """Add ANSI color codes to text."""
    colors = {
        "green": "\033[32m",
        "blue": "\033[34m",
        "yellow": "\033[33m",
        "red": "\033[31m",
        "reset": "\033[0m",
    }
    return f"{colors.get(color, '')}{text}{colors['reset']}"


@app.command()
def init(
    backend_port: Annotated[int, typer.Option(help="Backend server port")] = 8000,
    frontend_port: Annotated[int, typer.Option(help="Frontend dev server port")] = 5173,
):
    """Initialize FileSense - start both backend and frontend servers."""
    project_root = get_project_root()
    
    typer.echo(colorize("🚀 Starting FileSense...", "green"))
    typer.echo()
    
    # Environment setup
    env = os.environ.copy()
    env["PYTHONPATH"] = f"{env.get('PYTHONPATH', '')}:{project_root}/src"
    
    processes = []
    
    try:
        # Start backend
        typer.echo(colorize(f"[Backend] Starting on http://localhost:{backend_port}", "blue"))
        backend_cmd = [
            "uv", "run", "uvicorn", "src.main:app",
            "--reload",
            "--port", str(backend_port),
            "--host", "0.0.0.0"
        ]
        backend_proc = subprocess.Popen(
            backend_cmd,
            cwd=project_root,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        processes.append(("backend", backend_proc))
        
        # Start frontend
        frontend_dir = project_root / "frontend"
        typer.echo(colorize(f"[Frontend] Starting on http://localhost:{frontend_port}", "yellow"))
        frontend_cmd = ["npm", "run", "dev", "--", "--port", str(frontend_port)]
        frontend_proc = subprocess.Popen(
            frontend_cmd,
            cwd=frontend_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        processes.append(("frontend", frontend_proc))
        
        typer.echo()
        typer.echo(colorize("✅ Both servers started! Press Ctrl+C to stop.", "green"))
        typer.echo()
        
        # Stream output from both processes with prefixes
        import select
        
        while True:
            readable, _, _ = select.select(
                [p[1].stdout for p in processes if p[1].stdout and not p[1].poll()],
                [],
                [],
                0.1
            )
            
            for stream in readable:
                line = stream.readline()
                if line:
                    # Find which process this stream belongs to
                    for name, proc in processes:
                        if proc.stdout == stream:
                            prefix = colorize(f"[{name.upper():8}]", 
                                            "blue" if name == "backend" else "yellow")
                            typer.echo(f"{prefix} {line.rstrip()}")
                            break
            
            # Check if any process died
            for name, proc in processes:
                if proc.poll() is not None:
                    typer.echo(colorize(f"\n❌ [{name.upper()}] Process exited with code {proc.returncode}", "red"))
                    raise KeyboardInterrupt
                    
    except KeyboardInterrupt:
        typer.echo()
        typer.echo(colorize("\n🛑 Shutting down FileSense...", "red"))
        
        for name, proc in processes:
            if proc.poll() is None:
                typer.echo(colorize(f"  Stopping {name}...", "yellow"))
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()
        
        typer.echo(colorize("✅ All services stopped.", "green"))
        sys.exit(0)
    except Exception as e:
        typer.echo(colorize(f"\n❌ Error: {e}", "red"))
        for name, proc in processes:
            if proc.poll() is None:
                proc.kill()
        sys.exit(1)


def main():
    """Entry point for the CLI."""
    app()


if __name__ == "__main__":
    main()
