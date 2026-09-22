// Firebase Storage Manager - Frontend (API-based)
// Uses Flask backend with Firebase Admin SDK instead of client-side Firebase

const API_BASE_URL = 'http://localhost:5000/api';

let currentPath = '';
let selectedFile = null;
let fileCount = 0;
let folderCount = 0;

// Multi-selection state
let currentLoadedFiles = [];
let currentLoadedFolders = [];
let selectedFiles = new Set();
let selectedFolders = new Set();

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadFiles();
});

async function loadFiles() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '<div class="loading">Loading files...</div>';
    clearSelection();

    try {
        const response = await fetch(`${API_BASE_URL}/files?path=${encodeURIComponent(currentPath)}`);
        const data = await response.json();
        
        if (response.ok) {
            currentLoadedFiles = (data.files || []).filter(f => f.name !== '.placeholder' && !f.full_path.endsWith('/.placeholder'));
            currentLoadedFolders = data.folders || [];
            fileCount = data.file_count !== undefined ? data.file_count : currentLoadedFiles.length;
            folderCount = currentLoadedFolders.length;
            const folderCounts = data.folder_counts || {};
            updateStats();
            renderFiles(currentLoadedFiles, currentLoadedFolders, folderCounts);
            updateBreadcrumb();
            updateSelectAllButton();
        } else {
            fileList.innerHTML = `<div class="error-message">Error loading files: ${data.error}</div>`;
        }
    } catch (error) {
        fileList.innerHTML = `<div class="error-message">Error connecting to server: ${error.message}</div>`;
        console.error(error);
    }
}

