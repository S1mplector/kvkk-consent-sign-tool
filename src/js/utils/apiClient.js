/**
 * API Client Utility
 * Handles communication with the backend server
 */
class APIClient {
    constructor(baseURL = 'http://localhost:3001') {
        this.baseURL = baseURL;
        this.timeout = 30000; // 30 seconds
    }

    /**
     * Make HTTP request with error handling
     */
    async makeRequest(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            timeout: this.timeout
        };

        const requestOptions = { ...defaultOptions, ...options };

        try {
            // Create abort controller for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            const response = await fetch(url, {
                ...requestOptions,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // Handle HTTP errors
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new APIError(
                    errorData.message || `HTTP ${response.status}: ${response.statusText}`,
                    response.status,
                    errorData
                );
            }

            // Parse response
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return await response.text();
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                throw new APIError('İstek zaman aşımına uğradı', 408);
            }
            
            if (error instanceof APIError) {
                throw error;
            }

            // Network or other errors
            throw new APIError(
                'Sunucuya bağlanırken bir hata oluştu: ' + error.message,
                0,
                { originalError: error }
            );
        }
    }

    /**
     * Submit consent form data
     */
    async submitConsent(formData, pdfBlob) {
        try {
            // Create FormData for file upload
            const formDataObj = new FormData();
            
            // Add form fields
            formDataObj.append('formData', JSON.stringify(formData));
            
            // Add PDF file
            const filename = this.generateFilename(formData);
            formDataObj.append('pdf', pdfBlob, filename);

            const response = await this.makeRequest('/api/consent/submit', {
                method: 'POST',
                body: formDataObj,
                headers: {} // Remove Content-Type to let browser set it with boundary
            });

            return {
                success: true,
                data: response,
                message: 'Onay formu başarıyla gönderildi'
            };

        } catch (error) {
            console.error('Consent submission error:', error);
            return {
                success: false,
                error: error.message,
                statusCode: error.statusCode
            };
        }
    }

    /**
     * Send email with PDF attachment
     */
    async sendEmail(emailData) {
        try {
            const response = await this.makeRequest('/api/email/send', {
                method: 'POST',
                body: JSON.stringify(emailData)
            });

            return {
                success: true,
                data: response,
                message: 'E-posta başarıyla gönderildi'
            };

        } catch (error) {
            console.error('Email sending error:', error);
            return {
                success: false,
                error: error.message,
                statusCode: error.statusCode
            };
        }
    }

    /**
     * Check server health
     */
    async checkHealth() {
        try {
            const response = await this.makeRequest('/api/health', {
                method: 'GET'
            });

            return {
                success: true,
                data: response,
                message: 'Sunucu çalışıyor'
            };

        } catch (error) {
            console.error('Health check error:', error);
            return {
                success: false,
                error: error.message,
                statusCode: error.statusCode
            };
        }
    }

    /**
     * Upload PDF and get processed result
     */
    async uploadPDF(pdfBlob, formData) {
        try {
            const formDataObj = new FormData();
            formDataObj.append('pdf', pdfBlob, 'consent-form.pdf');
            formDataObj.append('formData', JSON.stringify(formData));

            const response = await this.makeRequest('/api/pdf/process', {
                method: 'POST',
                body: formDataObj,
                headers: {} // Remove Content-Type for FormData
            });

            return {
                success: true,
                data: response,
                message: 'PDF başarıyla işlendi'
            };

        } catch (error) {
            console.error('PDF upload error:', error);
            return {
                success: false,
                error: error.message,
                statusCode: error.statusCode
            };
        }
    }

    /**
     * Get configuration from server
     */
    async getConfig() {
        try {
            const response = await this.makeRequest('/api/config', {
                method: 'GET'
            });

            return {
                success: true,
                data: response
            };

        } catch (error) {
            console.error('Config fetch error:', error);
            return {
                success: false,
                error: error.message,
                statusCode: error.statusCode
            };
        }
    }

    /**
     * Generate filename for PDF
     */
    generateFilename(formData) {
        const date = new Date().toISOString().split('T')[0];
        const patientName = formData.patientName
            .replace(/[^a-zA-ZğüşıöçĞÜŞİÖÇ\s]/g, '')
            .replace(/\s+/g, '_')
            .toLowerCase();
        
        return `KVKK_Onay_${patientName}_${date}.pdf`;
    }

    /**
     * Handle retry logic for failed requests
     */
    async retryRequest(requestFn, maxRetries = 3, delay = 1000) {
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await requestFn();
            } catch (error) {
                lastError = error;
                
                // Don't retry on client errors (4xx)
                if (error.statusCode >= 400 && error.statusCode < 500) {
                    throw error;
                }

                if (attempt < maxRetries) {
                    await this.sleep(delay * attempt); // Exponential backoff
                }
            }
        }

        throw lastError;
    }

    /**
     * Sleep utility for retry delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Set base URL
     */
    setBaseURL(url) {
        this.baseURL = url;
    }

    /**
     * Set timeout
     */
    setTimeout(timeout) {
        this.timeout = timeout;
    }

    /**
     * Create request with progress tracking
     */
    async makeRequestWithProgress(endpoint, options = {}, onProgress = null) {
        if (!onProgress) {
            return this.makeRequest(endpoint, options);
        }

        const url = `${this.baseURL}${endpoint}`;
        
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            
            // Setup progress tracking
            if (xhr.upload && options.body instanceof FormData) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = (e.loaded / e.total) * 100;
                        onProgress({ type: 'upload', percent: percentComplete });
                    }
                });
            }

            xhr.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    onProgress({ type: 'download', percent: percentComplete });
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch (e) {
                        resolve(xhr.responseText);
                    }
                } else {
                    reject(new APIError(`HTTP ${xhr.status}: ${xhr.statusText}`, xhr.status));
                }
            });

            xhr.addEventListener('error', () => {
                reject(new APIError('Network error occurred', 0));
            });

            xhr.addEventListener('timeout', () => {
                reject(new APIError('Request timed out', 408));
            });

            // Setup request
            xhr.open(options.method || 'GET', url);
            xhr.timeout = this.timeout;

            // Set headers
            if (options.headers && !(options.body instanceof FormData)) {
                Object.entries(options.headers).forEach(([key, value]) => {
                    xhr.setRequestHeader(key, value);
                });
            }

            // Send request
            xhr.send(options.body || null);
        });
    }
}

/**
 * Custom API Error class
 */
class APIError extends Error {
    constructor(message, statusCode = 0, data = null) {
        super(message);
        this.name = 'APIError';
        this.statusCode = statusCode;
        this.data = data;
    }

    /**
     * Check if error is a network error
     */
    isNetworkError() {
        return this.statusCode === 0;
    }

    /**
     * Check if error is a client error (4xx)
     */
    isClientError() {
        return this.statusCode >= 400 && this.statusCode < 500;
    }

    /**
     * Check if error is a server error (5xx)
     */
    isServerError() {
        return this.statusCode >= 500 && this.statusCode < 600;
    }

    /**
     * Get user-friendly error message
     */
    getUserMessage() {
        if (this.isNetworkError()) {
            return 'İnternet bağlantınızı kontrol edin ve tekrar deneyin';
        }

        if (this.statusCode === 408) {
            return 'İstek zaman aşımına uğradı, lütfen tekrar deneyin';
        }

        if (this.isServerError()) {
            return 'Sunucu hatası oluştu, lütfen daha sonra tekrar deneyin';
        }

        return this.message;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { APIClient, APIError };
} else {
    // Browser environment
    window.APIClient = APIClient;
    window.APIError = APIError;
}