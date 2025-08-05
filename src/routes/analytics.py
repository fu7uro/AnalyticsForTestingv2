import requests
import json
import os
import csv
import io
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request, session, Response
from flask_cors import cross_origin
from src.utils.auth import require_auth

analytics_bp = Blueprint('analytics', __name__)

# 11labs API configuration
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "sk_e25899b1054a36c01b57ed036ebedfee65c1afbf14f3cad6")
ELEVENLABS_BASE_URL = "https://api.elevenlabs.io"

@analytics_bp.route('/health')
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "service": "analytics"})

# Mock data for testing
MOCK_DATA_MODE = True  # Set to False for production

def get_mock_conversations():
    """Generate mock conversation data for testing"""
    from datetime import datetime, timedelta
    import random
    
    conversations = []
    for i in range(20):
        date = datetime.now() - timedelta(days=random.randint(0, 30))
        duration = random.randint(30, 1200)  # 30 seconds to 20 minutes
        messages = random.randint(1, 50)
        status = random.choice(['completed', 'transferred', 'failed'])
        
        conversations.append({
            'conversation_id': f'conv_{i+1:03d}',
            'start_time_unix_secs': int(date.timestamp()),
            'metadata': {
                'call_duration_secs': duration,
                'status': status
            },
            'transcript': [{'message': f'Message {j+1}'} for j in range(messages)],
            'analysis': {
                'evaluation_result': {
                    'overall_score': random.uniform(0.6, 1.0),
                    'criteria_scores': {
                        'helpfulness': random.uniform(0.7, 1.0),
                        'accuracy': random.uniform(0.6, 1.0),
                        'professionalism': random.uniform(0.8, 1.0)
                    }
                },
                'sentiment': random.choice(['positive', 'neutral', 'negative'])
            },
            'tools_used': random.choice([[], ['search_tool'], ['booking_tool', 'payment_tool']])
        })
    
    return conversations

def make_elevenlabs_request(endpoint, params=None):
    """Make request to ElevenLabs API"""
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.get(f"{ELEVENLABS_BASE_URL}{endpoint}", headers=headers, params=params, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"API request failed: {e}")
        return None

def get_agent_info(agent_id):
    """Get agent information from 11labs API"""
    try:
        agents_data = make_elevenlabs_request("/v1/convai/agents")
        
        if agents_data and "agents" in agents_data:
            for agent in agents_data["agents"]:
                if agent.get("agent_id") == agent_id:
                    return {
                        "name": agent.get("name", "Unknown Agent"),
                        "type": "Conversational AI",
                        "description": "Conversational AI agent"
                    }
        
        # Fallback
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

@analytics_bp.route('/conversations/<agent_id>')
@require_auth
def get_conversations(agent_id):
    """Get conversations for a specific agent"""
    session_agent_id = session.get('agent_id')
    if agent_id != session_agent_id:
        return jsonify({"error": "Access denied. You can only view your own agent's data."}), 403
    
    params = {
        "agent_id": agent_id,
        "page_size": 50
    }
    
    conversations_data = make_elevenlabs_request("/v1/convai/conversations", params)
    
    if conversations_data is None:
        return jsonify({"error": "Failed to fetch conversations from 11labs API"}), 500
    
    agent_info = get_agent_info(agent_id)
    
    conversations = []
    for conv in conversations_data.get("conversations", []):
        # Get metadata for duration and message count
        metadata = conv.get("metadata", {})
        duration_secs = metadata.get("call_duration_secs", 0)
        duration_mins = duration_secs // 60
        duration_remaining_secs = duration_secs % 60
        duration_str = f"{duration_mins}m {duration_remaining_secs}s"
        
        # Count messages from transcript
        transcript = conv.get("transcript", [])
        message_count = len(transcript) if isinstance(transcript, list) else 0
        
        # Determine status
        status = conv.get("status", "unknown")
        if status == "done":
            status = "completed"
        elif status == "failed":
            status = "transferred"
        
        conversation = {
            "id": conv.get("conversation_id", ""),
            "title": f"{agent_info['type']} Customer Call",
            "summary": f"{agent_info['type']} customer interaction",
            "sentiment": "neutral",
            "status": status,
            "duration": duration_str,
            "date": datetime.fromtimestamp(metadata.get("start_time_unix_secs", 0)).strftime("%Y-%m-%d") if metadata.get("start_time_unix_secs") else datetime.now().strftime("%Y-%m-%d"),
            "transcript": "Click 'Transcript' to view full conversation",
            "hasAudio": conv.get("has_audio", False),
            "messageCount": message_count,
            "callSuccessful": status
        }
        conversations.append(conversation)
    
    return jsonify({
        "conversations": conversations,
        "total": len(conversations),
        "agent": agent_info
    })