function renderFiles(files, folders, folderCounts = {}) {
    const fileList = document.getElementById('fileList');
    
    if (folders.length === 0 && files.length === 0) {
        fileList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📁</div>
                <p>This folder is empty</p>
            </div>
        `;
        return;
    }

    let html = '';

    // Render folders first
    folders.forEach((folderName) => {
        const isChecked = selectedFolders.has(folderName) ? 'checked' : '';
        const count = folderCounts[folderName];
        const metaText = count !== undefined ? `Folder • ${count.toLocaleString()} file${count === 1 ? '' : 's'}` : 'Folder';
        html += `
            <div class="file-item">
                <input type="checkbox" class="item-checkbox" data-type="folder" data-id="${folderName}" ${isChecked} onchange="onItemSelectionChanged(this, 'folder', '${folderName}')">
                <div class="file-icon file-folder">📁</div>
                <div class="file-info">
                    <div class="file-name">${folderName}</div>
                    <div class="file-meta">${metaText}</div>
                </div>
                <div class="file-actions">
                    <button class="btn btn-primary" onclick="navigateTo('${currentPath}${folderName}/')">Open</button>
                    <button class="btn btn-danger" onclick="deleteFolder('${folderName}')">Delete</button>
                </div>
            </div>
        `;
    });

    // Render files
    files.forEach((file) => {
        const fileName = file.name;
        const fileSize = formatFileSize(file.size);
        const updated = file.updated ? new Date(file.updated).toLocaleString() : 'Unknown';
        const isChecked = selectedFiles.has(file.full_path) ? 'checked' : '';
        
        html += `
            <div class="file-item">
                <input type="checkbox" class="item-checkbox" data-type="file" data-id="${file.full_path}" ${isChecked} onchange="onItemSelectionChanged(this, 'file', '${file.full_path}')">
                <div class="file-icon">📄</div>
                <div class="file-info">
                    <div class="file-name">${fileName}</div>
                    <div class="file-meta">${fileSize} • Updated: ${updated}</div>
                </div>
                <div class="file-actions">
                    <button class="btn btn-success" onclick="downloadFile('${file.full_path}')">Download</button>
                    <button class="btn btn-info" onclick="showSingleCopyModal('${file.full_path}')">Copy</button>
                    <button class="btn btn-warning" onclick="showSingleMoveModal('${file.full_path}')">Move</button>
                    <button class="btn btn-primary" onclick="showSingleRenameModal('${file.full_path}')">Rename</button>
                    <button class="btn btn-danger" onclick="deleteFile('${file.full_path}')">Delete</button>
                </div>
            </div>
        `;
    });

    fileList.innerHTML = html;
}

// Selection management
function onItemSelectionChanged(checkbox, type, id) {
    if (type === 'file') {
        if (checkbox.checked) {
            selectedFiles.add(id);
        } else {
            selectedFiles.delete(id);
        }
    } else if (type === 'folder') {
        if (checkbox.checked) {
            selectedFolders.add(id);
        } else {
            selectedFolders.delete(id);
        }
    }
    updateSelectionUI();
}

function toggleSelectAll() {
    const totalItems = currentLoadedFiles.length + currentLoadedFolders.length;
    const currentSelected = selectedFiles.size + selectedFolders.size;
    const selectAll = currentSelected < totalItems;

    selectedFiles.clear();
    selectedFolders.clear();

    if (selectAll) {
        currentLoadedFiles.forEach(f => selectedFiles.add(f.full_path));
        currentLoadedFolders.forEach(folder => selectedFolders.add(folder));
    }

    // Update all rendered checkboxes
    document.querySelectorAll('.item-checkbox').forEach(cb => {
        cb.checked = selectAll;
    });

    updateSelectionUI();
}

function clearSelection() {
    selectedFiles.clear();
    selectedFolders.clear();
    document.querySelectorAll('.item-checkbox').forEach(cb => {
        cb.checked = false;
    });
    updateSelectionUI();
}

function updateSelectionUI() {
    const totalSelected = selectedFiles.size + selectedFolders.size;
    const batchToolbar = document.getElementById('batchToolbar');
    const selectedCountText = document.getElementById('selectedCountText');

    if (totalSelected > 0) {
        batchToolbar.classList.remove('hidden');
        selectedCountText.textContent = `${totalSelected} selected (${selectedFiles.size} file${selectedFiles.size === 1 ? '' : 's'}, ${selectedFolders.size} folder${selectedFolders.size === 1 ? '' : 's'})`;
    } else {
        batchToolbar.classList.add('hidden');
    }

    updateSelectAllButton();
}

function updateSelectAllButton() {
    const selectAllBtn = document.getElementById('selectAllBtn');
    if (!selectAllBtn) return;
    const totalItems = currentLoadedFiles.length + currentLoadedFolders.length;
    const currentSelected = selectedFiles.size + selectedFolders.size;

    if (totalItems > 0 && currentSelected === totalItems) {
        selectAllBtn.textContent = 'Deselect All';
    } else {
        selectAllBtn.textContent = 'Select All';
    }
}

// Batch Actions
async function batchDownload() {
    if (selectedFiles.size === 0) {
        alert('Please select at least one file to download. (Folders cannot be downloaded directly).');
        return;
    }

    const filesToDownload = Array.from(selectedFiles);
    for (const filePath of filesToDownload) {
        await downloadFile(filePath);
        // Small delay to prevent browser download throttling
        await new Promise(r => setTimeout(r, 200));
    }
}

async function batchDelete() {
    const total = selectedFiles.size + selectedFolders.size;
    if (total === 0) return;

    if (!confirm(`Are you sure you want to delete ${total} selected item(s)? This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/batch-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                files: Array.from(selectedFiles),
                folders: Array.from(selectedFolders).map(name => currentPath + name)
            })
        });

        const data = await response.json();
        if (response.ok) {
            clearSelection();
            loadFiles();
        } else {
            throw new Error(data.error || 'Batch delete failed');
        }
    } catch (err) {
        alert('Error deleting items: ' + err.message);
        console.error(err);
    }
}

async function populateFolderDropdown(selectId, customInputId, defaultPath) {
    const select = document.getElementById(selectId);
    const customInput = document.getElementById(customInputId);
    if (!select) return;

    select.innerHTML = '<option value="">Loading folders...</option>';
    if (customInput) customInput.classList.add('hidden');

    try {
        const response = await fetch(`${API_BASE_URL}/folders`);
        const data = await response.json();
        const folders = (data && data.folders) ? data.folders : [];

        let html = '<option value="">/ (Root)</option>';
        folders.forEach(f => {
            html += `<option value="${f}">${f}</option>`;
        });
        html += '<option value="__custom__">+ Enter new folder name...</option>';
        select.innerHTML = html;

        // Set default path if matching
        if (defaultPath && folders.includes(defaultPath)) {
            select.value = defaultPath;
        } else if (defaultPath && defaultPath !== '') {
            select.value = '__custom__';
            if (customInput) {
                customInput.value = defaultPath;
                customInput.classList.remove('hidden');
            }
        } else {
            select.value = '';
        }
    } catch (err) {
        console.error('Error fetching folders:', err);
        select.innerHTML = '<option value="">/ (Root)</option><option value="__custom__">+ Enter new folder name...</option>';
    }
}

