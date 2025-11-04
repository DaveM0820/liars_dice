const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8001;

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.php': 'text/html' // We'll handle PHP specially
};

// Discover competitor files from competitors/ directory
function discoverCompetitors() {
  const allFiles = new Set();
  const competitorsDir = path.join(__dirname, 'competitors');
  
  try {
    // Check for starter bot files directly in competitors/
    const botFiles = fs.readdirSync(competitorsDir)
      .filter(file => file.endsWith('.js') && !file.startsWith('test-') && !file.includes('strategy'));
    botFiles.forEach(f => allFiles.add(f));
    
    // Check competitors/Player*/ directories for strategy.js files
    const playerDirs = fs.readdirSync(competitorsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('Player'));
    
    for (const playerDir of playerDirs) {
      const playerNum = playerDir.name.replace('Player', '');
      const strategyPath = path.join(competitorsDir, playerDir.name, 'strategy.js');
      if (fs.existsSync(strategyPath)) {
        allFiles.add(`Player${playerNum}.js`);
      }
    }
  } catch (err) {
    // competitors directory might not exist
  }
  
  return Array.from(allFiles);
}

// Replace PHP competitor discovery with JavaScript
function processPHP(phpContent) {
  const competitorFiles = discoverCompetitors();
  const competitorFilesJson = JSON.stringify(competitorFiles, null, 2);
  
  // Replace PHP variable defaults
  const defaultRounds = 50;
  const defaultSeed = 12345;
  const defaultMaxPlayers = 6;
  
  let html = phpContent;
  
  // Replace PHP echo statements in input values
  html = html.replace(
    /value="<\?php echo htmlspecialchars\(\(string\)\$defaultRounds, ENT_QUOTES\); \?>" /g,
    `value="${defaultRounds}" `
  );
  html = html.replace(
    /value="<\?php echo htmlspecialchars\(\(string\)\$defaultSeed, ENT_QUOTES\); \?>" /g,
    `value="${defaultSeed}" `
  );
  html = html.replace(
    /value="<\?php echo htmlspecialchars\(\(string\)\$defaultMaxPlayers, ENT_QUOTES\); \?>" /g,
    `value="${defaultMaxPlayers}" `
  );
  
  // Replace the entire PHP block at the top
  html = html.replace(/<\?php[\s\S]*?\?>/g, '');
  
  // Replace the window.BOT_FILES script tag (both existing PHP and our injection)
  html = html.replace(
    /<script>[\s\S]*?window\.BOT_FILES[\s\S]*?<\/script>/,
    `<script>
      // Inject server-discovered competitor list
      window.BOT_FILES = ${competitorFilesJson};
    </script>`
  );
  
  // If window.BOT_FILES doesn't exist, add it before tournament.js
  if (!html.includes('window.BOT_FILES')) {
    html = html.replace(
      /<script src="tournament.js"><\/script>/,
      `<script>
      // Inject server-discovered competitor list
      window.BOT_FILES = ${competitorFilesJson};
    </script>
    <script src="tournament.js"></script>`
    );
  }
  
  return html;
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  // Default to index.php
  if (pathname === '/') {
    pathname = '/index.php';
  }

  // Handle bots/ requests - serve from competitors/ directory
  if (pathname.startsWith('/bots/')) {
    const fileName = path.basename(pathname);
    
    // Check if it's a Player file (Player1.js, Player2.js, etc.)
    if (fileName.startsWith('Player') && fileName.endsWith('.js')) {
      const playerNum = fileName.replace('Player', '').replace('.js', '');
      const strategyPath = path.join(__dirname, 'competitors', `Player${playerNum}`, 'strategy.js');
      
      if (fs.existsSync(strategyPath)) {
        fs.readFile(strategyPath, (err, content) => {
          if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'application/javascript' });
            res.end(content, 'utf-8');
          }
        });
        return;
      }
    }
    
    // Check for starter bots in competitors/ directory
    const competitorBotPath = path.join(__dirname, 'competitors', fileName);
    
    if (fs.existsSync(competitorBotPath)) {
      fs.readFile(competitorBotPath, (err, content) => {
        if (!err) {
          res.writeHead(200, { 'Content-Type': 'application/javascript' });
          res.end(content, 'utf-8');
          return;
        }
      });
    }
  }

  const filePath = path.join(__dirname, pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      // Determine content type
      const ext = path.parse(filePath).ext;
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      // Handle PHP files specially
      if (ext === '.php') {
        const html = processPHP(content.toString());
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html, 'utf-8');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Found ${discoverCompetitors().length} competitor(s): ${discoverCompetitors().join(', ')}`);
});
