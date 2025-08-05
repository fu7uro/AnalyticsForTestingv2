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

# Register blueprints with URL prefixes
app.register_blueprint(analytics_bp, url_prefix='/api/analytics')
app.register_blueprint(auth_bp, url_prefix='/api')

@app.route('/')
def index():
    """Serve the main dashboard"""
    if 'agent_id' not in session:
        return redirect('/login')
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/login')
def login_page():
    """Serve the login page"""
    return send_from_directory(app.static_folder, 'login.html')

@app.route('/dashboard')
def dashboard():
    """Redirect to main page"""
    return redirect('/')

@app.route('/static/<path:filename>')
def static_files(filename):
    """Serve static files"""
    return send_from_directory(app.static_folder, filename)


if __name__ == '__main__':
    # Get port from environment variable (Railway, Heroku, etc.) or default to 5000
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

