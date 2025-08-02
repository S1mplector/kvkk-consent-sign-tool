/**
 * Health Monitor Module
 * Handles real-time health monitoring and WebSocket connections
 */

class HealthMonitor {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.ws = null;
        this.reconnectInterval = 5000;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.isConnecting = false;
        
        // For now, we'll use polling instead of WebSocket
        // WebSocket implementation can be added later
        this.useWebSocket = false;
        
        if (this.useWebSocket) {
            this.initWebSocket();
        }
    }
    
    initWebSocket() {
        // WebSocket implementation for future use
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/admin`;
        
        try {
            this.connect(wsUrl);
        } catch (error) {
            console.error('WebSocket initialization failed:', error);
            this.dashboard.updateConnectionStatus(false);
        }
    }
    
    connect(url) {
        if (this.isConnecting) return;
        
        this.isConnecting = true;
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            this.dashboard.updateConnectionStatus(true);
            this.dashboard.addActivityItem('Real-time connection established', 'success');
            
            // Send authentication token if needed
            this.authenticate();
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.isConnecting = false;
            this.dashboard.updateConnectionStatus(false);
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.isConnecting = false;
            this.dashboard.updateConnectionStatus(false);
            this.dashboard.addActivityItem('Real-time connection lost', 'warning');
            
            // Attempt to reconnect
            this.scheduleReconnect();
        };
    }
    
    authenticate() {
        // Send authentication message
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'auth',
                token: this.getAuthToken()
            }));
        }
    }
    
    getAuthToken() {
        // Get auth token from localStorage or cookie
        return localStorage.getItem('adminToken') || '';
    }
    
    handleMessage(data) {
        switch (data.type) {
            case 'health_update':
                this.dashboard.updateHealthDisplay(data.payload);
                break;
                
            case 'service_status':
                this.handleServiceStatus(data.payload);
                break;
                
            case 'activity':
                this.handleActivity(data.payload);
                break;
                
            case 'alert':
                this.handleAlert(data.payload);
                break;
                
            default:
                console.log('Unknown message type:', data.type);
        }
    }
    
    handleServiceStatus(payload) {
        // Update specific service status
        const { service, status } = payload;
        this.dashboard.updateServicesGrid({ [service]: status });
        
        // Add activity item
        const statusClass = this.dashboard.getStatusClass(status);
        const message = `${service} service status changed to ${status}`;
        this.dashboard.addActivityItem(message, statusClass === 'error' ? 'error' : 'info');
    }
    
    handleActivity(payload) {
        const { message, type } = payload;
        this.dashboard.addActivityItem(message, type);
    }
    
    handleAlert(payload) {
        const { message, severity } = payload;
        this.dashboard.showToast(message, severity);
        
        // Add to activity log
        this.dashboard.addActivityItem(`Alert: ${message}`, severity);
    }
    
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            this.dashboard.showToast('Unable to establish real-time connection', 'error');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectInterval * this.reconnectAttempts, 30000);
        
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
                this.initWebSocket();
            }
        }, delay);
    }
    
    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('WebSocket is not connected');
        }
    }
    
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
    
    // Polling fallback for environments without WebSocket
    startPolling(interval = 30000) {
        this.pollingInterval = setInterval(() => {
            this.dashboard.fetchHealthData();
        }, interval);
    }
    
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }
}

// Export for use in dashboard
window.HealthMonitor = HealthMonitor;