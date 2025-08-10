// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  // Initialize DOM elements
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // DOM Elements
  const authOverlay = document.getElementById('authOverlay');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const loginBtn = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const showSignupBtn = document.getElementById('showSignupBtn');
  const showLoginBtn = document.getElementById('showLoginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const currentUsername = document.getElementById('currentUsername');

  const mainMenu = document.getElementById('mainMenu');
  const gameSettings = document.getElementById('gameSettings');
  const playButton = document.getElementById('playButton');
  const gameModeOptions = document.getElementById('gameModeOptions');
  const vsAIButton = document.getElementById('vsAI');
  const onlineButton = document.getElementById('online');
  const btnBackToMain = document.getElementById('btnBackToMain');
  const startButton = document.getElementById('startButton');
  const draftOverlay = document.getElementById('draftOverlay');
  const draftPlayerLabel = document.getElementById('draftPlayerLabel');
  const cardGrid = document.getElementById('cardGrid');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const btnResume = document.getElementById('btnResume');
  const btnQuit = document.getElementById('btnQuit');
  const leaderboardOverlay = document.getElementById('leaderboardOverlay');
  const leaderboardButton = document.getElementById('leaderboardButton');
  const closeLeaderboard = document.getElementById('closeLeaderboard');
  const rankDisplay = document.getElementById('rankDisplay');
  const rankName = document.querySelector('.rank-name');
  const rankDivision = document.querySelector('.rank-division');
  const rankIcon = document.querySelector('.rank-icon');

  let paused = false;

  // Ranking System
  const RANKS = {
    BRONZE: { name: 'Bronze', icon: '🥉', color: '#cd7f32', versions: 3, divisions: 3 },
    SILVER: { name: 'Silver', icon: '🥈', color: '#c0c0c0', versions: 3, divisions: 3 },
    GOLD: { name: 'Gold', icon: '🥇', color: '#ffd700', versions: 3, divisions: 3 },
    PLATINUM: { name: 'Platinum', icon: '💎', color: '#e5e4e2', versions: 3, divisions: 3 },
    DIAMOND: { name: 'Diamond', icon: '💠', color: '#b9f2ff', versions: 3, divisions: 3 },
    MASTER: { name: 'Master Gunman', icon: '👑', color: '#ff6b35', versions: 1, divisions: 0 }
  };

  const RANK_ORDER = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'MASTER'];

  // User authentication system
  let currentUser = null;
  let users = {};

  // Player ranking data (stored in localStorage)
  let playerRank = {
    rank: 'BRONZE',
    version: 1,
    division: 1,
    wins: 0,
    losses: 0,
    totalGames: 0
  };

  // Real leaderboard data (stored in localStorage)
  let leaderboardData = [];

  // Load data from localStorage
  function loadData() {
    // Load users
    const savedUsers = localStorage.getItem('gameUsers');
    if (savedUsers) {
      users = JSON.parse(savedUsers);
    }
    
    // Load leaderboard
    const savedLeaderboard = localStorage.getItem('gameLeaderboard');
    if (savedLeaderboard) {
      leaderboardData = JSON.parse(savedLeaderboard);
    } else {
      // Initialize with some real-looking data
      initializeLeaderboard();
    }
    
    // Load current user (optional)
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      currentUser = JSON.parse(savedUser);
    }
    
    // Main menu will be shown after data loads
  }

  // Save data to localStorage
  function saveData() {
    localStorage.setItem('gameUsers', JSON.stringify(users));
    localStorage.setItem('gameLeaderboard', JSON.stringify(leaderboardData));
    if (currentUser) {
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
    }
  }

  // Initialize leaderboard with realistic data
  function initializeLeaderboard() {
    // Start with empty leaderboard - only real players will be added
    leaderboardData = [];
  }

  // User authentication functions
  function showAuthOverlay() {
    authOverlay.classList.remove('hidden');
    mainMenu.classList.add('hidden');
  }

  function hideAuthOverlay() {
    authOverlay.classList.add('hidden');
  }

  function showMainMenu() {
    mainMenu.classList.remove('hidden');
    gameSettings.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    draftOverlay.classList.add('hidden');
    leaderboardOverlay.classList.add('hidden');
    gameModeOptions.classList.remove('show');
    
    // Update user info display
    if (currentUser) {
      currentUsername.textContent = currentUser.username;
      document.getElementById('mainMenuLoginBtn').style.display = 'none';
      document.getElementById('logoutBtn').style.display = 'block';
    } else {
      currentUsername.textContent = 'Guest Player';
      document.getElementById('mainMenuLoginBtn').style.display = 'block';
      document.getElementById('logoutBtn').style.display = 'none';
    }
    
    loadPlayerRank();
  }

  function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    showMainMenu(); // Changed from showAuthOverlay to showMainMenu
  }

  // Load player rank from localStorage
  function loadPlayerRank() {
    if (currentUser) {
      // Load player rank data from localStorage
      const savedRank = localStorage.getItem(`playerRank_${currentUser.username}`);
      if (savedRank) {
        playerRank = JSON.parse(savedRank);
      } else {
        // Initialize new player at Bronze 1
        playerRank = {
          rank: 'BRONZE',
          version: 1,
          division: 1,
          wins: 0,
          losses: 0,
          totalGames: 0
        };
      }
    } else {
      // Guest player - use temporary rank
      playerRank = {
        rank: 'BRONZE',
        version: 1,
        division: 1,
        wins: 0,
        losses: 0,
        totalGames: 0
      };
    }
    
    updateRankDisplay();
  }

  // Save player rank to localStorage
  function savePlayerRank() {
    if (currentUser) {
      // Only save rank data for authenticated users
      localStorage.setItem(`playerRank_${currentUser.username}`, JSON.stringify(playerRank));
    }
    // Guest users don't have persistent rank data
  }

  // Update rank display
  function updateRankDisplay() {
    const rankData = RANKS[playerRank.rank];
    rankIcon.textContent = rankData.icon;
    rankName.textContent = `${rankData.name} ${playerRank.version}`;
    
    if (rankData.divisions > 0) {
      rankDivision.textContent = `Division ${playerRank.division}`;
      rankDivision.style.display = 'block';
    } else {
      rankDivision.style.display = 'none';
    }
  }

  // Handle win/loss and rank progression
  function handleGameResult(won) {
    if (gameMode !== 'online') return;
    
    if (won) {
      playerRank.wins++;
      playerRank.totalGames++;
      
      // Progress division
      const rankData = RANKS[playerRank.rank];
      if (rankData.divisions > 0) {
        playerRank.division++;
        if (playerRank.division > rankData.divisions) {
          playerRank.division = 1;
          playerRank.version++;
          if (playerRank.version > rankData.versions) {
            // Rank up
            const currentIndex = RANK_ORDER.indexOf(playerRank.rank);
            if (currentIndex < RANK_ORDER.length - 1) {
              playerRank.rank = RANK_ORDER[currentIndex + 1];
              playerRank.version = 1;
              playerRank.division = 1;
            }
          }
        }
      } else {
        // Master Gunman - no divisions, just track wins
        playerRank.wins++;
      }
    } else {
      playerRank.losses++;
      playerRank.totalGames++;
      
      // Lose division
    const rankData = RANKS[playerRank.rank];
    if (rankData.divisions > 0) {
      playerRank.division--;
      if (playerRank.division < 1) {
        playerRank.version--;
        if (playerRank.version < 1) {
          // Rank down
          const currentIndex = RANK_ORDER.indexOf(playerRank.rank);
          if (currentIndex > 0) {
            playerRank.rank = RANK_ORDER[currentIndex - 1];
            const prevRank = RANKS[playerRank.rank];
            playerRank.version = prevRank.versions;
            playerRank.division = prevRank.divisions;
          } else {
            // Can't go below Bronze 1
            playerRank.division = 1;
          }
        } else {
          playerRank.division = rankData.divisions;
        }
      }
    }
  }
  
  savePlayerRank();
  updateRankDisplay();
}



  function showGameSettings() {
    mainMenu.classList.add('hidden');
    gameSettings.classList.remove('hidden');
  }

  function showGameModeOptions() {
    console.log('showGameModeOptions called');
    console.log('gameModeOptions element:', gameModeOptions);
    console.log('gameModeOptions classes before:', gameModeOptions.className);
    gameModeOptions.classList.remove('hidden');
    gameModeOptions.classList.add('show');
    console.log('gameModeOptions classes after:', gameModeOptions.className);
  }

  function hideGameModeOptions() {
    gameModeOptions.classList.remove('show');
    gameModeOptions.classList.add('hidden');
  }

  // Event Listeners
  console.log('Setting up play button event listener');
  console.log('playButton element:', playButton);
  playButton.addEventListener('click', () => {
    console.log('Play button clicked!');
    showGameModeOptions();
  });

  // Pause key binding
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && state === 'playing') {
      setPaused(!paused);
    }
  });

  // Start button event listener
  startButton.addEventListener('click', () => {
    if (gameMode === 'vsAI') {
      const difficulty = document.getElementById('difficulty').value;
      setDifficulty(difficulty);
      state = 'playing';
      bullets = [];
      particles.length = 0;
      buildArena(currentArena);
      currentArena = (currentArena + 1) % 4;
      players[0].reset(); players[1].reset();
      players[0].applyCards(); players[1].applyCards();
      gameSettings.classList.add('hidden');
    } else if (gameMode === 'online') {
      // For now, start with AI but track as online
      state = 'playing';
      bullets = [];
      particles.length = 0;
      buildArena(currentArena);
      currentArena = (currentArena + 1) % 4;
      players[0].reset(); players[1].reset();
      players[0].applyCards(); players[1].applyCards();
      gameSettings.classList.add('hidden');
    }
  });

  vsAIButton.addEventListener('click', () => {
    console.log('VS AI button clicked!');
    gameMode = 'vsAI';
    hideGameModeOptions();
    showGameSettings();
  });

  onlineButton.addEventListener('click', () => {
    console.log('Online button clicked!');
    gameMode = 'online';
    hideGameModeOptions();
    
    // Start online matchmaking
    startOnlineMatchmaking();
  });

  btnBackToMain.addEventListener('click', showMainMenu);

  leaderboardButton.addEventListener('click', () => {
    leaderboardOverlay.classList.remove('hidden');
    populateLeaderboard();
  });

  closeLeaderboard.addEventListener('click', () => {
    leaderboardOverlay.classList.add('hidden');
  });

  // Tab switching for leaderboard
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('hidden'));
      
      btn.classList.add('active');
      const tabName = btn.dataset.tab;
      document.getElementById(tabName + 'Leaderboard').classList.add('active');
    });
  });

  // Populate leaderboard with real data
  function populateLeaderboard() {
    // Global leaderboard
    const globalList = document.getElementById('globalList');
    globalList.innerHTML = '';
    
    leaderboardData.forEach((player, index) => {
      const rankData = RANKS[player.rank];
      const playerEl = document.createElement('div');
      playerEl.className = 'leaderboard-entry';
      
      // Highlight current user
      const isCurrentUser = currentUser && player.username === currentUser.username;
      if (isCurrentUser) {
        playerEl.classList.add('current-user');
      }
      
      playerEl.innerHTML = `
        <div class="entry-rank">#${index + 1}</div>
        <div class="entry-icon">${rankData.icon}</div>
        <div class="entry-name">${player.username}</div>
        <div class="entry-rank-name">${rankData.name}</div>
        <div class="entry-stats">${player.wins}W ${player.losses}L (${player.winRate}%)</div>
      `;
      globalList.appendChild(playerEl);
    });
    
    // Rankings grid
    const rankingsGrid = document.getElementById('rankingsGrid');
    rankingsGrid.innerHTML = '';
    
    RANK_ORDER.forEach(rankKey => {
      const rankData = RANKS[rankKey];
      const rankEl = document.createElement('div');
      rankEl.className = 'ranking-card';
      rankEl.innerHTML = `
        <div class="ranking-header">
          <div class="ranking-icon">${rankData.icon}</div>
          <div class="ranking-name">${rankData.name}</div>
        </div>
        <div class="ranking-structure">
          ${rankData.versions > 1 ? `${rankData.versions} versions` : '1 version'}
          ${rankData.divisions > 0 ? `• ${rankData.divisions} divisions each` : ''}
        </div>
      `;
      rankingsGrid.appendChild(rankEl);
    });
  }

        // Main menu login button (for guest users)
        document.getElementById('mainMenuLoginBtn').addEventListener('click', () => {
          mainMenu.classList.add('hidden');
          authOverlay.classList.remove('hidden');
          loginForm.classList.remove('hidden');
          signupForm.classList.add('hidden');
        });

        // Authentication form event listeners
        document.getElementById('loginBtn').addEventListener('click', handleLogin);
        document.getElementById('signupBtn').addEventListener('click', handleSignup);
        document.getElementById('showSignupBtn').addEventListener('click', () => {
          loginForm.classList.add('hidden');
          signupForm.classList.remove('hidden');
        });
        document.getElementById('showLoginBtn').addEventListener('click', () => {
          signupForm.classList.add('hidden');
          loginForm.classList.remove('hidden');
        });

  // Handle login
  function handleLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
      alert('Please enter both username and password');
      return;
    }
    
    if (users[username] && users[username].password === password) {
      currentUser = { username };
      saveData();
      
      // Clear form fields
      document.getElementById('loginUsername').value = '';
      document.getElementById('loginPassword').value = '';
      
      // Hide auth overlay and return to main menu
      hideAuthOverlay();
      showMainMenu();
    } else {
      alert('Invalid username or password');
    }
  }

  // Handle signup
  function handleSignup() {
    const username = document.getElementById('signupUsername').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    
    if (!username || !password || !confirmPassword) {
      alert('Please fill in all fields');
      return;
    }
    
    if (password !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    
    if (users[username]) {
      alert('Username already exists');
      return;
    }
    
    if (username.length < 3) {
      alert('Username must be at least 3 characters long');
      return;
    }
    
    if (password.length < 6) {
      alert('Password must be at least 6 characters long');
      return;
    }
    
    // Create new user
    users[username] = { password };
    currentUser = { username };
    
    // Add to leaderboard
    leaderboardData.push({
      username,
      rank: 'BRONZE',
      wins: 0,
      losses: 0,
      totalGames: 0,
      winRate: 0
    });
    
    // Sort leaderboard
    leaderboardData.sort((a, b) => {
      const rankA = RANK_ORDER.indexOf(a.rank);
      const rankB = RANK_ORDER.indexOf(b.rank);
      if (rankA !== rankB) return rankB - rankA;
      return b.winRate - a.winRate;
    });
    
    saveData();
    
    // Clear form
    document.getElementById('signupUsername').value = '';
    document.getElementById('signupPassword').value = '';
    document.getElementById('signupConfirmPassword').value = '';
    
    // Hide auth overlay and return to main menu
    hideAuthOverlay();
    showMainMenu();
    }

  // Online Multiplayer Functions
  function startOnlineMatchmaking() {
    if (!currentUser) {
      alert('Please log in to play online');
      return;
    }
    
    isOnline = true;
    state = 'matchmaking';
    
    // Show matchmaking screen
    mainMenu.classList.add('hidden');
    showMatchmakingScreen();
    
    // Simulate finding a match (in a real implementation, this would connect to a server)
    setTimeout(() => {
      findOnlineMatch();
    }, 2000);
  }
  
  function showMatchmakingScreen() {
    // Create matchmaking overlay if it doesn't exist
    let matchmakingOverlay = document.getElementById('matchmakingOverlay');
    if (!matchmakingOverlay) {
      matchmakingOverlay = document.createElement('div');
      matchmakingOverlay.id = 'matchmakingOverlay';
      matchmakingOverlay.className = 'overlay';
      matchmakingOverlay.innerHTML = `
        <div class="menu-card">
          <div class="menu-title accent-title">Finding Match...</div>
          <div class="menu-sub">Searching for opponents</div>
          <div class="matchmaking-status">Connecting to server...</div>
          <div class="menu-row">
            <button id="btnCancelMatchmaking" class="secondary">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(matchmakingOverlay);
      
      // Add cancel button event listener
      document.getElementById('btnCancelMatchmaking').addEventListener('click', () => {
        cancelMatchmaking();
      });
    }
    
    matchmakingOverlay.classList.remove('hidden');
  }
  
  function findOnlineMatch() {
    // Simulate finding a match
    const matchmakingOverlay = document.getElementById('matchmakingOverlay');
    if (matchmakingOverlay) {
      const status = matchmakingOverlay.querySelector('.matchmaking-status');
      status.textContent = 'Match found! Starting game...';
      
      setTimeout(() => {
        startOnlineGame();
      }, 1500);
    }
  }
  
  function startOnlineGame() {
    // Hide matchmaking screen
    const matchmakingOverlay = document.getElementById('matchmakingOverlay');
    if (matchmakingOverlay) {
      matchmakingOverlay.classList.add('hidden');
    }
    
    // Create online opponent (simulated for now)
    const onlineOpponent = new Player(1, '#ff8a80', { ai: false, online: true });
    onlineOpponent.username = 'OnlinePlayer_' + Math.floor(Math.random() * 1000);
    
    // Replace AI player with online player
    players[1] = onlineOpponent;
    
    // Start the game
    state = 'playing';
    bullets = [];
    particles.length = 0;
    buildArena(currentArena);
    currentArena = (currentArena + 1) % 4;
    players[0].reset(); 
    players[1].reset();
    players[0].applyCards(); 
    players[1].applyCards();
    
    // Hide the main menu
    mainMenu.classList.add('hidden');
    
    // Show online indicator
    showOnlineIndicator();
    
    // Set online mode flag
    isOnline = true;
  }
  
  function showOnlineIndicator() {
    // Create online indicator if it doesn't exist
    let onlineIndicator = document.getElementById('onlineIndicator');
    if (!onlineIndicator) {
      onlineIndicator = document.createElement('div');
      onlineIndicator.id = 'onlineIndicator';
      onlineIndicator.className = 'online-indicator';
      onlineIndicator.innerHTML = `
        <div class="online-status">
          <span class="online-dot"></span>
          Online Match
        </div>
      `;
      document.body.appendChild(onlineIndicator);
    }
    
    onlineIndicator.classList.remove('hidden');
  }
  
  function cancelMatchmaking() {
    isOnline = false;
    state = 'menu';
    
    // Hide matchmaking screen
    const matchmakingOverlay = document.getElementById('matchmakingOverlay');
    if (matchmakingOverlay) {
      matchmakingOverlay.classList.add('hidden');
    }
    
    // Return to main menu
    showMainMenu();
  }
  
  function handleOnlineGameResult(won) {
    if (isOnline && currentUser) {
      // Update player stats for online games
      if (won) {
        playerRank.wins++;
        // Update rank progression (simplified)
        if (playerRank.division < 3) {
          playerRank.division++;
        } else if (playerRank.version < 3) {
          playerRank.version++;
          playerRank.division = 1;
        } else if (playerRank.rank !== 'MASTER') {
          const currentRankIndex = RANK_ORDER.indexOf(playerRank.rank);
          if (currentRankIndex < RANK_ORDER.length - 1) {
            playerRank.rank = RANK_ORDER[currentRankIndex + 1];
            playerRank.version = 1;
            playerRank.division = 1;
          }
        }
      } else {
        playerRank.losses++;
        // Update rank regression (simplified)
        if (playerRank.division > 1) {
          playerRank.division--;
        } else if (playerRank.version > 1) {
          playerRank.version--;
          playerRank.division = 3;
        } else if (playerRank.rank !== 'BRONZE') {
          const currentRankIndex = RANK_ORDER.indexOf(playerRank.rank);
          if (currentRankIndex > 0) {
            playerRank.rank = RANK_ORDER[currentRankIndex - 1];
            playerRank.version = 3;
            playerRank.division = 3;
          }
        }
      }
      
      playerRank.totalGames++;
      playerRank.winRate = Math.round((playerRank.wins / playerRank.totalGames) * 100);
      
      savePlayerRank();
      updateRankDisplay();
    }
  }

  // Initialize
  loadData();
  
  // Resize
  function fit() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', fit);
  fit();

  // Game constants
  const G = 1800; // gravity px/s^2
  const JUMP_V = 750;
  const MOVE_A = 3000;
  const MAX_VX = 380;
  const AIR_CTRL = 0.7;
  const FRICTION = 12;

  // Series config: 5 rounds total; each round is best-of-3 engagements
  const SERIES_ROUNDS_TOTAL = 5;
  const ROUND_BEST_OF = 3; // first to 2
  let seriesRoundIndex = 1;
  let roundWins = [0, 0];
  let scores = [0, 0];

  // Mouse aiming
  let mouseX = 0, mouseY = 0;
  window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });

  // Input
  const keys = new Set();
  let jumpPressed = false;
  window.addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'Space') jumpPressed = true; });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  let mouseDown = false;
  window.addEventListener('mousedown', (e) => { if (e.button === 0) mouseDown = true; });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });

  // World platforms (side view) with cool shapes and colors
  let platforms = [];
  function makeDefaultPlatforms() {
    const w = canvas.width, h = canvas.height;
    platforms = [
      // ground - dark stone with subtle texture
      { x: 0, y: h - 60, w: w, h: 60, type: 'ground', color: '#2a2a2a', pattern: 'stone' },
      
      // mid platforms with different shapes and colors
      { x: w * 0.2, y: h * 0.68, w: 220, h: 16, type: 'platform', color: '#4a7c59', pattern: 'rounded', shape: 'rounded' },
      { x: w * 0.6, y: h * 0.56, w: 260, h: 16, type: 'platform', color: '#8b5a96', pattern: 'crystal', shape: 'crystal' },
      { x: w * 0.15, y: h * 0.44, w: 180, h: 16, type: 'platform', color: '#d4a574', pattern: 'wood', shape: 'wood' },
      { x: w * 0.55, y: h * 0.34, w: 220, h: 16, type: 'platform', color: '#6b8e23', pattern: 'grass', shape: 'grass' },
      
      // floating platforms
      { x: w * 0.35, y: h * 0.25, w: 140, h: 12, type: 'platform', color: '#4682b4', pattern: 'ice', shape: 'ice' },
      { x: w * 0.75, y: h * 0.18, w: 160, h: 14, type: 'platform', color: '#daa520', pattern: 'gold', shape: 'gold' },
    ];
  }
  makeDefaultPlatforms();

  // Utils
  function rectsIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function randRange(a, b) { return a + Math.random() * (b - a); }

  // Player with levels map
  class Player {
    constructor(idx, color, controls) {
      this.idx = idx;
      this.color = color;
      this.controls = controls;
      this.w = 40; this.h = 56;
      this.levels = {}; // id -> level (1..4)
      this.reset();
    }
    reset(spawnX, spawnY) {
      this.x = spawnX ?? (this.idx === 0 ? canvas.width * 0.18 : canvas.width * 0.82);
      this.y = spawnY ?? (canvas.height - 60 - this.h);
      this.vx = 0; this.vy = 0;
      this.onGround = false;
      this.maxHp = this.maxHp || 100;
      this.hp = this.maxHp;
      this.reload = 0;
      this.facing = this.idx === 0 ? 1 : -1;
      this.bulletSpeed = 650;
      this.bulletDmg = 18;
      this.fireDelay = 0.35;
      this.knockback = 220;
      this.jumpBoost = 0;
      this.moveBoost = 0;
    this.maxJumps = 1;
    this.jumpsUsed = 0;
    this.pierceLevel = 0;
    this.bounceLevel = 0;
    this.explosiveLevel = 0;
    this.lifesteal = 0;
    this.shieldCooldownMax = 0; this.shieldCooldown = 0; this.shieldCharges = 0; this.shieldCapacity = 0;
    this.aiJumpCd = 0; this.aiOffsetX = 0;
    // mags/reload defaults
    this.magSize = this.magSize || 8;
    this.reloadTime = this.reloadTime || 1.2;
    this.ammoInMag = (this.ammoInMag == null) ? this.magSize : Math.min(this.ammoInMag, this.magSize);
    this.reloading = false; this.reloadTimer = 0;
    this.multishotLevel = this.multishotLevel || 0;
    this.burstLevel = this.burstLevel || 0; this.burstCount = 1; this.burstShotsLeft = 0; this.burstTimer = 0; this.burstInterval = 0.08;
    this.pellets = 0;
    this.applyCards();
  }
  applyCards() {
    // Reset to base first
    const prevLevels = this.levels;
    this.maxHp = 100;
    this.bulletSpeed = 650;
    this.bulletDmg = 18;
    this.fireDelay = 0.35;
    this.knockback = 220;
    this.jumpBoost = 0;
    this.moveBoost = 0;
    this.maxJumps = 1;
    this.pierceLevel = 0;
    this.bounceLevel = 0;
    this.explosiveLevel = 0;
    this.lifesteal = 0;
    this.shieldCooldownMax = 0; this.shieldCapacity = 0; this.shieldCharges = Math.min(this.shieldCharges, 0);

    // Apply per-level effects
    const L = (id) => prevLevels[id] || 0;
    const clampLevel = (v) => Math.max(0, Math.min(MAX_LEVEL, v));

    const rapidL = clampLevel(L('rapid')); if (rapidL) this.fireDelay *= Math.pow(0.8, rapidL);
    const powerL = clampLevel(L('power')); if (powerL) this.bulletDmg *= (1 + 0.5 * powerL);
    const speedL = clampLevel(L('speed')); if (speedL) this.moveBoost += 0.2 * speedL;
    const jumperL = clampLevel(L('jumper')); if (jumperL) this.jumpBoost += 0.25 * jumperL;
    const djL = clampLevel(L('doublejump')); if (djL) this.maxJumps = 1 + djL;
    const pierceL = clampLevel(L('pierce')); this.pierceLevel = pierceL;
    const bounceL = clampLevel(L('bounce')); this.bounceLevel = bounceL;
    const sniperL = clampLevel(L('sniper')); if (sniperL) this.bulletSpeed *= Math.pow(1.3, sniperL);
    const explL = clampLevel(L('explosive')); this.explosiveLevel = explL;
    const shieldL = clampLevel(L('shield')); if (shieldL) { this.shieldCooldownMax = 8 / (1 + 0.25 * (shieldL - 1)); this.shieldCapacity = Math.min(2, 1 + Math.floor((shieldL - 1) / 2)); }
    const lsL = clampLevel(L('lifesteal')); if (lsL) this.lifesteal = 6 * lsL;
    const hpL = clampLevel(L('hp')); if (hpL) this.maxHp += 40 * hpL;

    // Tradeoff and shooting abilities
    this.multishotLevel = clampLevel(L('multishot'));
    this.burstLevel = clampLevel(L('burst'));
    const bigMagL = clampLevel(L('bigmag'));
    const heavyMagL = clampLevel(L('heavymag'));
    const fastRelL = clampLevel(L('fastreload'));
    const glassL = clampLevel(L('glasscannon'));
    this.unstoppableLevel = clampLevel(L('unstoppable'));

    // Magazine/reload
    this.magSize = 8 + 4*bigMagL + 6*heavyMagL;
    this.reloadTime = 1.2 * Math.pow(0.85, fastRelL) * (heavyMagL ? (1 + 0.15*heavyMagL) : 1);
    this.ammoInMag = Math.min((this.ammoInMag == null ? this.magSize : this.ammoInMag), this.magSize);
    this.reloading = false; this.reloadTimer = 0;

    // Burst/multishot
    this.burstCount = this.burstLevel ? (2 + this.burstLevel) : 1; // 3..6 total when Lv1..4
    this.burstInterval = 0.08; this.burstShotsLeft = 0; this.burstTimer = 0;
    this.pellets = this.multishotLevel; // extra pellets per shot

    // Tradeoffs
    if (heavyMagL) this.moveBoost -= 0.1 * heavyMagL;
    if (glassL) { this.bulletDmg *= (1 + 0.6 * glassL); this.maxHp = Math.max(40, Math.floor(this.maxHp * (1 - 0.15 * glassL))); }

    this.hp = Math.min(this.hp, this.maxHp);
  }
}

class Bullet {
  constructor(owner, x, y, vx, vy, dmg, color) {
    this.owner = owner; this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.r = 4;
    this.dmg = dmg; this.life = 2.5; this.color = color; this.pierces = 0; this.bounces = owner.bounceLevel;
  }
}

// Leveled abilities (up to 4)
const MAX_LEVEL = 4;

const RARITY = { Common: 'Common', Rare: 'Rare', Epic: 'Epic', Legendary: 'Legendary' };
const RARITY_WEIGHTS = [
  { r: RARITY.Common, w: 0.6 },
  { r: RARITY.Rare, w: 0.28 },
  { r: RARITY.Epic, w: 0.1 },
  { r: RARITY.Legendary, w: 0.02 },
];
const RARITY_COLOR = { Common: '#9aa6b2', Rare: '#53b3f3', Epic: '#c77dff', Legendary: '#ffd166' };

  function weightedRarity() {
    const x = Math.random();
    let acc = 0;
    for (const e of RARITY_WEIGHTS) { acc += e.w; if (x <= acc) return e.r; }
    return RARITY.Common;
  }

// Abilities list includes new tradeoff abilities
const ALL_CARDS = [
  { id: 'rapid', title: 'Rapid Fire', desc: 'Reduce fire delay', rarity: RARITY.Common, icon: '⚡' },
  { id: 'power', title: 'High Caliber', desc: 'Increase bullet damage', rarity: RARITY.Rare, icon: '💥' },
  { id: 'speed', title: 'Sprinter', desc: 'Increase move speed', rarity: RARITY.Common, icon: '🏃' },
  { id: 'jumper', title: 'Bunny Hop', desc: 'Increase jump power', rarity: RARITY.Common, icon: '🦘' },
  { id: 'doublejump', title: 'Double Jump', desc: 'Gain extra jumps', rarity: RARITY.Rare, icon: '🦅' },
  { id: 'unstoppable', title: 'Unstoppable Bullets', desc: 'Bullets pass through platforms', rarity: RARITY.Legendary, icon: '🚀' },
  { id: 'bounce', title: 'Bouncy Bullets', desc: 'Bullets bounce', rarity: RARITY.Epic, icon: '🏀' },
  { id: 'sniper', title: 'Marksman', desc: 'Increase bullet speed', rarity: RARITY.Rare, icon: '🎯' },
  { id: 'explosive', title: 'Explosive Rounds', desc: 'Bullets explode', rarity: RARITY.Legendary, icon: '💣' },
  { id: 'shield', title: 'Personal Shield', desc: 'Block a bullet periodically', rarity: RARITY.Epic, icon: '🛡️' },
  { id: 'lifesteal', title: 'Vampiric Rounds', desc: 'Heal on hit', rarity: RARITY.Rare, icon: '🩸' },
  { id: 'hp', title: 'Toughness', desc: 'Increase max HP', rarity: RARITY.Common, icon: '❤️' },
  { id: 'multishot', title: 'Multishot', desc: '+1 pellet per level (spread)', rarity: RARITY.Rare, icon: '🔫' },
  { id: 'burst', title: 'Burst Fire', desc: 'Fires bursts of shots', rarity: RARITY.Epic, icon: '🔥' },
  { id: 'bigmag', title: 'Bigger Mag', desc: 'Increase magazine size', rarity: RARITY.Common, icon: '📦' },
  { id: 'fastreload', title: 'Fast Reload', desc: 'Reduce reload time', rarity: RARITY.Rare, icon: '⚡' },
  { id: 'heavymag', title: 'Heavy Mag', desc: 'Huge mag, slower reload & movement', rarity: RARITY.Epic, icon: '🏋️' },
  { id: 'glasscannon', title: 'Glass Cannon', desc: 'Big damage, lower max HP', rarity: RARITY.Epic, icon: '💎' },
];

  function generateDraftPool(forPlayer) {
    const pool = [];
    const used = new Set();
    for (let i = 0; i < 3; i++) {
      const rarity = weightedRarity();
      const candidates = ALL_CARDS.filter(c => c.rarity === rarity && !used.has(c.id))
        .filter(c => (forPlayer.levels[c.id] || 0) < MAX_LEVEL);
      if (candidates.length === 0) continue;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      used.add(pick.id);
      const nextLevel = (forPlayer.levels[pick.id] || 0) + 1;
      pool.push({ card: pick, nextLevel });
    }
    // If pool underfilled, backfill with any rarity
    while (pool.length < 3) {
      const rem = ALL_CARDS.filter(c => !pool.find(p => p.card.id === c.id) && (forPlayer.levels[c.id] || 0) < MAX_LEVEL);
      if (!rem.length) break;
      const pick = rem[Math.floor(Math.random() * candidates.length)];
      pool.push({ card: pick, nextLevel: (forPlayer.levels[pick.id] || 0) + 1 });
    }
    return pool;
  }

  // Game state
  let players = [
    new Player(0, '#69f0ae', { left: 'KeyA', right: 'KeyD', jump: 'Space', fire: 'MouseLeft' }),
    new Player(1, '#ff8a80', { ai: true }),
  ];
  
  // Game state variables
  let bullets = [];
  let winner = null;
  let state = 'menu'; // menu, playing, between
  let gameMode = 'vsAI'; // vsAI, online
  let lastTime = performance.now() / 1000;
  let simTime = 0;

  const difficultySel = document.getElementById('difficulty');
  
  // Remove the old startButton.onclick since we have a proper event listener below
  function overlayHideDraft() { draftOverlay.classList.add('hidden'); }

  // Multiple arenas
  let currentArena = 0;
  // Dynamic palettes per arena
  const PALETTES = [
    { bgTop: '#11243a', bgBot: '#1b3660', platTop: '#4a607a', platBot: '#32465e', accent: '#ffd166', spike: '#ff6b6b' },
    { bgTop: '#1a1633', bgBot: '#312b6b', platTop: '#6b5ca5', platBot: '#4c437a', accent: '#ffdf6e', spike: '#ff8a80' },
    { bgTop: '#0f2a28', bgBot: '#184b46', platTop: '#4f8a83', platBot: '#2f5e59', accent: '#ffe082', spike: '#ff6f61' },
    { bgTop: '#26130f', bgBot: '#4b261c', platTop: '#8a5648', platBot: '#5a3a30', accent: '#ffd54f', spike: '#ff7043' },
  ];
  let currentPalette = PALETTES[0];

  // Hazards
  let hazards = [];

  // Define spike helper before buildArena
  function addSpikeRow(x, y, w, h) { hazards.push({ x, y, w, h, type: 'spike' }); }

  function rectIntersectObj(p, o) { return p.x < o.x + o.w && p.x + p.w > o.x && p.y < o.y + o.h && p.y + p.h > o.y; }
  function playerHitsHazard(p) {
    const bbox = { x: p.x, y: p.y, w: p.w, h: p.h };
    for (const hz of hazards) { if (rectIntersectObj(bbox, hz)) return true; }
    return false;
  }

  // Enhanced parallax background with pyramids, mountains, and 3D elements
  const parallaxLayers = [];
  function setupParallax() {
    parallaxLayers.length = 0;
    
    // Far layer: distant mountains and pyramids
    parallaxLayers.push({ 
      kind: 'mountains', 
      speed: 0.01, 
      color: '#1a1a2e', 
      seed: 1,
      height: 0.4,
      detail: 'low'
    });
    
    // Mid-far layer: pyramids and mesas
    parallaxLayers.push({ 
      kind: 'pyramids', 
      speed: 0.025, 
      color: '#16213e', 
      seed: 2,
      height: 0.5,
      detail: 'medium'
    });
    
    // Mid layer: hills and plateaus
    parallaxLayers.push({ 
      kind: 'hills', 
      speed: 0.05, 
      color: '#0f3460', 
      seed: 3,
      height: 0.6,
      detail: 'medium'
    });
    
    // Near layer: detailed terrain
    parallaxLayers.push({ 
      kind: 'terrain', 
      speed: 0.08, 
      color: '#533483', 
      seed: 4,
      height: 0.7,
      detail: 'high'
    });
    
    // Very near layer: small details and particles
    parallaxLayers.push({ 
      kind: 'particles', 
      speed: 0.12, 
      color: '#e94560', 
      seed: 5,
      count: 60
    });
  }

  function drawParallax() {
    const w = canvas.width, h = canvas.height;
    
    for (const layer of parallaxLayers) {
      if (layer.kind === 'mountains') {
        drawMountains(layer, w, h);
      } else if (layer.kind === 'pyramids') {
        drawPyramids(layer, w, h);
      } else if (layer.kind === 'hills') {
        drawHills(layer, w, h);
      } else if (layer.kind === 'terrain') {
        drawTerrain(layer, w, h);
      } else if (layer.kind === 'particles') {
        drawParticles(layer, w, h);
      }
    }
  }

  function drawMountains(layer, w, h) {
    const yBase = h * layer.height;
    const offset = (simTime * layer.speed * 60) % w;
    
    ctx.fillStyle = layer.color + '88';
    ctx.beginPath();
    ctx.moveTo(-offset, yBase);
    
    for (let x = -offset; x <= w + 200; x += 200) {
      const peak1 = yBase - 80 - 60 * Math.sin((x + layer.seed * 73) * 0.005);
      const peak2 = yBase - 60 - 40 * Math.sin((x + layer.seed * 131) * 0.008);
      const peak3 = yBase - 40 - 30 * Math.sin((x + layer.seed * 97) * 0.012);
      
      ctx.quadraticCurveTo(x + 50, peak1, x + 100, peak2);
      ctx.quadraticCurveTo(x + 150, peak3, x + 200, yBase);
    }
    
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
  }

  function drawPyramids(layer, w, h) {
    const yBase = h * layer.height;
    const offset = (simTime * layer.speed * 80) % w;
    
    ctx.fillStyle = layer.color + 'aa';
    
    for (let x = -offset; x <= w + 300; x += 300) {
      const pyramidWidth = 120 + Math.sin((x + layer.seed * 47) * 0.01) * 40;
      const pyramidHeight = 80 + Math.sin((x + layer.seed * 89) * 0.015) * 30;
      
      ctx.beginPath();
      ctx.moveTo(x, yBase);
      ctx.lineTo(x + pyramidWidth/2, yBase - pyramidHeight);
      ctx.lineTo(x + pyramidWidth, yBase);
      ctx.closePath();
      ctx.fill();
      
      // Add pyramid details
      ctx.strokeStyle = layer.color + '44';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + pyramidWidth/2, yBase - pyramidHeight);
      ctx.lineTo(x + pyramidWidth/2, yBase);
      ctx.stroke();
    }
  }

  function drawHills(layer, w, h) {
    const yBase = h * layer.height;
    const offset = (simTime * layer.speed * 100) % w;
    
    ctx.fillStyle = layer.color + '99';
    ctx.beginPath();
    ctx.moveTo(-offset, yBase);
    
    for (let x = -offset; x <= w + 150; x += 150) {
      const peak = yBase - 50 - 35 * Math.sin((x + layer.seed * 73) * 0.01);
      ctx.quadraticCurveTo(x + 75, peak, x + 150, yBase);
    }
    
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
  }

  function drawTerrain(layer, w, h) {
    const yBase = h * layer.height;
    const offset = (simTime * layer.speed * 120) % w;
    
    ctx.fillStyle = layer.color + 'bb';
    ctx.beginPath();
    ctx.moveTo(-offset, yBase);
    
    for (let x = -offset; x <= w + 100; x += 100) {
      const peak = yBase - 30 - 20 * Math.sin((x + layer.seed * 73) * 0.02);
      const detail = 8 * Math.sin((x + layer.seed * 131) * 0.05);
      ctx.quadraticCurveTo(x + 50, peak + detail, x + 100, yBase);
    }
    
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
  }

  function drawParticles(layer, w, h) {
    const count = layer.count || 40;
    
    for (let i = 0; i < count; i++) {
      const x = ((i * 97 + layer.seed * 131) % w + (simTime * layer.speed * 150)) % w;
      const y = (i * 53 + layer.seed * 77) % (h * 0.5);
      const size = 1 + Math.sin((i + simTime * 2) * 0.1) * 0.5;
      
      ctx.fillStyle = layer.color + '66';
      ctx.fillRect(x, y, size, size);
    }
  }

  // Platform helpers
  function addMovingPlat(x, y, w, h, dx, dy, speed = 1) {
    platforms.push({ x, y, w, h, move: true, baseX: x, baseY: y, dx, dy, t: Math.random()*Math.PI*2, speed, active: true });
  }
  function addCrumblePlat(x, y, w, h, delay = 0.6, respawn = 3) {
    platforms.push({ x, y, w, h, crumble: true, delay, respawn, timer: -1, respawnTimer: 0, active: true });
  }

  // Arena builder with larger layouts and spike hazards
  function buildArena(idx) {
    const w = canvas.width, h = canvas.height;
    currentPalette = PALETTES[idx % PALETTES.length];
    hazards = [];
    platforms = [];
    const groundY = h - 60;
    const step = Math.min(200, Math.max(120, (JUMP_V * JUMP_V) / (2 * G) - 10));
    const top1 = groundY - step; const top2 = top1 - step; const top3 = top2 - step; const top4 = top3 - step;
    const ph = 18;
    // Ground
    platforms.push({ x: 0, y: groundY, w, h: 60, active: true });
    if (idx === 0) {
      platforms.push({ x: w * 0.12, y: top1, w: 260, h: ph, active: true });
      addMovingPlat(w * 0.62, top1 - 10, 240, ph, 120, 0, 0.8);
      platforms.push({ x: w * 0.10, y: top2, w: 220, h: ph, active: true });
      addCrumblePlat(w * 0.55, top2 - 10, 220, ph, 0.6, 3);
      platforms.push({ x: w * 0.32, y: top3, w: 260, h: ph, active: true });
      addSpikeRow(0, groundY - 16, 120, 16);
      addSpikeRow(w - 120, groundY - 16, 120, 16);
    } else if (idx === 1) {
      platforms.push({ x: w * 0.05, y: top1, w: w * 0.9, h: 14, active: true });
      addMovingPlat(w * 0.18, top2 + 10, 240, 14, 140, 0, 1.2);
      platforms.push({ x: w * 0.58, y: top2, w: 280, h: 14, active: true });
      addCrumblePlat(w * 0.38, top3 + 10, 220, 14, 0.5, 2.5);
      addSpikeRow(w * 0.4, groundY - 16, w * 0.2, 16);
    } else if (idx === 2) {
      platforms.push({ x: w * 0.12, y: top1, w: 220, h: ph, active: true });
      addMovingPlat(w * 0.12, top2, 200, ph, 0, 80, 0.9);
      platforms.push({ x: w * 0.12, y: top3, w: 180, h: ph, active: true });
      platforms.push({ x: w * 0.68, y: top1, w: 240, h: ph, active: true });
      addCrumblePlat(w * 0.68, top2, 220, ph, 0.7, 2.8);
      addMovingPlat(w * 0.68, top3, 200, ph, 0, 90, 1.0);
      platforms.push({ x: w * 0.40, y: top2 + 10, w: 260, h: ph, active: true });
      addSpikeRow(w * 0.48, groundY - 16, 100, 16);
    } else {
      platforms.push({ x: w * 0.2, y: top1 + 10, w: 200, h: ph, active: true });
      addCrumblePlat(w * 0.16, top2 + 10, 260, ph, 0.6, 2.6);
      platforms.push({ x: w * 0.12, y: top3 + 10, w: 320, h: ph, active: true });
      addMovingPlat(w * 0.66, top1, 240, ph, 140, 0, 0.8);
      platforms.push({ x: w * 0.62, y: top2, w: 300, h: ph, active: true });
      addMovingPlat(w * 0.58, top3, 360, ph, 160, 0, 0.6);
      addSpikeRow(w * 0.45, groundY - 16, w * 0.1, 16);
    }
    setupParallax();
  }

  function doStartMatch() {
    state = 'playing';
    bullets = [];
    particles.length = 0;
    buildArena(currentArena);
    currentArena = (currentArena + 1) % 4; // rotate arenas each engagement
    players[0].reset(); players[1].reset();
    players[0].applyCards(); players[1].applyCards();
    
    // If this is an online game, ensure the online indicator is shown
    if (isOnline) {
      showOnlineIndicator();
    }
  }

  // AI params
  const AI = { react: 0.2, aimJitter: 0.15 };
  function setDifficulty(label) {
    if (label === 'easy') { AI.react = 0.35; AI.aimJitter = 0.3; }
    else if (label === 'hard') { AI.react = 0.12; AI.aimJitter = 0.06; }
    else { AI.react = 0.2; AI.aimJitter = 0.15; }
  }
  setDifficulty('normal');
  difficultySel?.addEventListener('change', (e) => setDifficulty(e.target.value));

  // Visual effects: muzzle flashes and bullet trails
  const muzzleFlashes = [];
  function spawnMuzzle(x, y) { muzzleFlashes.push({ x, y, t: 0 }); }
  const trails = [];
  function spawnTrail(x, y, color) { trails.push({ x, y, life: 0.25, color }); }
  // Explosions VFX store
  const explosions = [];
  function spawnExplosion(x, y, owner) {
    explosions.push({ x, y, t: 0, owner });
    for (let i = 0; i < 16; i++) spawnSpark(x, y, owner.color);
    addShake(0.12);
  }
  // VFX rings for impacts/jumps
  const rings = [];
  function spawnRing(x, y, color, duration=0.2, radius=18) { rings.push({ x, y, t:0, d:duration, r:radius, color }); }

  // Enhanced particle system
  const particles = [];
  function spawnParticle(x, y, color) {
    // Backward compatible puff
    particles.push({ x, y, vx: randRange(-80,80), vy: randRange(-220,-60), life: 0.5, maxLife: 0.5, color, size: randRange(2,4), rot: Math.random()*Math.PI, rotV: randRange(-4,4), type: 'puff', drag: 0.98, grav: 800 });
  }
  function spawnSpark(x, y, color) {
    particles.push({ x, y, vx: randRange(-260,260), vy: randRange(-180,60), life: 0.35, maxLife: 0.35, color, size: randRange(2,3), rot: Math.random()*Math.PI, rotV: randRange(-10,10), type: 'spark', drag: 0.96, grav: 600 });
  }

  let shakeT = 0;
  function addShake(s) { shakeT = Math.min(0.3, shakeT + s); }

  function endRound(winnerIdx) {
    roundWins[winnerIdx]++;
    const need = Math.ceil(ROUND_BEST_OF / 2);
    if (roundWins[winnerIdx] >= need) {
      scores[winnerIdx]++;
      roundWins = [0, 0];
              // Between rounds: draft unless series is over
        if (seriesRoundIndex >= SERIES_ROUNDS_TOTAL) {
          // Series end
          if (gameMode === 'online') {
            // Handle ranking for online mode
            const playerWon = winnerIdx === 0;
            handleOnlineGameResult(playerWon);
            
            // Hide online indicator
            const onlineIndicator = document.getElementById('onlineIndicator');
            if (onlineIndicator) {
              onlineIndicator.classList.add('hidden');
            }
            
            // Reset online state
            isOnline = false;
          } else {
            // Handle AI game result
            const playerWon = winnerIdx === 0;
            handleGameResult(playerWon);
          }
          
          // Show main menu
          showMainMenu();
          const msg = scores[0] === scores[1] ? 'Series tied! Play again' : `P${scores[0] > scores[1] ? 1 : 2} wins the series!`;
          
          // Reset series
          scores = [0, 0];
          seriesRoundIndex = 1;
          players.forEach(p => { p.levels = {}; p.applyCards(); });
          return;
        } else {
        seriesRoundIndex++;
        state = 'between';
        openDraft(winnerIdx === 0 ? 1 : 0); // loser picks first
        return;
      }
    }
    // Continue same round (next engagement)
    doStartMatch();
  }

  function openDraft(firstPickerIdx) {
    draftOverlay.classList.remove('hidden');
    doDraftFor(firstPickerIdx, () => doDraftFor(firstPickerIdx === 0 ? 1 : 0, () => {
      draftOverlay.classList.add('hidden');
      doStartMatch();
    }));
  }

  function doDraftFor(playerIdx, done) {
    const isAI = !!players[playerIdx].controls.ai;
    const pool = generateDraftPool(players[playerIdx]);
    if (isAI) {
      const choice = pool[Math.floor(Math.random() * pool.length)];
      const id = choice.card.id;
      players[playerIdx].levels[id] = Math.min(MAX_LEVEL, (players[playerIdx].levels[id] || 0) + 1);
      players[playerIdx].applyCards();
      done();
      return;
    }
    draftPlayerLabel.textContent = `Player ${playerIdx + 1} pick`;
    cardGrid.innerHTML = '';
    for (const opt of pool) {
      const c = opt.card; const nextLevel = opt.nextLevel;
      const el = document.createElement('div'); el.className = 'card';
      el.innerHTML = `<div class="card-title" style="color:${RARITY_COLOR[c.rarity]}">${c.icon} ${c.title} · Lv.${nextLevel} · ${c.rarity}</div><div class="card-desc">${c.desc}</div>`;
      el.onclick = () => {
        players[playerIdx].levels[c.id] = Math.min(MAX_LEVEL, (players[playerIdx].levels[c.id] || 0) + 1);
        players[playerIdx].applyCards();
        done();
      };
      cardGrid.appendChild(el);
    }
  }

  function pickNCards(pool, n) {
    const tmp = [...pool]; const out = [];
    for (let i = 0; i < n && tmp.length; i++) out.push(tmp.splice(Math.floor(Math.random() * tmp.length), 1)[0]);
    return out;
  }

  // AI improvements
  function updateAI(p, dt) {
    const enemy = players[0];
    p.aiJumpCd = Math.max(0, p.aiJumpCd - dt);
    
    // Simple distance-based movement
    const dx = (enemy.x + enemy.w/2) - (p.x + p.w/2);
    const currentDistance = Math.abs(dx);
    
    // Basic movement - move towards enemy but keep some distance
    const wantDir = Math.sign(dx);
    const accel = MOVE_A * (p.onGround ? 1 : AIR_CTRL) * 0.8;
    p.vx += wantDir * accel * dt;
    p.vx = clamp(p.vx, -MAX_VX * 0.8, MAX_VX * 0.8);
    
    // Simple jumping logic
    if (p.onGround && p.aiJumpCd === 0) {
      let shouldJump = false;
      
      // Jump to reach higher platforms when close
      const upperPlatforms = platforms.filter(s => s.y < p.y - 20 && s.h < 40);
      for (const platform of upperPlatforms) {
        const platformCenterX = platform.x + platform.w/2;
        const distanceToPlatform = Math.abs((p.x + p.w/2) - platformCenterX);
        if (distanceToPlatform < 100) {
          shouldJump = true;
          break;
        }
      }
      
      // Jump to dodge bullets occasionally
      if (detectIncomingBullets(p, enemy) && Math.random() < 0.6) {
        shouldJump = true;
      }
      
      // Jump to avoid hazards
      if (detectHazardsAhead(p)) {
        shouldJump = true;
      }
      
      // Jump if too close to enemy
      if (currentDistance < 80 && Math.random() < 0.4) {
        shouldJump = true;
      }
      
      if (shouldJump) {
        p.vy = -JUMP_V * 0.9;
        p.onGround = false;
        p.aiJumpCd = 0.5;
      }
    }
    
    // Simple aiming - just point at enemy
    const gunX = p.x + p.w / 2 + p.facing * 12;
    const gunY = p.y + p.h * 0.35;
    const ex = enemy.x + enemy.w / 2;
    const ey = enemy.y + enemy.h * 0.4;
    
    let aimX = ex - gunX;
    let aimY = ey - gunY;
    
    // Normalize
    const n = Math.hypot(aimX, aimY) || 1;
    aimX /= n;
    aimY /= n;
    
    // Add some randomness
    aimX += randRange(-0.1, 0.1);
    aimY += randRange(-0.1, 0.1);
    
    const n2 = Math.hypot(aimX, aimY) || 1;
    aimX /= n2;
    aimY /= n2;
    
    // Update facing
    p.facing = Math.sign(aimX) || 1;
    
    // Simple shooting - shoot when reloaded and enemy is visible
    p.reload -= dt;
    if (p.reload <= 0 && !p.reloading && p.ammoInMag > 0) {
      // Shoot if enemy is roughly in front and not too far
      if (Math.abs(dx) < 500 && Math.abs(dx) > 50) {
        const vx = aimX * p.bulletSpeed;
        const vy = aimY * p.bulletSpeed;
        bullets.push(new Bullet(p, gunX, gunY, vx, vy, p.bulletDmg, p.color));
        p.ammoInMag--;
        p.reload = p.fireDelay * (0.8 + AI.react * 0.4);
        addShake(0.05);
      }
    }
  }

  // Helper function to detect incoming bullets
  function detectIncomingBullets(p, enemy) {
    for (const b of bullets) {
      if (b.owner === enemy) {
        const vx = b.vx, vy = b.vy;
        const toAIx = (p.x + p.w/2) - b.x;
        const toAIy = (p.y + p.h*0.5) - b.y;
        const dist = Math.hypot(toAIx, toAIy) || 1;
        const tti = dist / (Math.hypot(vx, vy) || 1);
        
        // If bullet heading towards AI and impact soon
        const dot = (vx * toAIx + vy * toAIy) / ((Math.hypot(vx, vy)||1) * dist);
        if (dot > 0.7 && tti < 0.4) {
          return true;
        }
      }
    }
    return false;
  }

  // Helper function to detect hazards ahead
  function detectHazardsAhead(p) {
    const lookAhead = 50 * Math.sign(p.vx || 1);
    const feetBox = { x: p.x + lookAhead, y: p.y + p.h - 10, w: 30, h: 10 };
    
    for (const hz of hazards) {
      if (rectsIntersect(feetBox, hz)) {
        return true;
      }
    }
    return false;
  }

  // Helper function to check if enemy is blocked from view
  function isEnemyBlocked(p, enemy) {
    // Simple line of sight check - if there's a platform between AI and enemy
    const aiCenterX = p.x + p.w/2;
    const aiCenterY = p.y + p.h/2;
    const enemyCenterX = enemy.x + enemy.w/2;
    const enemyCenterY = enemy.y + enemy.h/2;
    
    for (const platform of platforms) {
      if (platform === platforms[0]) continue; // Skip ground
      
      // Check if platform blocks the line of sight
      if (lineIntersectsRect(aiCenterX, aiCenterY, enemyCenterX, enemyCenterY, platform)) {
        return true;
      }
    }
    return false;
  }

  // Helper function to check if a line intersects a rectangle
  function lineIntersectsRect(x1, y1, x2, y2, rect) {
    // Check if line segment intersects rectangle
    const left = rect.x;
    const right = rect.x + rect.w;
    const top = rect.y;
    const bottom = rect.y + rect.h;
    
    // Check if either endpoint is inside the rectangle
    if ((x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) ||
        (x2 >= left && x2 <= right && y2 >= top && y2 <= bottom)) {
      return true;
    }
    
    // Check if line intersects any of the rectangle's edges
    const edges = [
      {x1: left, y1: top, x2: right, y2: top},     // Top edge
      {x1: right, y1: top, x2: right, y2: bottom}, // Right edge
      {x1: right, y1: bottom, x2: left, y2: bottom}, // Bottom edge
      {x1: left, y1: bottom, x2: left, y2: top}    // Left edge
    ];
    
    for (const edge of edges) {
      if (linesIntersect(x1, y1, x2, y2, edge.x1, edge.y1, edge.x2, edge.y2)) {
        return true;
      }
    }
    
    return false;
  }

  // Helper function to check if two line segments intersect
  function linesIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (den === 0) return false;
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
    
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

// Mobile controls
const mobileControls = document.getElementById('mobileControls');
const moveStick = document.getElementById('moveStick');
const moveKnob = document.getElementById('moveKnob');
let isMobile = false;
  function checkMobile() {
    const touchCapable = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
    isMobile = touchCapable;
    mobileControls.classList.toggle('show', isMobile);
  }

let mobileMoveLeft = false, mobileMoveRight = false; let mobileShootTap = null; // {x,y} when tapped
let aimVec = { x: 1, y: 0 };

  // Left joystick handling: x controls left/right, y upward triggers jump
  let stickActive = false; let stickId = null;
  function stickToVec(clientX, clientY) {
    const rect = moveStick.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top + rect.height/2;
    let dx = clientX - cx; let dy = clientY - cy;
    const len = Math.hypot(dx, dy);
    const maxR = rect.width/2 - 28;
    if (len > maxR) { dx = dx / len * maxR; dy = dy / len * maxR; }
    moveKnob.style.left = `${rect.width/2 - 28 + dx}px`;
    moveKnob.style.top = `${rect.height/2 - 28 + dy}px`;
    const nx = (dx / maxR) || 0; const ny = (dy / maxR) || 0;
    aimVec.x = nx; aimVec.y = ny;
    mobileMoveLeft = nx < -0.25; mobileMoveRight = nx > 0.25;
    // Jump if pushing upwards past threshold
    if (ny < -0.6) jumpPressed = true;
  }

  function resetStick() { 
    moveKnob.style.left = '42px'; 
    moveKnob.style.top = '42px'; 
    aimVec.x = 0; 
    aimVec.y = 0; 
    mobileMoveLeft = mobileMoveRight = false; 
  }
moveStick?.addEventListener('touchstart', (e) => { stickActive = true; stickId = e.changedTouches[0].identifier; stickToVec(e.changedTouches[0].clientX, e.changedTouches[0].clientY); }, { passive: false });
moveStick?.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === stickId) stickToVec(t.clientX, t.clientY); }, { passive: false });
moveStick?.addEventListener('touchend', () => { stickActive = false; resetStick(); }, { passive: false });
moveStick?.addEventListener('mousedown', (e) => { stickActive = true; stickToVec(e.clientX, e.clientY); });
window.addEventListener('mousemove', (e) => { if (stickActive) stickToVec(e.clientX, e.clientY); });
window.addEventListener('mouseup', () => { if (stickActive) { stickActive = false; resetStick(); } });

  // Right-side tap to shoot toward tap position
  function isRightSideTap(e) { 
    const x = (e.touches? e.touches[0].clientX : e.clientX); 
    return x > window.innerWidth * 0.55; 
  }
  function tapPos(e) { 
    const t = e.touches? e.touches[0] : e; 
    return { x: t.clientX, y: t.clientY }; 
  }
window.addEventListener('touchstart', (e) => { if (!isMobile) return; if (isRightSideTap(e)) { mobileShootTap = tapPos(e); }}, { passive: false });
window.addEventListener('mousedown', (e) => { if (!isMobile) return; if (isRightSideTap(e)) { mobileShootTap = tapPos(e); } });

  function updatePlatforms(dt) {
    for (const s of platforms) {
      if (s.move) {
        s.t += dt * (s.speed || 1);
        s.x = s.baseX + Math.sin(s.t) * (s.dx || 0);
        s.y = s.baseY + Math.cos(s.t) * (s.dy || 0);
      }
      if (s.crumble) {
        if (!s.active && s.respawnTimer > 0) {
          s.respawnTimer -= dt; if (s.respawnTimer <= 0) { s.active = true; s.timer = -1; }
        }
      }
    }
  }

  // Ambient/environment particles
  let envTimer = 0;
  
  // Online multiplayer variables
  let isOnline = false;
  let onlinePlayers = [];
  let matchmakingQueue = [];
  let currentMatch = null;
  let websocket = null;
  let playerId = null;
  function updateEnvironment(dt) {
    envTimer -= dt;
    if (envTimer <= 0) {
      envTimer = randRange(0.2, 0.6);
      const side = Math.random() < 0.5 ? 0 : 1;
      const x = side ? canvas.width + 10 : -10;
      const y = randRange(40, canvas.height * 0.7);
      const color = currentPalette.accent + '99';
      particles.push({ x, y, vx: side ? -randRange(30,80) : randRange(30,80), vy: randRange(-10,10), life: 1.2, maxLife: 1.2, color, size: randRange(2,3), rot: 0, rotV: 0, type: 'puff', drag: 0.995, grav: 0 });
    }
  }

  function update(dt) {
    if (state !== 'playing' || paused) { jumpPressed = false; return; }
    simTime += dt;
    shakeT = Math.max(0, shakeT - dt);
    updatePlatforms(dt);
    updateEnvironment(dt);

    for (let pi = 0; pi < players.length; pi++) {
      const p = players[pi];
      const isAI = !!p.controls.ai;

      // Reload handling
      if (p.reloading) { p.reloadTimer -= dt; if (p.reloadTimer <= 0) { p.reloading = false; p.ammoInMag = p.magSize; } }

      if (!isAI && !p.controls.online) {
        const accel = MOVE_A * (p.onGround ? 1 : AIR_CTRL);
        const moveLeft = keys.has('KeyA') || mobileMoveLeft;
        const moveRight = keys.has('KeyD') || mobileMoveRight;
        if (moveLeft) p.vx -= accel * dt;
        if (moveRight) p.vx += accel * dt;
        p.vx = clamp(p.vx, -MAX_VX * (1 + p.moveBoost), MAX_VX * (1 + p.moveBoost));

        if (jumpPressed && (p.onGround || p.jumpsUsed < p.maxJumps)) {
          if (p.onGround) p.jumpsUsed = 0;
          p.vy = -JUMP_V * (1 + p.jumpBoost);
          p.onGround = false;
          p.jumpsUsed++;
          spawnPuff(p.x + p.w/2, p.y + p.h, p.color);
        }

        if (keys.has('KeyR') && !p.reloading && p.ammoInMag < p.magSize) { p.reloading = true; p.reloadTimer = p.reloadTime; }

        // Aim and shooting
        let dirX = p.facing, dirY = 0;
        if (isMobile && mobileShootTap) {
          const ax = mobileShootTap.x - (p.x + p.w/2);
          const ay = mobileShootTap.y - (p.y + p.h*0.35);
          const len = Math.hypot(ax, ay) || 1; dirX = ax/len; dirY = ay/len;
        } else if (!isMobile) {
          const ax = mouseX - (p.x + p.w / 2);
          const ay = mouseY - (p.y + p.h * 0.35);
          const len = Math.hypot(ax, ay) || 1; dirX = ax / len; dirY = ay / len;
        } else {
          dirX = (Math.abs(aimVec.x) > 0.1 ? aimVec.x : p.facing); dirY = 0;
        }
        p.facing = Math.sign(dirX) || p.facing;

        p.reload -= dt;
        if (p.burstShotsLeft > 0) { p.burstTimer -= dt; if (p.burstTimer <= 0 && p.ammoInMag > 0) { fireShot(p, dirX, dirY); p.burstShotsLeft--; p.burstTimer = p.burstInterval; } }
        const wantShoot = (!isMobile && mouseDown) || (isMobile && !!mobileShootTap);
        if (wantShoot && p.reload <= 0 && p.ammoInMag > 0 && !p.reloading) {
          fireShot(p, dirX, dirY);
          p.reload = p.fireDelay;
          if (p.burstCount > 1) { p.burstShotsLeft = p.burstCount - 1; p.burstTimer = p.burstInterval; }
        } else if (wantShoot && p.ammoInMag === 0 && !p.reloading) { p.reloading = true; p.reloadTimer = p.reloadTime; }
        mobileShootTap = null; // consume tap
      } else if (p.controls.online) {
        // Online player - do nothing (waiting for real player input)
        // Just handle reloading when empty
        if (!p.reloading && p.ammoInMag === 0) { p.reloading = true; p.reloadTimer = p.reloadTime; }
      } else {
        // AI player
        if (!p.reloading && p.ammoInMag === 0) { p.reloading = true; p.reloadTimer = p.reloadTime; }
        updateAI(p, dt);
      }

      // Shields
      if (p.shieldCooldownMax > 0) { p.shieldCooldown -= dt; if (p.shieldCooldown <= 0) { p.shieldCooldown = p.shieldCooldownMax; p.shieldCharges = Math.min((p.shieldCharges||0) + 1, p.shieldCapacity || 1); } }

      // gravity & integrate
      p.vy += G * dt;
      p.x += p.vx * dt;
      const bboxX = { x: p.x, y: p.y, w: p.w, h: p.h };
      for (const s of platforms) {
        if (s.active === false) continue;
        if (rectsIntersect(bboxX, s)) { if (p.vx > 0) p.x = s.x - p.w; else if (p.vx < 0) p.x = s.x + s.w; p.vx = 0; }
      }
      p.y += p.vy * dt;
      const prevOnGround = p.onGround;
      p.onGround = false;
      const bboxY = { x: p.x, y: p.y, w: p.w, h: p.h };
      for (const s of platforms) {
        if (s.active === false) continue;
        if (rectsIntersect(bboxY, s)) {
          if (p.vy > 0) {
            p.y = s.y - p.h; p.onGround = true; p.jumpsUsed = 0;
            if (s.crumble && s.timer < 0) { s.timer = s.delay; }
          } else if (p.vy < 0) {
            p.y = s.y + s.h;
          }
          p.vy = 0;
        }
      }
      // advance crumble timers
      for (const s of platforms) if (s.crumble && s.timer >= 0 && s.active) { s.timer -= dt; if (s.timer <= 0) { s.active = false; s.respawnTimer = s.respawn; } }

      if (!prevOnGround && p.onGround) { spawnPuff(p.x + p.w/2, p.y + p.h, p.color); }

      if (playerHitsHazard(p)) { p.hp -= 40*dt; spawnParticle(p.x + p.w/2, p.y + p.h, currentPalette.spike); }

      p.x = clamp(p.x, 0, canvas.width - p.w);
      if (p.onGround) p.vx -= p.vx * FRICTION * dt;
    }

    // Bullets update remains as earlier...
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.life -= dt; if (b.life <= 0) { bullets.splice(i, 1); continue; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.vy += (G * 0.2) * dt;
      const bb = { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 };
      let hitGeom = false;
      if (!(b.owner.unstoppableLevel > 0)) {
        for (const s of platforms) if (rectsIntersect(bb, s)) { hitGeom = true; if (b.bounces > 0) { b.vy = -Math.abs(b.vy) * 0.7; b.bounces--; hitGeom = false; } else if (b.owner.explosiveLevel > 0) { spawnExplosion(b.x, b.y, b.owner); } break; }
        for (const hz of hazards) if (rectsIntersect(bb, hz)) { hitGeom = true; break; }
      }
      if (hitGeom) { bullets.splice(i, 1); continue; }
      if (b.x < -50 || b.x > canvas.width + 50 || b.y > canvas.height + 200) { bullets.splice(i, 1); continue; }
      for (const p of players) {
        if (p === b.owner) continue;
        if (rectsIntersect(bb, { x: p.x, y: p.y, w: p.w, h: p.h })) {
          if (p.shieldCharges && p.shieldCharges > 0) { p.shieldCharges--; spawnParticle(b.x, b.y, '#9ad7ff'); bullets.splice(i, 1); break; }
          p.hp -= b.dmg;
          if (b.owner.lifesteal) b.owner.hp = clamp((b.owner.hp||100) + b.owner.lifesteal, 0, b.owner.maxHp||100);
          p.vx += Math.sign(b.vx) * 80; p.vy -= 120;
          // Sleek impact VFX
          spawnImpact(b.x, b.y, b.color, b.dmg);
          if (b.pierces > 0) { b.pierces--; } else { bullets.splice(i, 1); }
          break;
        }
      }
    }

    // Explosions, particles updated already elsewhere
    for (let ei = explosions.length - 1; ei >= 0; ei--) {
      const e = explosions[ei]; e.t += dt; if (e.t > 0.25) { explosions.splice(ei,1); continue; }
      for (const p of players) {
        const cx = p.x + p.w/2, cy = p.y + p.h/2; const d2 = (cx - e.x)**2 + (cy - e.y)**2;
        const radius = 80 + 20 * Math.max(0, (e.owner.explosiveLevel||1) - 1);
        const dmgBase = 20 + 8 * Math.max(0, (e.owner.explosiveLevel||1) - 1);
        if (d2 < radius*radius) { p.hp -= dmgBase * dt * 4; }
      }
    }

    // Trails, muzzle, rings
    for (let i = trails.length - 1; i >= 0; i--) { trails[i].life -= dt; if (trails[i].life <= 0) trails.splice(i, 1); }
    for (let i = muzzleFlashes.length - 1; i >= 0; i--) { muzzleFlashes[i].t += dt; if (muzzleFlashes[i].t > 0.08) muzzleFlashes.splice(i, 1); }
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.t += dt; if (r.t > r.d) rings.splice(i, 1); }
    // Update enhanced particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.rotV * dt;
    }

    const alive = players.map(p => p.hp > 0);
    if (alive.filter(Boolean).length <= 1) { const winIdx = alive[0] ? 0 : 1; endRound(winIdx); }
    jumpPressed = false;
  }

  function fireShot(p, dirX, dirY) {
    if (p.ammoInMag <= 0) return;
    const originX = p.x + p.w / 2 + p.facing * 12;
    const originY = p.y + p.h * 0.35;
    const pellets = 1 + (p.pellets || 0);
    for (let k = 0; k < pellets; k++) {
      const spread = (p.pellets ? randRange(-0.12, 0.12) : 0); // radians approx ±7°
      const ang = Math.atan2(dirY, dirX) + spread;
      const vx = Math.cos(ang) * p.bulletSpeed;
      const vy = Math.sin(ang) * p.bulletSpeed;
      bullets.push(new Bullet(p, originX, originY, vx, vy, p.bulletDmg, p.color));
      spawnTrail(originX, originY, p.color);
    }
    p.ammoInMag--;
    spawnMuzzle(originX, originY);
  }

  // Drawing helpers
  function drawRoundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Drawing polish: player head
  function drawPlayer(p) {
    // hp bar
    ctx.fillStyle = '#00000088'; drawRoundedRect(p.x - 2, p.y - 25, p.w + 4, 6, 3); ctx.fill();
    ctx.fillStyle = p.color; drawRoundedRect(p.x - 2, p.y - 25, (p.w + 4) * clamp(p.hp / (p.maxHp||100), 0, 1), 6, 3); ctx.fill();
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; drawRoundedRect(Math.floor(p.x)+2, Math.floor(p.y)+6, p.w, p.h, 12); ctx.fill();
    // body with black border
    ctx.fillStyle = p.color; drawRoundedRect(Math.floor(p.x), Math.floor(p.y), p.w, p.h, 12); ctx.fill();
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 2; drawRoundedRect(Math.floor(p.x), Math.floor(p.y), p.w, p.h, 12); ctx.stroke();
    // head with black border
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x + p.w/2, p.y - 10, 10, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x + p.w/2, p.y - 10, 10, 0, Math.PI*2); ctx.stroke();
    // eye
    ctx.fillStyle = '#0b1020'; ctx.beginPath(); ctx.arc(p.x + p.w/2 + (p.facing>0?4:-4), p.y - 12, 2, 0, Math.PI*2); ctx.fill();
    // shield outline
    if (p.shieldCharges && p.shieldCharges>0) { ctx.strokeStyle = '#9ad7ff'; ctx.lineWidth = 2; drawRoundedRect(Math.floor(p.x)-3, Math.floor(p.y)-3, p.w+6, p.h+6, 14); ctx.stroke(); }
    // gun
    const gx = p.x + p.w/2 + p.facing * 10; const gy = p.y + p.h * 0.35;
    let aimX = p.facing, aimY = 0;
    if (!p.controls.ai) { aimX = mouseX - gx; aimY = mouseY - gy; } else { const enemy = players[0]; aimX = (enemy.x+enemy.w/2)-gx; aimY = (enemy.y+enemy.h*0.4)-gy; }
    const n = Math.hypot(aimX, aimY) || 1; aimX/=n; aimY/=n;
    drawGunAt(gx, gy, aimX, aimY, 22, 4);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Subtle background pulse
    const pulse = 0.02 * Math.sin(simTime * 0.7);
    const gr = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gr.addColorStop(0, currentPalette.bgTop); gr.addColorStop(1, currentPalette.bgBot);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawParallax();

    let sx = 0, sy = 0; if (shakeT > 0) { sx = (Math.random()-0.5)*10*shakeT; sy=(Math.random()-0.5)*10*shakeT; ctx.save(); ctx.translate(sx, sy); }

    for (const s of platforms) drawPlatform(s);
    drawHazards();

    // Explosions (additive)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const e of explosions) {
      const radius = 80 + 20 * Math.max(0, (e.owner.explosiveLevel||1) - 1);
      const alpha = Math.max(0, 1 - e.t / 0.25);
      const grd = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, radius);
      grd.addColorStop(0, `rgba(255,200,80,${alpha})`);
      grd.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(e.x, e.y, radius, 0, Math.PI*2); ctx.fill();
    }
    // trails (additive glow)
    for (const tr of trails) { ctx.globalAlpha = Math.max(0, tr.life / 0.25); const g2 = ctx.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, 26); g2.addColorStop(0, tr.color); g2.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(tr.x, tr.y, 26, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
    // muzzle flashes (cone)
    for (const m of muzzleFlashes) { const a = Math.max(0, 1 - m.t / 0.08); ctx.globalAlpha = a; ctx.fillStyle = '#ffd27d'; ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x + 18, m.y - 6); ctx.lineTo(m.x + 18, m.y + 6); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.restore();

    for (const p of players) drawPlayer(p);

    // bullets
    for (const b of bullets) { const grd2 = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 1.8); grd2.addColorStop(0, b.color); grd2.addColorStop(1, '#ffffff00'); ctx.fillStyle = grd2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); }

    // enhanced particles
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const pr of particles) {
      const t = 1 - (pr.life / pr.maxLife);
      if (pr.type === 'spark') {
        ctx.translate(pr.x, pr.y); ctx.rotate(pr.rot);
        ctx.fillStyle = pr.color; ctx.fillRect(-pr.size*0.5, -pr.size*2, pr.size, pr.size*4);
        ctx.setTransform(1,0,0,1,0,0);
      } else {
        const g3 = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, pr.size * 4);
        g3.addColorStop(0, pr.color);
        g3.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g3; ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.size * 4, 0, Math.PI*2); ctx.fill();
      }
    }
    ctx.restore();

    // rings
    for (const r of rings) { const tt = r.t / r.d; ctx.strokeStyle = r.color; ctx.globalAlpha = Math.max(0, 1 - tt); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (1 + tt*2), 0, Math.PI*2); ctx.stroke(); ctx.globalAlpha = 1; }

    if (shakeT > 0) ctx.restore();
    drawVignette();

    // HUD (Round & Series) + Ammo
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui, sans-serif';
    const opponentName = isOnline ? players[1].username || 'OnlinePlayer' : 'AI';
    ctx.fillText(`Round ${seriesRoundIndex}/${SERIES_ROUNDS_TOTAL}  |  Series: P1 ${scores[0]} - ${scores[1]} ${opponentName}`, Math.max(12, canvas.width/2 - 180), 28);
    const p1 = players[0];
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui, sans-serif';
    const reloadTxt = p1.reloading ? ' (reloading...)' : '';
    ctx.fillText(`Ammo: ${p1.ammoInMag}/${p1.magSize}${reloadTxt}`, 12, canvas.height - 16);
  }

  function loop() {
    const now = performance.now() / 1000; const dt = Math.min(0.033, now - lastTime); lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // Visual revamp helpers
  function drawGunAt(originX, originY, aimDirX, aimDirY, length = 22, thickness = 4) {
    const ang = Math.atan2(aimDirY, aimDirX);
    ctx.save();
    ctx.translate(originX, originY);
    ctx.rotate(ang);
    drawRoundedRect(0, -thickness/2, length, thickness, 2);
    ctx.fillStyle = '#e5e7eb';
    ctx.fill();
    ctx.restore();
  }

  function drawPlatform(s) {
    if (!s.active) return;
    
    ctx.save();
    
    // Set the base color
    ctx.fillStyle = s.color || '#4a7c59';
    
    // Apply different drawing styles based on platform type
    if (s.type === 'ground') {
      // Ground platform with stone texture
      drawGroundPlatform(s);
    } else if (s.shape === 'rounded') {
      // Rounded platform with smooth edges
      drawRoundedPlatform(s);
    } else if (s.shape === 'crystal') {
      // Crystal platform with geometric edges
      drawCrystalPlatform(s);
    } else if (s.shape === 'wood') {
      // Wooden platform with grain texture
      drawWoodPlatform(s);
    } else if (s.shape === 'grass') {
      // Grass platform with organic feel
      drawGrassPlatform(s);
    } else if (s.shape === 'ice') {
      // Ice platform with translucent effect
      drawIcePlatform(s);
    } else if (s.shape === 'gold') {
      // Gold platform with metallic shine
      drawGoldPlatform(s);
    } else {
      // Default platform
      drawDefaultPlatform(s);
    }
    
    // Add black border to all platforms for better contrast
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    if (s.type === 'ground') {
      ctx.strokeRect(s.x, s.y, s.w, s.h);
    } else if (s.shape === 'rounded') {
      ctx.beginPath();
      ctx.moveTo(s.x + 8, s.y);
      ctx.lineTo(s.x + s.w - 8, s.y);
      ctx.quadraticCurveTo(s.x + s.w, s.y, s.x + s.w, s.y + 8);
      ctx.lineTo(s.x + s.w, s.y + s.h - 8);
      ctx.quadraticCurveTo(s.x + s.w, s.y + s.h, s.x + s.w - 8, s.y + s.h);
      ctx.lineTo(s.x + 8, s.y + s.h);
      ctx.quadraticCurveTo(s.x, s.y + s.h, s.x, s.y + s.h - 8);
      ctx.lineTo(s.x, s.y + 8);
      ctx.quadraticCurveTo(s.x, s.y, s.x + 8, s.y);
      ctx.closePath();
      ctx.stroke();
    } else if (s.shape === 'crystal') {
      const segments = 6;
      const segmentWidth = s.w / segments;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y + s.h);
      for (let i = 0; i <= segments; i++) {
        const x = s.x + i * segmentWidth;
        const y = s.y + (i % 2 === 0 ? 0 : s.h * 0.3);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(s.x + s.w, s.y + s.h);
      ctx.closePath();
      ctx.stroke();
    } else {
      // Default rectangular border
      ctx.strokeRect(s.x, s.y, s.w, s.h);
    }
    
    ctx.restore();
  }

  function drawGroundPlatform(s) {
    // Stone ground with subtle texture
    const gradient = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.h);
    gradient.addColorStop(0, s.color);
    gradient.addColorStop(1, '#1a1a1a');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    
    // Add stone texture lines
    ctx.strokeStyle = '#00000022';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = s.y + (i + 1) * (s.h / 6);
      ctx.beginPath();
      ctx.moveTo(s.x, y);
      ctx.lineTo(s.x + s.w, y);
      ctx.stroke();
    }
  }

  function drawRoundedPlatform(s) {
    // Smooth rounded platform
    ctx.beginPath();
    ctx.moveTo(s.x + 8, s.y);
    ctx.lineTo(s.x + s.w - 8, s.y);
    ctx.quadraticCurveTo(s.x + s.w, s.y, s.x + s.w, s.y + 8);
    ctx.lineTo(s.x + s.w, s.y + s.h - 8);
    ctx.quadraticCurveTo(s.x + s.w, s.y + s.h, s.x + s.w - 8, s.y + s.h);
    ctx.lineTo(s.x + 8, s.y + s.h);
    ctx.quadraticCurveTo(s.x, s.y + s.h, s.x, s.y + s.h - 8);
    ctx.lineTo(s.x, s.y + 8);
    ctx.quadraticCurveTo(s.x, s.y, s.x + 8, s.y);
    ctx.closePath();
    ctx.fill();
    
    // Add subtle highlight
    ctx.strokeStyle = '#ffffff33';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawCrystalPlatform(s) {
    // Geometric crystal platform
    const segments = 6;
    const segmentWidth = s.w / segments;
    
    ctx.beginPath();
    ctx.moveTo(s.x, s.y + s.h);
    
    for (let i = 0; i <= segments; i++) {
      const x = s.x + i * segmentWidth;
      const y = s.y + (i % 2 === 0 ? 0 : s.h * 0.3);
      ctx.lineTo(x, y);
    }
    
    ctx.lineTo(s.x + s.w, s.y + s.h);
    ctx.closePath();
    ctx.fill();
    
    // Add crystal facets
    ctx.strokeStyle = '#ffffff44';
    ctx.lineWidth = 1;
    for (let i = 1; i < segments; i++) {
      const x = s.x + i * segmentWidth;
      ctx.beginPath();
      ctx.moveTo(x, s.y + s.h);
      ctx.lineTo(x, s.y + (i % 2 === 0 ? 0 : s.h * 0.3));
      ctx.stroke();
    }
  }

  function drawWoodPlatform(s) {
    // Wooden platform with grain
    ctx.fillRect(s.x, s.y, s.w, s.h);
    
    // Add wood grain lines
    ctx.strokeStyle = '#8b451322';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const x = s.x + (i + 1) * (s.w / 9);
      ctx.beginPath();
      ctx.moveTo(x, s.y);
      ctx.lineTo(x, s.y + s.h);
      ctx.stroke();
    }
    
    // Add wood knots
    ctx.fillStyle = '#8b451344';
    for (let i = 0; i < 3; i++) {
      const x = s.x + 20 + i * (s.w / 4);
      const y = s.y + s.h / 2;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGrassPlatform(s) {
    // Grass platform with organic feel
    ctx.fillRect(s.x, s.y, s.w, s.h);
    
    // Add grass tufts
    ctx.fillStyle = '#228b22';
    for (let i = 0; i < 12; i++) {
      const x = s.x + 10 + i * (s.w / 13);
      const height = 3 + Math.random() * 4;
      ctx.fillRect(x, s.y - height, 2, height);
    }
    
    // Add soil texture
    ctx.fillStyle = '#654321';
    ctx.fillRect(s.x, s.y + s.h - 3, s.w, 3);
  }

  function drawIcePlatform(s) {
    // Translucent ice platform
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.globalAlpha = 1;
    
    // Add ice cracks
    ctx.strokeStyle = '#ffffff66';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const startX = s.x + Math.random() * s.w;
      const startY = s.y + Math.random() * s.h;
      const endX = startX + (Math.random() - 0.5) * 20;
      const endY = startY + (Math.random() - 0.5) * 20;
      
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
  }

  function drawGoldPlatform(s) {
    // Metallic gold platform with shine
    const gradient = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.h);
    gradient.addColorStop(0, '#ffd700');
    gradient.addColorStop(0.5, '#ffed4e');
    gradient.addColorStop(1, '#b8860b');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    
    // Add metallic shine
    ctx.fillStyle = '#ffffff44';
    ctx.fillRect(s.x, s.y, s.w, s.h * 0.3);
    
    // Add gold texture
    ctx.strokeStyle = '#b8860b44';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = s.y + (i + 1) * (s.h / 5);
      ctx.beginPath();
      ctx.moveTo(s.x, y);
      ctx.lineTo(s.x + s.w, y);
      ctx.stroke();
    }
  }

  function drawDefaultPlatform(s) {
    // Simple default platform
    ctx.fillRect(s.x, s.y, s.w, s.h);
  }

  function drawHazards() {
    for (const hz of hazards) {
      if (hz.type === 'spike') {
        // draw a strip of triangles
        const step = 16; const num = Math.max(1, Math.floor(hz.w / step));
        for (let i = 0; i < num; i++) {
          const x0 = hz.x + i * step;
          ctx.fillStyle = currentPalette.spike;
          ctx.beginPath();
          ctx.moveTo(x0, hz.y + hz.h);
          ctx.lineTo(x0 + step/2, hz.y);
          ctx.lineTo(x0 + step, hz.y + hz.h);
          ctx.closePath(); ctx.fill();
        }
      }
    }
  }

  function drawVignette() {
    const r = Math.max(canvas.width, canvas.height);
    const vg = ctx.createRadialGradient(canvas.width/2, canvas.height/2, r*0.2, canvas.width/2, canvas.height/2, r*0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg; ctx.fillRect(0,0,canvas.width,canvas.height);
  }

  function setPaused(v) {
    paused = v;
    pauseOverlay.classList.toggle('hidden', !paused);
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (state === 'playing') setPaused(!paused);
    }
  });
  btnResume?.addEventListener('click', () => setPaused(false));
  btnQuit?.addEventListener('click', () => { 
    setPaused(false); 
    showMainMenu(); 
    // Reset game state when quitting to menu
    state = 'menu';
    bullets = [];
    particles.length = 0;
  });

  // Improved sleek jump VFX
  function spawnPuff(x, y, color, count=8) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = randRange(40, 80);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - randRange(20, 40);
      
      particles.push({ 
        x, y, 
        vx, vy, 
        life: 0.4, 
        maxLife: 0.4, 
        color: color + 'cc', 
        size: randRange(2, 4), 
        rot: Math.random() * Math.PI, 
        rotV: randRange(-2, 2), 
        type: 'puff', 
        drag: 0.95, 
        grav: 600 
      });
    }
  }

  // New sleek impact VFX when bullets hit players
  function spawnImpact(x, y, color, damage) {
    // Small, colorful impact particles
    const count = Math.min(6, Math.floor(damage / 10) + 2);
    
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const speed = randRange(30, 60);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      
      particles.push({ 
        x, y, 
        vx, vy, 
        life: 0.3, 
        maxLife: 0.3, 
        color: color + 'ff', 
        size: randRange(1, 3), 
        rot: 0, 
        rotV: 0, 
        type: 'impact', 
        drag: 0.9, 
        grav: 400 
      });
    }
    
    // Small impact ring
    rings.push({ 
      x, y, 
      t: 0, 
      d: 0.15, 
      r: 8, 
      color: color + '88' 
    });
    
    // Subtle screen shake based on damage
    addShake(Math.min(0.08, damage / 200));
  }

  // Call loadData to initialize the game
  loadData();
  
  // Show the main menu initially
  showMainMenu();
  
  // Start the game loop
  loop();
  
}); // End of DOMContentLoaded event listener