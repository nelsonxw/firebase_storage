"""
Flask backend server for Firebase Storage Manager.
Uses Firebase Admin SDK with service account authentication (similar to slide scapper).
"""

import os
import json
import tempfile
import urllib3
from pathlib import Path
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, storage
from google.cloud.storage.blob import Blob

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend

# Configuration
SERVICE_ACCOUNT_PATH = Path(__file__).parent / "serviceAccountKey.json"
STORAGE_BUCKET = "slide-preview.firebasestorage.app"

# Initialize Firebase Admin
def init_firebase():
    try:
        if not firebase_admin._apps:
            if SERVICE_ACCOUNT_PATH.exists():
                cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
                firebase_app = firebase_admin.initialize_app(cred, {
                    'storageBucket': STORAGE_BUCKET
                })
                print("Firebase initialized successfully")
            else:
                raise FileNotFoundError(f"Service account key not found at {SERVICE_ACCOUNT_PATH}")
        else:
            print("Firebase already initialized")
        
        bucket = storage.bucket(STORAGE_BUCKET)
        print(f"Bucket obtained: {bucket.name}")
        return bucket
    except Exception as e:
        print(f"Error initializing Firebase: {e}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        raise

try:
    bucket = init_firebase()
    
    # Configure SSL verification like slide scrapper does
    if bucket and hasattr(bucket, 'client'):
        client = bucket.client
        urllib3.disable_warnings()  # Disable SSL warnings
        
        if hasattr(client, '_http') and client._http:
            client._http.verify = False  # Disable SSL verification
        
        if hasattr(client, '_connection') and hasattr(client._connection, 'http') and client._connection.http:
            client._connection.http.verify = False  # Disable SSL verification
    
    print("Server startup complete")
except Exception as e:
    print(f"Failed to initialize Firebase: {e}")
    bucket = None

def get_storage_path(path):
    """Convert frontend path to Firebase storage path"""
    if not path or path == '/':
        return ''
    return path.lstrip('/')

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'bucket': STORAGE_BUCKET})

