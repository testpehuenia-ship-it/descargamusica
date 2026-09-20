# SpotiDownloader 🎵

Plataforma web para descargar música de Spotify en alta calidad (hasta 320 kbps) con carátulas y metadatos ID3 integrados, basada en **spotDL** y **FastAPI**.

![SpotiDownloader](static/index.html)

## 🚀 Características

- **Análisis Rápido de Metadatos**: Inspecciona canciones, álbumes y listas de reproducción de Spotify en segundos.
- **Calidad y Formatos Configurables**: Soporte para formatos MP3, M4A, FLAC y WAV con calidad hasta 320 kbps.
- **Ubicación de Salida Personalizable**: Selecciona la carpeta de tu computadora donde deseas guardar los archivos.
- **Barra de Progreso y Ecualizador Animado**: Visualización gráfica del estado y porcentaje de descarga en tiempo real.
- **Botón para Detener**: Posibilidad de cancelar descargas en progreso en cualquier momento.
- **Empaquetado Automático en ZIP**: Descarga listas completas en un único archivo comprimido `.zip`.
- **Reproductor Integrado**: Escucha una vista previa de la canción descargada desde el navegador.

---

## 🛠️ Instalación y Requisitos

### Requisitos Previos
- Python 3.10 o superior.
- Git.

### Pasos de Instalación

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/testpehuenia-ship-it/descargamusica.git
   cd descargamusica
   ```

2. Crear y activar entorno virtual:
   ```bash
   python -m venv venv
   # En Windows:
   .\venv\Scripts\activate
   # En Linux/macOS:
   source venv/bin/activate
   ```

3. Instalar dependencias:
   ```bash
   pip install -r requirements.txt
   ```

4. Descargar FFmpeg mediante spotDL:
   ```bash
   spotdl --download-ffmpeg
   ```

---

## 💻 Ejecución de la Aplicación

Ejecuta el servidor de desarrollo FastAPI:

```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Abre tu navegador en: **`http://127.0.0.1:8000`**

---

## 📄 Licencia

Este proyecto se distribuye bajo la licencia MIT con fines educativos y de uso personal.
