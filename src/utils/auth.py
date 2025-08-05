from flask import session, request, jsonify, redirect
from datetime import datetime
from functools import wraps

def require_auth(f):
    """Decorator to require authentication for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'agent_id' not in session:
            if request.is_json:
                return jsonify({"error": "Authentication required"}), 401
            else:
                return redirect('/login')
        
        # Update last activity
        session['last_activity'] = datetime.now().isoformat()
        
        return f(*args, **kwargs)
    
    return decorated_function

