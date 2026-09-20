document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('spotifyUrl');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const clearBtn = document.getElementById('clearBtn');
    const formatSelect = document.getElementById('formatSelect');
    const bitrateSelect = document.getElementById('bitrateSelect');
    const outputDirInput = document.getElementById('outputDirInput');
    const stopBtn = document.getElementById('stopBtn');
    
    const loadingSpinner = document.getElementById('loadingSpinner');
    const previewCard = document.getElementById('previewCard');
    const coverImg = document.getElementById('coverImg');
    const typeBadge = document.getElementById('typeBadge');
    const mediaTitle = document.getElementById('mediaTitle');
    const mediaArtist = document.getElementById('mediaArtist');
    const trackCount = document.getElementById('trackCount');
    const downloadBtn = document.getElementById('downloadBtn');
    const trackListContainer = document.getElementById('trackListContainer');
    const trackList = document.getElementById('trackList');
    const trackListCount = document.getElementById('trackListCount');
    
    const progressBox = document.getElementById('progressBox');
    const statusText = document.getElementById('statusText');
    const progressPercent = document.getElementById('progressPercent');
    const progressBar = document.getElementById('progressBar');
    
    const resultsCard = document.getElementById('resultsCard');
    const audioPlayerContainer = document.getElementById('audioPlayerContainer');
    const audioPreview = document.getElementById('audioPreview');
    const downloadButtons = document.getElementById('downloadButtons');
    
    const errorAlert = document.getElementById('errorAlert');
    const errorMessage = document.getElementById('errorMessage');

    let currentMediaInfo = null;
    let currentTaskId = null;
    let pollInterval = null;

    // Toggle Botón Limpiar
    urlInput.addEventListener('input', () => {
        if (urlInput.value.trim() !== '') {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    });

    clearBtn.addEventListener('click', () => {
        urlInput.value = '';
        clearBtn.classList.add('hidden');
        hideAllCards();
    });

    // Enter key en input
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            analyzeUrl();
        }
    });

    analyzeBtn.addEventListener('click', analyzeUrl);

    async function analyzeUrl() {
        const url = urlInput.value.trim();
        if (!url) {
            showError('Por favor pega un enlace válido de Spotify.');
            return;
        }

        hideAllCards();
        loadingSpinner.classList.remove('hidden');
        const spinnerMsg = loadingSpinner.querySelector('p');
        if (spinnerMsg) spinnerMsg.textContent = 'Obteniendo metadatos desde Spotify (esto puede tomar unos segundos)...';

        try {
            const res = await fetch('/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            const data = await res.json();
            loadingSpinner.classList.add('hidden');

            if (!res.ok) {
                throw new Error(data.detail || 'Error al obtener información de Spotify.');
            }

            currentMediaInfo = data;
            renderPreview(data);

        } catch (err) {
            loadingSpinner.classList.add('hidden');
            showError(err.message);
        }
    }

    function renderPreview(data) {
        coverImg.src = data.cover_url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=500&q=80';
        mediaTitle.textContent = data.title;
        mediaArtist.textContent = data.artist;
        
        typeBadge.textContent = data.type === 'song' ? 'Canción' : (data.type === 'album' ? 'Álbum' : 'Playlist');
        trackCount.textContent = `${data.track_count} ${data.track_count === 1 ? 'Canción' : 'Canciones'}`;

        if (data.track_count > 1 && data.tracks && data.tracks.length > 0) {
            trackListContainer.classList.remove('hidden');
            trackListCount.textContent = `${data.tracks.length} pistas`;
            trackList.innerHTML = '';
            
            data.tracks.forEach((track, idx) => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-2.5 rounded-lg bg-[#1a1a23] border border-gray-800/40 text-xs hover:bg-[#222230] transition';
                item.innerHTML = `
                    <div class="flex items-center space-x-3 overflow-hidden mr-2">
                        <span class="text-gray-500 font-mono w-5 text-right flex-shrink-0">${idx + 1}</span>
                        <div class="truncate">
                            <p class="font-medium text-gray-200 truncate">${escapeHtml(track.name)}</p>
                            <p class="text-gray-400 text-[11px] truncate">${escapeHtml(track.artist)}</p>
                        </div>
                    </div>
                    <span class="text-gray-500 font-mono flex-shrink-0">${track.duration}</span>
                `;
                trackList.appendChild(item);
            });
        } else {
            trackListContainer.classList.add('hidden');
        }

        previewCard.classList.remove('hidden');
    }

    downloadBtn.addEventListener('click', async () => {
        if (!currentMediaInfo) return;

        const url = urlInput.value.trim();
        const format = formatSelect.value;
        const bitrate = bitrateSelect.value;
        const output_dir = outputDirInput.value.trim() || null;

        previewCard.classList.add('hidden');
        progressBox.classList.remove('hidden');
        updateProgress(5, 'Iniciando descarga de canciones...');

        try {
            const res = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, format, bitrate, output_dir })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || 'Error al iniciar la descarga.');
            }

            currentTaskId = data.task_id;
            startPolling(currentTaskId);

        } catch (err) {
            progressBox.classList.add('hidden');
            showError(err.message);
        }
    });

    // Event listener para el botón Detener
    stopBtn.addEventListener('click', async () => {
        if (!currentTaskId) return;

        try {
            stopBtn.disabled = true;
            stopBtn.classList.add('opacity-50');
            await fetch(`/api/cancel/${currentTaskId}`, { method: 'POST' });
        } catch (e) {
            console.error('Error al cancelar la tarea:', e);
        } finally {
            if (pollInterval) clearInterval(pollInterval);
            progressBox.classList.add('hidden');
            stopBtn.disabled = false;
            stopBtn.classList.remove('opacity-50');
            showError('Descarga detenida por el usuario.');
        }
    });

    function startPolling(taskId) {
        if (pollInterval) clearInterval(pollInterval);

        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/progress/${taskId}`);
                const task = await res.json();

                if (!res.ok) throw new Error('Error al consultar el progreso.');

                if (task.status === 'cancelled') {
                    clearInterval(pollInterval);
                    progressBox.classList.add('hidden');
                    showError('Descarga detenida por el usuario.');
                    return;
                }

                updateProgress(task.progress, task.current_status || 'Procesando canciones...');

                if (task.status === 'completed') {
                    clearInterval(pollInterval);
                    progressBox.classList.add('hidden');
                    renderResults(taskId, task);
                } else if (task.status === 'error') {
                    clearInterval(pollInterval);
                    progressBox.classList.add('hidden');
                    showError(task.error_message || 'Falló la descarga de las canciones.');
                }
            } catch (err) {
                clearInterval(pollInterval);
                progressBox.classList.add('hidden');
                showError(err.message);
            }
        }, 1200);
    }

    function updateProgress(percent, text) {
        progressBar.style.width = `${percent}%`;
        progressPercent.textContent = `${percent}%`;
        statusText.textContent = text || 'Procesando descarga...';
        
        const songCounterText = document.getElementById('songCounterText');
        if (songCounterText) {
            songCounterText.textContent = text.includes('Descargadas') ? text : `${percent}% completado`;
        }
    }

    function renderResults(taskId, task) {
        downloadButtons.innerHTML = '';
        audioPlayerContainer.classList.add('hidden');

        const files = task.downloaded_files || [];

        // Si se generaron archivos ZIP (fraccionados por partes o único)
        if (task.zip_files && task.zip_files.length > 0) {
            const zipContainer = document.createElement('div');
            zipContainer.className = 'w-full flex flex-col items-center gap-3 mb-4';
            
            task.zip_files.forEach((zipInfo) => {
                const zipUrl = `/api/files/${taskId}/${encodeURIComponent(zipInfo.filename)}`;
                const zipBtn = document.createElement('a');
                zipBtn.href = zipUrl;
                zipBtn.download = zipInfo.filename;
                zipBtn.className = 'w-full sm:w-auto px-8 py-4 bg-[#1DB954] hover:bg-[#1ed760] text-black font-extrabold rounded-xl transition shadow-xl shadow-[#1DB954]/25 flex items-center justify-center space-x-3 text-base';
                zipBtn.innerHTML = `<i class="fa-solid fa-file-zipper text-xl"></i><span>${escapeHtml(zipInfo.label)}</span>`;
                zipContainer.appendChild(zipBtn);
            });
            downloadButtons.appendChild(zipContainer);
        } else if (task.zip_file) {
            const zipUrl = `/api/files/${taskId}/${encodeURIComponent(task.zip_file)}`;
            const zipBtn = document.createElement('a');
            zipBtn.href = zipUrl;
            zipBtn.download = task.zip_file;
            zipBtn.className = 'px-8 py-4 bg-[#1DB954] hover:bg-[#1ed760] text-black font-extrabold rounded-xl transition shadow-xl shadow-[#1DB954]/25 flex items-center space-x-3 text-base';
            zipBtn.innerHTML = `<i class="fa-solid fa-file-zipper text-xl"></i><span>Descargar Álbum/Playlist (.ZIP)</span>`;
            downloadButtons.appendChild(zipBtn);
        }

        // Mostrar botones individuales y ubicación de guardado
        files.forEach((file) => {
            const fileUrl = `/api/files/${taskId}/${encodeURIComponent(file.filename)}`;
            const fileBtn = document.createElement('a');
            fileBtn.href = fileUrl;
            fileBtn.download = file.filename;
            fileBtn.className = 'px-6 py-3 bg-[#262633] hover:bg-[#323244] border border-gray-700 text-white font-semibold rounded-xl transition flex items-center space-x-2 text-sm';
            fileBtn.innerHTML = `<i class="fa-solid fa-music text-[#1DB954]"></i><span class="truncate max-w-xs">${escapeHtml(file.filename)}</span>`;
            downloadButtons.appendChild(fileBtn);

            if (files.length === 1 && file.filename.endsWith('.mp3')) {
                audioPreview.src = fileUrl;
                audioPlayerContainer.classList.remove('hidden');
            }
        });

        resultsCard.classList.remove('hidden');
    }

    function hideAllCards() {
        loadingSpinner.classList.add('hidden');
        previewCard.classList.add('hidden');
        progressBox.classList.add('hidden');
        resultsCard.classList.add('hidden');
        errorAlert.classList.add('hidden');
    }

    function showError(msg) {
        errorMessage.textContent = msg;
        errorAlert.classList.remove('hidden');
    }

    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
});
