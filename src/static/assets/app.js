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
        // Create a loading modal first
        const loadingModal = this.createModal('🔧 Tools Used', `
            <div class="text-center py-8">
                <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
                <p class="text-gray-400">Loading tools data...</p>
            </div>
        `);
        document.body.appendChild(loadingModal);
        
        try {
            const response = await fetch(`/conversation-tools-used/${conversationId}`);
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login';
                    return;
                }
                throw new Error(`HTTP ${response.status}: Failed to load tools data`);
            }
            
            const data = await response.json();
            
            // Close loading modal
            document.body.removeChild(loadingModal);
            
            // Show the actual tools data
            this.showToolsUsedModal(data);
        } catch (error) {
            // Remove loading modal on error
            if (loadingModal && loadingModal.parentNode) {
                document.body.removeChild(loadingModal);
            }
            
            console.error('Error loading tools used:', error);
            this.showNotification('Failed to load tools data', 'error');
        }
    }

    showTranscriptModal(data) {
        const modal = this.createModal('📜 Call Transcript', `
            <div class="bg-gray-900 rounded-lg p-4 mb-4">
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="text-gray-400">Duration:</span>
                        <span class="text-white ml-2">${data.duration || 'N/A'}</span>
                    </div>
                    <div>
                        <span class="text-gray-400">Date:</span>
                        <span class="text-white ml-2">${data.date || 'N/A'}</span>
                    </div>
                    <div>
                        <span class="text-gray-400">Status:</span>
                        <span class="text-white ml-2 capitalize">${data.status || 'Unknown'}</span>
                    </div>
                    <div>
                        <span class="text-gray-400">Messages:</span>
                        <span class="text-white ml-2">${data.messageCount || 0}</span>
                    </div>
                </div>
            </div>
            <div class="bg-gray-800 rounded-lg p-6 max-h-96 overflow-y-auto">
                <pre class="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">${data.transcript || 'No transcript available'}</pre>
            </div>
        `);
        document.body.appendChild(modal);
    }

    showBriefSummaryModal(data) {
        const modal = this.createModal('📋 Brief Summary', `
            <div class="bg-gray-900 rounded-lg p-4 mb-4">
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="text-gray-400">Duration:</span>
                        <span class="text-white ml-2">${data.duration || 'N/A'}</span>
                    </div>
                    <div>
                        <span class="text-gray-400">Date:</span>
                        <span class="text-white ml-2">${data.date || 'N/A'}</span>
                    </div>
                    <div>
                        <span class="text-gray-400">Status:</span>
                        <span class="text-white ml-2 capitalize">${data.status || 'Unknown'}</span>
                    </div>
                    <div>
                        <span class="text-gray-400">Call Successful:</span>
                        <span class="text-white ml-2 capitalize">${data.callSuccessful || 'Unknown'}</span>
                    </div>
                </div>
            </div>
            <div class="bg-gray-800 rounded-lg p-6">
                <h4 class="text-lg font-semibold text-white mb-3">Summary</h4>
                <p class="text-gray-300 leading-relaxed">${data.summary || 'No summary available'}</p>
                
                ${data.keyPoints && data.keyPoints.length > 0 ? `
                    <h4 class="text-lg font-semibold text-white mb-3 mt-6">Key Points</h4>
                    <ul class="list-disc list-inside text-gray-300 space-y-1">
                        ${data.keyPoints.map(point => `<li>${point}</li>`).join('')}
                    </ul>
                ` : ''}
            </div>
        `);
        document.body.appendChild(modal);
    }

    showDataAnalysisModal(data) {
        const modal = this.createModal('📊 Data Analysis', `
            <div class="bg-gray-900 rounded-lg p-4 mb-4">
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="text-gray-400">Duration:</span>
                        <span class="text-white ml-2">${data.duration || 'N/A'}</span>
                    </div>
                    <div>
                        <span class="text-gray-400">Date:</span>
                        <span class="text-white ml-2">${data.date || 'N/A'}</span>
                    </div>
                    <div>
                        <span class="text-gray-400">Status:</span>
                        <span class="text-white ml-2 capitalize">${data.status || 'Unknown'}</span>
                    </div>
                    <div>
                        <span class="text-gray-400">Messages:</span>
                        <span class="text-white ml-2">${data.messageCount || 0}</span>
                    </div>
                </div>
            </div>
            <div class="space-y-4">
                <div class="bg-gray-800 rounded-lg p-6">
                    <h4 class="text-lg font-semibold text-white mb-3">📈 Performance Metrics</h4>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-gray-700 rounded p-3">
                            <div class="text-gray-400 text-sm">Call Duration</div>
                            <div class="text-white text-lg font-semibold">${data.duration || 'N/A'}</div>
                        </div>
                        <div class="bg-gray-700 rounded p-3">
                            <div class="text-gray-400 text-sm">Call Outcome</div>
                            <div class="text-white text-lg font-semibold capitalize">${data.callSuccessful || 'Unknown'}</div>
                        </div>
                    </div>
                </div>
                
                ${data.evaluationResults && data.evaluationResults.length > 0 ? `
                    <div class="bg-gray-800 rounded-lg p-6">
                        <h4 class="text-lg font-semibold text-white mb-3">🎯 Evaluation Results</h4>
                        <div class="space-y-3">
                            ${data.evaluationResults.map(eval => `
                                <div class="bg-gray-700 rounded p-3">
                                    <div class="flex justify-between items-center mb-2">
                                        <span class="text-white font-medium">${eval.criteria}</span>
                                        <span class="text-sm px-2 py-1 rounded ${eval.result === 'pass' ? 'bg-green-600' : eval.result === 'fail' ? 'bg-red-600' : 'bg-yellow-600'} text-white">
                                            ${eval.result}
                                        </span>
                                    </div>
                                    ${eval.score !== undefined ? `<div class="text-gray-400 text-sm">Score: ${eval.score}</div>` : ''}
                                    ${eval.feedback ? `<div class="text-gray-300 text-sm mt-2">${eval.feedback}</div>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <div class="bg-gray-800 rounded-lg p-6">
                    <h4 class="text-lg font-semibold text-white mb-3">📝 Analysis Summary</h4>
                    <p class="text-gray-300 leading-relaxed">${data.summary || 'No detailed analysis available for this conversation.'}</p>
                </div>
            </div>
        `);
        document.body.appendChild(modal);
    }

    showToolsUsedModal(data) {
        let toolsContent = '';
        
        if (data.toolsUsed && Array.isArray(data.toolsUsed) && data.toolsUsed.length > 0) {
            toolsContent = `
                <div class="space-y-3">
                    ${data.toolsUsed.map(tool => `
                        <div class="bg-gray-700 rounded-lg p-4">
                            <div class="flex items-center justify-between mb-2">
                                <h5 class="font-semibold text-white">${tool.name || 'Unknown Tool'}</h5>
                                <span class="text-xs bg-purple-600 text-white px-2 py-1 rounded">
                                    ${tool.category || 'Tool'}
                                </span>
                            </div>
                            ${tool.description ? `<p class="text-gray-300 text-sm mb-2">${tool.description}</p>` : ''}
                            ${tool.usage ? `
                                <div class="text-gray-400 text-xs">
                                    <strong>Usage:</strong> ${tool.usage}
                                </div>
                            ` : ''}
                            ${tool.result ? `
                                <div class="text-gray-400 text-xs mt-1">
                                    <strong>Result:</strong> ${tool.result}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            toolsContent = `
                <div class="text-center py-8">
                    <i class="fas fa-tools text-gray-400 text-4xl mb-4"></i>
                    <p class="text-gray-400 text-lg">No tools were used in this conversation</p>
                    <p class="text-gray-500 text-sm mt-2">The agent handled this conversation without requiring external tools or services.</p>
                </div>
            `;
        }

        const modal = this.createModal('🔧 Tools Used', `
            <div class="bg-gray-900 rounded-lg p-4 mb-4">
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="text-gray-400">Duration:</span>
                        <span class="text-white ml-2">${data.duration || 'N/A'}</span>
                    </div>
                    <div>
                        <span class="text-gray-400">Date:</span>
                        <span class="text-white ml-2">${data.date || 'N/A'}</span>
                    </div>
                    <div>
                        <span class="text-gray-400">Status:</span>
                        <span class="text-white ml-2 capitalize">${data.status || 'Unknown'}</span>
                    </div>
                    <div>
                        <span class="text-gray-400">Tools Count:</span>
                        <span class="text-white ml-2">${data.toolsUsed ? data.toolsUsed.length : 0}</span>
                    </div>
                </div>
            </div>
            <div class="bg-gray-800 rounded-lg p-6 max-h-96 overflow-y-auto">
                ${toolsContent}
            </div>
        `);
        document.body.appendChild(modal);
    }

    createModal(title, content) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-gray-900 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
                <div class="flex justify-between items-center p-6 border-b border-gray-700">
                    <h3 class="text-xl font-semibold text-white">${title}</h3>
                    <button class="text-gray-400 hover:text-white text-2xl" onclick="this.closest('.fixed').remove()">
                        &times;
                    </button>
                </div>
                <div class="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
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

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 transition-all duration-300 ${
            type === 'error' ? 'bg-red-600' : 
            type === 'success' ? 'bg-green-600' : 
            'bg-blue-600'
        }`;
        notification.innerHTML = `
            <div class="flex items-center">
                <span class="text-white">${message}</span>
                <button class="ml-4 text-white hover:text-gray-200" onclick="this.parentElement.parentElement.remove()">
                    &times;
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    async logout() {
        try {
            const response = await fetch('/logout', { method: 'POST' });
            if (response.ok) {
                window.location.href = '/login';
            } else {
                this.showNotification('Failed to logout', 'error');
            }
        } catch (error) {
            console.error('Logout error:', error);
            this.showNotification('Failed to logout', 'error');
        }
    }
}


// Time-based Analytics System
class TimeBasedAnalytics {
    constructor() {
        this.currentPeriod = 'Last 30 Days';
        this.timeSelector = null;
        this.agentId = null;
        this.initializeTimeSelector();
    }

    initializeTimeSelector() {
        // Get the agent ID from the main analytics instance
        if (window.analytics && window.analytics.currentAgent) {
            this.agentId = window.analytics.currentAgent.id;
        }

        // Create time period selector
        this.createTimeSelector();
        
        // Load initial data
        this.loadTimeBasedData();
    }

    createTimeSelector() {
        const analyticsContent = document.getElementById('analytics-content');
        if (!analyticsContent) return;

        // Create time period selector container
        const selectorContainer = document.createElement('div');
        selectorContainer.className = 'flex justify-center mb-6';
        selectorContainer.innerHTML = `
            <div class="flex bg-gray-800 rounded-lg p-1">
                <button class="time-period-btn px-4 py-2 rounded-md text-sm font-medium transition-colors" data-period="Today">Today</button>
                <button class="time-period-btn px-4 py-2 rounded-md text-sm font-medium transition-colors active" data-period="Last 7 Days">Last 7 Days</button>
                <button class="time-period-btn px-4 py-2 rounded-md text-sm font-medium transition-colors" data-period="Last 30 Days">Last 30 Days</button>
            </div>
        `;

        // Insert at the beginning of analytics content
        analyticsContent.insertBefore(selectorContainer, analyticsContent.firstChild);

        // Add event listeners
        const buttons = selectorContainer.querySelectorAll('.time-period-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Update active state
                buttons.forEach(b => b.classList.remove('active', 'bg-purple-600', 'text-white'));
                e.target.classList.add('active', 'bg-purple-600', 'text-white');
                
                // Update current period and load data
                this.currentPeriod = e.target.dataset.period;
                this.loadTimeBasedData();
            });
        });

        // Set initial active state
        const defaultBtn = selectorContainer.querySelector('[data-period="Last 7 Days"]');
        if (defaultBtn) {
            defaultBtn.classList.add('bg-purple-600', 'text-white');
        }
    }

    async loadTimeBasedData() {
        if (!this.agentId) {
            console.warn('No agent ID available for time-based analytics');
            return;
        }

        try {
            // Show loading state
            this.showLoadingState();

            const response = await fetch(`/analytics/${this.agentId}/time-based?period=${encodeURIComponent(this.currentPeriod)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: Failed to load time-based analytics`);
            }

            const data = await response.json();
            this.updateTimeBasedUI(data);
            
        } catch (error) {
            console.error('Error loading time-based analytics:', error);
            this.showErrorState();
        }
    }

    updateTimeBasedUI(data) {
        // Update metrics
        this.updateMetrics(data.metrics);
        
        // Update charts
        this.updateCharts(data.charts);
        
        // Update insights
        if (data.insights) {
            this.updateInsights(data.insights);
        }
        
        // Show data, hide loading
        this.hideLoadingState();
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
        if (!element || change === undefined || change === null) return;

        const isPositive = change > 0;
        const isNegative = change < 0;
        
        element.className = `text-sm ${isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-gray-500'}`;
        element.textContent = `${isPositive ? '+' : ''}${change}%`;
    }

    updateCharts(charts) {
        // Update call volume chart
        if (charts.callVolume && typeof updateCallVolumeChart === 'function') {
            updateCallVolumeChart(charts.callVolume);
        }

        // Update success rate trend chart
        if (charts.successRateTrend && typeof updateCallSuccessRateChart === 'function') {
            updateCallSuccessRateChart(charts.successRateTrend);
        }
    }

    updateInsights(insights) {
        const insightsContainer = document.getElementById('insights-container');
        if (!insightsContainer || !insights || !Array.isArray(insights)) return;

        insightsContainer.innerHTML = insights.map(insight => `
            <div class="bg-gray-800 rounded-lg p-4 border-l-4 ${this.getInsightBorderColor(insight.type)}">
                <div class="flex items-center mb-2">
                    <i class="fas ${this.getInsightIcon(insight.type)} mr-2 ${this.getInsightIconColor(insight.type)}"></i>
                    <h4 class="font-semibold text-white">${insight.title}</h4>
                </div>
                <p class="text-gray-300 text-sm">${insight.description}</p>
                ${insight.value ? `<div class="mt-2 text-lg font-bold ${this.getInsightValueColor(insight.type)}">${insight.value}</div>` : ''}
            </div>
        `).join('');
    }

    getInsightBorderColor(type) {
        const colors = {
            'positive': 'border-green-500',
            'negative': 'border-red-500',
            'neutral': 'border-blue-500',
            'warning': 'border-yellow-500'
        };
        return colors[type] || 'border-gray-500';
    }

    getInsightIcon(type) {
        const icons = {
            'positive': 'fa-arrow-up',
            'negative': 'fa-arrow-down',
            'neutral': 'fa-info-circle',
            'warning': 'fa-exclamation-triangle'
        };
        return icons[type] || 'fa-info-circle';
    }

    getInsightIconColor(type) {
        const colors = {
            'positive': 'text-green-500',
            'negative': 'text-red-500',
            'neutral': 'text-blue-500',
            'warning': 'text-yellow-500'
        };
        return colors[type] || 'text-gray-500';
    }

    getInsightValueColor(type) {
        const colors = {
            'positive': 'text-green-400',
            'negative': 'text-red-400',
            'neutral': 'text-blue-400',
            'warning': 'text-yellow-400'
        };
        return colors[type] || 'text-gray-400';
    }

    showLoadingState() {
        const loadingElements = document.querySelectorAll('.metric-card, .glass-card');
        loadingElements.forEach(el => {
            el.style.opacity = '0.6';
        });
    }

    hideLoadingState() {
        const loadingElements = document.querySelectorAll('.metric-card, .glass-card');
        loadingElements.forEach(el => {
            el.style.opacity = '1';
        });
    }

    showErrorState() {
        this.hideLoadingState();
        console.warn('Failed to load time-based analytics data');
    }
}

// Initialize the analytics dashboard when the page loads
document.addEventListener('DOMContentLoaded', function() {
    window.analytics = new FuturoAnalytics();
});

// Global logout function
function logout() {
    if (window.analytics) {
        window.analytics.logout();
    }
}
