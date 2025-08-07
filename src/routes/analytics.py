import requests
import json
import os
import re
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request, session
from flask_cors import cross_origin
from src.utils.auth import require_auth

analytics_bp = Blueprint('analytics', __name__)

# 11labs API configuration - use environment variable with fallback
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "sk_443c531bae96a3318af7d3858ce2ad308b74a0e965f4662b")
ELEVENLABS_BASE_URL = "https://api.elevenlabs.io"

def make_elevenlabs_request(endpoint, params=None):
    """Make a request to the 11labs API"""
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.get(f"{ELEVENLABS_BASE_URL}{endpoint}", headers=headers, params=params, timeout=30)
        print(f"DEBUG: API Request - Status: {response.status_code}, URL: {ELEVENLABS_BASE_URL}{endpoint}")
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"API request failed: {e}")
        print(f"DEBUG: Response content: {response.text if 'response' in locals() else 'No response'}")
        return None

def get_agent_info(agent_id):
    """Get agent information from 11labs API"""
    try:
        # Try to get agent details from the conversational AI agents endpoint
        agents_data = make_elevenlabs_request("/v1/convai/agents")
        
        if agents_data and "agents" in agents_data:
            for agent in agents_data["agents"]:
                if agent.get("agent_id") == agent_id:
                    return {
                        "name": agent.get("name", "Unknown Agent"),
                        "type": agent.get("conversation_config", {}).get("agent_prompt", "AI Agent")[:50] + "..." if len(agent.get("conversation_config", {}).get("agent_prompt", "")) > 50 else agent.get("conversation_config", {}).get("agent_prompt", "AI Agent"),
                        "description": agent.get("conversation_config", {}).get("agent_prompt", "Conversational AI agent")[:100] + "..." if len(agent.get("conversation_config", {}).get("agent_prompt", "")) > 100 else agent.get("conversation_config", {}).get("agent_prompt", "Conversational AI agent")
                    }
        
        # Fallback: try to get info from a conversation
        conversations_data = make_elevenlabs_request("/v1/convai/conversations", {"agent_id": agent_id, "page_size": 1})
        
        if conversations_data and conversations_data.get("conversations"):
            # Use generic info based on agent ID pattern or first conversation
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

@analytics_bp.route('/health')
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()})

@analytics_bp.route('/conversations/<agent_id>')
@require_auth
def get_conversations(agent_id):
    """Get conversations for a specific agent"""
    # Check if the requested agent_id matches the session agent_id
    session_agent_id = session.get('agent_id')
    if agent_id != session_agent_id:
        return jsonify({"error": "Access denied. You can only view your own agent's data."}), 403
    
    params = {
        "agent_id": agent_id,
        "page_size": 100  # Reasonable limit to handle more conversations without API timeouts
    }
    
    # Get conversations from 11labs API
    conversations_data = make_elevenlabs_request("/v1/convai/conversations", params)
    
    if conversations_data is None:
        return jsonify({"error": "Failed to fetch conversations from 11labs API"}), 500
    
    # Get agent info dynamically
    agent_info = get_agent_info(agent_id)
    
    # Process and format the conversations
    conversations = []
    for conv in conversations_data.get("conversations", []):
        # Format duration properly
        duration_secs = conv.get("call_duration_secs", 0)
        duration_mins = duration_secs // 60
        duration_remaining_secs = duration_secs % 60
        duration_str = f"{duration_mins}m {duration_remaining_secs}s"
        
        # Determine status based on conversation outcome
        status = "completed" if conv.get("call_successful") == "success" else "transferred"
        
        conversation = {
            "id": conv.get("conversation_id", ""),
            "title": f"{agent_info['type']} Customer Call",
            "summary": conv.get("transcript_summary") or f"{agent_info['type']} customer interaction",
            "sentiment": "neutral",  # Default sentiment
            "status": status,
            "duration": duration_str,
            "date": datetime.fromtimestamp(conv.get("start_time_unix_secs", 0)).strftime("%Y-%m-%d"),
            "transcript": "Click 'Call Analysis' to view full transcript",
            "hasAudio": True,
            "messageCount": conv.get("message_count", len(conv.get("messages", []))),
            "callSuccessful": conv.get("call_successful", "unknown")
        }
        conversations.append(conversation)
    
    return jsonify({
        "conversations": conversations,
        "total": len(conversations),
        "agent": agent_info
    })