function onFolderDropdownChange(type) {
    const map = {
        'singleCopy': ['singleCopyDestSelect', 'singleCopyCustomDest'],
        'singleMove': ['singleMoveDestSelect', 'singleMoveCustomDest'],
        'batchCopy': ['batchCopyDestSelect', 'batchCopyCustomDest'],
        'batchMove': ['batchMoveDestSelect', 'batchMoveCustomDest']
    };
    const ids = map[type];
    if (!ids) return;
    const select = document.getElementById(ids[0]);
    const customInput = document.getElementById(ids[1]);

    if (select.value === '__custom__') {
        customInput.classList.remove('hidden');
        customInput.focus();
    } else {
        customInput.classList.add('hidden');
    }
}

async function showBatchCopyModal() {
    if (selectedFiles.size === 0) {
        alert('Please select files to copy.');
        return;
    }
    const summary = document.getElementById('batchCopySummary');
    summary.textContent = `Copying ${selectedFiles.size} file(s) from current folder.`;
    await populateFolderDropdown('batchCopyDestSelect', 'batchCopyCustomDest', currentPath);
    document.getElementById('batchCopyModal').classList.add('active');
}

async function executeBatchCopy() {
    const select = document.getElementById('batchCopyDestSelect');
    const customInput = document.getElementById('batchCopyCustomDest');
    let dest = select.value === '__custom__' ? customInput.value.trim() : select.value;

    const copyBtn = document.querySelector('#batchCopyModal .btn-info') || document.querySelector('#batchCopyModal .btn-primary');
    const originalText = copyBtn ? copyBtn.textContent : 'Copy';
    if (copyBtn) {
        copyBtn.disabled = true;
        copyBtn.textContent = 'Copying...';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/batch-copy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                files: Array.from(selectedFiles),
                destination: dest
            })
        });

        const data = await response.json();
        if (response.ok) {
            closeModal('batchCopyModal');
            clearSelection();
            loadFiles();
        } else {
            throw new Error(data.error || 'Batch copy failed');
        }
    } catch (err) {
        alert('Error copying files: ' + err.message);
        console.error(err);
    } finally {
        if (copyBtn) {
            copyBtn.disabled = false;
            copyBtn.textContent = originalText;
        }
    }
}

async function showBatchMoveModal() {
    if (selectedFiles.size === 0) {
        alert('Please select files to move.');
        return;
    }
    const summary = document.getElementById('batchMoveSummary');
    summary.textContent = `Moving ${selectedFiles.size} file(s) from current folder.`;
    await populateFolderDropdown('batchMoveDestSelect', 'batchMoveCustomDest', currentPath);
    document.getElementById('batchMoveModal').classList.add('active');
}

async function executeBatchMove() {
    const select = document.getElementById('batchMoveDestSelect');
    const customInput = document.getElementById('batchMoveCustomDest');
    let dest = select.value === '__custom__' ? customInput.value.trim() : select.value;

    const moveBtn = document.querySelector('#batchMoveModal .btn-warning');
    const originalText = moveBtn ? moveBtn.textContent : 'Move';
    if (moveBtn) {
        moveBtn.disabled = true;
        moveBtn.textContent = 'Moving...';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/batch-move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                files: Array.from(selectedFiles),
                destination: dest
            })
        });

        const data = await response.json();
        if (response.ok) {
            closeModal('batchMoveModal');
            clearSelection();
            loadFiles();
        } else {
            throw new Error(data.error || 'Batch move failed');
        }
    } catch (err) {
        alert('Error moving files: ' + err.message);
        console.error(err);
    } finally {
        if (moveBtn) {
            moveBtn.disabled = false;
            moveBtn.textContent = originalText;
        }
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function updateStats() {
    document.getElementById('totalFiles').textContent = (typeof fileCount === 'number') ? fileCount.toLocaleString() : fileCount;
    document.getElementById('totalFolders').textContent = (typeof folderCount === 'number') ? folderCount.toLocaleString() : folderCount;
    document.getElementById('currentPath').textContent = currentPath || '/';
}

function updateBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    const parts = currentPath.split('/').filter(part => part);
    
    let html = '<span class="breadcrumb-item" onclick="navigateTo(\'\')">Root</span>';
    
    let path = '';
    parts.forEach((part, index) => {
        path += part + '/';
        html += '<span class="breadcrumb-separator">/</span>';
        html += `<span class="breadcrumb-item" onclick="navigateTo('${path}')">${part}</span>`;
    });
    
    breadcrumb.innerHTML = html;
}