@analytics_bp.route('/conversation-data-analysis/<conversation_id>')
@require_auth
def get_conversation_data_analysis(conversation_id):
    """Get detailed data collection analysis"""
    
    conversation_data = make_elevenlabs_request(f"/v1/convai/conversations/{conversation_id}")
    
    if conversation_data is None:
        return jsonify({"error": "Failed to fetch conversation data from 11labs API"}), 500
    
    session_agent_id = session.get('agent_id')
    conversation_agent_id = conversation_data.get('agent_id')
    
    if conversation_agent_id != session_agent_id:
        return jsonify({"error": "Access denied."}), 403
    
    agent_info = get_agent_info(conversation_agent_id)
    
    # Extract metadata with proper duration and message count
    metadata = conversation_data.get("metadata", {})
    duration_secs = metadata.get("call_duration_secs", 0)
    duration_mins = duration_secs // 60
    duration_remaining_secs = duration_secs % 60
    duration_str = f"{duration_mins}m {duration_remaining_secs}s"
    
    # Count messages from transcript
    transcript = conversation_data.get("transcript", [])
    message_count = len(transcript) if isinstance(transcript, list) else 0
    
    # Get analysis data if available
    analysis = conversation_data.get("analysis", {})
    
    return jsonify({
        "conversation_id": conversation_id,
        "agent_name": agent_info["name"],
        "duration": duration_str,
        "messages": message_count,
        "status": conversation_data.get("status", "unknown"),
        "start_time": datetime.fromtimestamp(metadata.get("start_time_unix_secs", 0)).isoformat() if metadata.get("start_time_unix_secs") else None,
        "analysis": analysis,
        "evaluation_score": analysis.get("evaluation_score", 0) if analysis else 0
    })

@analytics_bp.route('/conversation-transcript/<conversation_id>')
@require_auth
def get_conversation_transcript(conversation_id):
    """Get conversation transcript with proper metadata"""
    
    conversation_data = make_elevenlabs_request(f"/v1/convai/conversations/{conversation_id}")
    
    if conversation_data is None:
        return jsonify({"error": "Failed to fetch conversation data from 11labs API"}), 500
    
    session_agent_id = session.get('agent_id')
    conversation_agent_id = conversation_data.get('agent_id')
    
    if conversation_agent_id != session_agent_id:
        return jsonify({"error": "Access denied."}), 403
    
    # Extract metadata with proper duration and message count
    metadata = conversation_data.get("metadata", {})
    duration_secs = metadata.get("call_duration_secs", 0)
    duration_mins = duration_secs // 60
    duration_remaining_secs = duration_secs % 60
    duration_str = f"{duration_mins}m {duration_remaining_secs}s"
    
    # Process transcript
    transcript = conversation_data.get("transcript", [])
    message_count = len(transcript) if isinstance(transcript, list) else 0
    
    # Format transcript for display
    formatted_transcript = ""
    if isinstance(transcript, list):
        for message in transcript:
            role = message.get("role", "unknown")
            content = message.get("message", "")
            if role == "user":
                formatted_transcript += f"User: {content}\n\n"
            elif role == "agent":
                formatted_transcript += f"Agent: {content}\n\n"
    
    return jsonify({
        "conversation_id": conversation_id,
        "duration": duration_str,
        "messages": message_count,
        "transcript": formatted_transcript.strip(),
        "status": conversation_data.get("status", "unknown")
    })

@analytics_bp.route('/conversation-tools-used/<conversation_id>')
@require_auth
def get_conversation_tools_used(conversation_id):
    """Get tools used in conversation with proper metadata"""
    
    conversation_data = make_elevenlabs_request(f"/v1/convai/conversations/{conversation_id}")
    
    if conversation_data is None:
        return jsonify({"error": "Failed to fetch conversation data from 11labs API"}), 500
    
    session_agent_id = session.get('agent_id')
    conversation_agent_id = conversation_data.get('agent_id')
    
    if conversation_agent_id != session_agent_id:
        return jsonify({"error": "Access denied."}), 403
    
    # Extract metadata with proper duration and message count
    metadata = conversation_data.get("metadata", {})
    duration_secs = metadata.get("call_duration_secs", 0)
    duration_mins = duration_secs // 60
    duration_remaining_secs = duration_secs % 60
    duration_str = f"{duration_mins}m {duration_remaining_secs}s"
    
    # Count messages from transcript
    transcript = conversation_data.get("transcript", [])
    message_count = len(transcript) if isinstance(transcript, list) else 0
    
    # Extract tools used from transcript or metadata
    tools_used = []
    
    # Check if there are tool calls in the transcript
    if isinstance(transcript, list):
        for message in transcript:
            if message.get("role") == "tool" or "tool_call" in message:
                tool_name = message.get("tool_name", "Unknown Tool")
                tools_used.append({
                    "name": tool_name,
                    "description": f"Tool used during conversation",
                    "timestamp": message.get("time_in_call_secs", 0)
                })
    
    return jsonify({
        "conversation_id": conversation_id,
        "duration": duration_str,
        "messages": message_count,
        "tools_used": tools_used,
        "status": conversation_data.get("status", "unknown")
    })

