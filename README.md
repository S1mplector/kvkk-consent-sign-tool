# KVKK Consent Tool

A web utility for KVKK (Personal Data Protection Law) consent form signing with PDF viewing and digital consent collection.

## Project Structure

```
sign-tool/
├── index.html                 # Main HTML file
├── package.json              # Project configuration
├── README.md                 # This file
└── src/
    ├── js/
    │   └── app.js            # Main application logic
    ├── styles/
    │   ├── main.css          # Base styles
    │   ├── components.css    # Component-specific styles
    │   └── mobile.css        # Mobile-responsive styles
    └── resources/
        └── assets/
            ├── logo.png      # Company logo
            └── example.pdf   # KVKK form PDF
```

## Getting Started

### Prerequisites

- Modern web browser with JavaScript enabled
- Python 3.x (for local development server)

### Running the Application

1. **Clone or download** the project to your local machine

2. **Navigate** to the project directory:
   ```bash
   cd sign-tool
   ```

3. **Start a local server**:
   ```bash
   # Using Python (recommended)
   python -m http.server 8000
   
   # Or using npm script
   npm start
   ```

4. **Open your browser** and navigate to:
   ```
   http://localhost:8000
   ```

## Usage

1. **View PDF**: The KVKK form will load automatically
2. **Navigate**: Use swipe gestures (mobile) or arrow buttons to navigate pages
3. **Consent**: Read through all pages, then check "Okudum, anlıyorum"
4. **Submit**: Click "Onayla ve Gönder" to submit your consent

## Technical Details

### Technologies Used

- **HTML5**: Semantic markup with accessibility features
- **CSS3**: Modern styling with Flexbox, Grid, and animations
- **Vanilla JavaScript**: ES6+ features, async/await, classes
- **PDF.js**: Mozilla's PDF rendering library
- **Responsive Design**: Mobile-first approach with media queries

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

## Customization

### Adding Your Logo

Replace `src/resources/assets/logo.png` with your company logo.

### Updating the PDF

Replace `src/resources/assets/example.pdf` with your KVKK form.

### Styling

Modify the CSS files in `src/styles/` to match your brand colors and design.

## License

MIT License - feel free to use this project as a starting point for your own KVKK consent tools.

## Support

For questions or issues, please refer to the documentation or create an issue in the project repository.