@app.route('/api/files', methods=['GET'])
def list_files():
    """List files and folders in a given path"""
    if not bucket:
        return jsonify({'error': 'Firebase not initialized'}), 500
        
    try:
        path = request.args.get('path', '')
        storage_path = get_storage_path(path)
        
        print(f"Listing files for path: {path}, storage_path: {storage_path}")
        
        files = []
        folders = set()
        
        # Set the prefix for listing
        if storage_path:
            prefix = storage_path.rstrip('/') + '/'
        else:
            prefix = ''
        
        print(f"Using prefix: '{prefix}'")
        
        try:
            # List blobs with delimiter='/' so GCS returns current directory items + subfolder prefixes
            blob_iterator = bucket.list_blobs(prefix=prefix, delimiter='/')
            
            for blob in blob_iterator:
                # Skip folder markers and internal placeholder files
                if blob.name == prefix or blob.name.endswith('/') or blob.name.endswith('/.placeholder') or blob.name == '.placeholder':
                    continue
                
                # Relative path from requested prefix
                relative_path = blob.name[len(prefix):] if prefix else blob.name
                
                # File directly under the current folder
                file_info = {
                    'name': relative_path,
                    'full_path': blob.name,
                    'size': blob.size,
                    'updated': blob.updated.isoformat() if blob.updated else None,
                    'content_type': blob.content_type
                }
                files.append(file_info)
            
            # Subfolders are returned via blob_iterator.prefixes
            for folder_prefix in blob_iterator.prefixes:
                # folder_prefix looks like 'previews/' or 'slides/sub/'
                sub_folder = folder_prefix[len(prefix):].rstrip('/')
                if sub_folder:
                    folders.add(sub_folder)
            
            # Count files in subfolders
            folder_counts = {}
            if folders:
                from concurrent.futures import ThreadPoolExecutor
                def count_folder(f_name):
                    sub_prefix = f"{prefix}{f_name}/"
                    c = 0
                    for bl in bucket.list_blobs(prefix=sub_prefix, projection='noAcl', fields='items(name),nextPageToken'):
                        if not (bl.name.endswith('/') or bl.name.endswith('/.placeholder') or bl.name == '.placeholder'):
                            c += 1
                    return f_name, c

                with ThreadPoolExecutor(max_workers=min(len(folders), 10)) as executor:
                    res = executor.map(count_folder, folders)
                    folder_counts = dict(res)
            
            # In root view, total file count shows sum of files in all folders (+ any root files)
            if not storage_path:
                total_file_count = len(files) + sum(folder_counts.values())
            else:
                total_file_count = len(files)

            print(f"Successfully listed {len(files)} files and {len(folders)} folders in '{storage_path}'")
            
        except Exception as list_error:
            import traceback
            print(f"Firebase listing failed: {list_error}")
            print(f"Traceback: {traceback.format_exc()}")
            return jsonify({'error': str(list_error)}), 500
        
        print(f"Final count: {total_file_count} total files, {len(folders)} folders")
        
        return jsonify({
            'files': files,
            'folders': sorted(list(folders)),
            'folder_counts': folder_counts,
            'file_count': total_file_count,
            'folder_count': len(folders),
            'current_path': path
        })
        
    except Exception as e:
        import traceback
        print(f"Error listing files: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/folders', methods=['GET'])
def list_all_folders():
    """List all unique folder paths across the bucket"""
    if not bucket:
        return jsonify({'error': 'Firebase not initialized'}), 500
        
    try:
        blobs = bucket.list_blobs()
        folders = set()
        for blob in blobs:
            parts = blob.name.split('/')
            for i in range(1, len(parts)):
                folders.add('/'.join(parts[:i]) + '/')
        return jsonify({'folders': sorted(list(folders))})
    except Exception as e:
        import traceback
        print(f"Error listing all folders: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Upload a file to Firebase Storage"""
    if not bucket:
        return jsonify({'error': 'Firebase not initialized'}), 500
        
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        path = request.form.get('path', '')
        storage_path = get_storage_path(path)
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Construct the full storage path
        if storage_path:
            full_path = f"{storage_path.rstrip('/')}/{file.filename}"
        else:
            full_path = file.filename
        
        # Upload to Firebase
        blob = bucket.blob(full_path)
        blob.upload_from_file(file, content_type=file.content_type)
        
        return jsonify({
            'success': True,
            'path': full_path,
            'name': file.filename
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['GET'])
def download_file():
    """Download a file from Firebase Storage"""
    if not bucket:
        return jsonify({'error': 'Firebase not initialized'}), 500
        
    try:
        path = request.args.get('path')
        if not path:
            return jsonify({'error': 'No path provided'}), 400
        
        storage_path = get_storage_path(path)
        blob = bucket.blob(storage_path)
        
        if not blob.exists():
            return jsonify({'error': 'File not found'}), 404
        
        # Create a temporary file
        with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
            blob.download_to_file(tmp_file)
            tmp_path = tmp_file.name
        
        # Send the file and clean up
        return send_file(tmp_path, as_attachment=True, download_name=blob.name.split('/')[-1])
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/delete', methods=['DELETE'])
def delete_file():
    """Delete a file from Firebase Storage"""
    if not bucket:
        return jsonify({'error': 'Firebase not initialized'}), 500
        
    try:
        path = request.args.get('path')
        if not path:
            return jsonify({'error': 'No path provided'}), 400
        
        storage_path = get_storage_path(path)
        blob = bucket.blob(storage_path)
        
        if not blob.exists():
            return jsonify({'error': 'File not found'}), 404
        
        blob.delete()
        
        return jsonify({'success': True, 'path': storage_path})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/copy', methods=['POST'])
def copy_file():
    """Copy a single file in Firebase Storage"""
    if not bucket:
        return jsonify({'error': 'Firebase not initialized'}), 500
        
    try:
        source_path = request.json.get('source_path')
        destination_path = request.json.get('destination_path')
        
        if not source_path or not destination_path:
            return jsonify({'error': 'Both source_path and destination_path required'}), 400
            
        source_storage_path = get_storage_path(source_path)
        dest_storage_path = get_storage_path(destination_path)
        
        source_blob = bucket.blob(source_storage_path)
        if not source_blob.exists():
            return jsonify({'error': 'Source file not found'}), 404
            
        bucket.copy_blob(source_blob, bucket, dest_storage_path)
        
        return jsonify({
            'success': True,
            'source_path': source_storage_path,
            'destination_path': dest_storage_path
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/move', methods=['POST'])
def move_file():
    """Move/rename a file in Firebase Storage"""
    if not bucket:
        return jsonify({'error': 'Firebase not initialized'}), 500
        
    try:
        old_path = request.json.get('old_path')
        new_path = request.json.get('new_path')
        
        if not old_path or not new_path:
            return jsonify({'error': 'Both old_path and new_path required'}), 400
        
        old_storage_path = get_storage_path(old_path)
        new_storage_path = get_storage_path(new_path)
        
        # Rename/move blob
        source_blob = bucket.blob(old_storage_path)
        if not source_blob.exists():
            return jsonify({'error': 'Source file not found'}), 404
            
        bucket.rename_blob(source_blob, new_storage_path)
        
        return jsonify({
            'success': True,
            'old_path': old_storage_path,
            'new_path': new_storage_path
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/create-folder', methods=['POST'])
def create_folder():
    """Create a folder in Firebase Storage"""
    if not bucket:
        return jsonify({'error': 'Firebase not initialized'}), 500
        
    try:
        path = request.json.get('path', '')
        folder_name = request.json.get('folder_name')
        
        if not folder_name:
            return jsonify({'error': 'folder_name required'}), 400
        
        storage_path = get_storage_path(path)
        
        # In Firebase Storage, folders are created by adding a placeholder file
        if storage_path:
            full_path = f"{storage_path.rstrip('/')}/{folder_name}/.placeholder"
        else:
            full_path = f"{folder_name}/.placeholder"
        
        blob = bucket.blob(full_path)
        blob.upload_from_string('', content_type='text/plain')
        
        return jsonify({
            'success': True,
            'path': full_path,
            'folder_name': folder_name
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/delete-folder', methods=['DELETE'])
def delete_folder():
    """Delete a folder and all its contents"""
    if not bucket:
        return jsonify({'error': 'Firebase not initialized'}), 500
        
    try:
        path = request.args.get('path')
        if not path:
            return jsonify({'error': 'No path provided'}), 400
        
        storage_path = get_storage_path(path)
        
        # List all blobs in the folder
        blobs = list(bucket.list_blobs(prefix=storage_path.rstrip('/') + '/'))
        
        # Delete all blobs
        for blob in blobs:
            blob.delete()
        
        return jsonify({'success': True, 'path': storage_path})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/batch-delete', methods=['POST'])
def batch_delete():
    """Delete multiple files and/or folders"""
    if not bucket:
        return jsonify({'error': 'Firebase not initialized'}), 500
        
    try:
        data = request.get_json() or {}
        files = data.get('files', [])
        folders = data.get('folders', [])
        
        def delete_one_file(file_path):
            storage_path = get_storage_path(file_path)
            blob = bucket.blob(storage_path)
            if blob.exists():
                blob.delete()
                return 1
            return 0

        from concurrent.futures import ThreadPoolExecutor
        deleted_count = 0
        
        if files:
            with ThreadPoolExecutor(max_workers=20) as executor:
                results = list(executor.map(delete_one_file, files))
                deleted_count += sum(results)
                
        # Delete folders and their contents
        for folder_path in folders:
            storage_path = get_storage_path(folder_path)
            prefix = storage_path.rstrip('/') + '/'
            blobs = list(bucket.list_blobs(prefix=prefix))
            for blob in blobs:
                blob.delete()
                deleted_count += 1
                
        return jsonify({'success': True, 'deleted_count': deleted_count})
    except Exception as e:
        import traceback
        print(f"Batch delete error: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/batch-copy', methods=['POST'])
def batch_copy():
    """Copy multiple files to a destination folder"""
    if not bucket:
        return jsonify({'error': 'Firebase not initialized'}), 500
        
    try:
        data = request.get_json() or {}
        files = data.get('files', [])
        destination_folder = data.get('destination', '').strip()
        
        dest_storage_path = get_storage_path(destination_folder)
        
        def copy_one(file_path):
            source_storage_path = get_storage_path(file_path)
            source_blob = bucket.blob(source_storage_path)
            if not source_blob.exists():
                return 0
            file_name = source_storage_path.split('/')[-1]
            if dest_storage_path:
                target_path = f"{dest_storage_path.rstrip('/')}/{file_name}"
            else:
                target_path = file_name
            bucket.copy_blob(source_blob, bucket, target_path)
            return 1

        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=20) as executor:
            results = list(executor.map(copy_one, files))
            
        copied_count = sum(results)
        return jsonify({'success': True, 'copied_count': copied_count})
    except Exception as e:
        import traceback
        print(f"Batch copy error: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/batch-move', methods=['POST'])
def batch_move():
    """Move multiple files to a destination folder"""
    if not bucket:
        return jsonify({'error': 'Firebase not initialized'}), 500
        
    try:
        data = request.get_json() or {}
        files = data.get('files', [])
        destination_folder = data.get('destination', '').strip()
        
        dest_storage_path = get_storage_path(destination_folder)
        
        def move_one(file_path):
            source_storage_path = get_storage_path(file_path)
            source_blob = bucket.blob(source_storage_path)
            if not source_blob.exists():
                return 0
            file_name = source_storage_path.split('/')[-1]
            if dest_storage_path:
                target_path = f"{dest_storage_path.rstrip('/')}/{file_name}"
            else:
                target_path = file_name
            bucket.rename_blob(source_blob, target_path)
            return 1

        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=20) as executor:
            results = list(executor.map(move_one, files))
            
        moved_count = sum(results)
        return jsonify({'success': True, 'moved_count': moved_count})
    except Exception as e:
        import traceback
        print(f"Batch move error: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print(f"Starting Firebase Storage Manager server...")
    print(f"Storage Bucket: {STORAGE_BUCKET}")
    print(f"Service Account: {SERVICE_ACCOUNT_PATH}")
    app.run(host='0.0.0.0', port=5000, debug=True)
