// Enhanced Analytics Dashboard JavaScript
// Handles all frontend functionality including CSV export and proper data display

class AnalyticsDashboard {
    constructor() {
        this.currentAgent = null;
        this.currentFilter = 'today';
        this.conversations = [];
        this.init();
    }

    async init() {
        await this.checkAuthentication();
        this.setupEventListeners();
        await this.loadDashboard();
    }

    async checkAuthentication() {
        try {
            const response = await fetch('/api/session');
            const data = await response.json();
            
            if (!data.authenticated) {
                window.location.href = '/login';
                return;
            }
            
            this.currentAgent = data;
            this.updateAgentInfo();
        } catch (error) {
            console.error('Authentication check failed:', error);
            window.location.href = '/login';
        }
    }

    updateAgentInfo() {
        const titleElement = document.querySelector('.agent-title');
        const descElement = document.querySelector('.agent-description');
        
        if (titleElement && this.currentAgent) {
            titleElement.textContent = `${this.currentAgent.agent_name} Analytics Dashboard`;
        }
        
        if (descElement && this.currentAgent) {
            descElement.textContent = this.currentAgent.agent_type;
        }
    }

    setupEventListeners() {
        // Time filter buttons
        document.querySelectorAll('.time-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.setTimeFilter(filter);
            });
        });

        // CSV Export button
        const csvBtn = document.querySelector('.csv-export-btn');
        if (csvBtn) {
            csvBtn.addEventListener('click', () => this.exportToCSV());
        }

        // Logout button
        const logoutBtn = document.querySelector('.logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
    }

    async setTimeFilter(filter) {
        this.currentFilter = filter;
        
        // Update active button
        document.querySelectorAll('.time-filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
        
        // Reload data
        await this.loadDashboard();
    }

    async loadDashboard() {
        if (!this.currentAgent) return;
        
        try {
            // Show loading state
            this.showLoading();
            
            // Load analytics data and conversations in parallel
            const [analyticsData, conversationsData] = await Promise.all([
                this.loadAnalyticsData(),
                this.loadConversations()
            ]);
            
            // Update dashboard
            this.updateMetrics(analyticsData);
            this.updateConversations(conversationsData);
            
            // Hide loading state
            this.hideLoading();
            
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            this.showError('Failed to load dashboard data');
        }
    }

    async loadAnalyticsData() {
        const response = await fetch(`/analytics-data/${this.currentAgent.agent_id}?filter=${this.currentFilter}`);
        if (!response.ok) throw new Error('Failed to load analytics data');
        return await response.json();
    }

    async loadConversations() {
        const response = await fetch(`/conversations/${this.currentAgent.agent_id}`);
        if (!response.ok) throw new Error('Failed to load conversations');
        const data = await response.json();
        this.conversations = data.conversations || [];
        return data;
    }

    updateMetrics(data) {
        // Update metric cards
        this.updateMetricCard('total-calls', data.total_calls || 0);
        this.updateMetricCard('success-rate', `${data.success_rate || 0}%`);
        this.updateMetricCard('avg-duration', data.avg_duration || '0m 0s');
        this.updateMetricCard('evaluation-score', `${data.evaluation_score || 0}%`);
        this.updateMetricCard('positive-sentiment', `${data.positive_sentiment || 0}%`);
    }

    updateMetricCard(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    updateConversations(data) {
        const container = document.querySelector('.conversations-container');
        if (!container) return;

        if (!data.conversations || data.conversations.length === 0) {
            container.innerHTML = '<div class="no-conversations">No conversations found for the selected time period.</div>';
            return;
        }

        container.innerHTML = data.conversations.map(conv => this.renderConversation(conv)).join('');
        
        // Add event listeners to conversation buttons
        this.setupConversationButtons();
    }

    renderConversation(conv) {
        return `
            <div class="conversation-item" data-id="${conv.id}">
                <div class="conversation-header">
                    <h3 class="conversation-title">${conv.title}</h3>
                    <span class="conversation-status status-${conv.status}">${conv.status}</span>
                </div>
                <div class="conversation-meta">
                    <span class="conversation-date">📅 ${conv.date}</span>
                    <span class="conversation-duration">⏱️ ${conv.duration}</span>
                    <span class="conversation-messages">💬 ${conv.messageCount} messages</span>
                </div>
                <div class="conversation-summary">
                    ${conv.summary}
                </div>
                <div class="conversation-actions">
                    <button class="btn btn-primary transcript-btn" data-id="${conv.id}">
                        📄 Transcript
                    </button>
                    <button class="btn btn-secondary summary-btn" data-id="${conv.id}">
                        📋 Brief Summary
                    </button>
                    <button class="btn btn-info tools-btn" data-id="${conv.id}">
                        🔧 Tools Used
                    </button>
                    <button class="btn btn-warning analysis-btn" data-id="${conv.id}">
                        📊 Data Analysis
                    </button>
                </div>
            </div>
        `;
    }

    setupConversationButtons() {
        // Transcript buttons
        document.querySelectorAll('.transcript-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const convId = e.target.dataset.id;
                this.showTranscript(convId);
            });
        });

        // Tools Used buttons
        document.querySelectorAll('.tools-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const convId = e.target.dataset.id;
                this.showToolsUsed(convId);
            });
        });

        // Analysis buttons
        document.querySelectorAll('.analysis-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const convId = e.target.dataset.id;
                this.showAnalysis(convId);
            });
        });

        // Summary buttons
        document.querySelectorAll('.summary-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const convId = e.target.dataset.id;
                this.showSummary(convId);
            });
        });
    }

    async showTranscript(conversationId) {
        try {
            const response = await fetch(`/conversation-transcript/${conversationId}`);
            if (!response.ok) throw new Error('Failed to load transcript');
            
            const data = await response.json();
            
            this.showModal('Conversation Transcript', `
                <div class="transcript-modal">
                    <div class="transcript-header">
                        <div class="transcript-meta">
                            <span><strong>Conversation ID:</strong> ${data.conversation_id}</span>
                            <span><strong>Messages:</strong> ${data.messages}</span>
                            <span><strong>Duration:</strong> ${data.duration}</span>
                        </div>
                    </div>
                    <div class="transcript-content">
                        <h4>Full Transcript:</h4>
                        <div class="transcript-text">${data.transcript.replace(/\n/g, '<br>')}</div>
                    </div>
                </div>
            `);
        } catch (error) {
            console.error('Failed to load transcript:', error);
            this.showError('Failed to load transcript');
        }
    }

    async showToolsUsed(conversationId) {
        try {
            const response = await fetch(`/conversation-tools-used/${conversationId}`);
            if (!response.ok) throw new Error('Failed to load tools data');
            
            const data = await response.json();
            
            let toolsContent = '';
            if (data.tools_used && data.tools_used.length > 0) {
                toolsContent = data.tools_used.map(tool => `
                    <div class="tool-item">
                        <h5>${tool.name}</h5>
                        <p>${tool.description}</p>
                        <small>Used at: ${tool.timestamp}s</small>
                    </div>
                `).join('');
            } else {
                toolsContent = '<p>No tools were used in this conversation.</p><p>Tools usage data will appear here when available.</p>';
            }
            
            this.showModal('Tools Used', `
                <div class="tools-modal">
                    <div class="tools-header">
                        <div class="tools-meta">
                            <span><strong>Conversation ID:</strong> ${data.conversation_id}</span>
                            <span><strong>Messages:</strong> ${data.messages}</span>
                            <span><strong>Duration:</strong> ${data.duration}</span>
                        </div>
                    </div>
                    <div class="tools-content">
                        <h4>Tools Used:</h4>
                        ${toolsContent}
                    </div>
                </div>
            `);
        } catch (error) {
            console.error('Failed to load tools data:', error);
            this.showError('Failed to load tools data');
        }
    }

    async showAnalysis(conversationId) {
        try {
            const response = await fetch(`/conversation-data-analysis/${conversationId}`);
            if (!response.ok) throw new Error('Failed to load analysis data');
            
            const data = await response.json();
            
            this.showModal('Data Analysis', `
                <div class="analysis-modal">
                    <div class="analysis-header">
                        <div class="analysis-meta">
                            <span><strong>Conversation ID:</strong> ${data.conversation_id}</span>
                            <span><strong>Messages:</strong> ${data.messages}</span>
                            <span><strong>Duration:</strong> ${data.duration}</span>
                        </div>
                    </div>
                    <div class="analysis-content">
                        <h4>Analysis Results:</h4>
                        <div class="analysis-metrics">
                            <div class="metric">
                                <label>Status:</label>
                                <span>${data.status}</span>
                            </div>
                            <div class="metric">
                                <label>Evaluation Score:</label>
                                <span>${data.evaluation_score}%</span>
                            </div>
                            <div class="metric">
                                <label>Start Time:</label>
                                <span>${data.start_time ? new Date(data.start_time).toLocaleString() : 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `);
        } catch (error) {
            console.error('Failed to load analysis data:', error);
            this.showError('Failed to load analysis data');
        }
    }

    showSummary(conversationId) {
        const conv = this.conversations.find(c => c.id === conversationId);
        if (!conv) return;
        
        this.showModal('Brief Summary', `
            <div class="summary-modal">
                <div class="summary-content">
                    <h4>${conv.title}</h4>
                    <div class="summary-meta">
                        <span><strong>Date:</strong> ${conv.date}</span>
                        <span><strong>Duration:</strong> ${conv.duration}</span>
                        <span><strong>Messages:</strong> ${conv.messageCount}</span>
                        <span><strong>Status:</strong> ${conv.status}</span>
                    </div>
                    <div class="summary-text">
                        <p>${conv.summary}</p>
                    </div>
                </div>
            </div>
        `);
    }

    async exportToCSV() {
        if (!this.currentAgent) return;
        
        try {
            const response = await fetch(`/export-csv/${this.currentAgent.agent_id}`);
            if (!response.ok) throw new Error('Failed to export CSV');
            
            // Create download link
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `conversations_${this.currentAgent.agent_id}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            this.showSuccess('CSV export completed successfully');
        } catch (error) {
            console.error('Failed to export CSV:', error);
            this.showError('Failed to export CSV');
        }
    }

    showModal(title, content) {
        // Remove existing modal
        const existingModal = document.querySelector('.modal-overlay');
        if (existingModal) {
            existingModal.remove();
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add close functionality
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.remove();
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    async logout() {
        try {
            await fetch('/api/logout', { method: 'POST' });
            window.location.href = '/login';
        } catch (error) {
            console.error('Logout failed:', error);
            window.location.href = '/login';
        }
    }

    showLoading() {
        const loadingElement = document.querySelector('.loading-indicator');
        if (loadingElement) {
            loadingElement.style.display = 'block';
        }
    }

    hideLoading() {
        const loadingElement = document.querySelector('.loading-indicator');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AnalyticsDashboard();
});

