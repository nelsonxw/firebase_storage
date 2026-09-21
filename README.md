# Firebase Storage Manager

A web-based interface for managing Firebase Storage with full CRUD operations using a Flask backend with Firebase Admin SDK.

## Features

- **File Counting**: Automatically counts and displays the number of files and folders in each directory
- **File Upload**: Upload files to any folder in your Firebase Storage
- **File Download**: Download files directly from the interface
- **File Deletion**: Delete individual files or entire folders (with confirmation)
- **File Moving/Renaming**: Move files between folders or rename them
- **Folder Creation**: Create new folders to organize your files
- **Navigation**: Navigate through folder structure with breadcrumb navigation
- **No User Authentication**: Uses service account authentication (server-side)

## Architecture

This implementation uses a **backend server approach** similar to the slide scrapper:

- **Backend**: Flask server with Firebase Admin SDK
- **Frontend**: Pure HTML/CSS/JavaScript calling backend APIs
- **Authentication**: Service account key (no user login required)
- **Storage**: Firebase Storage with admin privileges

## Setup Instructions

### 1. Prerequisites

- Python 3.8 or higher
- Firebase project with Storage enabled
- Firebase service account key file

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Service Account

1. Place your `serviceAccountKey.json` file in the project directory
2. The server will automatically use this file for authentication
3. Update the `STORAGE_BUCKET` variable in `server.py` if needed (default: `slide-preview.appspot.com`)

### 4. Start the Backend Server

```bash
python server.py
```

The server will start on `http://localhost:5000`

### 5. Open the Web Interface

Open `index.html` in a web browser, or use a simple HTTP server:

```bash
# Python 3
python -m http.server 8080

# Or Python 2
python -m SimpleHTTPServer 8080
```

Then navigate to `http://localhost:8080`

## Usage

### File Operations

**Upload Files:**
- Click "Upload File" button
- Select a file from your computer
- Click "Upload"

**Create Folders:**
- Click "Create Folder" button
- Enter folder name
- Click "Create"

**Navigate Folders:**
- Click on any folder to open it
- Use breadcrumb navigation to go back to parent folders
- Click "Root" to return to the top level

**Download Files:**
- Click the "Download" button next to any file

**Move/Rename Files:**
- Click "Move/Rename" button next to any file
- Enter the new path (e.g., `folder/newname.txt` to move and rename)
- Click "Move"

**Delete Files/Folders:**
- Click "Delete" button next to any file or folder
- Confirm the deletion in the dialog

## API Endpoints

The backend server provides the following REST API endpoints:

- `GET /api/health` - Health check
- `GET /api/files?path=<path>` - List files and folders
- `POST /api/upload` - Upload a file
- `GET /api/download?path=<path>` - Download a file
- `DELETE /api/delete?path=<path>` - Delete a file
- `POST /api/move` - Move/rename a file
- `POST /api/create-folder` - Create a folder
- `DELETE /api/delete-folder?path=<path>` - Delete a folder

## Security Notes

⚠️ **Important Security Considerations:**

1. **Never commit service account keys to public repositories**
   - `serviceAccountKey.json` is in .gitignore by default
   - Keep this file secure and local only
2. **Service account has admin privileges** - anyone with access to the server has full storage access
3. **Consider adding authentication** to the Flask server for production use
4. **Use proper Firebase Security Rules** as an additional layer of protection
5. **Deploy behind proper security** (firewall, VPN, etc.) in production

## Technical Details

- **Backend**: Flask 3.0.0 with Firebase Admin SDK 6.4.0
- **Frontend**: Pure HTML, CSS, and JavaScript (no frameworks)
- **Storage**: Google Cloud Storage via Firebase Admin SDK
- **Authentication**: Service account (server-side)

## Browser Compatibility

Works in all modern browsers that support:
- Fetch API
- File API
- ES6 JavaScript

Tested on:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Troubleshooting

**"Error connecting to server"**
- Ensure the Flask server is running on port 5000
- Check that serviceAccountKey.json exists in the project directory
- Verify the storage bucket name in server.py

**"Error loading files"**
- Check the Flask server logs for errors
- Verify the service account has Storage permissions
- Ensure the storage bucket exists and is accessible

**Upload/download issues**
- Check file permissions on the server
- Verify the Flask server has write permissions for temp files
- Check Firebase Storage quotas and limits

## Differences from Client-Side Approach

This backend approach differs from the original client-side Firebase SDK approach:

**Advantages:**
- No user authentication required
- Uses existing service account (like slide scrapper)
- Simpler configuration (only service account key needed)
- More control over file operations
- Can be extended with server-side logic

**Disadvantages:**
- Requires running a backend server
- Service account has full admin access
- Need to manage server deployment
- Less portable than pure client-side solution

## License

This is a demonstration project. Use at your own risk and ensure proper security measures are implemented for production use.
