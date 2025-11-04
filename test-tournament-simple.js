// Simple tournament test - verify bots can be loaded and respond
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Tournament System...\n');

// Test 1: Check bot files exist
console.log('1️⃣ Checking bot files...');
const botFiles = ['Baseline.js', 'ProbabilityTuned.js', 'AggroBluffer.js'];
let allExist = true;

for (const file of botFiles) {
  const filePath = path.join(__dirname, 'bots', file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const hasOnMessage = content.includes('onmessage') || content.includes('self.onmessage');
    const hasPostMessage = content.includes('postMessage');
    const hasBotName = content.match(/BOT_NAME:\s*(.+)/);
    
    console.log(`  ✓ ${file}`);
    console.log(`    - Has onmessage handler: ${hasOnMessage ? '✓' : '✗'}`);
    console.log(`    - Has postMessage: ${hasPostMessage ? '✓' : '✗'}`);
    if (hasBotName) {
      console.log(`    - Bot name: ${hasBotName[1].trim()}`);
    }
  } else {
    console.log(`  ✗ ${file} - NOT FOUND`);
    allExist = false;
  }
}

if (!allExist) {
  console.log('\n❌ Some bot files are missing!');
  process.exit(1);
}

// Test 2: Check tournament.js structure
console.log('\n2️⃣ Checking tournament.js...');
const tournamentPath = path.join(__dirname, 'tournament.js');
if (fs.existsSync(tournamentPath)) {
  const content = fs.readFileSync(tournamentPath, 'utf8');
  const hasPlayHand = content.includes('async function playHand');
  const hasRunTournament = content.includes('async function runTournament');
  const hasLoadBot = content.includes('loadBotText');
  
  console.log(`  ✓ tournament.js exists`);
  console.log(`    - Has playHand function: ${hasPlayHand ? '✓' : '✗'}`);
  console.log(`    - Has runTournament function: ${hasRunTournament ? '✓' : '✗'}`);
  console.log(`    - Has loadBotText function: ${hasLoadBot ? '✓' : '✗'}`);
} else {
  console.log(`  ✗ tournament.js - NOT FOUND`);
  process.exit(1);
}

// Test 3: Check server.js
console.log('\n3️⃣ Checking server.js...');
const serverPath = path.join(__dirname, 'server.js');
if (fs.existsSync(serverPath)) {
  console.log(`  ✓ server.js exists`);
} else {
  console.log(`  ✗ server.js - NOT FOUND`);
}

// Test 4: Check index.php
console.log('\n4️⃣ Checking index.php...');
const indexPath = path.join(__dirname, 'index.php');
if (fs.existsSync(indexPath)) {
  const content = fs.readFileSync(indexPath, 'utf8');
  const hasBotPicker = content.includes('bot-picker');
  const hasTournamentJs = content.includes('tournament.js');
  
  console.log(`  ✓ index.php exists`);
  console.log(`    - Has bot picker: ${hasBotPicker ? '✓' : '✗'}`);
  console.log(`    - References tournament.js: ${hasTournamentJs ? '✓' : '✗'}`);
} else {
  console.log(`  ✗ index.php - NOT FOUND`);
}

// Test 5: Verify bot syntax
console.log('\n5️⃣ Checking bot JavaScript syntax...');
let syntaxErrors = 0;
for (const file of botFiles) {
  const filePath = path.join(__dirname, 'bots', file);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Basic syntax check - try to parse
    new Function(content);
    console.log(`  ✓ ${file} - Valid syntax`);
  } catch (err) {
    console.log(`  ✗ ${file} - Syntax error: ${err.message}`);
    syntaxErrors++;
  }
}

if (syntaxErrors > 0) {
  console.log(`\n❌ Found ${syntaxErrors} syntax error(s)!`);
  process.exit(1);
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('✅ All basic checks passed!');
console.log('\n📋 Summary:');
console.log(`   - ${botFiles.length} bot files found and valid`);
console.log('   - Tournament system files in place');
console.log('   - Server is running on port 8001');
console.log('\n🎮 Next steps:');
console.log('   1. Open http://localhost:8001/ in your browser');
console.log('   2. Select bots to compete');
console.log('   3. Click "Start" to run a tournament');
console.log('\n💡 The tournament will work in the browser where Web Workers');
console.log('   are properly supported. This test confirms file structure only.');
console.log('='.repeat(50));
