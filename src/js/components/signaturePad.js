/**
 * Signature Pad Component
 * Mobile-optimized digital signature capture using Signature Pad library
 */
class SignaturePadComponent {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            backgroundColor: 'rgba(255, 255, 255, 0)',
            penColor: 'rgb(0, 0, 0)',
            velocityFilterWeight: 0.7,
            minWidth: 0.5,
            maxWidth: 2.5,
            throttle: 16,
            minDistance: 5,
            ...options
        };
        this.signaturePad = null;
        this.canvas = null;
        this.isEmpty = true;
        this.init();
    }

    init() {
        this.render();
        this.setupSignaturePad();
        this.setupEventListeners();
        this.setupResizeHandler();
    }

    render() {
        this.container.innerHTML = `
            <div class="signature-pad-container">
                <div class="signature-header">
                    <h3 class="signature-title">
                        <span class="signature-icon" aria-hidden="true">✍️</span>
                        Dijital İmza
                    </h3>
                    <p class="signature-description">
                        Lütfen aşağıdaki alana parmağınız veya kalem ile imzanızı atın
                    </p>
                </div>

                <div class="signature-canvas-container">
                    <canvas 
                        id="signatureCanvas" 
                        class="signature-canvas"
                        aria-label="İmza alanı"
                        role="img"
                        tabindex="0"
                    ></canvas>
                    
                    <div class="signature-placeholder" id="signaturePlaceholder">
                        <div class="placeholder-content">
                            <span class="placeholder-icon" aria-hidden="true">✍️</span>
                            <span class="placeholder-text">Buraya imzalayın</span>
                        </div>
                    </div>
                </div>

                <div class="signature-controls">
                    <button 
                        type="button" 
                        id="clearSignature" 
                        class="signature-btn clear-btn"
                        aria-describedby="clear-description"
                    >
                        <span class="btn-icon" aria-hidden="true">🗑️</span>
                        Temizle
                    </button>
                    <div id="clear-description" class="visually-hidden">
                        İmzayı temizle ve yeniden başla
                    </div>

                    <button 
                        type="button" 
                        id="undoSignature" 
                        class="signature-btn undo-btn"
                        disabled
                        aria-describedby="undo-description"
                    >
                        <span class="btn-icon" aria-hidden="true">↶</span>
                        Geri Al
                    </button>
                    <div id="undo-description" class="visually-hidden">
                        Son çizgiyi geri al
                    </div>
                </div>

                <div class="signature-validation">
                    <div id="signature-error" class="error-message" role="alert"></div>
                    <div class="signature-status" id="signatureStatus" aria-live="polite">
                        İmza bekleniyor...
                    </div>
                </div>
            </div>
        `;
    }

    setupSignaturePad() {
        this.canvas = this.container.querySelector('#signatureCanvas');
        
        // Set canvas size
        this.resizeCanvas();
        
        // Initialize Signature Pad
        this.signaturePad = new SignaturePad(this.canvas, this.options);
        
        // Setup signature pad events
        this.signaturePad.addEventListener('beginStroke', () => {
            this.onSignatureStart();
        });

        this.signaturePad.addEventListener('endStroke', () => {
            this.onSignatureEnd();
        });

        // Initial state
        this.updateSignatureState();
    }

    setupEventListeners() {
        const clearBtn = this.container.querySelector('#clearSignature');
        const undoBtn = this.container.querySelector('#undoSignature');
        const canvas = this.canvas;

        // Clear button
        clearBtn.addEventListener('click', () => {
            this.clear();
            this.announceAction('İmza temizlendi');
        });

        // Undo button
        undoBtn.addEventListener('click', () => {
            this.undo();
            this.announceAction('Son çizgi geri alındı');
        });

        // Canvas keyboard support
        canvas.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'Delete':
                case 'Backspace':
                    e.preventDefault();
                    this.clear();
                    break;
                case 'z':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.undo();
                    }
                    break;
            }
        });

        // Touch event optimization for mobile
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
        }, { passive: false });
    }

    setupResizeHandler() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.resizeCanvas();
            }, 250);
        });
    }

    resizeCanvas() {
        const container = this.container.querySelector('.signature-canvas-container');
        const containerRect = container.getBoundingClientRect();
        
        // Set canvas size based on container
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const width = containerRect.width;
        const height = Math.min(containerRect.height, 200); // Max height of 200px
        
        this.canvas.width = width * ratio;
        this.canvas.height = height * ratio;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        
        const ctx = this.canvas.getContext('2d');
        ctx.scale(ratio, ratio);
        
        // Reconfigure signature pad if it exists
        if (this.signaturePad) {
            this.signaturePad.clear();
            this.updateSignatureState();
        }
    }

    onSignatureStart() {
        this.hidePlaceholder();
        this.clearError();
    }

    onSignatureEnd() {
        this.isEmpty = this.signaturePad.isEmpty();
        this.updateSignatureState();
        
        if (!this.isEmpty) {
            this.announceAction('İmza eklendi');
        }
    }

    updateSignatureState() {
        const placeholder = this.container.querySelector('#signaturePlaceholder');
        const undoBtn = this.container.querySelector('#undoSignature');
        const statusElement = this.container.querySelector('#signatureStatus');
        
        this.isEmpty = this.signaturePad.isEmpty();
        
        if (this.isEmpty) {
            placeholder.style.display = 'flex';
            undoBtn.disabled = true;
            statusElement.textContent = 'İmza bekleniyor...';
            statusElement.className = 'signature-status waiting';
        } else {
            placeholder.style.display = 'none';
            undoBtn.disabled = false;
            statusElement.textContent = 'İmza alındı ✓';
            statusElement.className = 'signature-status completed';
        }
    }

    hidePlaceholder() {
        const placeholder = this.container.querySelector('#signaturePlaceholder');
        placeholder.style.display = 'none';
    }

    clear() {
        if (this.signaturePad) {
            this.signaturePad.clear();
            this.updateSignatureState();
            this.clearError();
        }
    }

    undo() {
        if (this.signaturePad && !this.signaturePad.isEmpty()) {
            const data = this.signaturePad.toData();
            if (data.length > 0) {
                data.pop(); // Remove last stroke
                this.signaturePad.fromData(data);
                this.updateSignatureState();
            }
        }
    }

    getSignatureData() {
        if (this.signaturePad && !this.signaturePad.isEmpty()) {
            return {
                dataURL: this.signaturePad.toDataURL('image/png'),
                svg: this.signaturePad.toSVG(),
                data: this.signaturePad.toData(),
                isEmpty: false
            };
        }
        return {
            dataURL: null,
            svg: null,
            data: null,
            isEmpty: true
        };
    }

    setSignatureData(data) {
        if (this.signaturePad && data && data.data) {
            this.signaturePad.fromData(data.data);
            this.updateSignatureState();
        }
    }

    validate() {
        if (this.signaturePad.isEmpty()) {
            this.showError('Lütfen imzanızı atın');
            return false;
        }
        
        this.clearError();
        return true;
    }

    showError(message) {
        const errorElement = this.container.querySelector('#signature-error');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        
        // Add error styling to canvas
        this.canvas.classList.add('error');
        this.canvas.setAttribute('aria-invalid', 'true');
    }

    clearError() {
        const errorElement = this.container.querySelector('#signature-error');
        errorElement.textContent = '';
        errorElement.style.display = 'none';
        
        // Remove error styling
        this.canvas.classList.remove('error');
        this.canvas.setAttribute('aria-invalid', 'false');
    }

    announceAction(message) {
        // Create temporary announcement for screen readers
        const announcer = document.createElement('div');
        announcer.setAttribute('aria-live', 'polite');
        announcer.setAttribute('aria-atomic', 'true');
        announcer.className = 'visually-hidden';
        announcer.textContent = message;
        
        document.body.appendChild(announcer);
        setTimeout(() => {
            document.body.removeChild(announcer);
        }, 1000);
    }

    isEmpty() {
        return this.signaturePad ? this.signaturePad.isEmpty() : true;
    }

    hide() {
        this.container.style.display = 'none';
    }

    show() {
        this.container.style.display = 'block';
        // Resize canvas when showing to ensure proper dimensions
        setTimeout(() => {
            this.resizeCanvas();
        }, 100);
    }

    destroy() {
        if (this.signaturePad) {
            this.signaturePad.off();
        }
        
        // Remove resize listener
        window.removeEventListener('resize', this.resizeCanvas);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SignaturePadComponent;
}