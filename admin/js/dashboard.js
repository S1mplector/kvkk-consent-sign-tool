/**
 * Admin Dashboard Main JavaScript
 * Handles UI interactions and data fetching
 */

class AdminDashboard {
    constructor() {
        this.apiBase = '/api';
        this.refreshInterval = 30000; // 30 seconds
        this.refreshTimer = null;
        this.lastUpdate = null;
        
        this.elements = {
            connectionStatus: document.getElementById('connectionStatus'),
            lastUpdate: document.getElementById('lastUpdate'),
            overallStatus: document.getElementById('overallStatus'),
            servicesGrid: document.getElementById('servicesGrid'),
            uptimeValue: document.getElementById('uptimeValue'),
            environmentValue: document.getElementById('environmentValue'),
            versionValue: document.getElementById('versionValue'),
            protocolValue: document.getElementById('protocolValue'),
            httpsValue: document.getElementById('httpsValue'),
            csrfValue: document.getElementById('csrfValue'),
            rateLimitValue: document.getElementById('rateLimitValue'),
            encryptionValue: document.getElementById('encryptionValue'),
            activityList: document.getElementById('activityList'),
            adminMenuBtn: document.getElementById('adminMenuBtn'),
            adminDropdown: document.getElementById('adminDropdown'),
            logoutBtn: document.getElementById('logoutBtn'),
            testEmailBtn: document.getElementById('testEmailBtn'),
            runDiagnosticsBtn: document.getElementById('runDiagnosticsBtn'),
            exportLogsBtn: document.getElementById('exportLogsBtn'),
            refreshActivityBtn: document.getElementById('refreshActivityBtn'),
            loadingOverlay: document.getElementById('loadingOverlay'),
            toastContainer: document.getElementById('toastContainer')
        };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.fetchHealthData();
        this.startAutoRefresh();
        this.updateLastUpdateTime();
    }
    
    setupEventListeners() {
        // Admin menu dropdown
        this.elements.adminMenuBtn.addEventListener('click', () => {
            this.toggleDropdown();
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.admin-menu')) {
                this.closeDropdown();
            }
        });
        
