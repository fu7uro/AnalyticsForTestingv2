// Futuro Analytics Dashboard - Complete JavaScript Implementation
// Methodically structured for perfect integration

class FuturoAnalytics {
    constructor() {
        this.currentAgent = null;
        this.sessionAgent = null;
        this.init();
    }

    async init() {
        // Check authentication status
        await this.checkSession();
        
        // If authenticated, auto-load the session agent's dashboard
        if (this.sessionAgent) {
            this.loadAgentDashboard();
        } else {
            // Redirect to login if not authenticated
            window.location.href = '/login';
        }
    }

    async checkSession() {
        try {
            const response = await fetch('/session');
            const data = await response.json();
            
            if (data.authenticated) {
                this.sessionAgent = data;
                this.currentAgent = {
                    id: data.agentId,
                    name: data.agentName,
                    type: data.agentType,
                    description: data.agentDescription
                };
            } else {
                window.location.href = '/login';
            }
        } catch (error) {
            console.error('Session check failed:', error);
            window.location.href = '/login';
        }
    }

    async loadAgentDashboard() {
        if (!this.currentAgent) return;
        
        // Update dashboard title and description
        const dashboardTitle = document.getElementById('dashboardTitle');
        const agentDescription = document.getElementById('agentDescription');
        
        if (dashboardTitle) {
            dashboardTitle.textContent = `${this.currentAgent.name} Analytics Dashboard`;
        }
        
        if (agentDescription) {
            agentDescription.textContent = this.currentAgent.description;
        }
        
        // Hide loading state and show dashboard content
        const loadingState = document.getElementById('loadingState');
        const dashboardContent = document.getElementById('dashboardContent');
        
        if (loadingState) loadingState.style.display = 'none';
        if (dashboardContent) dashboardContent.style.display = 'block';
        
        // Load agent data
        await this.loadAnalytics();
        await this.loadConversations();
        
        // Initialize time-based analytics if elements exist
        this.initializeTimeBasedAnalytics();
    }

    initializeTimeBasedAnalytics() {
        // Check if time-based analytics elements exist
        const analyticsContent = document.getElementById('analytics-content');
        if (analyticsContent) {
            // Initialize the time-based analytics system
            window.timeAnalytics = new TimeBasedAnalytics();
        }
    }

