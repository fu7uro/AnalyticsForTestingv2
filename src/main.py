import os
import sys
from datetime import timedelta
# DON'T CHANGE THIS !!!
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from flask import Flask, send_from_directory, session, redirect
from flask_cors import CORS
from src.routes.analytics import analytics_bp
from src.routes.auth import auth_bp

app = Flask(__name__, static_folder=os.path.join(os.path.dirname(__file__), 'static'))
app.config['SECRET_KEY'] = 'futuro_analytics_secret_key_2024_secure'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=4)

# Enable CORS for all routes
CORS(app, supports_credentials=True)

# Register blueprints
app.register_blueprint(analytics_bp)
app.register_blueprint(auth_bp)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    # Check if accessing login page
    if path == 'login' or path == 'login.html':
        return send_from_directory(app.static_folder, 'login.html')
    
    # For main dashboard, check authentication
    if path == '' or path == 'index.html':
        if 'agent_id' not in session:
            return redirect('/login')
    
    static_folder_path = app.static_folder
    if static_folder_path is None:
        return "Static folder not configured", 404

    if path != "" and os.path.exists(os.path.join(static_folder_path, path)):
        return send_from_directory(static_folder_path, path)
    else:
        # For authenticated users, serve the main dashboard
        if 'agent_id' in session:
            index_path = os.path.join(static_folder_path, 'index.html')
            if os.path.exists(index_path):
                return send_from_directory(static_folder_path, 'index.html')
        
        # Unauthenticated users get redirected to login
        return redirect('/login')


if __name__ == '__main__':
    # Get port from environment variable (Railway, Heroku, etc.) or default to 5000
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

