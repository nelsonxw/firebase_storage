"""
Extract Firebase configuration from service account key file.
This script reads the serviceAccountKey.json and extracts the relevant
configuration fields for the Firebase Storage Manager web interface.
"""

import json
import sys
from pathlib import Path

def extract_firebase_config(service_account_path):
    """
    Extract Firebase configuration from service account key file.
    
    Args:
        service_account_path: Path to serviceAccountKey.json file
    
    Returns:
        dict: Firebase configuration object
    """
    try:
        with open(service_account_path, 'r') as f:
            service_account = json.load(f)
        
        # Extract relevant fields from service account key
        config = {
            'projectId': service_account.get('project_id'),
            'storageBucket': f"{service_account.get('project_id')}.appspot.com",
            # Note: API key, authDomain, messagingSenderId, and appId are not in service account key
            # These need to be obtained from Firebase Console > Project Settings > General
            'apiKey': '',  # Needs to be filled manually
            'authDomain': f"{service_account.get('project_id')}.firebaseapp.com",
            'messagingSenderId': '',  # Needs to be filled manually
            'appId': ''  # Needs to be filled manually
        }
        
        return config
        
    except FileNotFoundError:
        print(f"Error: Service account key file not found at {service_account_path}")
        return None
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON in service account key file")
        return None
    except Exception as e:
        print(f"Error reading service account key: {e}")
        return None

def main():
    # Default path to service account key in slide_scrapper
    default_path = Path(__file__).parent.parent / "slide_scrapper" / "backend" / "serviceAccountKey.json"
    
    # Check if file exists at default path
    if not default_path.exists():
        print(f"Service account key not found at: {default_path}")
        print("Please provide the path to your serviceAccountKey.json file:")
        custom_path = input().strip()
        if custom_path:
            default_path = Path(custom_path)
        else:
            print("No path provided. Exiting.")
            return
    
    # Extract configuration
    config = extract_firebase_config(default_path)
    
    if config:
        print("\n" + "="*60)
        print("FIREBASE CONFIGURATION EXTRACTED")
        print("="*60)
        print(f"Project ID: {config['projectId']}")
        print(f"Storage Bucket: {config['storageBucket']}")
        print(f"Auth Domain: {config['authDomain']}")
        print("\nNOTE: The following fields need to be obtained from Firebase Console:")
        print("- API Key (from Project Settings > General > Your apps)")
        print("- Messaging Sender ID (from Project Settings > General > Your apps)")
        print("- App ID (from Project Settings > General > Your apps)")
        print("\n" + "="*60)
        
        # Generate JavaScript config object
        print("\nJavaScript Configuration Object:")
        print("-" * 60)
        js_config = f"""const firebaseConfig = {{
  apiKey: "{config['apiKey']}",  // Fill this in
  authDomain: "{config['authDomain']}",
  projectId: "{config['projectId']}",
  storageBucket: "{config['storageBucket']}",
  messagingSenderId: "",  // Fill this in
  appId: ""  // Fill this in
}};"""
        print(js_config)
        print("-" * 60)
        
        # Automatically save to a file
        config_path = Path(__file__).parent / "firebase-config.json"
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
        print(f"\nConfiguration automatically saved to: {config_path}")
        print("You can now manually add the missing fields (apiKey, messagingSenderId, appId) to this file")

if __name__ == "__main__":
    main()
