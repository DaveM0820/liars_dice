<?php
/* 
  Liar’s Dice Tournament — index.php
  */

// Discover /bots/*.js (filenames only)
$botDir = __DIR__ . '/bots';
$files = is_dir($botDir) ? glob($botDir . '/*.js') : [];
$botFiles = array_map('basename', $files);

// Sensible defaults
$defaultRounds = 50;
$defaultSeed = 12345;
$defaultMaxPlayers = 6;
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Liar’s Dice — Classroom Tournament</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div class="header-stripe" aria-hidden="true"></div>
  <div id="stage">
    <h1>Liar’s Dice — Classroom Tournament</h1>

    <noscript>
      <p role="alert" style="padding:12px;border:2px solid #c00;border-radius:8px;">
        JavaScript is required to run the tournament.
      </p>
    </noscript>

    <div class="layout">
      <!-- Collapsible sidebar: Bot picker -->
      <aside class="sidebar" id="sidebar" aria-labelledby="sidebar-title">
        <div class="sidebar__header">
          <div class="sidebar__title" id="sidebar-title">Bots</div>
          <button id="sidebar-toggle" class="sidebar__toggle" aria-expanded="true" type="button">Hide</button>
        </div>

        <p class="label">Detected in <code>/bots</code> (check to include):</p>
        <div id="bot-picker" role="group" aria-label="Available bots">
          <!-- Filled by JS -->
        </div>

        <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
          <button id="select-all" type="button" title="Select all bots">Select All</button>
          <button id="clear-all"  type="button" title="Clear all selections">Clear</button>
          <button id="random-five" type="button" title="Pick 5 random bots">Random 5</button>
        </div>

        <p class="label" style="margin-top:12px;">
          Tip: Students submit a single <code>.js</code> file each to <code>/bots</code>.
        </p>
      </aside>

      <!-- Main panel -->
      <main>
        <!-- Controls -->
        <div class="controls" role="group" aria-label="Tournament controls">
          <label>
            <span class="label">Rounds (Games)</span><br/>
            <input id="rounds" type="number" min="1" step="1" value="<?php echo htmlspecialchars((string)$defaultRounds, ENT_QUOTES); ?>" />
          </label>

          <label>
            <span class="label">Seed</span><br/>
            <input id="seed" type="number" step="1" value="<?php echo htmlspecialchars((string)$defaultSeed, ENT_QUOTES); ?>" />
          </label>

          <label>
            <span class="label">Max Players per Game</span><br/>
            <input id="maxPlayers" type="number" min="2" max="20" step="1" value="<?php echo htmlspecialchars((string)$defaultMaxPlayers, ENT_QUOTES); ?>" />
          </label>

          <label style="min-width:160px;">
            <span class="label">Turn Delay (ms)</span><br/>
            <input id="turnDelay" type="range" min="0" max="1200" step="10" value="250" aria-valuemin="0" aria-valuemax="1200" />
          </label>

          <label style="display:flex; align-items:center; gap:6px; margin-top:20px;">
            <input id="showDice" type="checkbox" checked="checked" />
            <span>Show Dice</span>
          </label>

          <label style="display:flex; align-items:center; gap:6px; margin-top:20px;">
            <input id="fastSim" type="checkbox" />
            <span>FAST simulate</span>
          </label>

          <div style="display:flex; gap:8px; align-items:center;">
            <button id="start" type="button" title="Start a new run">Start</button>
            <button id="pause" type="button" aria-pressed="false" title="Pause / Resume">Pause</button>
            <button id="step"  type="button" title="Step one action while paused">Step</button>
          </div>
        </div>

        <!-- Canvas table -->
        <canvas id="table" width="1000" height="420" aria-label="Tournament table"></canvas>

        <!-- Debug log (hidden/quiet in FAST mode by JS) -->
        <pre id="log" aria-live="polite"></pre>

        <!-- Results -->
        <div id="results" class="results" aria-live="polite"></div>
      </main>
    </div>
  </div>

  <script>
    // Inject server-discovered bot list
    window.BOT_FILES = <?php echo json_encode(array_values($botFiles), JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE); ?>;
  </script>
  <script src="tournament.js"></script>
</body>
</html>