function navigateTo(path) {
    currentPath = path;
    loadFiles();
}

function refreshFiles() {
    loadFiles();
}

function showUploadModal() {
    document.getElementById('uploadModal').classList.add('active');
    document.getElementById('fileInput').value = '';
    document.getElementById('uploadProgress').classList.add('hidden');
    document.getElementById('uploadProgressBar').style.width = '0%';
}

function showCreateFolderModal() {
    document.getElementById('createFolderModal').classList.add('active');
    document.getElementById('folderName').value = '';
}

function showMoveModal(filePath) {
    selectedFile = filePath;
    const fileName = filePath.split('/').pop();
    document.getElementById('moveModal').classList.add('active');
    document.getElementById('newPath').value = currentPath + fileName;
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    selectedFile = null;
}

async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a file to upload');
        return;
    }

    const uploadProgress = document.getElementById('uploadProgress');
    const uploadProgressBar = document.getElementById('uploadProgressBar');
    uploadProgress.classList.remove('hidden');

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', currentPath);

        const response = await fetch(`${API_BASE_URL}/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            uploadProgressBar.style.width = '100%';
            
            setTimeout(() => {
                closeModal('uploadModal');
                loadFiles();
            }, 500);
        } else {
            throw new Error(data.error || 'Upload failed');
        }
    } catch (error) {
        alert('Error uploading file: ' + error.message);
        console.error(error);
        uploadProgress.classList.add('hidden');
    }
}

async function createFolder() {
    const folderName = document.getElementById('folderName').value.trim();
    
    if (!folderName) {
        alert('Please enter a folder name');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/create-folder`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: currentPath,
                folder_name: folderName
            })
        });

        const data = await response.json();

        if (response.ok) {
            closeModal('createFolderModal');
            loadFiles();
        } else {
            throw new Error(data.error || 'Failed to create folder');
        }
    } catch (error) {
        alert('Error creating folder: ' + error.message);
        console.error(error);
    }
}

async function deleteFile(filePath) {
    const fileName = filePath.split('/').pop();
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/delete?path=${encodeURIComponent(filePath)}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            loadFiles();
        } else {
            throw new Error(data.error || 'Failed to delete file');
        }
    } catch (error) {
        alert('Error deleting file: ' + error.message);
        console.error(error);
    }
}

async function deleteFolder(folderName) {
    if (!confirm(`Are you sure you want to delete folder ${folderName} and all its contents?`)) {
        return;
    }

    const folderPath = currentPath + folderName;

    try {
        const response = await fetch(`${API_BASE_URL}/delete-folder?path=${encodeURIComponent(folderPath)}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            loadFiles();
        } else {
            throw new Error(data.error || 'Failed to delete folder');
        }
    } catch (error) {
        alert('Error deleting folder: ' + error.message);
        console.error(error);
    }
}

async function showSingleCopyModal(filePath) {
    selectedFile = filePath;
    const fileName = filePath.split('/').pop();
    const sourceDir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/') + 1) : '';

    document.getElementById('singleCopySourceInfo').textContent = `Copying: ${fileName}`;
    document.getElementById('singleCopyFileName').value = fileName;
    await populateFolderDropdown('singleCopyDestSelect', 'singleCopyCustomDest', sourceDir);
    document.getElementById('singleCopyModal').classList.add('active');
}

async function executeSingleCopy() {
    if (!selectedFile) return;
    const select = document.getElementById('singleCopyDestSelect');
    const customInput = document.getElementById('singleCopyCustomDest');
    const fileName = document.getElementById('singleCopyFileName').value.trim();

    if (!fileName) {
        alert('Please enter a file name');
        return;
    }

    let destFolder = select.value === '__custom__' ? customInput.value.trim() : select.value;
    let destinationPath = destFolder ? `${destFolder.replace(/\/+$/, '')}/${fileName}` : fileName;

    try {
        const response = await fetch(`${API_BASE_URL}/copy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source_path: selectedFile,
                destination_path: destinationPath
            })
        });

        const data = await response.json();
        if (response.ok) {
            closeModal('singleCopyModal');
            loadFiles();
        } else {
            throw new Error(data.error || 'Failed to copy file');
        }
    } catch (err) {
        alert('Error copying file: ' + err.message);
        console.error(err);
    }
}