@analytics_bp.route('/export-csv/<agent_id>')
@require_auth
def export_conversations_csv(agent_id):
    """Export conversations to CSV with enhanced data"""
    session_agent_id = session.get('agent_id')
    if agent_id != session_agent_id:
        return jsonify({"error": "Access denied."}), 403
    
    params = {
        "agent_id": agent_id,
        "page_size": 100
    }
    
    conversations_data = make_elevenlabs_request("/v1/convai/conversations", params)
    
    if conversations_data is None:
        return jsonify({"error": "Failed to fetch conversations"}), 500
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write headers
    writer.writerow([
        'Conversation ID',
        'Date',
        'Duration (seconds)',
        'Duration (formatted)',
        'Message Count',
        'Status',
        'Has Audio',
        'Start Time',
        'Agent ID',
        'Summary'
    ])
    
    # Write data rows
    for conv in conversations_data.get("conversations", []):
        metadata = conv.get("metadata", {})
        duration_secs = metadata.get("call_duration_secs", 0)
        duration_mins = duration_secs // 60
        duration_remaining_secs = duration_secs % 60
        duration_str = f"{duration_mins}m {duration_remaining_secs}s"
        
        transcript = conv.get("transcript", [])
        message_count = len(transcript) if isinstance(transcript, list) else 0
        
        start_time = ""
        if metadata.get("start_time_unix_secs"):
            start_time = datetime.fromtimestamp(metadata.get("start_time_unix_secs")).isoformat()
        
        writer.writerow([
            conv.get("conversation_id", ""),
            datetime.fromtimestamp(metadata.get("start_time_unix_secs", 0)).strftime("%Y-%m-%d") if metadata.get("start_time_unix_secs") else "",
            duration_secs,
            duration_str,
            message_count,
            conv.get("status", "unknown"),
            conv.get("has_audio", False),
            start_time,
            agent_id,
            "Conversational AI customer interaction"
        ])
    
    # Create response
    output.seek(0)
    response = Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename=conversations_{agent_id}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
        }
    )
    
    return response

@analytics_bp.route('/analytics-data/<agent_id>')
@require_auth
def get_analytics_data(agent_id):
    """Get analytics data for dashboard"""
    session_agent_id = session.get('agent_id')
    if agent_id != session_agent_id:
        return jsonify({"error": "Access denied."}), 403
    
    # Get time filter from query params
    time_filter = request.args.get('filter', 'today')
    
    # Calculate date range
    now = datetime.now()
    if time_filter == 'today':
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif time_filter == '7days':
        start_date = now - timedelta(days=7)
    elif time_filter == '30days':
        start_date = now - timedelta(days=30)
    else:
        start_date = now - timedelta(days=1)
    
    params = {
        "agent_id": agent_id,
        "page_size": 100
    }
    
    conversations_data = make_elevenlabs_request("/v1/convai/conversations", params)
    
    if conversations_data is None:
        return jsonify({"error": "Failed to fetch conversations"}), 500
    
    # Process conversations for analytics
    total_conversations = 0
    successful_conversations = 0
    total_duration = 0
    evaluation_scores = []
    
    for conv in conversations_data.get("conversations", []):
        metadata = conv.get("metadata", {})
        conv_start_time = metadata.get("start_time_unix_secs")
        
        if conv_start_time:
            conv_datetime = datetime.fromtimestamp(conv_start_time)
            if conv_datetime >= start_date:
                total_conversations += 1
                
                if conv.get("status") == "done":
                    successful_conversations += 1
                
                duration_secs = metadata.get("call_duration_secs", 0)
                total_duration += duration_secs
                
                # Get evaluation score from analysis
                analysis = conv.get("analysis", {})
                if analysis and "evaluation_score" in analysis:
                    evaluation_scores.append(analysis["evaluation_score"])
    
    # Calculate metrics
    success_rate = (successful_conversations / total_conversations * 100) if total_conversations > 0 else 0
    avg_duration_secs = total_duration // total_conversations if total_conversations > 0 else 0
    avg_duration_mins = avg_duration_secs // 60
    avg_duration_remaining = avg_duration_secs % 60
    avg_duration_str = f"{avg_duration_mins}m {avg_duration_remaining}s"
    
    avg_evaluation_score = sum(evaluation_scores) / len(evaluation_scores) if evaluation_scores else 0
    
    return jsonify({
        "total_calls": total_conversations,
        "success_rate": round(success_rate, 1),
        "avg_duration": avg_duration_str,
        "evaluation_score": round(avg_evaluation_score, 1),
        "positive_sentiment": round(success_rate, 1)  # Using success rate as proxy for sentiment
    })

