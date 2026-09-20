import os
import uuid
import asyncio
import nest_asyncio
from typing import Optional
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# Aplicar parche para permitir llamadas a asyncio.run() dentro del event loop de FastAPI
nest_asyncio.apply()

from spotdl_service import (
    extract_spotify_info,
    run_spotdl_download_process,
    cancel_download_task,
    download_tasks,
    DEFAULT_DOWNLOAD_DIR
)

app = FastAPI(title="Spotify Downloader Platform", version="1.0.0")

# Permitir CORS para peticiones desde el cliente web
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Executor para hilos de descarga e inspección
executor = ThreadPoolExecutor(max_workers=4)

class InfoRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format: str = "mp3"
    bitrate: str = "320k"
    output_dir: Optional[str] = None

@app.post("/api/info")
async def get_info(req: InfoRequest):
    """Obtiene los metadatos de un enlace de Spotify."""
    try:
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(executor, extract_spotify_info, req.url)
        return info
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/download")
async def start_download(req: DownloadRequest):
    """Inicia la descarga en segundo plano."""
    try:
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(executor, extract_spotify_info, req.url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al analizar el enlace: {str(e)}")

    task_id = str(uuid.uuid4())
    download_tasks[task_id] = {
        "task_id": task_id,
        "url": req.url,
        "format": req.format,
        "bitrate": req.bitrate,
        "custom_output_dir": req.output_dir,
        "status": "queued",
        "progress": 5,
        "current_status": "Analizando enlace e iniciando descarga...",
        "total_songs": info["track_count"],
        "info": info,
        "downloaded_files": [],
        "zip_file": None,
        "error_message": None
    }

    # Ejecutar proceso en segundo plano en el executor
    executor.submit(
        run_spotdl_download_process,
        task_id,
        req.url,
        req.format,
        req.bitrate,
        req.output_dir
    )

    return {"task_id": task_id, "info": info}

@app.post("/api/cancel/{task_id}")
async def cancel_download(task_id: str):
    """Detiene una descarga en progreso."""
    success = cancel_download_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Tarea no encontrada o ya finalizada.")
    return {"message": "Descarga cancelada correctamente", "task_id": task_id}

@app.get("/api/progress/{task_id}")
async def get_progress(task_id: str):
    """Consulta el avance de una tarea de descarga."""
    task = download_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tarea de descarga no encontrada.")
    return task

@app.get("/api/files/{task_id}/{filename}")
async def download_file(task_id: str, filename: str):
    """Permite descargar un archivo de audio específico o un archivo ZIP."""
    filename = os.path.basename(filename)
    
    # Revisar si existe en la carpeta asignada de la tarea o en la por defecto
    task = download_tasks.get(task_id, {})
    custom_folder = task.get("output_folder")
    
    file_path = None
    if custom_folder and os.path.exists(os.path.join(custom_folder, filename)):
        file_path = os.path.join(custom_folder, filename)
    else:
        file_path = os.path.join(DEFAULT_DOWNLOAD_DIR, task_id, filename)

    if filename.endswith(".zip"):
        zip_path = os.path.join(DEFAULT_DOWNLOAD_DIR, filename)
        if os.path.exists(zip_path):
            return FileResponse(zip_path, filename=filename, media_type="application/zip")

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado.")

    return FileResponse(
        file_path,
        filename=filename,
        media_type="audio/mpeg" if filename.endswith(".mp3") else "application/octet-stream"
    )

# Servir archivos estáticos del frontend
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
