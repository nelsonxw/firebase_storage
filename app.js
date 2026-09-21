// Firebase Storage Manager - Frontend (API-based)
// Uses Flask backend with Firebase Admin SDK instead of client-side Firebase

const API_BASE_URL = 'http://localhost:5000/api';

let currentPath = '';
let selectedFile = null;
let fileCount = 0;
let folderCount = 0;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadFiles();
});

async function loadFiles() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '<div class="loading">Loading files...</div>';

    try {
        const response = await fetch(`${API_BASE_URL}/files?path=${encodeURIComponent(currentPath)}`);
        const data = await response.json();
        
        if (response.ok) {
            fileCount = data.file_count;
            folderCount = data.folder_count;
            updateStats();
            renderFiles(data.files, data.folders);
            updateBreadcrumb();
        } else {
            fileList.innerHTML = `<div class="error-message">Error loading files: ${data.error}</div>`;
        }
    } catch (error) {
        fileList.innerHTML = `<div class="error-message">Error connecting to server: ${error.message}</div>`;
        console.error(error);
    }
}

function renderFiles(files, folders) {
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
        html += `
            <div class="file-item">
                <div class="file-icon file-folder">📁</div>
                <div class="file-info">
                    <div class="file-name">${folderName}</div>
                    <div class="file-meta">Folder</div>
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
        
        html += `
            <div class="file-item">
                <div class="file-icon">📄</div>
                <div class="file-info">
                    <div class="file-name">${fileName}</div>
                    <div class="file-meta">${fileSize} • Updated: ${updated}</div>
                </div>
                <div class="file-actions">
                    <button class="btn btn-success" onclick="downloadFile('${file.full_path}')">Download</button>
                    <button class="btn btn-primary" onclick="showMoveModal('${file.full_path}')">Move/Rename</button>
                    <button class="btn btn-danger" onclick="deleteFile('${file.full_path}')">Delete</button>
                </div>
            </div>
        `;
    });

    fileList.innerHTML = html;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function updateStats() {
    document.getElementById('totalFiles').textContent = fileCount;
    document.getElementById('totalFolders').textContent = folderCount;
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

async function moveFile() {
    const newPath = document.getElementById('newPath').value.trim();
    
    if (!newPath) {
        alert('Please enter a new path');
        return;
    }

    if (!selectedFile) {
        alert('No file selected');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/move`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                old_path: selectedFile,
                new_path: newPath
            })
        });

        const data = await response.json();

        if (response.ok) {
            closeModal('moveModal');
            loadFiles();
        } else {
            throw new Error(data.error || 'Failed to move file');
        }
    } catch (error) {
        alert('Error moving file: ' + error.message);
        console.error(error);
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
window.moveFile = moveFile;
window.downloadFile = downloadFile;
