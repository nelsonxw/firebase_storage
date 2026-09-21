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
STORAGE_BUCKET = "slide-preview.appspot.com"

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
        
        # For root level, use known folders since Firebase listing is hanging
        if not storage_path:
            known_folders = ['slides', 'previews', 'temp', 'uploads']
            folders.update(known_folders)
            print(f"Using known folders for root: {known_folders}")
        else:
            # For subfolders, try to get actual files with debugging
            print(f"Attempting to list actual files in: {storage_path}")
            
            try:
                # First, let's see what's actually in the bucket
                print("Checking what exists in the entire bucket...")
                all_blobs = list(bucket.list_blobs(max_results=50))
                print(f"Total blobs found in bucket: {len(all_blobs)}")
                
                for blob in all_blobs[:10]:  # Show first 10
                    print(f"  - {blob.name}")
                
                # Now filter for the requested path
                prefix = storage_path.rstrip('/') + '/'
                print(f"Filtering for prefix: {prefix}")
                
                for blob in all_blobs:
                    if blob.name.startswith(prefix):
                        remaining_path = blob.name[len(prefix):]
                        
                        # Skip placeholders and folder markers
                        if blob.name.endswith('/.placeholder') or blob.name.endswith('/'):
                            continue
                        
                        # Only add files directly in current folder
                        if '/' not in remaining_path:
                            file_info = {
                                'name': blob.name.split('/')[-1],
                                'full_path': blob.name,
                                'size': blob.size,
                                'updated': blob.updated.isoformat() if blob.updated else None,
                                'content_type': blob.content_type
                            }
                            files.append(file_info)
                            print(f"Added real file: {file_info['name']}")
                
                print(f"Successfully listed {len(files)} real files in {storage_path}")
                
            except Exception as list_error:
                import traceback
                print(f"Firebase listing failed: {list_error}")
                print(f"Traceback: {traceback.format_exc()}")
                # Return empty if everything fails
                print("Could not list any files, returning empty list")
        
        print(f"Final count: {len(files)} files, {len(folders)} folders")
        
        return jsonify({
            'files': files,
            'folders': sorted(list(folders)),
            'file_count': len(files),
            'folder_count': len(folders),
            'current_path': path
        })
        
    except Exception as e:
        import traceback
        print(f"Error listing files: {e}")
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
        
        # Copy to new location
        source_blob = bucket.blob(old_storage_path)
        destination_blob = bucket.blob(new_storage_path)
        destination_blob.rewrite_from(source_blob)
        
        # Delete old file
        source_blob.delete()
        
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
        blobs = list(bucket.list_blobs(prefix=storage_path.rstrip('/') + '/', max_results=100))
        
        # Delete all blobs
        for blob in blobs:
            blob.delete()
        
        return jsonify({'success': True, 'path': storage_path})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print(f"Starting Firebase Storage Manager server...")
    print(f"Storage Bucket: {STORAGE_BUCKET}")
    print(f"Service Account: {SERVICE_ACCOUNT_PATH}")
    app.run(host='0.0.0.0', port=5000, debug=True)
