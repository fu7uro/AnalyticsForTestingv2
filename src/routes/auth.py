from flask import Blueprint, request, jsonify, session, redirect, url_for, render_template_string
import requests
from datetime import datetime, timedelta
import os

# Create blueprint for authentication routes
auth_bp = Blueprint('auth', __name__)

# Configuration
ELEVENLABS_API_KEY = "sk_e25899b1054a36c01b57ed036ebedfee65c1afbf14f3cad6"
ELEVENLABS_BASE_URL = "https://api.elevenlabs.io"
GENERIC_PASSWORD = "Kk7B28j!RrEes"

def validate_agent_id(agent_id):
    """Validate agent ID exists by checking 11labs API"""
    try:
        headers = {"xi-api-key": ELEVENLABS_API_KEY}
        params = {"agent_id": agent_id, "page_size": 1}
        
        response = requests.get(
            f"{ELEVENLABS_BASE_URL}/v1/convai/conversations",
            headers=headers,
            params=params,
            timeout=10
        )
        
        # If we get a 200 response, the agent exists
        return response.status_code == 200
        
    except Exception as e:
        print(f"Error validating agent ID: {e}")
        return False

def get_agent_info(agent_id):
    """Get agent information dynamically from 11labs API"""
    try:
        headers = {"xi-api-key": ELEVENLABS_API_KEY}
        
        # Try to get agent details from the conversational AI agents endpoint
        agents_response = requests.get(f"{ELEVENLABS_BASE_URL}/v1/convai/agents", headers=headers, timeout=10)
        
        if agents_response.status_code == 200:
            agents_data = agents_response.json()
            if "agents" in agents_data:
                for agent in agents_data["agents"]:
                    if agent.get("agent_id") == agent_id:
                        return {
                            "name": agent.get("name", f"Agent {agent_id[-8:]}"),
                            "type": agent.get("conversation_config", {}).get("agent_prompt", "AI Agent")[:50] + "..." if len(agent.get("conversation_config", {}).get("agent_prompt", "")) > 50 else agent.get("conversation_config", {}).get("agent_prompt", "AI Agent"),
                            "description": agent.get("conversation_config", {}).get("agent_prompt", "Conversational AI agent")[:100] + "..." if len(agent.get("conversation_config", {}).get("agent_prompt", "")) > 100 else agent.get("conversation_config", {}).get("agent_prompt", "Conversational AI agent")
                        }
        
        # Fallback: try to get info from a conversation
        conversations_response = requests.get(
            f"{ELEVENLABS_BASE_URL}/v1/convai/conversations",
            headers=headers,
            params={"agent_id": agent_id, "page_size": 1},
            timeout=10
        )
        
        if conversations_response.status_code == 200:
            # Use generic info based on agent ID
            return {
                "name": f"Agent {agent_id[-8:]}",  # Use last 8 chars of agent ID
                "type": "Conversational AI",
                "description": "Conversational AI agent providing customer support and assistance"
            }
        
        # Final fallback
        return {
            "name": f"Agent {agent_id[-8:]}",
            "type": "AI Agent", 
            "description": "Conversational AI agent"
        }
        
    except Exception as e:
        print(f"Error getting agent info: {e}")
        return {
            "name": f"Agent {agent_id[-8:]}",
            "type": "AI Agent",
            "description": "Conversational AI agent"
        }

@auth_bp.route('/login', methods=['GET'])
def login_page():
    """Serve the login page"""
    # Check if user is already logged in
    if 'agent_id' in session:
        return redirect('/dashboard')
    
    # Serve the login HTML file
    try:
        with open(os.path.join(os.path.dirname(__file__), '..', 'static', 'login.html'), 'r') as f:
            return f.read()
    except FileNotFoundError:
        return "Login page not found", 404

@auth_bp.route('/api/login', methods=['POST'])
def login():
    """Handle login authentication"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"success": False, "message": "No data provided"}), 400
        
        agent_id = data.get('agent_id', '').strip()
        password = data.get('password', '')
        
        # Validate input
        if not agent_id or not password:
            return jsonify({"success": False, "message": "Agent ID and password are required"}), 400
        
        if len(agent_id) < 3:
            return jsonify({"success": False, "message": "Invalid Agent ID format"}), 400
        
        # Check password
        if password != GENERIC_PASSWORD:
            return jsonify({"success": False, "message": "Invalid password"}), 401
        
        # Validate agent ID exists in 11labs
        if not validate_agent_id(agent_id):
            return jsonify({"success": False, "message": "Agent ID not found or invalid"}), 401
        
        # Get agent information dynamically
        agent_info = get_agent_info(agent_id)
        
        # Create session
        session['agent_id'] = agent_id
        session['agent_name'] = agent_info['name']
        session['agent_type'] = agent_info['type']
        session['agent_description'] = agent_info['description']
        session['login_time'] = datetime.now().isoformat()
        session['last_activity'] = datetime.now().isoformat()
        
        # Set session to expire in 4 hours
        session.permanent = True
        
        return jsonify({
            "success": True,
            "message": "Authentication successful",
            "agent": agent_info
        })
        
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({"success": False, "message": "Authentication failed"}), 500

@auth_bp.route('/api/logout', methods=['POST'])
def logout():
    """Handle logout"""
    session.clear()
    return jsonify({"success": True, "message": "Logged out successfully"})

@auth_bp.route('/dashboard')
def dashboard():
    """Redirect to main analytics dashboard"""
    # Check if user is logged in
    if 'agent_id' not in session:
        return redirect('/login')
    
    # Update last activity
    session['last_activity'] = datetime.now().isoformat()
    
    # Redirect to main analytics page
    return redirect('/')

@auth_bp.route('/api/session')
def get_session():
    """Get current session information"""
    if 'agent_id' not in session:
        return jsonify({"authenticated": False})
    
    return jsonify({
        "authenticated": True,
        "agent_id": session['agent_id'],
        "agent_name": session['agent_name'],
        "agent_type": session['agent_type'],
        "agent_description": session.get('agent_description', 'Conversational AI agent'),
        "login_time": session['login_time']
    })

# Session timeout check
@auth_bp.before_app_request
def check_session_timeout():
    """Check if session has timed out"""
    if 'last_activity' in session:
        last_activity = datetime.fromisoformat(session['last_activity'])
        if datetime.now() - last_activity > timedelta(hours=4):
            session.clear()
            if request.endpoint and request.endpoint.startswith('api.'):
                return jsonify({"error": "Session expired"}), 401

