# KVKK Consent Tool

A web utility for KVKK (Personal Data Protection Law) consent form signing with PDF viewing and digital consent collection.

## Project Structure

```
sign-tool/
├── index.html                 # Main HTML file
├── package.json              # Project configuration
├── proxy-server.js           # Reverse proxy server (NEW)
├── README.md                 # This file
├── backend/                  # Backend API server
│   ├── server.js            # Express server
│   ├── routes/              # API routes
│   ├── services/            # Business logic
│   └── templates/           # Email templates
└── src/
    ├── js/
    │   ├── app.js           # Main application logic
    │   ├── components/      # UI components
    │   └── utils/           # Utility functions
    ├── styles/
    │   ├── main.css         # Base styles
    │   ├── components.css   # Component-specific styles
    │   └── mobile.css       # Mobile-responsive styles
    └── resources/
        └── assets/
            ├── logo.png     # Company logo
            └── *.pdf        # KVKK form PDFs
```

## Features

- **Single Port Operation**: Entire application runs on one port using reverse proxy
- **Digital Signatures**: Capture and embed signatures directly into PDFs
- **Email Delivery**: Automatic email sending with signed consent forms
- **Mobile Optimized**: Touch-friendly interface with gesture support
- **Multi-Role Support**: Different forms for patients vs. patient relatives
- **PDF Processing**: View, navigate, and sign PDF documents in-browser

## Getting Started

### Prerequisites

- Modern web browser with JavaScript enabled
- Node.js 14+ and npm (for backend and proxy server)
- Python 3.x (optional, for legacy frontend-only mode)

### Installation

1. **Clone or download** the project to your local machine

2. **Navigate** to the project directory:
   ```bash
   cd sign-tool
   ```

3. **Install dependencies**:
   ```bash
   # Install main dependencies
   npm install
   
   # Install backend dependencies
   cd backend
   npm install
   cd ..
   ```

4. **Configure backend** (for email functionality):
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your email configuration
   cd ..
   ```

### Running the Application

#### Option 1: Unified Server with Proxy (Recommended)
This runs both frontend and backend on a single port (8080), perfect for ngrok:

```bash
npm start
# or
npm run proxy
```

Access the application at: **http://localhost:8080**

#### Option 2: Legacy Mode (Separate Servers)
Run frontend and backend on separate ports:

```bash
# Frontend only (no backend features)
npm run frontend

# Or run both separately
npm run dev:legacy
```

- Frontend: http://localhost:8000
- Backend API: http://localhost:3000

### Using with ngrok

With the proxy server, expose the entire application with one command:

```bash
# Terminal 1: Start the proxy server
npm start

# Terminal 2: Start ngrok
ngrok http 8080
```

Your application will be accessible at the ngrok URL (e.g., https://abc123.ngrok.io)

## Usage

1. **View PDF**: The KVKK form will load automatically
2. **Navigate**: Use swipe gestures (mobile) or arrow buttons to navigate pages
3. **Consent**: Read through all pages, then check "Okudum, anlıyorum"
4. **Submit**: Click "Onayla ve Gönder" to submit your consent

## Technical Details

### Technologies Used

- **Frontend**:
  - HTML5: Semantic markup with accessibility features
  - CSS3: Modern styling with Flexbox, Grid, and animations
  - Vanilla JavaScript: ES6+ features, async/await, classes
  - PDF.js: Mozilla's PDF rendering library
  - Signature Pad: Digital signature capture
  - PDF-lib: PDF manipulation and signature embedding

- **Backend**:
  - Node.js & Express: RESTful API server
  - Nodemailer: Email delivery service
  - Multer: File upload handling
  - Express Rate Limit: API protection

- **Proxy Server**:
  - Express: Static file serving
  - http-proxy-middleware: API request forwarding
  - Unified port operation for simplified deployment

### Browser Support

- Chrome/Chromium 80+
- Firefox 75+
- Safari 13+
- Edge 80+

### Performance Features

- Lazy loading of PDF pages
- Touch-optimized interactions
- Smooth animations with hardware acceleration
- Minimal external dependencies

## Deployment

### Quick Deployment with ngrok

1. Start the proxy server:
   ```bash
   npm start
   ```

2. Create ngrok tunnel:
   ```bash
   ngrok http 8080
   ```

3. Share the ngrok URL with users

### Production Deployment

See [PROXY_SERVER_SETUP.md](PROXY_SERVER_SETUP.md) for detailed production deployment instructions.

## Customization

### Adding Your Logo

Replace `src/resources/assets/logo.png` with your company logo.

### Updating the PDF Forms

Place your KVKK consent forms in `src/resources/assets/`:
- `KVKK.pdf` - For patients
- `Açık Rıza Metni.pdf` - For patient relatives

### Styling

Modify the CSS files in `src/styles/` to match your brand colors and design.

### Email Configuration

Edit `backend/.env` to configure email settings:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM="Your Company <noreply@company.com>"
```

## License

MIT License - feel free to use this project as a starting point for your own KVKK consent tools.

## Support

For questions or issues, please refer to the documentation or create an issue in the project repository.
