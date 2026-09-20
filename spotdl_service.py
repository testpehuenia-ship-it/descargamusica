import os
import shutil
import zipfile
import subprocess
import json
import uuid
import asyncio
from typing import Dict, Any, List, Optional
from spotdl.utils.spotify import SpotifyClient
from spotdl.utils.search import get_simple_songs

# Directorio de descargas predeterminado
DEFAULT_DOWNLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloads")
os.makedirs(DEFAULT_DOWNLOAD_DIR, exist_ok=True)

# Diccionario en memoria para rastrear el progreso de las tareas
download_tasks: Dict[str, Dict[str, Any]] = {}

# Procesos activos para permitir cancelación
active_processes: Dict[str, subprocess.Popen] = {}

def init_spotify_client():
    """Inicializa el cliente de Spotify de forma segura sin re-inicializaciones."""
    if SpotifyClient._instance is None:
        try:
            SpotifyClient.init(client_id="client_id", client_secret="client_secret")
        except Exception:
            pass

def extract_spotify_info(url: str) -> Dict[str, Any]:
    """
    Inspecciona un enlace de Spotify sin descargar el audio.
    Retorna metadatos: tipo, título, artista, carátula, recuento y lista de canciones.
    """
    url = url.strip()
    init_spotify_client()
    songs = get_simple_songs([url])


    if not songs:
        raise ValueError("No se pudieron encontrar canciones en la URL proporcionada.")

    is_single = len(songs) == 1
    first = songs[0]

    track_list = []
    for s in songs:
        duration_mins = int(s.duration // 60)
        duration_secs = int(s.duration % 60)
        duration_str = f"{duration_mins}:{duration_secs:02d}"
        track_list.append({
            "name": s.name,
            "artist": ", ".join(s.artists),
            "album": s.album_name,
            "duration": duration_str,
            "cover_url": s.cover_url,
            "url": s.url
        })

    info = {
        "type": "song" if is_single else ("album" if "album" in url else "playlist"),
        "title": first.name if is_single else (first.album_name if "album" in url else "Lista de Spotify"),
        "artist": ", ".join(first.artists) if is_single else f"{len(songs)} canciones",
        "cover_url": first.cover_url,
        "track_count": len(songs),
        "tracks": track_list
    }
    return info

def cancel_download_task(task_id: str) -> bool:
    """Cancela una tarea de descarga activa matando su proceso."""
    task = download_tasks.get(task_id)
    if task:
        task["status"] = "cancelled"
        task["current_status"] = "Descarga deteniéndose..."
    
    proc = active_processes.get(task_id)
    if proc:
        try:
            proc.kill()
        except Exception:
            pass
        active_processes.pop(task_id, None)

    if task:
        task["current_status"] = "Descarga detenida por el usuario."
        return True
    return False

def run_spotdl_download_process(task_id: str, url: str, output_format: str, bitrate: str, custom_output_dir: Optional[str] = None):
    """
    Ejecuta el proceso de descarga con spotdl CLI en segundo plano
    y actualiza el diccionario de progreso.
    """
    task = download_tasks.get(task_id)
    if not task:
        return

    task["status"] = "downloading"
    task["progress"] = 10

    # Determinar la carpeta de salida
    if custom_output_dir and custom_output_dir.strip():
        output_dir = os.path.abspath(custom_output_dir.strip())
    else:
        output_dir = os.path.join(DEFAULT_DOWNLOAD_DIR, task_id)
        
    os.makedirs(output_dir, exist_ok=True)
    task["output_folder"] = output_dir

    venv_spotdl = os.path.join(os.path.dirname(os.path.abspath(__file__)), "venv", "Scripts", "spotdl.exe")
    executable = venv_spotdl if os.path.exists(venv_spotdl) else "spotdl"

    cmd = [
        executable,
        "download",
        url,
        "--output", output_dir,
        "--format", output_format,
        "--bitrate", bitrate,
        "--audio", "youtube-music", "youtube", "soundcloud", "piped"
    ]

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace"
        )
        active_processes[task_id] = process

        total_songs = task.get("total_songs", 1)
        completed_songs = 0

        while True:
            # Comprobar cancelación
            if task.get("status") == "cancelled":
                try:
                    process.kill()
                except Exception:
                    pass
                active_processes.pop(task_id, None)
                return

            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            if line:
                line_str = line.strip()
                if "Downloaded" in line_str or "Skipping" in line_str:
                    completed_songs += 1
                    percent = min(90, int(10 + (completed_songs / max(1, total_songs)) * 80))
                    task["progress"] = percent
                    task["current_status"] = f"Descargadas {completed_songs} de {total_songs} canciones"

        rc = process.poll()
        active_processes.pop(task_id, None)

        if task.get("status") == "cancelled":
            return

        # Buscar archivos descargados
        downloaded_files = []
        for root, _, files in os.walk(output_dir):
            for file in files:
                if file.endswith(f".{output_format}"):
                    rel_path = os.path.relpath(os.path.join(root, file), DEFAULT_DOWNLOAD_DIR)
                    downloaded_files.append({
                        "filename": file,
                        "path": rel_path if not os.path.isabs(rel_path) else file,
                        "full_path": os.path.join(root, file)
                    })

        if not downloaded_files:
            task["status"] = "error"
            task["error_message"] = "No se pudieron descargar archivos de audio."
            return

        task["downloaded_files"] = downloaded_files

        # Si hay más de un archivo, empaquetar en ZIP en la carpeta predeterminada
        if len(downloaded_files) > 1:
            zip_filename = f"spotify_download_{task_id[:8]}.zip"
            zip_path = os.path.join(DEFAULT_DOWNLOAD_DIR, zip_filename)
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for file_info in downloaded_files:
                    full_file_path = file_info["full_path"]
                    zipf.write(full_file_path, arcname=file_info["filename"])
            task["zip_file"] = zip_filename

        task["progress"] = 100
        task["status"] = "completed"
        task["current_status"] = "Descarga completada con éxito."

    except Exception as e:
        active_processes.pop(task_id, None)
        if task.get("status") != "cancelled":
            task["status"] = "error"
            task["error_message"] = str(e)
