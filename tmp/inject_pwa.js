const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
    const filePath = path.join(publicDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    let modified = false;

    // Inject manifest if not exists
    if (!content.includes('manifest.json')) {
        content = content.replace('</head>', '    <link rel="manifest" href="manifest.json">\n</head>');
        modified = true;
    }

    // Inject pwa.js if not exists
    if (!content.includes('pwa.js')) {
        content = content.replace('</body>', '    <script src="js/pwa.js"></script>\n</body>');
        modified = true;
    }

    // Inject theme-color
    if (!content.includes('theme-color')) {
        content = content.replace('</head>', '    <meta name="theme-color" content="#4F46E5">\n</head>');
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(filePath, content);
        console.log(`Injected PWA tags into ${file}`);
    }
});