    async loadAnalytics() {
        if (!this.currentAgent) return;
        
        try {
            const response = await fetch(`/analytics/${this.currentAgent.id}`);
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                throw new Error('Failed to load analytics');
            }
            
            const data = await response.json();
            this.updateAnalyticsUI(data);
        } catch (error) {
            console.error('Error loading analytics:', error);
            this.showNotification('Failed to load analytics data', 'error');
        }
    }

    async loadConversations() {
        if (!this.currentAgent) return;
        
        try {
            const response = await fetch(`/conversations/${this.currentAgent.id}`);
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                throw new Error('Failed to load conversations');
            }
            
            const data = await response.json();
            this.updateConversationsUI(data.conversations);
        } catch (error) {
            console.error('Error loading conversations:', error);
            this.showNotification('Failed to load conversation data', 'error');
        }
    }

    updateAnalyticsUI(data) {
        // Update metrics cards
        const totalConversations = document.querySelector('.metric-total-conversations');
        if (totalConversations) {
            totalConversations.textContent = data.totalConversations || 0;
        }
        
        const successRate = document.querySelector('.metric-success-rate');
        if (successRate) {
            successRate.textContent = `${data.successRate || 0}%`;
        }
        
        const avgCallDuration = document.getElementById('metric-avg-duration');
        if (avgCallDuration) {
            avgCallDuration.textContent = data.avgCallDuration || '0m 0s';
        }
        
        const positiveSentiment = document.querySelector('.metric-positive-sentiment');
        if (positiveSentiment) {
            positiveSentiment.textContent = `${data.positiveSentimentPercentage || 0}%`;
        }
        
        // Update evaluation score in the top metrics area
        const evaluationScore = document.getElementById('metric-eval-score');
        if (evaluationScore) {
            evaluationScore.textContent = `${data.evaluationScore || 0}%`;
        }
        
        // Update charts if they exist
        if (typeof updateCallVolumeChart === 'function') {
            updateCallVolumeChart(data.callVolumeData || []);
        }
        
        if (typeof updateCallSuccessRateChart === 'function') {
            updateCallSuccessRateChart(data.callSuccessRateTrend || {});
        }
    }

    updateConversationsUI(conversations) {
        const conversationsList = document.getElementById('conversationsList');
        if (!conversationsList) return;
        
        if (!conversations || conversations.length === 0) {
            conversationsList.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-comments text-gray-400 text-4xl mb-4"></i>
                    <p class="text-gray-400 text-lg">No conversations found for this agent.</p>
                    <p class="text-gray-500 text-sm mt-2">Conversations will appear here once your agent starts handling calls.</p>
                </div>
            `;
            return;
        }
        
        conversationsList.innerHTML = conversations.map(conv => `
            <div class="conversation-card rounded-lg p-6 mb-4">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex-1">
                        <h4 class="text-lg font-semibold text-white mb-2">${conv.title}</h4>
                        <p class="text-gray-300 text-sm mb-3">${conv.summary}</p>
                        <div class="flex items-center space-x-4 text-sm text-gray-400">
                            <span>
                                <i class="fas fa-calendar mr-1"></i>
                                ${new Date(conv.date).toLocaleDateString()}
                            </span>
                            <span>
                                <i class="fas fa-clock mr-1"></i>
                                ${conv.duration}
                            </span>
                            <span>
                                <i class="fas fa-comments mr-1"></i>
                                ${conv.messageCount} messages
                            </span>
                        </div>
                    </div>
                    <div class="ml-4">
                        <span class="status-${conv.status}">${conv.status}</span>
                    </div>
                </div>
                <div class="flex space-x-2">
                    <button class="btn-action" onclick="analytics.viewTranscript('${conv.id}')">
                        <i class="fas fa-file-text mr-1"></i> Transcript
                    </button>
                    <button class="btn-action" onclick="analytics.viewBriefSummary('${conv.id}')">
                        <i class="fas fa-clipboard-list mr-1"></i> Brief Summary
                    </button>
                    <button class="btn-action" onclick="analytics.viewToolsUsed('${conv.id}')">
                        <i class="fas fa-tools mr-1"></i> Tools Used
                    </button>
                    <button class="btn-action" onclick="analytics.viewDataAnalysis('${conv.id}')">
                        <i class="fas fa-chart-bar mr-1"></i> Data Analysis
                    </button>
                </div>
            </div>
        `).join('');
    }

    async viewTranscript(conversationId) {
        try {
            const response = await fetch(`/conversation-transcript/${conversationId}`);
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                throw new Error('Failed to load transcript');
            }
            
            const data = await response.json();
            this.showTranscriptModal(data);
        } catch (error) {
            console.error('Error loading transcript:', error);
            this.showNotification('Failed to load transcript', 'error');
        }
    }

    async viewBriefSummary(conversationId) {
        try {
            const response = await fetch(`/conversation-analysis/${conversationId}`);
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                throw new Error('Failed to load brief summary');
            }
            
            const data = await response.json();
            this.showBriefSummaryModal(data);
        } catch (error) {
            console.error('Error loading brief summary:', error);
            this.showNotification('Failed to load brief summary', 'error');
        }
    }

    async viewDataAnalysis(conversationId) {
        try {
            const response = await fetch(`/conversation-data-analysis/${conversationId}`);
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                throw new Error('Failed to load data analysis');
            }
            
            const data = await response.json();
            this.showDataAnalysisModal(data);
        } catch (error) {
            console.error('Error loading data analysis:', error);
            this.showNotification('Failed to load data analysis', 'error');
        }
    }

    async viewToolsUsed(conversationId) {
        try {
            const response = await fetch(`/conversation-tools-used/${conversationId}`);
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                throw new Error('Failed to load tools data');
            }
            
            const data = await response.json();
            this.showToolsUsedModal(data);
        } catch (error) {
            console.error('Error loading tools data:', error);
            this.showNotification('Failed to load tools data', 'error');
        }
    }

    async downloadAudio(conversationId) {
        try {
            const response = await fetch(`/conversation-audio/${conversationId}`);
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                throw new Error('Failed to get audio URL');
            }
            
            const data = await response.json();
            if (data.audioUrl) {
                window.open(data.audioUrl, '_blank');
            } else {
                this.showNotification('Audio not available for this conversation', 'warning');
            }
        } catch (error) {
            console.error('Error downloading audio:', error);
            this.showNotification('Failed to download audio', 'error');
        }
    }

    showTranscriptModal(data) {
        const modal = this.createModal('📞 Conversation Transcript', `
            <div class="space-y-4">
                <div class="bg-gray-800 rounded-lg p-4">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                            <span class="text-gray-400">Conversation ID:</span>
                            <p class="text-white font-mono text-xs">${data.conversationId}</p>
                        </div>
                        <div>
                            <span class="text-gray-400">Messages:</span>
                            <p class="text-white">${data.messageCount}</p>
                        </div>
                        <div>
                            <span class="text-gray-400">Duration:</span>
                            <p class="text-white">${data.duration}</p>
                        </div>
                    </div>
                </div>
                <div class="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
                    <h4 class="text-purple-400 font-semibold mb-3">Full Transcript:</h4>
                    <div class="text-gray-300 whitespace-pre-wrap font-mono text-sm leading-relaxed">
                        ${data.transcript || 'No transcript available'}
                    </div>
                </div>
            </div>
        `);
        
        document.body.appendChild(modal);
    }

    showBriefSummaryModal(data) {
        const modal = this.createModal('📊 Brief Summary', `
            <div class="space-y-6">
                <div class="flex justify-between items-start">
                    <div>
                        <h3 class="text-xl font-semibold text-white mb-2">${data.title}</h3>
                        <div class="flex items-center space-x-4">
                            <span class="status-${data.status}">${data.status}</span>
                            <span class="bg-purple-600 text-white px-3 py-1 rounded-full text-sm">${data.duration}</span>
                            <span class="bg-blue-600 text-white px-3 py-1 rounded-full text-sm">${data.messageCount} messages</span>
                        </div>
                    </div>
                </div>
                
                <div class="bg-gray-800 rounded-lg p-4">
                    <h4 class="text-purple-400 font-semibold mb-2">📝 Summary</h4>
                    <p class="text-gray-300">${data.summary}</p>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="bg-gray-800 rounded-lg p-4">
                        <h4 class="text-purple-400 font-semibold mb-2">📅 Call Details</h4>
                        <div class="space-y-2 text-sm">
                            <div class="flex justify-between">
                                <span class="text-gray-400">Date:</span>
                                <span class="text-white">${new Date(data.date).toLocaleString()}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-400">Messages:</span>
                                <span class="text-white">${data.messageCount}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-gray-400">Agent:</span>
                                <span class="text-white">${data.agent.name} (${data.agent.type})</span>
                            </div>
                        </div>
                    </div>
                    
                    ${data.keyPoints && data.keyPoints.length > 0 ? `
                        <div class="bg-gray-800 rounded-lg p-4">
                            <h4 class="text-purple-400 font-semibold mb-2">🎯 Key Points</h4>
                            <ul class="space-y-1 text-sm text-gray-300">
                                ${data.keyPoints.map(point => `<li class="flex items-start"><span class="text-purple-400 mr-2">•</span>${point}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
                
                ${data.evaluationResults && data.evaluationResults.length > 0 ? `
                    <div class="bg-gray-800 rounded-lg p-4">
                        <h4 class="text-purple-400 font-semibold mb-3">✅ Evaluation Results</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            ${data.evaluationResults.map(result => `
                                <div class="flex justify-between items-center p-2 bg-gray-700 rounded">
                                    <span class="text-gray-300 text-sm">${result.criteria}</span>
                                    <span class="px-2 py-1 rounded text-xs font-semibold ${result.passed ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}">
                                        ${result.passed ? 'PASS' : 'FAIL'}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `);
        
        document.body.appendChild(modal);
    }

    showDataAnalysisModal(data) {
        const modal = this.createModal('📊 Detailed Data Analysis', `
            <div class="space-y-6">
                <div class="flex justify-between items-start">
                    <div>
                        <h3 class="text-xl font-semibold text-white mb-2">${data.title}</h3>
                        <div class="flex items-center space-x-4">
                            <span class="status-${data.status}">${data.status}</span>
                            <span class="bg-purple-600 text-white px-3 py-1 rounded-full text-sm">${data.duration}</span>
                            <span class="bg-blue-600 text-white px-3 py-1 rounded-full text-sm">${data.messageCount} messages</span>
                        </div>
                    </div>
                </div>
                
                <div class="bg-gray-800 rounded-lg p-4">
                    <h4 class="text-purple-400 font-semibold mb-2">📋 Transcript Summary</h4>
                    <p class="text-gray-300">${data.transcriptSummary}</p>
                </div>
                
                <div class="grid grid-cols-1 gap-4">
                    <div class="bg-gray-800 rounded-lg p-4">
                        <h4 class="text-purple-400 font-semibold mb-3">📝 Call Summary</h4>
                        <p class="text-gray-300 whitespace-pre-wrap">${data.callSummary}</p>
                    </div>
                    
                    <div class="bg-gray-800 rounded-lg p-4">
                        <h4 class="text-purple-400 font-semibold mb-3">🎯 Call Conclusion</h4>
                        <p class="text-gray-300 whitespace-pre-wrap">${data.callConclusion}</p>
                    </div>
                    
                    <div class="bg-gray-800 rounded-lg p-4">
                        <h4 class="text-purple-400 font-semibold mb-3">⭐ Caller Interest Rating</h4>
                        <p class="text-gray-300 whitespace-pre-wrap">${data.callerInterestRating}</p>
                    </div>
                </div>
                
                ${data.hasDataCollection ? `
                    <div class="bg-gray-800 rounded-lg p-4">
                        <h4 class="text-purple-400 font-semibold mb-3">📊 Data Collection Results</h4>
                        <div class="space-y-3">
                            ${Object.entries(data.dataCollectionResults).map(([key, result]) => `
                                <div class="bg-gray-700 rounded p-3">
                                    <h5 class="text-white font-medium mb-2">${result.data_collection_id}</h5>
                                    <p class="text-gray-300 text-sm mb-2"><strong>Value:</strong> ${result.value}</p>
                                    <p class="text-gray-400 text-xs"><strong>Rationale:</strong> ${result.rationale}</p>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${data.hasEvaluationCriteria ? `
                    <div class="bg-gray-800 rounded-lg p-4">
                        <h4 class="text-purple-400 font-semibold mb-3">✅ Evaluation Criteria Results</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            ${Object.entries(data.evaluationCriteriaResults).map(([key, result]) => `
                                <div class="bg-gray-700 rounded p-3">
                                    <div class="flex justify-between items-center mb-2">
                                        <span class="text-white text-sm font-medium">${result.criteria_id}</span>
                                        <span class="px-2 py-1 rounded text-xs font-semibold ${
                                            result.result === 'success' ? 'bg-green-600 text-white' : 
                                            result.result === 'failure' ? 'bg-red-600 text-white' : 
                                            'bg-yellow-600 text-white'
                                        }">
                                            ${result.result.toUpperCase()}
                                        </span>
                                    </div>
                                    <p class="text-gray-400 text-xs">${result.rationale}</p>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <div class="bg-gray-800 rounded-lg p-4">
                    <h4 class="text-purple-400 font-semibold mb-2">📅 Call Details</h4>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-400">Date:</span>
                            <span class="text-white">${new Date(data.date).toLocaleString()}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Messages:</span>
                            <span class="text-white">${data.messageCount}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Agent:</span>
                            <span class="text-white">${data.agent.name}</span>
                        </div>
                    </div>
                </div>
            </div>
        `);
        
        document.body.appendChild(modal);
    }

    showToolsUsedModal(data) {
        const modal = this.createModal('🔧 Tools Used', `
            <div class="space-y-6">
                <div class="flex justify-between items-start">
                    <div>
                        <h3 class="text-xl font-semibold text-white mb-2">${data.title}</h3>
                        <div class="flex items-center space-x-4">
                            <span class="status-${data.status}">${data.status}</span>
                            <span class="bg-purple-600 text-white px-3 py-1 rounded-full text-sm">${data.duration}</span>
                            <span class="bg-blue-600 text-white px-3 py-1 rounded-full text-sm">${data.messageCount} messages</span>
                        </div>
                    </div>
                </div>
                
                ${data.toolsUsed && data.toolsUsed.length > 0 ? `
                    <div class="space-y-4">
                        <h4 class="text-purple-400 font-semibold mb-3">🛠️ Tools Used in This Conversation</h4>
                        ${data.toolsUsed.map((tool, index) => `
                            <div class="bg-gray-800 rounded-lg p-4">
                                <div class="flex items-center justify-between mb-3">
                                    <h5 class="text-white font-medium">
                                        <i class="fas fa-tool text-purple-400 mr-2"></i>
                                        ${tool.name || `Tool ${index + 1}`}
                                    </h5>
                                    <span class="bg-green-600 text-white px-2 py-1 rounded text-xs">Used</span>
                                </div>
                                ${tool.result ? `
                                    <div class="bg-gray-700 rounded p-3 mt-3">
                                        <h6 class="text-purple-300 font-medium mb-2">📊 Tool Result:</h6>
                                        <div class="text-gray-300 text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">
                                            ${typeof tool.result === 'object' ? JSON.stringify(tool.result, null, 2) : tool.result}
                                        </div>
                                    </div>
                                ` : ''}
                                ${tool.description ? `
                                    <p class="text-gray-400 text-sm mt-2">${tool.description}</p>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="text-center py-8">
                        <i class="fas fa-tools text-gray-400 text-4xl mb-4"></i>
                        <p class="text-gray-400 text-lg">No tools were used in this conversation.</p>
                        <p class="text-gray-500 text-sm mt-2">Tools usage data will appear here when available.</p>
                    </div>
                `}
                
                <div class="bg-gray-800 rounded-lg p-4">
                    <h4 class="text-purple-400 font-semibold mb-2">📅 Call Details</h4>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-400">Date:</span>
                            <span class="text-white">${new Date(data.date).toLocaleString()}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Messages:</span>
                            <span class="text-white">${data.messageCount}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Agent:</span>
                            <span class="text-white">${data.agent.name}</span>
                        </div>
                    </div>
                </div>
            </div>
        `);
        
        document.body.appendChild(modal);
    }

    createModal(title, content) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="text-purple-400">${title}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;
        
        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        return modal;
    }

    async logout() {
        try {
            await fetch('/api/logout', { method: 'POST' });
            window.location.href = '/login';
        } catch (error) {
            console.error('Logout failed:', error);
            // Force redirect anyway
            window.location.href = '/login';
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 
                           type === 'success' ? 'fa-check-circle' : 
                           type === 'warning' ? 'fa-exclamation-triangle' :
                           'fa-info-circle'} mr-2"></i>
            ${message}
        `;
        
        document.body.appendChild(notification);
        
        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Hide notification after 4 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }
}

// Time-based Analytics Management Class
class TimeBasedAnalytics {
    constructor() {
        this.currentPeriod = 'today';
        this.charts = {};
        this.initializeEventListeners();
        this.loadAnalytics('today');
    }

    initializeEventListeners() {
        // Tab switching
        document.querySelectorAll('.analytics-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const period = e.target.id.replace('tab-', '');
                this.switchTab(period);
            });
        });
    }

    switchTab(period) {
        // Update active tab
        document.querySelectorAll('.analytics-tab').forEach(tab => {
            tab.classList.remove('active', 'bg-purple-600', 'text-white');
            tab.classList.add('bg-gray-700', 'text-gray-300');
        });
        
        const targetTab = document.getElementById(`tab-${period}`);
        if (targetTab) {
            targetTab.classList.add('active', 'bg-purple-600', 'text-white');
            targetTab.classList.remove('bg-gray-700', 'text-gray-300');
        }
        
        this.currentPeriod = period;
        this.loadAnalytics(period);
    }

    async loadAnalytics(period) {
        try {
            // Show loading state
            const loadingElement = document.getElementById('analytics-loading');
            const dataElement = document.getElementById('analytics-data');
            
            if (loadingElement) loadingElement.style.display = 'block';
            if (dataElement) dataElement.style.display = 'none';

            // Fetch analytics data for the period
            const response = await fetch(`/analytics/time-based/${period}`);
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // Update metrics
            this.updateMetrics(data.metrics);
            
            // Update charts
            this.updateCharts(data.charts);
            
            // Update insights
            if (data.insights) {
                this.updateInsights(data.insights);
            }
            
            // Show data, hide loading
            if (loadingElement) loadingElement.style.display = 'none';
            if (dataElement) dataElement.style.display = 'block';

        } catch (error) {
            console.error('Error loading analytics:', error);
            const loadingElement = document.getElementById('analytics-loading');
            if (loadingElement) {
                loadingElement.innerHTML = `
                    <div class="text-center py-8">
                        <div class="text-red-500 mb-4">
                            <svg class="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                            </svg>
                        </div>
                        <p class="text-gray-400">Failed to load analytics data</p>
                        <button onclick="timeAnalytics.loadAnalytics('${period}')" class="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                            Retry
                        </button>
                    </div>
                `;
            }
        }
    }

    updateMetrics(metrics) {
        // Update metric values
        const elements = {
            'metric-total-calls': metrics.totalCalls || '0',
            'metric-success-rate': `${metrics.successRate || 0}%`,
            'metric-avg-duration': metrics.avgDuration || '0m 0s',
            'metric-eval-score': `${metrics.evaluationScore || 0}%`
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });

        // Update change indicators
        this.updateChangeIndicator('metric-total-change', metrics.totalCallsChange);
        this.updateChangeIndicator('metric-success-change', metrics.successRateChange);
        this.updateChangeIndicator('metric-duration-change', metrics.avgDurationChange);
        this.updateChangeIndicator('metric-eval-change', metrics.evaluationScoreChange);
    }

    updateChangeIndicator(elementId, change) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const changeValue = change || 0;
        const isPositive = changeValue >= 0;
        
        element.textContent = `${isPositive ? '+' : ''}${changeValue}%`;
        element.className = `text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`;
    }

    updateCharts(chartData) {
        // Destroy existing charts
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        this.charts = {};

        // Create new charts
        this.createPerformanceTrendChart(chartData.performanceTrend);
        this.createCallSuccessRateTrendChart(chartData.callSuccessRateTrend);
        this.createDurationDistributionChart(chartData.durationDistribution);
        this.createCallOutcomesChart(chartData.callOutcomes);
    }

    createPerformanceTrendChart(data) {
        const ctx = document.getElementById('performance-trend-chart');
        if (!ctx) return;

        this.charts.performanceTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels || [],
                datasets: [{
                    label: 'Success Rate',
                    data: data.successRate || [],
                    borderColor: '#8B5CF6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }, {
                    label: 'Call Volume',
                    data: data.callVolume || [],
                    borderColor: '#06B6D4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    borderWidth: 3,
                    fill: false,
                    tension: 0.4,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#E5E7EB' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#9CA3AF' },
                        grid: { color: 'rgba(75, 85, 99, 0.3)' }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        ticks: { color: '#9CA3AF' },
                        grid: { color: 'rgba(75, 85, 99, 0.3)' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        ticks: { color: '#9CA3AF' },
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    }

    createCallSuccessRateTrendChart(data) {
        const ctx = document.getElementById('evaluation-criteria-chart');
        if (!ctx) return;

        // Destroy existing chart
        if (this.charts.callSuccessRateTrend) {
            this.charts.callSuccessRateTrend.destroy();
        }

        // Prepare data for line chart
        const labels = data.data?.map(item => item.date) || [];
        const successRates = data.data?.map(item => item.success_rate) || [];

        this.charts.callSuccessRateTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Success Rate (%)',
                    data: successRates,
                    borderColor: '#10B981',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(75, 85, 99, 0.3)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#9CA3AF',
                            font: {
                                size: 12
                            }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: {
                            color: 'rgba(75, 85, 99, 0.3)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#9CA3AF',
                            font: {
                                size: 12
                            },
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    }

    // Update caller interest rating gauge chart
    updateCallerInterestRatingChart(data) {
        const ctx = document.getElementById('callerInterestRatingChart');
        if (!ctx) return;

        // Calculate average rating from data
        const averageRating = data.average_rating || 0;
        
        // Create gauge chart
        if (this.charts.callerInterestRating) {
            this.charts.callerInterestRating.destroy();
        }

        this.charts.callerInterestRating = new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [averageRating, 10 - averageRating],
                    backgroundColor: ['#10B981', 'rgba(75, 85, 99, 0.3)'],
                    borderWidth: 0,
                    cutout: '75%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                scales: {
                    x: {
                        ticks: { color: '#9CA3AF' },
                        grid: { color: 'rgba(75, 85, 99, 0.3)' }
                    },
                    y: {
                        beginAtZero: true,
                        max: 10,
                        ticks: { 
                            color: '#9CA3AF',
                            callback: function(value) {
                                return value + '/10';
                            }
                        },
                        grid: { color: 'rgba(75, 85, 99, 0.3)' }
                    }
                }
            }
        });
    }

    createDurationDistributionChart(data) {
        const ctx = document.getElementById('duration-distribution-chart');
        if (!ctx) return;

        this.charts.durationDistribution = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels || [],
                datasets: [{
                    label: 'Number of Calls',
                    data: data.counts || [],
                    backgroundColor: 'rgba(251, 191, 36, 0.8)',
                    borderColor: '#F59E0B',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#E5E7EB' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#9CA3AF' },
                        grid: { color: 'rgba(75, 85, 99, 0.3)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#9CA3AF' },
                        grid: { color: 'rgba(75, 85, 99, 0.3)' }
                    }
                }
            }
        });
    }

    createCallOutcomesChart(data) {
        const ctx = document.getElementById('call-outcomes-chart');
        if (!ctx) return;

        this.charts.callOutcomes = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels || [],
                datasets: [{
                    data: data.values || [],
                    backgroundColor: [
                        '#10B981', '#EF4444', '#6B7280'
                    ],
                    borderColor: [
                        '#059669', '#DC2626', '#4B5563'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { 
                            color: '#E5E7EB',
                            padding: 20
                        }
                    }
                }
            }
        });
    }

    updateInsights(data) {
        // Update trend insights
        this.updateTrendInsights(data.insights);
        
        // Update performance benchmarks
        this.updatePerformanceBenchmarks(data.benchmarks);
        
        // Update recommendations
        this.updateRecommendations(data.recommendations);
        
        // Update top conversations
        this.updateTopConversations(data.topConversations);
    }

    updateTrendInsights(insights) {
        const container = document.getElementById('trend-insights');
        if (!container || !insights) return;

        container.innerHTML = insights.map(insight => `
            <div class="flex items-start space-x-3 p-3 bg-gray-800/50 rounded-lg">
                <div class="flex-shrink-0">
                    <span class="text-lg">${insight.icon}</span>
                </div>
                <div class="flex-1">
                    <p class="text-sm font-medium text-white">${insight.title}</p>
                    <p class="text-xs text-gray-400 mt-1">${insight.description}</p>
                    <div class="mt-2">
                        <span class="text-xs px-2 py-1 rounded-full ${insight.trend === 'positive' ? 'bg-green-900 text-green-300' : insight.trend === 'negative' ? 'bg-red-900 text-red-300' : 'bg-gray-700 text-gray-300'}">
                            ${insight.value}
                        </span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    updatePerformanceBenchmarks(benchmarks) {
        const container = document.getElementById('performance-benchmarks');
        if (!container || !benchmarks) return;

        container.innerHTML = benchmarks.map(benchmark => `
            <div class="p-3 bg-gray-800/50 rounded-lg">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium text-white">${benchmark.metric}</span>
                    <span class="text-xs text-gray-400">${benchmark.period}</span>
                </div>
                <div class="flex items-center space-x-2">
                    <div class="flex-1 bg-gray-700 rounded-full h-2">
                        <div class="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full" style="width: ${benchmark.percentage}%"></div>
                    </div>
                    <span class="text-sm font-semibold text-white">${benchmark.value}</span>
                </div>
                <p class="text-xs text-gray-400 mt-1">${benchmark.comparison}</p>
            </div>
        `).join('');
    }

    updateRecommendations(recommendations) {
        const container = document.getElementById('recommendations');
        if (!container || !recommendations) return;

        container.innerHTML = recommendations.map(rec => `
            <div class="p-4 bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-lg border border-purple-500/20">
                <div class="flex items-start space-x-3">
                    <span class="text-lg">${rec.icon}</span>
                    <div class="flex-1">
                        <h5 class="text-sm font-semibold text-white">${rec.title}</h5>
                        <p class="text-xs text-gray-300 mt-1">${rec.description}</p>
                        <div class="mt-2">
                            <span class="text-xs px-2 py-1 bg-purple-600 text-white rounded-full">
                                ${rec.impact}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    updateTopConversations(conversations) {
        const container = document.getElementById('top-conversations');
        if (!container || !conversations) return;

        container.innerHTML = conversations.map((conv, index) => `
            <div class="flex items-center space-x-4 p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800/70 transition-colors">
                <div class="flex-shrink-0">
                    <div class="w-8 h-8 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                        <span class="text-sm font-bold text-white">${index + 1}</span>
                    </div>
                </div>
                <div class="flex-1">
                    <div class="flex items-center justify-between">
                        <h5 class="text-sm font-medium text-white">${conv.title}</h5>
                        <span class="text-xs text-gray-400">${conv.date}</span>
                    </div>
                    <p class="text-xs text-gray-400 mt-1">${conv.summary}</p>
                    <div class="flex items-center space-x-4 mt-2">
                        <span class="text-xs px-2 py-1 bg-green-900 text-green-300 rounded-full">
                            ${conv.successRate}% Success
                        </span>
                        <span class="text-xs text-gray-400">
                            ${conv.duration} • ${conv.messages} messages
                        </span>
                    </div>
                </div>
                <div class="flex-shrink-0">
                    <button onclick="showConversationDetails('${conv.id}')" class="text-purple-400 hover:text-purple-300 text-xs">
                        View Details
                    </button>
                </div>
            </div>
        `).join('');
    }
}

// Global initialization
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the main analytics system
    window.analytics = new FuturoAnalytics();
    
    // Add logout button event handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            if (window.analytics) {
                window.analytics.logout();
            }
        });
    }
});

// Global helper functions
function showConversationDetails(conversationId) {
    if (window.analytics) {
        window.analytics.viewDataAnalysis(conversationId);
    }
}

