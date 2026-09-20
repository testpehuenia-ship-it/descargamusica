FROM python:3.11-slim

# Instalación de FFmpeg y herramientas del sistema necesarias
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar e instalar requerimientos de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código del proyecto
COPY . .

# Variables de entorno y puerto de exposición
ENV PORT=8000
EXPOSE 8000

# Comando para iniciar el servidor FastAPI
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