async function showSingleMoveModal(filePath) {
    selectedFile = filePath;
    const fileName = filePath.split('/').pop();
    const sourceDir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/') + 1) : '';

    document.getElementById('singleMoveSourceInfo').textContent = `Moving: ${fileName}`;
    document.getElementById('singleMoveFileName').value = fileName;
    await populateFolderDropdown('singleMoveDestSelect', 'singleMoveCustomDest', sourceDir);
    document.getElementById('singleMoveModal').classList.add('active');
}

async function executeSingleMove() {
    if (!selectedFile) return;
    const select = document.getElementById('singleMoveDestSelect');
    const customInput = document.getElementById('singleMoveCustomDest');
    const fileName = document.getElementById('singleMoveFileName').value.trim();

    if (!fileName) {
        alert('Please enter a file name');
        return;
    }

    let destFolder = select.value === '__custom__' ? customInput.value.trim() : select.value;
    let newPath = destFolder ? `${destFolder.replace(/\/+$/, '')}/${fileName}` : fileName;

    if (newPath === selectedFile) {
        alert('Destination is the same as the source file.');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                old_path: selectedFile,
                new_path: newPath
            })
        });

        const data = await response.json();
        if (response.ok) {
            closeModal('singleMoveModal');
            loadFiles();
        } else {
            throw new Error(data.error || 'Failed to move file');
        }
    } catch (err) {
        alert('Error moving file: ' + err.message);
        console.error(err);
    }
}

function showSingleRenameModal(filePath) {
    selectedFile = filePath;
    const fileName = filePath.split('/').pop();
    document.getElementById('singleRenameSourceInfo').textContent = `Current name: ${fileName}`;
    document.getElementById('singleRenameFileName').value = fileName;
    document.getElementById('singleRenameModal').classList.add('active');
}

async function executeSingleRename() {
    if (!selectedFile) return;
    const newFileName = document.getElementById('singleRenameFileName').value.trim();
    if (!newFileName) {
        alert('Please enter a valid file name');
        return;
    }

    const currentDir = selectedFile.includes('/') ? selectedFile.substring(0, selectedFile.lastIndexOf('/') + 1) : '';
    const newPath = currentDir + newFileName;

    if (newPath === selectedFile) {
        closeModal('singleRenameModal');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                old_path: selectedFile,
                new_path: newPath
            })
        });

        const data = await response.json();
        if (response.ok) {
            closeModal('singleRenameModal');
            loadFiles();
        } else {
            throw new Error(data.error || 'Failed to rename file');
        }
    } catch (err) {
        alert('Error renaming file: ' + err.message);
        console.error(err);
    }
}

async function downloadFile(filePath) {
    try {
        const response = await fetch(`${API_BASE_URL}/download?path=${encodeURIComponent(filePath)}`);
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filePath.split('/').pop();
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } else {
            const data = await response.json();
            throw new Error(data.error || 'Download failed');
        }
    } catch (error) {
        alert('Error downloading file: ' + error.message);
        console.error(error);
    }
}

// Make functions available globally
window.loadFiles = loadFiles;
window.navigateTo = navigateTo;
window.refreshFiles = refreshFiles;
window.showUploadModal = showUploadModal;
window.showCreateFolderModal = showCreateFolderModal;
window.showMoveModal = showMoveModal;
window.closeModal = closeModal;
window.uploadFile = uploadFile;
window.createFolder = createFolder;
window.deleteFile = deleteFile;
window.deleteFolder = deleteFolder;
window.downloadFile = downloadFile;
window.showSingleCopyModal = showSingleCopyModal;
window.executeSingleCopy = executeSingleCopy;
window.showSingleMoveModal = showSingleMoveModal;
window.executeSingleMove = executeSingleMove;
window.showSingleRenameModal = showSingleRenameModal;
window.executeSingleRename = executeSingleRename;
window.toggleSelectAll = toggleSelectAll;
window.clearSelection = clearSelection;
window.onItemSelectionChanged = onItemSelectionChanged;
window.batchDownload = batchDownload;
window.batchDelete = batchDelete;
window.showBatchCopyModal = showBatchCopyModal;
window.executeBatchCopy = executeBatchCopy;
window.showBatchMoveModal = showBatchMoveModal;
window.executeBatchMove = executeBatchMove;
window.onFolderDropdownChange = onFolderDropdownChange;