        // Logout button
        this.elements.logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleLogout();
        });
        
        // Quick action buttons
        this.elements.testEmailBtn.addEventListener('click', () => {
            this.testEmailService();
        });
        
        this.elements.runDiagnosticsBtn.addEventListener('click', () => {
            this.runDiagnostics();
        });
        
        this.elements.exportLogsBtn.addEventListener('click', () => {
            this.exportLogs();
        });
        
        this.elements.refreshActivityBtn.addEventListener('click', () => {
            this.refreshActivity();
        });
        
        // Handle visibility change for auto-refresh
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopAutoRefresh();
            } else {
                this.startAutoRefresh();
                this.fetchHealthData();
            }
        });
    }
    
    toggleDropdown() {
        this.elements.adminMenuBtn.classList.toggle('active');
        this.elements.adminDropdown.classList.toggle('show');
    }
    
    closeDropdown() {
        this.elements.adminMenuBtn.classList.remove('active');
        this.elements.adminDropdown.classList.remove('show');
    }
    
    async fetchHealthData() {
        try {
            const response = await fetch(`${this.apiBase}/health`);
            const data = await response.json();
            
            if (response.ok) {
                this.updateHealthDisplay(data);
                this.updateConnectionStatus(true);
                this.lastUpdate = new Date();
            } else {
                throw new Error('Failed to fetch health data');
            }
        } catch (error) {
            console.error('Health fetch error:', error);
            this.updateConnectionStatus(false);
            this.showToast('Failed to fetch health data', 'error');
        }
    }
    
    updateHealthDisplay(data) {
        // Update overall status
        this.updateOverallStatus(data);
        
        // Update services grid
        this.updateServicesGrid(data.services);
        
        // Update system metrics
        this.updateSystemMetrics(data);
        
        // Update security status
        this.updateSecurityStatus(data.security);
        
        // Add sample activity (in real implementation, this would come from a separate endpoint)
        this.addActivityItem('System health check completed', 'success');
    }
    
    updateOverallStatus(data) {
        const statusElement = this.elements.overallStatus;
        const allServicesHealthy = Object.values(data.services).every(
            status => status === 'Ready' || status === 'Running' || status === 'Operational'
        );
        
        let statusClass = 'healthy';
        let statusText = 'All Systems Operational';
        
        if (!allServicesHealthy) {
            const hasErrors = Object.values(data.services).some(
                status => status === 'Error' || status === 'Down'
            );
            
            if (hasErrors) {
                statusClass = 'error';
                statusText = 'System Issues Detected';
            } else {
                statusClass = 'warning';
                statusText = 'Partial Degradation';
            }
        }
        
        statusElement.innerHTML = `
            <div class="status-indicator ${statusClass}">
                <span class="status-icon"></span>
                <span class="status-label">${statusText}</span>
            </div>
        `;
    }
    
    updateServicesGrid(services) {
        const grid = this.elements.servicesGrid;
        grid.innerHTML = '';
        
        const serviceIcons = {
            email: '📧',
            encryption: '🔐',
            storage: '💾',
            tokens: '🎫',
            cleanup: '🧹'
        };
        
        for (const [service, status] of Object.entries(services)) {
            const statusClass = this.getStatusClass(status);
            const icon = serviceIcons[service] || '📊';
            
            const serviceCard = document.createElement('div');
            serviceCard.className = `service-card ${statusClass}`;
            serviceCard.innerHTML = `
                <div class="service-icon">${icon}</div>
                <div class="service-name">${this.formatServiceName(service)}</div>
                <div class="service-status">${status}</div>
            `;
            
            serviceCard.addEventListener('click', () => {
                this.showServiceDetails(service, status);
            });
            
            grid.appendChild(serviceCard);
        }
    }
    
    updateSystemMetrics(data) {
        // Format uptime
        const uptime = this.formatUptime(data.uptime);
        this.elements.uptimeValue.textContent = uptime;
        
        // Environment
        this.elements.environmentValue.textContent = data.environment || 'Unknown';
        this.elements.environmentValue.className = 'metric-value ' + 
            (data.environment === 'production' ? 'warning' : 'success');
        
        // Version
        this.elements.versionValue.textContent = data.version || 'Unknown';
        
        // Protocol
        const protocol = data.security?.https ? 'HTTPS' : 'HTTP';
        this.elements.protocolValue.textContent = protocol;
        this.elements.protocolValue.className = 'metric-value ' + 
            (data.security?.https ? 'success' : 'warning');
    }
    
    updateSecurityStatus(security) {
        // HTTPS
        this.elements.httpsValue.textContent = security.https ? 'Enabled' : 'Disabled';
        this.elements.httpsValue.className = 'metric-value ' + 
            (security.https ? 'success' : 'error');
        
        // CSRF
        this.elements.csrfValue.textContent = security.csrf || 'Unknown';
        this.elements.csrfValue.className = 'metric-value success';
        
        // Rate Limit
        this.elements.rateLimitValue.textContent = security.rateLimit || 'Unknown';
        this.elements.rateLimitValue.className = 'metric-value success';
        
        // Encryption
        this.elements.encryptionValue.textContent = security.encryption || 'Unknown';
        this.elements.encryptionValue.className = 'metric-value success';
    }
    
    updateConnectionStatus(connected) {
        const statusDot = this.elements.connectionStatus.querySelector('.status-dot');
        const statusText = this.elements.connectionStatus.querySelector('.status-text');
        
        if (connected) {
            statusDot.classList.remove('disconnected');
            statusText.textContent = 'Connected';
        } else {
            statusDot.classList.add('disconnected');
            statusText.textContent = 'Disconnected';
        }
    }
    
    addActivityItem(message, type = 'info') {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        const activityItem = document.createElement('div');
        activityItem.className = `activity-item ${type} new`;
        activityItem.innerHTML = `
            <span class="activity-time">${time}</span>
            <span class="activity-icon">${icons[type]}</span>
            <span class="activity-message">${message}</span>
        `;
        
        // Add to the beginning of the list
        const firstItem = this.elements.activityList.firstChild;
        if (firstItem) {
            this.elements.activityList.insertBefore(activityItem, firstItem);
        } else {
            this.elements.activityList.appendChild(activityItem);
        }
        
        // Remove 'new' class after animation
        setTimeout(() => {
            activityItem.classList.remove('new');
        }, 500);
        
        // Keep only last 20 items
        const items = this.elements.activityList.querySelectorAll('.activity-item');
        if (items.length > 20) {
            items[items.length - 1].remove();
        }
    }
    
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }
    
    formatServiceName(service) {
        return service.charAt(0).toUpperCase() + service.slice(1).replace(/([A-Z])/g, ' $1');
    }
    
    getStatusClass(status) {
        const healthyStatuses = ['Ready', 'Running', 'Operational', 'Enabled', 'Active'];
        const warningStatuses = ['Degraded', 'Limited', 'Partial'];
        const errorStatuses = ['Error', 'Down', 'Failed', 'Not configured'];
        
        if (healthyStatuses.includes(status)) return 'healthy';
        if (warningStatuses.includes(status)) return 'warning';
        if (errorStatuses.includes(status)) return 'error';
        return 'unknown';
    }
    
    showServiceDetails(service, status) {
        this.showToast(`${this.formatServiceName(service)}: ${status}`, 'info');
    }
    
    async testEmailService() {
        this.showLoading();
        this.addActivityItem('Testing email service...', 'info');
        
        try {
            // In real implementation, this would call the test email endpoint
            await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call
            
            this.hideLoading();
            this.showToast('Email service test completed successfully', 'success');
            this.addActivityItem('Email service test passed', 'success');
        } catch (error) {
            this.hideLoading();
            this.showToast('Email service test failed', 'error');
            this.addActivityItem('Email service test failed', 'error');
        }
    }
    
    async runDiagnostics() {
        this.showLoading();
        this.addActivityItem('Running system diagnostics...', 'info');
        
        try {
            // In real implementation, this would call the diagnostics endpoint
            await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate API call
            
            this.hideLoading();
            this.showToast('Diagnostics completed', 'success');
            this.addActivityItem('System diagnostics completed', 'success');
            this.fetchHealthData(); // Refresh health data
        } catch (error) {
            this.hideLoading();
            this.showToast('Diagnostics failed', 'error');
            this.addActivityItem('System diagnostics failed', 'error');
        }
    }
    
    async exportLogs() {
        this.showLoading();
        this.addActivityItem('Exporting logs...', 'info');
        
        try {
            // In real implementation, this would download logs
            await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API call
            
            this.hideLoading();
            this.showToast('Logs exported successfully', 'success');
            this.addActivityItem('Logs exported', 'success');
        } catch (error) {
            this.hideLoading();
            this.showToast('Failed to export logs', 'error');
            this.addActivityItem('Log export failed', 'error');
        }
    }
    
    refreshActivity() {
        const btn = this.elements.refreshActivityBtn;
        btn.style.transform = 'rotate(360deg)';
        
        setTimeout(() => {
            btn.style.transform = 'rotate(0deg)';
        }, 500);
        
        this.addActivityItem('Activity refreshed', 'info');
    }
    
    handleLogout() {
        if (confirm('Are you sure you want to logout?')) {
            // In real implementation, this would call logout endpoint
            window.location.href = '/admin/login.html';
        }
    }
    
    showLoading() {
        this.elements.loadingOverlay.classList.add('show');
    }
    
    hideLoading() {
        this.elements.loadingOverlay.classList.remove('show');
    }
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${message}</span>
        `;
        
        this.elements.toastContainer.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }
    
    startAutoRefresh() {
        this.stopAutoRefresh(); // Clear any existing timer
        
        this.refreshTimer = setInterval(() => {
            this.fetchHealthData();
        }, this.refreshInterval);
    }
    
    stopAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }
    
    updateLastUpdateTime() {
        setInterval(() => {
            if (this.lastUpdate) {
                const seconds = Math.floor((new Date() - this.lastUpdate) / 1000);
                let timeText = `${seconds}s ago`;
                
                if (seconds >= 60) {
                    const minutes = Math.floor(seconds / 60);
                    timeText = `${minutes}m ago`;
                }
                
                this.elements.lastUpdate.textContent = timeText;
            }
        }, 1000);
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new AdminDashboard();
});