@analytics_bp.route('/analytics/<agent_id>')
@require_auth
def get_analytics(agent_id):
    """Get analytics data for a specific agent"""
    # Check if the requested agent_id matches the session agent_id
    session_agent_id = session.get('agent_id')
    if agent_id != session_agent_id:
        return jsonify({"error": "Access denied. You can only view your own agent's data."}), 403
    
    # Get conversations for analytics calculation
    conversations_response = get_conversations(agent_id)
    conversations_data = conversations_response.get_json()
    
    if not conversations_data or "conversations" not in conversations_data:
        return jsonify({"error": "Failed to fetch analytics data"}), 500
    
    conversations = conversations_data.get("conversations", [])
    total_conversations = len(conversations)
    agent_info = conversations_data.get("agent", {})
    
    # Calculate success rate (completed conversations)
    completed_conversations = len([c for c in conversations if c.get("status") == "completed"])
    success_rate = (completed_conversations / total_conversations * 100) if total_conversations > 0 else 0
    
    # Calculate average call duration from conversation data
    total_duration_secs = 0
    duration_count = 0
    
    # Get duration from original API data
    for conv in conversations_data.get("conversations", []):
        duration_secs = conv.get("call_duration_secs", 0)
        if duration_secs > 0:  # Only count conversations with actual duration
            total_duration_secs += duration_secs
            duration_count += 1
    
    if duration_count > 0:
        avg_duration_secs = total_duration_secs / duration_count
        avg_duration_mins = int(avg_duration_secs // 60)
        avg_duration_remaining_secs = int(avg_duration_secs % 60)
        avg_call_duration = f"{avg_duration_mins}m {avg_duration_remaining_secs}s"
    else:
        avg_call_duration = "0m 0s"
    
    # Calculate sentiment distribution
    positive_count = len([c for c in conversations if c.get("sentiment") == "positive"])
    neutral_count = len([c for c in conversations if c.get("sentiment") == "neutral"])
    negative_count = len([c for c in conversations if c.get("sentiment") == "negative"])
    
    positive_percentage = (positive_count / total_conversations * 100) if total_conversations > 0 else 0
    
    # Generate call volume data for the last 7 days based on actual conversation dates
    call_volume_data = []
    days = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"]
    
    # Count actual conversations by day
    today = datetime.now()
    daily_counts = {}
    
    for i in range(7):
        date = today - timedelta(days=6-i)
        date_str = date.strftime("%Y-%m-%d")
        daily_counts[date_str] = 0
    
    # Count conversations by date
    for conv in conversations:
        conv_date = conv.get("date", "")
        if conv_date in daily_counts:
            daily_counts[conv_date] += 1
    
    # Create chart data
    for i, day in enumerate(days):
        date = today - timedelta(days=6-i)
        date_str = date.strftime("%Y-%m-%d")
        call_volume_data.append({"day": day, "calls": daily_counts.get(date_str, 0)})
    
    return jsonify({
        "totalConversations": total_conversations,
        "avgDurationSeconds": round(avg_duration_secs, 1) if duration_count > 0 else 0,
        "avgCallDuration": avg_call_duration,  # Add formatted average call duration
        "successRate": round(success_rate, 1),
        "evaluationScore": round(success_rate * 0.8, 1),  # Temporary proxy value
        "positiveSentimentPercentage": round(positive_percentage, 1),  # Keep for any remaining references
        "sentimentDistribution": {
            "positive": positive_count,
            "neutral": neutral_count, 
            "negative": negative_count
        },
        "callVolumeData": call_volume_data,
        "agent": agent_info
    })


@analytics_bp.route('/conversation-analysis/<conversation_id>')
@require_auth
def get_conversation_analysis(conversation_id):
    """Get detailed analysis for a specific conversation"""
    
    # Get detailed conversation data from 11labs API
    conversation_data = make_elevenlabs_request(f"/v1/convai/conversations/{conversation_id}")
    
    if conversation_data is None:
        return jsonify({"error": "Failed to fetch conversation details from 11labs API"}), 500
    
    # Verify the conversation belongs to the authenticated agent
    session_agent_id = session.get('agent_id')
    conversation_agent_id = conversation_data.get('agent_id')
    
    if conversation_agent_id != session_agent_id:
        return jsonify({"error": "Access denied. You can only view your own agent's conversations."}), 403
    
    # Get agent info dynamically
    agent_info = get_agent_info(conversation_agent_id)
    
    # Format duration properly
    duration_secs = conversation_data.get("metadata", {}).get("call_duration_secs", 0)
    duration_mins = duration_secs // 60
    duration_remaining_secs = duration_secs % 60
    duration_str = f"{duration_mins}m {duration_remaining_secs}s"
    
    # Get transcript if available - parse the messages array
    transcript_text = ""
    if conversation_data.get("messages"):
        transcript_parts = []
        for message in conversation_data["messages"]:
            role = message.get("role", "unknown")
            content = message.get("message", "")
            if content:
                transcript_parts.append(f"{role.upper()}: {content}")
        transcript_text = "\n\n".join(transcript_parts)
    elif conversation_data.get("transcript"):
        transcript_text = str(conversation_data["transcript"])
    
    # Get evaluation results
    evaluation_results = []
    if conversation_data.get("evaluation_results"):
        for eval_result in conversation_data["evaluation_results"]:
            evaluation_results.append({
                "criteria": eval_result.get("criteria", "Unknown"),
                "result": eval_result.get("result", "unknown"),
                "score": eval_result.get("score", 0),
                "feedback": eval_result.get("feedback", "")
            })
    
    analysis_data = {
        "conversationId": conversation_id,
        "title": f"{agent_info['type']} Customer Call",
        "summary": conversation_data.get("analysis", {}).get("transcript_summary") or "No summary available",
        "transcript": transcript_text,
        "duration": duration_str,
        "durationSeconds": duration_secs,
        "date": datetime.fromtimestamp(conversation_data.get("metadata", {}).get("start_time_unix_secs", 0)).strftime("%Y-%m-%d %H:%M:%S") if conversation_data.get("metadata", {}).get("start_time_unix_secs") else "Unknown date",
        "status": "completed" if conversation_data.get("analysis", {}).get("call_successful") == "success" else "transferred",
        "callSuccessful": conversation_data.get("analysis", {}).get("call_successful", "unknown"),
        "messageCount": conversation_data.get("message_count", len(conversation_data.get("messages", []))),
        "agent": agent_info,
        "evaluationResults": evaluation_results,
        "audioUrl": conversation_data.get("audio_url", ""),
        "sentiment": "neutral",  # Could be enhanced with sentiment analysis
        "keyPoints": [
            "Customer interaction completed",
            f"Call duration: {duration_str}",
            f"Messages exchanged: {conversation_data.get('message_count', len(conversation_data.get('messages', [])))}"
        ]
    }
    
    return jsonify(analysis_data)

def format_transcript(conversation_data):
    """Format transcript from 11labs API response"""
    transcript_array = conversation_data.get("transcript", [])
    
    if isinstance(transcript_array, list) and len(transcript_array) > 0:
        formatted_lines = []
        for turn in transcript_array:
            role = turn.get("role", "Unknown").title()
            message = turn.get("message", "")
            if message:
                formatted_lines.append(f"{role}: {message}")
        
        if formatted_lines:
            return "\n\n".join(formatted_lines)
    
    # Fallback to transcript summary if available
    return conversation_data.get("transcript_summary", "No transcript available")

@analytics_bp.route('/conversation-transcript/<conversation_id>')
@require_auth
def get_conversation_transcript(conversation_id):
    """Get transcript for a specific conversation"""
    
    # Get detailed conversation data from 11labs API
    conversation_data = make_elevenlabs_request(f"/v1/convai/conversations/{conversation_id}")
    
    if conversation_data is None:
        return jsonify({"error": "Failed to fetch conversation transcript from 11labs API"}), 500
    
    # Verify the conversation belongs to the authenticated agent
    session_agent_id = session.get('agent_id')
    conversation_agent_id = conversation_data.get('agent_id')
    
    if conversation_agent_id != session_agent_id:
        return jsonify({"error": "Access denied. You can only view your own agent's conversations."}), 403
    
    # Format the transcript properly
    transcript_text = format_transcript(conversation_data)
    
    # Format duration properly using correct metadata path
    duration_secs = conversation_data.get("metadata", {}).get("call_duration_secs", 0)
    duration_mins = duration_secs // 60
    duration_remaining_secs = duration_secs % 60
    duration_str = f"{duration_mins}m {duration_remaining_secs}s"
    
    return jsonify({
        "conversationId": conversation_id,
        "transcript": transcript_text,
        "messageCount": conversation_data.get("message_count", len(conversation_data.get("messages", []))),
        "duration": duration_str
    })

@analytics_bp.route('/conversation-data-analysis/<conversation_id>')
@require_auth
def get_conversation_data_analysis(conversation_id):
    """Get detailed data collection analysis for a specific conversation"""
    
    # Get detailed conversation data from 11labs API
    conversation_data = make_elevenlabs_request(f"/v1/convai/conversations/{conversation_id}")
    
    if conversation_data is None:
        return jsonify({"error": "Failed to fetch conversation data from 11labs API"}), 500
    
    # Verify the conversation belongs to the authenticated agent
    session_agent_id = session.get('agent_id')
    conversation_agent_id = conversation_data.get('agent_id')
    
    if conversation_agent_id != session_agent_id:
        return jsonify({"error": "Access denied. You can only view your own agent's conversations."}), 403
    
    # Get agent info dynamically
    agent_info = get_agent_info(conversation_agent_id)
    
    # Format duration properly
    duration_secs = conversation_data.get("metadata", {}).get("call_duration_secs", 0)
    duration_mins = duration_secs // 60
    duration_remaining_secs = duration_secs % 60
    duration_str = f"{duration_mins}m {duration_remaining_secs}s"
    
    # Extract data collection results
    data_collection_results = {}
    if conversation_data.get("analysis", {}).get("data_collection_results"):
        for data_id, data_result in conversation_data["analysis"]["data_collection_results"].items():
            data_collection_results[data_id] = {
                "data_collection_id": data_result.get("data_collection_id", data_id),
                "rationale": data_result.get("rationale", "No rationale provided"),
                "value": data_result.get("value", "No value provided")
            }
    
    # Extract evaluation criteria results
    evaluation_criteria_results = {}
    if conversation_data.get("analysis", {}).get("evaluation_criteria_results"):
        for criteria_id, criteria_result in conversation_data["analysis"]["evaluation_criteria_results"].items():
            evaluation_criteria_results[criteria_id] = {
                "criteria_id": criteria_result.get("criteria_id", criteria_id),
                "result": criteria_result.get("result", "unknown"),
                "rationale": criteria_result.get("rationale", "No rationale provided")
            }
    
    # Get transcript summary
    transcript_summary = conversation_data.get("analysis", {}).get("transcript_summary", "No summary available")
    
    # Extract specific data points based on common collection criteria
    call_summary = ""
    call_conclusion = ""
    caller_interest_rating = ""
    
    # Look for specific data collection IDs or patterns
    for data_id, data_result in data_collection_results.items():
        value = data_result.get("value", "")
        rationale = data_result.get("rationale", "")
        
        # Check for Call Summary patterns
        if "summary" in data_id.lower() or "call summary" in str(value).lower():
            call_summary = value or rationale
        
        # Check for Call Conclusion patterns
        elif "conclusion" in data_id.lower() or "end result" in str(value).lower():
            call_conclusion = value or rationale
        
        # Check for Interest Rating patterns
        elif "interest" in data_id.lower() or "rating" in data_id.lower():
            caller_interest_rating = value or rationale
    
    analysis_data = {
        "conversationId": conversation_id,
        "title": f"{agent_info['type']} - Detailed Data Analysis",
        "agent": agent_info,
        "duration": duration_str,
        "date": datetime.fromtimestamp(conversation_data.get("metadata", {}).get("start_time_unix_secs", 0)).strftime("%Y-%m-%d %H:%M:%S") if conversation_data.get("metadata", {}).get("start_time_unix_secs") else "Unknown date",
        "status": "completed" if conversation_data.get("analysis", {}).get("call_successful") == "success" else "transferred",
        "messageCount": conversation_data.get("message_count", len(conversation_data.get("messages", []))),
        
        # Main data collection insights
        "transcriptSummary": transcript_summary,
        "callSummary": call_summary or "No call summary available",
        "callConclusion": call_conclusion or "No call conclusion available", 
        "callerInterestRating": caller_interest_rating or "No interest rating available",
        
        # Raw data collection results
        "dataCollectionResults": data_collection_results,
        "evaluationCriteriaResults": evaluation_criteria_results,
        
        # Additional metadata
        "callSuccessful": conversation_data.get("analysis", {}).get("call_successful", "unknown"),
        "hasDataCollection": len(data_collection_results) > 0,
        "hasEvaluationCriteria": len(evaluation_criteria_results) > 0
    }
    
    return jsonify(analysis_data)

@analytics_bp.route('/conversation-audio/<conversation_id>')
@require_auth
def get_conversation_audio(conversation_id):
    """Get audio URL for a specific conversation"""
    
    # Get detailed conversation data from 11labs API
    conversation_data = make_elevenlabs_request(f"/v1/convai/conversations/{conversation_id}")
    
    if conversation_data is None:
        return jsonify({"error": "Failed to fetch conversation audio from 11labs API"}), 500
    
    # Verify the conversation belongs to the authenticated agent
    session_agent_id = session.get('agent_id')
    conversation_agent_id = conversation_data.get('agent_id')
    
    if conversation_agent_id != session_agent_id:
        return jsonify({"error": "Access denied. You can only view your own agent's conversations."}), 403
    
    audio_url = conversation_data.get("audio_url", "")
    
    if not audio_url:
        return jsonify({"error": "No audio available for this conversation"}), 404
    
    # Format duration properly using correct metadata path
    duration_secs = conversation_data.get("metadata", {}).get("call_duration_secs", 0)
    duration_mins = duration_secs // 60
    duration_remaining_secs = duration_secs % 60
    duration_str = f"{duration_mins}m {duration_remaining_secs}s"
    
    return jsonify({
        "conversationId": conversation_id,
        "audioUrl": audio_url,
        "duration": duration_str
    })

@analytics_bp.route('/conversation-tools-used/<conversation_id>')
@require_auth
def get_conversation_tools_used(conversation_id):
    """Get tools used data for a specific conversation"""
    
    # Get detailed conversation data from 11labs API
    conversation_data = make_elevenlabs_request(f"/v1/convai/conversations/{conversation_id}")
    
    if conversation_data is None:
        return jsonify({"error": "Failed to fetch conversation data from 11labs API"}), 500
    
    # Verify the conversation belongs to the authenticated agent
    session_agent_id = session.get('agent_id')
    conversation_agent_id = conversation_data.get('agent_id')
    
    if conversation_agent_id != session_agent_id:
        return jsonify({"error": "Access denied. You can only view your own agent's conversations."}), 403
    
    # Get agent info
    agent_info = get_agent_info(conversation_agent_id)
    
    # Extract call duration and message count from correct locations
    # Fix: Use metadata.call_duration_secs instead of call_duration_secs
    duration_secs = conversation_data.get("metadata", {}).get("call_duration_secs", 0)
    # Fix: Use len(transcript) instead of message_count
    transcript = conversation_data.get("transcript", [])
    message_count = len(transcript)
    
    # Extract tools used from conversation data
    tools_used = []
    
    # Debug: Print the full structure to understand the actual API response
    print(f"DEBUG: Full conversation data keys: {list(conversation_data.keys())}")
    print(f"DEBUG: Metadata keys: {list(conversation_data.get('metadata', {}).keys())}")
    if conversation_data.get('analysis'):
        print(f"DEBUG: Analysis keys: {list(conversation_data.get('analysis', {}).keys())}")
    
    # Debug: Print transcript structure
    print(f"DEBUG: Processing {len(transcript)} transcript entries for tools...")
    if transcript:
        print(f"DEBUG: First transcript entry keys: {list(transcript[0].keys())}")
        # Print all keys of transcript entries to see the full structure
        for i, entry in enumerate(transcript[:3]):  # Check first 3 entries
            print(f"DEBUG: Transcript entry {i} keys: {list(entry.keys())}")
    
    # Check for any fields containing "tool" in the name at conversation level
    tool_related_fields = [key for key in conversation_data.keys() if 'tool' in key.lower()]
    if tool_related_fields:
        print(f"DEBUG: Found tool-related fields at conversation level: {tool_related_fields}")
        for field in tool_related_fields:
            print(f"DEBUG: {field} content: {conversation_data[field]}")
    
    # Check for tool-related fields in analysis
    if conversation_data.get('analysis'):
        analysis_tool_fields = [key for key in conversation_data['analysis'].keys() if 'tool' in key.lower()]
        if analysis_tool_fields:
            print(f"DEBUG: Found tool-related fields in analysis: {analysis_tool_fields}")
            for field in analysis_tool_fields:
                print(f"DEBUG: analysis.{field} content: {conversation_data['analysis'][field]}")
    
    # Primary method: Extract from tool_calls and tool_results fields in transcript
    # Based on debugging, we found tools are stored in 'tool_calls' and 'tool_results' fields
    
    for entry in transcript:
        # Extract from tool_calls field
        tool_calls = entry.get('tool_calls', [])
        if tool_calls and isinstance(tool_calls, list):
            for tool_call in tool_calls:
                if isinstance(tool_call, dict):
                    # Extract tool name from various possible structures
                    tool_name = (
                        tool_call.get('name') or 
                        tool_call.get('function', {}).get('name') or 
                        tool_call.get('tool_name') or
                        tool_call.get('function_name')
                    )
                    
                    if tool_name:
                        print(f"DEBUG: Found tool in tool_calls: {tool_name}")
                        tools_used.append({
                            "name": tool_name,
                            "result": tool_call.get('result', ''),
                            "description": tool_call.get('description', '') or tool_call.get('function', {}).get('description', '')
                        })
        
        # Extract from tool_results field
        tool_results = entry.get('tool_results', [])
        if tool_results and isinstance(tool_results, list):
            for tool_result in tool_results:
                if isinstance(tool_result, dict):
                    # Extract tool name and result
                    tool_name = (
                        tool_result.get('name') or 
                        tool_result.get('tool_name') or
                        tool_result.get('function_name')
                    )
                    
                    if tool_name:
                        print(f"DEBUG: Found tool in tool_results: {tool_name}")
                        tools_used.append({
                            "name": tool_name,
                            "result": tool_result.get('result', '') or tool_result.get('output', ''),
                            "description": tool_result.get('description', '')
                        })
    
    # Secondary method: Check in analysis object
    if not tools_used and conversation_data.get("analysis"):
        analysis = conversation_data["analysis"]
        
        # Check for tools in various analysis fields
        if analysis.get("tools_used"):
            tools_data = analysis["tools_used"]
            if isinstance(tools_data, list):
                tools_used = [{"name": str(tool), "result": "", "description": ""} for tool in tools_data]
            elif isinstance(tools_data, dict):
                tools_used = [{"name": k, "result": str(v), "description": ""} for k, v in tools_data.items()]
    
    # Remove duplicates by tool name
    seen_tools = set()
    unique_tools = []
    for tool in tools_used:
        tool_name = tool.get('name', '')
        if tool_name and tool_name not in seen_tools:
            seen_tools.add(tool_name)
            unique_tools.append(tool)
    
    tools_used = unique_tools
    
    print(f"DEBUG: Final tools found: {len(tools_used)} - {[tool.get('name') for tool in tools_used]}")
    
    # Format duration properly
    duration_mins = duration_secs // 60
    duration_remaining_secs = duration_secs % 60
    duration_str = f"{duration_mins}m {duration_remaining_secs}s"
    
    # Get proper date from metadata
    start_time = conversation_data.get("metadata", {}).get("start_time_unix_secs")
    if start_time:
        date_str = datetime.fromtimestamp(start_time).isoformat()
    else:
        date_str = datetime.now().isoformat()
    
    # Format the response
    return jsonify({
        "conversationId": conversation_id,
        "title": f"Tools Used - {agent_info['name']}",
        "status": "successful" if conversation_data.get("analysis", {}).get("call_successful") == "success" else "completed",
        "duration": duration_str,
        "duration_secs": duration_secs,
        "date": date_str,
        "messageCount": message_count,
        "agent": agent_info,
        "toolsUsed": tools_used
    })

@analytics_bp.route('/debug-conversation/<conversation_id>')
@require_auth  
def debug_conversation_structure(conversation_id):
    """Debug endpoint to show raw conversation data structure"""
    # Get detailed conversation data from 11labs API
    conversation_data = make_elevenlabs_request(f"/v1/convai/conversations/{conversation_id}")
    
    if conversation_data is None:
        return jsonify({"error": "Failed to fetch conversation data from 11labs API"}), 500
    
    # Return the raw structure for debugging
    return jsonify({
        "conversation_keys": list(conversation_data.keys()),
        "metadata_keys": list(conversation_data.get('metadata', {}).keys()) if conversation_data.get('metadata') else [],
        "analysis_keys": list(conversation_data.get('analysis', {}).keys()) if conversation_data.get('analysis') else [],
        "transcript_count": len(conversation_data.get('transcript', [])),
        "first_transcript_keys": list(conversation_data.get('transcript', [{}])[0].keys()) if conversation_data.get('transcript') else [],
        "tool_related_fields": [key for key in conversation_data.keys() if 'tool' in key.lower()],
        "analysis_tool_fields": [key for key in conversation_data.get('analysis', {}).keys() if 'tool' in key.lower()] if conversation_data.get('analysis') else [],
        "sample_transcript_entry": conversation_data.get('transcript', [{}])[0] if conversation_data.get('transcript') else {}
    })

@analytics_bp.route('/session')
@require_auth
def get_session():
    """Get current session information"""
    agent_id = session.get('agent_id')
    if not agent_id:
        return jsonify({"authenticated": False}), 401
    
    # Get agent info dynamically
    agent_info = get_agent_info(agent_id)
    
    return jsonify({
        "authenticated": True,
        "agentId": agent_id,
        "agentName": agent_info["name"],
        "agentType": agent_info["type"],
        "agentDescription": agent_info["description"]
    })



@analytics_bp.route('/analytics/time-based/<period>')
@require_auth
def get_time_based_analytics(period):
    """Get time-based analytics data for dashboard charts and metrics"""
    
    # Validate period parameter
    valid_periods = ['today', '7days', '30days']
    if period not in valid_periods:
        return jsonify({"error": "Invalid period. Must be one of: today, 7days, 30days"}), 400
    
    # Get agent ID from session
    agent_id = session.get('agent_id')
    if not agent_id:
        return jsonify({"error": "Authentication required"}), 401
    
    try:
        # Get conversations data from 11labs API using the same method as working conversations endpoint
        params = {
            "agent_id": agent_id,
            "page_size": 100  # Reasonable limit to handle more conversations without API timeouts
        }
        conversations_data = make_elevenlabs_request("/v1/convai/conversations", params)
        
        if conversations_data is None:
            return jsonify({"error": "Failed to fetch conversations from 11labs API"}), 500
        
        conversations = conversations_data.get("conversations", [])
        print(f"DEBUG: Total conversations from API: {len(conversations)}")
        
        # Calculate date range based on period
        now = datetime.now()
        if period == 'today':
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            previous_start = start_date - timedelta(days=1)
            previous_end = start_date
        elif period == '7days':
            start_date = now - timedelta(days=7)
            previous_start = start_date - timedelta(days=7)
            previous_end = start_date
        else:  # 30days
            start_date = now - timedelta(days=30)
            previous_start = start_date - timedelta(days=30)
            previous_end = start_date
        
        print(f"DEBUG: Period: {period}")
        print(f"DEBUG: Now: {now}")
        print(f"DEBUG: Start date: {start_date}")
        
        # Filter conversations for current period
        current_conversations = []
        previous_conversations = []
        
        for conv in conversations:
            # Use the same timestamp processing as the working conversations endpoint
            timestamp = conv.get("start_time_unix_secs", 0)
            try:
                conv_time = datetime.fromtimestamp(timestamp)
                print(f"DEBUG: Conversation timestamp {timestamp} -> {conv_time}, >= {start_date}? {conv_time >= start_date}")
            except (ValueError, OSError):
                print(f"DEBUG: Invalid timestamp: {timestamp}")
                # Skip conversations with invalid timestamps
                continue
            
            if conv_time >= start_date:
                current_conversations.append(conv)
                print(f"DEBUG: Added to current: {conv_time}")
            elif conv_time >= previous_start and conv_time < previous_end:
                previous_conversations.append(conv)
        
        # Calculate metrics
        current_metrics = calculate_period_metrics(current_conversations)
        previous_metrics = calculate_period_metrics(previous_conversations)
        
        # Calculate percentage changes
        metrics_with_changes = calculate_metric_changes(current_metrics, previous_metrics)
        
        # Generate chart data
        chart_data = generate_chart_data(current_conversations, period)
        
        return jsonify({
            "period": period,
            "metrics": metrics_with_changes,
            "charts": chart_data,
            "conversation_count": len(current_conversations),
            "previous_conversation_count": len(previous_conversations)
        })
        
    except Exception as e:
        print(f"Error in time-based analytics: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

def calculate_period_metrics(conversations):
    """Calculate metrics for a given set of conversations"""
    if not conversations:
        return {
            "totalCalls": 0,
            "successRate": 0,
            "avgDuration": "0m 0s",
            "evaluationScore": 0
        }
    
    total_calls = len(conversations)
    successful_calls = 0
    total_duration = 0
    
    for conv in conversations:
        # Count successful calls
        if conv.get("call_successful") == "success":
            successful_calls += 1
        
        # Sum durations
        duration = conv.get("call_duration_secs", 0)
        total_duration += duration
        
    # Calculate averages
    success_rate = (successful_calls / total_calls) * 100 if total_calls > 0 else 0
    avg_duration_secs = total_duration / total_calls if total_calls > 0 else 0
    avg_duration_mins = int(avg_duration_secs // 60)
    avg_duration_remaining = int(avg_duration_secs % 60)
    avg_duration_str = f"{avg_duration_mins}m {avg_duration_remaining}s"
    
    # Calculate evaluation score (simplified - use success rate as proxy)
    avg_eval_score = round(success_rate * 0.8, 1)
    
    return {
        "totalCalls": total_calls,
        "successRate": round(success_rate, 1),
        "avgDuration": avg_duration_str,
        "evaluationScore": avg_eval_score
    }

def calculate_metric_changes(current, previous):
    """Calculate percentage changes between current and previous metrics"""
    def safe_percentage_change(current_val, previous_val):
        if previous_val == 0:
            return 100 if current_val > 0 else 0
        return round(((current_val - previous_val) / previous_val) * 100, 1)
    
    current["totalCallsChange"] = safe_percentage_change(current["totalCalls"], previous["totalCalls"])
    current["successRateChange"] = safe_percentage_change(current["successRate"], previous["successRate"])
    current["evaluationScoreChange"] = safe_percentage_change(current["evaluationScore"], previous["evaluationScore"])
    
    # Duration change is a bit different - we want shorter to be positive
    current_duration_secs = parse_duration_to_seconds(current["avgDuration"])
    previous_duration_secs = parse_duration_to_seconds(previous["avgDuration"])
    duration_change = safe_percentage_change(previous_duration_secs, current_duration_secs)  # Reversed for positive = shorter
    current["avgDurationChange"] = duration_change
    
    return current

def parse_duration_to_seconds(duration_str):
    """Parse duration string like '5m 30s' to total seconds"""
    try:
        parts = duration_str.split()
        minutes = int(parts[0].replace('m', '')) if len(parts) > 0 else 0
        seconds = int(parts[1].replace('s', '')) if len(parts) > 1 else 0
        return minutes * 60 + seconds
    except:
        return 0

def generate_chart_data(conversations, period):
    """Generate data for various charts"""
    
    # Performance trend data
    performance_trend = generate_performance_trend_data(conversations, period)
    
    # Call success rate trend data (replacing caller interest rating)
    call_success_rate_trend = generate_call_success_rate_trend_data(conversations)
    
    # Duration distribution data
    duration_distribution = generate_duration_distribution_data(conversations)
    
    # Call outcomes data
    call_outcomes = generate_call_outcomes_data(conversations)
    
    return {
        "performanceTrend": performance_trend,
        "callSuccessRateTrend": call_success_rate_trend,
        "durationDistribution": duration_distribution,
        "callOutcomes": call_outcomes
    }

def generate_performance_trend_data(conversations, period):
    """Generate performance trend chart data"""
    if period == 'today':
        # Hourly data for today
        labels = [f"{i:02d}:00" for i in range(24)]
        success_rates = [0] * 24
        call_volumes = [0] * 24
        
        for conv in conversations:
            hour = datetime.fromtimestamp(conv.get("start_time_unix_secs", 0)).hour
            call_volumes[hour] += 1
            if conv.get("call_successful") == "success":
                success_rates[hour] += 1
        
        # Convert to percentages
        for i in range(24):
            if call_volumes[i] > 0:
                success_rates[i] = (success_rates[i] / call_volumes[i]) * 100
    
    elif period == '7days':
        # Daily data for last 7 days
        labels = []
        success_rates = []
        call_volumes = []
        
        for i in range(7):
            date = datetime.now() - timedelta(days=6-i)
            labels.append(date.strftime("%a"))
            
            day_conversations = [c for c in conversations 
                               if datetime.fromtimestamp(c.get("start_time_unix_secs", 0)).date() == date.date()]
            
            call_volumes.append(len(day_conversations))
            
            if day_conversations:
                successful = sum(1 for c in day_conversations if c.get("call_successful") == "success")
                success_rates.append((successful / len(day_conversations)) * 100)
            else:
                success_rates.append(0)
    
    else:  # 30days
        # Weekly data for last 30 days
        labels = []
        success_rates = []
        call_volumes = []
        
        for i in range(4):
            week_start = datetime.now() - timedelta(days=28-i*7)
            week_end = week_start + timedelta(days=7)
            labels.append(f"Week {i+1}")
            
            week_conversations = [c for c in conversations 
                                if week_start <= datetime.fromtimestamp(c.get("start_time_unix_secs", 0)) < week_end]
            
            call_volumes.append(len(week_conversations))
            
            if week_conversations:
                successful = sum(1 for c in week_conversations if c.get("call_successful") == "success")
                success_rates.append((successful / len(week_conversations)) * 100)
            else:
                success_rates.append(0)
    
    return {
        "labels": labels,
        "successRate": success_rates,
        "callVolume": call_volumes
    }

def generate_call_success_rate_trend_data(conversations):
    """Generate call success rate trend chart data"""
    if not conversations:
        return {
            "type": "line",
            "data": [],
            "overall_success_rate": 0,
            "total_calls": 0
        }
    
    # Group conversations by date and calculate success rate for each day
    daily_data = {}
    
    for conv in conversations:
        # Get the call date
        timestamp = conv.get("metadata", {}).get("start_time_unix_secs") or conv.get("start_time_unix_secs", 0)
        if timestamp:
            date_str = datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d")
        else:
            continue
        
        # Initialize day data if not exists
        if date_str not in daily_data:
            daily_data[date_str] = {"successful": 0, "total": 0}
        
        # Count total calls for this day
        daily_data[date_str]["total"] += 1
        
        # Check if call was successful
        call_successful = conv.get("analysis", {}).get("call_successful") or conv.get("call_successful")
        if call_successful == "success":
            daily_data[date_str]["successful"] += 1
    
    # Convert to chart data format
    chart_data = []
    total_successful = 0
    total_calls = 0
    
    # Sort dates and create data points
    sorted_dates = sorted(daily_data.keys())
    
    for date_str in sorted_dates:
        day_data = daily_data[date_str]
        success_rate = (day_data["successful"] / day_data["total"]) * 100 if day_data["total"] > 0 else 0
        
        # Format date for display (e.g., "Jan 15")
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        display_date = date_obj.strftime("%b %d")
        
        chart_data.append({
            "date": display_date,
            "success_rate": round(success_rate, 1),
            "successful_calls": day_data["successful"],
            "total_calls": day_data["total"]
        })
        
        total_successful += day_data["successful"]
        total_calls += day_data["total"]
    
    # Calculate overall success rate
    overall_success_rate = (total_successful / total_calls) * 100 if total_calls > 0 else 0
    
    return {
        "type": "line",
        "data": chart_data,
        "overall_success_rate": round(overall_success_rate, 1),
        "total_calls": total_calls,
        "successful_calls": total_successful
    }

def generate_duration_distribution_data(conversations):
    """Generate call duration distribution chart data"""
    duration_buckets = {
        "0-2 min": 0,
        "2-5 min": 0,
        "5-10 min": 0,
        "10-15 min": 0,
        "15+ min": 0
    }
    
    for conv in conversations:
        # Fix: Use the correct field path for call duration
        duration_secs = conv.get("call_duration_secs", 0)
        duration_mins = duration_secs / 60
        
        if duration_mins < 2:
            duration_buckets["0-2 min"] += 1
        elif duration_mins < 5:
            duration_buckets["2-5 min"] += 1
        elif duration_mins < 10:
            duration_buckets["5-10 min"] += 1
        elif duration_mins < 15:
            duration_buckets["10-15 min"] += 1
        else:
            duration_buckets["15+ min"] += 1
    
    return {
        "labels": list(duration_buckets.keys()),
        "counts": list(duration_buckets.values())
    }

def generate_call_outcomes_data(conversations):
    """Generate call outcomes pie chart data"""
    outcomes = {"Successful": 0, "Failed": 0, "Unknown": 0}
    
    for conv in conversations:
        call_result = conv.get("call_successful", "unknown")
        if call_result == "success":
            outcomes["Successful"] += 1
        elif call_result == "failure":
            outcomes["Failed"] += 1
        else:
            outcomes["Unknown"] += 1
    
    return {
        "labels": list(outcomes.keys()),
        "values": list(outcomes.values())
    }


def generate_insights_data(conversations, period, metrics):
    """Generate insights, benchmarks, and recommendations"""
    
    insights = generate_trend_insights(conversations, period, metrics)
    benchmarks = generate_performance_benchmarks(conversations, metrics)
    recommendations = generate_recommendations(conversations, metrics)
    top_conversations = generate_top_conversations(conversations)
    
    return {
        "insights": insights,
        "benchmarks": benchmarks,
        "recommendations": recommendations,
        "topConversations": top_conversations
    }

def generate_trend_insights(conversations, period, metrics):
    """Generate trend analysis insights"""
    insights = []
    
    # Success rate trend
    if metrics.get("successRateChange", 0) > 0:
        insights.append({
            "icon": "📈",
            "title": "Success Rate Improving",
            "description": f"Your agent's success rate has increased by {metrics['successRateChange']}% compared to the previous {period}",
            "value": f"+{metrics['successRateChange']}%",
            "trend": "positive"
        })
    elif metrics.get("successRateChange", 0) < -5:
        insights.append({
            "icon": "📉",
            "title": "Success Rate Declining",
            "description": f"Success rate has decreased by {abs(metrics['successRateChange'])}% - consider reviewing recent conversations",
            "value": f"{metrics['successRateChange']}%",
            "trend": "negative"
        })
    
    # Call volume trend
    if metrics.get("totalCallsChange", 0) > 20:
        insights.append({
            "icon": "📞",
            "title": "High Call Volume",
            "description": f"Call volume increased by {metrics['totalCallsChange']}% - your agent is getting more engagement",
            "value": f"+{metrics['totalCallsChange']}%",
            "trend": "positive"
        })
    
    # Duration efficiency
    if metrics.get("avgDurationChange", 0) > 0:
        insights.append({
            "icon": "⚡",
            "title": "Improved Efficiency",
            "description": "Average call duration has decreased while maintaining quality",
            "value": f"Faster by {metrics['avgDurationChange']}%",
            "trend": "positive"
        })
    
    # Evaluation score trend
    if metrics.get("evaluationScoreChange", 0) > 5:
        insights.append({
            "icon": "🎯",
            "title": "Quality Improving",
            "description": f"Evaluation score improved by {metrics['evaluationScoreChange']}%",
            "value": f"+{metrics['evaluationScoreChange']}%",
            "trend": "positive"
        })
    
    # If no significant trends, add general insights
    if not insights:
        insights.append({
            "icon": "📊",
            "title": "Stable Performance",
            "description": "Your agent is maintaining consistent performance across all metrics",
            "value": "Steady",
            "trend": "neutral"
        })
    
    return insights

def generate_performance_benchmarks(conversations, metrics):
    """Generate performance benchmark comparisons"""
    benchmarks = []
    
    # Success rate benchmark
    success_rate = metrics.get("successRate", 0)
    benchmarks.append({
        "metric": "Success Rate",
        "value": f"{success_rate}%",
        "percentage": min(success_rate, 100),
        "period": "Current Period",
        "comparison": f"{'Above' if success_rate > 80 else 'Below' if success_rate < 60 else 'At'} industry average"
    })
    
    # Evaluation score benchmark
    eval_score = metrics.get("evaluationScore", 0)
    benchmarks.append({
        "metric": "Evaluation Score",
        "value": f"{eval_score}%",
        "percentage": min(eval_score, 100),
        "period": "Current Period",
        "comparison": f"{'Excellent' if eval_score > 90 else 'Good' if eval_score > 75 else 'Needs improvement'} performance"
    })
    
    # Call volume benchmark
    total_calls = metrics.get("totalCalls", 0)
    volume_score = min((total_calls / 200) * 100, 100)  # Assuming 200 calls is good volume for high-traffic agents
    benchmarks.append({
        "metric": "Call Volume",
        "value": f"{total_calls} calls",
        "percentage": volume_score,
        "period": "Current Period",
        "comparison": f"{'High' if total_calls > 30 else 'Moderate' if total_calls > 10 else 'Low'} activity level"
    })
    
    return benchmarks

def generate_recommendations(conversations, metrics):
    """Generate actionable recommendations"""
    recommendations = []
    
    success_rate = metrics.get("successRate", 0)
    eval_score = metrics.get("evaluationScore", 0)
    total_calls = metrics.get("totalCalls", 0)
    
    # Success rate recommendations
    if success_rate < 70:
        recommendations.append({
            "icon": "🎯",
            "title": "Improve Success Rate",
            "description": "Focus on conversation flow optimization and response accuracy",
            "impact": "High Impact"
        })
    
    # Evaluation criteria recommendations
    if eval_score < 80:
        recommendations.append({
            "icon": "📋",
            "title": "Enhance Evaluation Criteria",
            "description": "Review and improve performance on specific evaluation metrics",
            "impact": "Medium Impact"
        })
    
    # Call volume recommendations
    if total_calls < 10:
        recommendations.append({
            "icon": "📢",
            "title": "Increase Visibility",
            "description": "Consider promoting your agent to increase call volume and engagement",
            "impact": "Growth Opportunity"
        })
    
    # General optimization
    if success_rate > 80 and eval_score > 85:
        recommendations.append({
            "icon": "🚀",
            "title": "Scale Performance",
            "description": "Your agent is performing well - consider expanding to handle more complex scenarios",
            "impact": "Expansion Ready"
        })
    
    # If no specific recommendations, add general ones
    if not recommendations:
        recommendations.extend([
            {
                "icon": "📈",
                "title": "Monitor Trends",
                "description": "Continue tracking performance metrics to identify optimization opportunities",
                "impact": "Maintenance"
            },
            {
                "icon": "🔍",
                "title": "Analyze Conversations",
                "description": "Review individual conversations to identify patterns and improvement areas",
                "impact": "Insight Generation"
            }
        ])
    
    return recommendations

def generate_top_conversations(conversations):
    """Generate list of top performing conversations"""
    if not conversations:
        return []
    
    # Score conversations based on multiple factors
    scored_conversations = []
    
    for conv in conversations:
        score = 0
        
        # Success factor
        if conv.get("analysis", {}).get("call_successful") == "success":
            score += 40
        
        # Evaluation criteria factor
        eval_results = conv.get("analysis", {}).get("evaluation_criteria_results", {})
        if eval_results:
            passed_criteria = sum(1 for result in eval_results.values() if result.get("result") == "pass")
            total_criteria = len(eval_results)
            if total_criteria > 0:
                eval_percentage = (passed_criteria / total_criteria) * 100
                score += eval_percentage * 0.4
        
        # Duration factor (shorter is better for efficiency)
        duration = conv.get("metadata", {}).get("call_duration_secs", 0)
        if duration > 0:
            # Optimal duration is around 300 seconds (5 minutes)
            duration_score = max(0, 100 - abs(duration - 300) / 10)
            score += duration_score * 0.2
        
        scored_conversations.append({
            "conversation": conv,
            "score": score
        })
    
    # Sort by score and take top 5
    top_conversations = sorted(scored_conversations, key=lambda x: x["score"], reverse=True)[:5]
    
    # Format for frontend
    formatted_conversations = []
    for item in top_conversations:
        conv = item["conversation"]
        
        # Calculate success rate for this conversation
        eval_results = conv.get("analysis", {}).get("evaluation_criteria_results", {})
        success_rate = 0
        if eval_results:
            passed = sum(1 for result in eval_results.values() if result.get("result") == "pass")
            total = len(eval_results)
            success_rate = round((passed / total) * 100) if total > 0 else 0
        
        # Format duration
        duration_secs = conv.get("metadata", {}).get("call_duration_secs", 0)
        duration_mins = duration_secs // 60
        duration_remaining = duration_secs % 60
        duration_str = f"{duration_mins}m {duration_remaining}s"
        
        # Get message count
        message_count = conv.get("message_count", len(conv.get("messages", [])))
        
        # Format date
        timestamp = conv.get("metadata", {}).get("start_time_unix_secs", 0)
        date_str = datetime.fromtimestamp(timestamp).strftime("%m/%d %H:%M") if timestamp else "Unknown"
        
        # Get title or create one
        title = conv.get("analysis", {}).get("call_summary_title", "Conversational AI Customer Call")
        
        # Get summary
        summary = conv.get("analysis", {}).get("transcript_summary", "No summary available")
        if len(summary) > 100:
            summary = summary[:100] + "..."
        
        formatted_conversations.append({
            "id": conv.get("conversation_id", ""),
            "title": title,
            "summary": summary,
            "date": date_str,
            "duration": duration_str,
            "messages": message_count,
            "successRate": success_rate
        })
    
    return formatted_conversations

# Update the main time-based analytics function to include insights
def get_time_based_analytics_with_insights(period):
    """Enhanced version that includes insights data"""
    
    # Get agent ID from session
    agent_id = session.get('agent_id')
    if not agent_id:
        return jsonify({"error": "Authentication required"}), 401
    
    try:
        # Get conversations data from 11labs API
        conversations_data = make_elevenlabs_request(f"/v1/convai/conversations?agent_id={agent_id}")
        
        if conversations_data is None:
            return jsonify({"error": "Failed to fetch conversations from 11labs API"}), 500
        
        conversations = conversations_data.get("conversations", [])
        
        # Calculate date range based on period
        now = datetime.now()
        if period == 'today':
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            previous_start = start_date - timedelta(days=1)
            previous_end = start_date
        elif period == '7days':
            start_date = now - timedelta(days=7)
            previous_start = start_date - timedelta(days=7)
            previous_end = start_date
        else:  # 30days
            start_date = now - timedelta(days=30)
            previous_start = start_date - timedelta(days=30)
            previous_end = start_date
        
        # Filter conversations for current period
        current_conversations = []
        previous_conversations = []
        
        for conv in conversations:
            # Parse date from the actual date field (format: "2025-08-02")
            date_str = conv.get("date", "1970-01-01")
            try:
                conv_time = datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                # Skip conversations with invalid dates
                continue
            
            if conv_time >= start_date:
                current_conversations.append(conv)
            elif conv_time >= previous_start and conv_time < previous_end:
                previous_conversations.append(conv)
        
        # Calculate metrics
        current_metrics = calculate_period_metrics(current_conversations)
        previous_metrics = calculate_period_metrics(previous_conversations)
        
        # Calculate percentage changes
        metrics_with_changes = calculate_metric_changes(current_metrics, previous_metrics)
        
        # Generate chart data
        chart_data = generate_chart_data(current_conversations, period)
        
        # Generate insights data
        insights_data = generate_insights_data(current_conversations, period, metrics_with_changes)
        
        return jsonify({
            "period": period,
            "metrics": metrics_with_changes,
            "charts": chart_data,
            "insights": insights_data,
            "conversation_count": len(current_conversations),
            "previous_conversation_count": len(previous_conversations)
        })
        
    except Exception as e:
        print(f"Error in time-based analytics: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500



