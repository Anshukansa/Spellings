/********************************************************
 *          HELPER FUNCTIONS FOR CHROME STORAGE
 ********************************************************/
function getStorageData(key, defaultValue) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [key]: defaultValue }, (result) => {
      resolve(result[key]);
    });
  });
}

function setStorageData(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolve();
    });
  });
}

/********************************************************
 *             STORAGE KEYS & GLOBAL VARIABLES
 ********************************************************/
const STORAGE_KEY       = 'spellingGameState';       // Game session state
const MISTAKES_KEY      = 'allTimeMistakesList';       // All-time mistakes
const FULL_WORDS_KEY    = 'spellingList';              // Persistent full word list

// Persistent full word list (never overwritten by mistake sessions)
let fullWordList = [];

// Game session state – the working list for the current game session
let gameState = {
  words: [],           // This will be either the full word list or the mistakes list
  mode: 'in-line',     // 'in-line' or 'random'
  currentIndex: 0,     // next word index (for in-line)
  usedIndices: [],     // used indices for random mode
  score: 0,
  isGameActive: false, // true if a game session is active
};

// All-time mistakes list
let allTimeMistakes = [];

/********************************************************
 *                   ELEMENT REFERENCES
 ********************************************************/
// Main Controls
const startContainer       = document.getElementById('start-container');
const wordsInput           = document.getElementById('words-input');
const modeSelect           = document.getElementById('mode-select');
const newGameBtn           = document.getElementById('new-game-btn');
const resumeGameBtn        = document.getElementById('resume-game-btn');
const practiceMistakesBtn  = document.getElementById('practice-mistakes-btn');
const manageListBtn        = document.getElementById('manage-list-btn');
const manageAllMistakesBtn = document.getElementById('manage-all-mistakes-btn');
const pauseBtn             = document.getElementById('pause-btn'); // Pause button

// Current Word List Manager
const listManager     = document.getElementById('list-manager');
const currentWordList = document.getElementById('current-word-list');
const addWordInput    = document.getElementById('add-word-input');
const addWordBtn      = document.getElementById('add-word-btn');
const closeListBtn    = document.getElementById('close-list-btn');

// All-Time Mistakes Manager
const mistakesManager = document.getElementById('mistakes-manager');
const allMistakesList = document.getElementById('all-mistakes-list');
const addMistakeInput = document.getElementById('add-mistake-input');
const addMistakeBtn   = document.getElementById('add-mistake-btn');
const closeMistakesBtn= document.getElementById('close-mistakes-btn');

// Game Play Elements
const gameContainer  = document.getElementById('game-container');
const userSpelling   = document.getElementById('user-spelling');
const checkBtn       = document.getElementById('check-btn');
const feedback       = document.getElementById('feedback');
const scoreDisplay   = document.getElementById('score-display');
const quitBtn        = document.getElementById('quit-btn');

// Results Screen
const resultContainer = document.getElementById('result-container');
const finalScore      = document.getElementById('final-score');
const restartBtn      = document.getElementById('restart-btn');

/********************************************************
 *                      ON LOAD
 ********************************************************/
document.addEventListener('DOMContentLoaded', async () => {
  // Load persistent full word list and game state
  fullWordList = await getStorageData(FULL_WORDS_KEY, []);
  await loadGameState();
  await loadAllTimeMistakes();
  updateResumeButtonVisibility();

  // Optional: Log voices for TTS debugging
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      console.log("Voices loaded:", window.speechSynthesis.getVoices());
    };
  }
});

/********************************************************
 *                   EVENT LISTENERS
 ********************************************************/
newGameBtn.addEventListener('click', startNewGame);
resumeGameBtn.addEventListener('click', resumeGame);
practiceMistakesBtn.addEventListener('click', practiceAllTimeMistakes);
pauseBtn.addEventListener('click', pauseGame);

manageListBtn.addEventListener('click', openListManager);
addWordBtn.addEventListener('click', addWordToList);
closeListBtn.addEventListener('click', closeListManager);

manageAllMistakesBtn.addEventListener('click', openMistakesManager);
addMistakeBtn.addEventListener('click', addWordToMistakes);
closeMistakesBtn.addEventListener('click', closeMistakesManager);

checkBtn.addEventListener('click', checkSpelling);
quitBtn.addEventListener('click', quitGame);
restartBtn.addEventListener('click', restart);

// Allow Enter key for checking spelling
userSpelling.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    checkSpelling();
  }
});

/********************************************************
 *                  STORAGE HANDLING
 ********************************************************/
async function loadGameState() {
  const stored = await getStorageData(STORAGE_KEY, null);
  if (stored) {
    gameState = stored;
  }
}

async function saveGameState() {
  await setStorageData(STORAGE_KEY, gameState);
}

async function loadAllTimeMistakes() {
  const stored = await getStorageData(MISTAKES_KEY, []);
  allTimeMistakes = stored;
}

async function saveAllTimeMistakes() {
  await setStorageData(MISTAKES_KEY, allTimeMistakes);
}

async function saveFullWordList() {
  await setStorageData(FULL_WORDS_KEY, fullWordList);
}

/********************************************************
 *          GAME CONTROL FUNCTIONS
 ********************************************************/
// Start a new game using the full word list
async function startNewGame() {
  // Get any new words entered by the user
  const inputVal = wordsInput.value.trim();
  let newWords = [];
  if (inputVal) {
    newWords = inputVal.split(',').map(w => w.trim()).filter(Boolean);
  }
  // Merge new words into the persistent full word list
  newWords.forEach(word => {
    if (!fullWordList.includes(word)) {
      fullWordList.push(word);
    }
  });
  // Save the updated full list
  await saveFullWordList();
  // Use the full list for this game session
  gameState.words = [...fullWordList];
  gameState.mode = modeSelect.value;
  gameState.currentIndex = 0;
  gameState.usedIndices = [];
  gameState.score = 0;
  gameState.isGameActive = true;
  await saveGameState();
  launchGame();
}

// Resume a paused game
function resumeGame() {
  if (!gameState.isGameActive) {
    alert('No active game to resume!');
    return;
  }
  launchGame();
}

// Practice mistakes without affecting the full list
async function practiceAllTimeMistakes() {
  if (!allTimeMistakes.length) {
    alert("You have no all-time mistakes to practice!");
    return;
  }
  // Set the game session to use the mistakes list
  gameState.words = [...allTimeMistakes];
  gameState.mode = modeSelect.value;
  gameState.currentIndex = 0;
  gameState.usedIndices = [];
  gameState.score = 0;
  gameState.isGameActive = true;
  await saveGameState();
  launchGame();
}

// Return to the main screen
function restart() {
  hideAllContainers();
  startContainer.classList.remove('hidden');
}

/********************************************************
 *              PAUSE / RESUME FUNCTIONALITY
 ********************************************************/
async function pauseGame() {
  // Save the current game session state and return to main screen
  await saveGameState();
  hideAllContainers();
  startContainer.classList.remove('hidden');
  updateResumeButtonVisibility();
}

/********************************************************
 *                   GAME LAUNCHING
 ********************************************************/
function launchGame() {
  hideAllContainers();
  gameContainer.classList.remove('hidden');
  scoreDisplay.textContent = gameState.score;
  feedback.textContent = '';
  speakNextWord();
}

function updateResumeButtonVisibility() {
  resumeGameBtn.style.display = gameState.isGameActive ? 'inline-block' : 'none';
}

/********************************************************
 *               LIST & MISTAKES MANAGERS
 ********************************************************/
function openListManager() {
  hideAllContainers();
  listManager.classList.remove('hidden');
  renderCurrentWordList();
}

function closeListManager() {
  listManager.classList.add('hidden');
  if (gameState.isGameActive) {
    gameContainer.classList.remove('hidden');
  } else {
    startContainer.classList.remove('hidden');
  }
}

function renderCurrentWordList() {
  currentWordList.innerHTML = '';
  fullWordList.forEach((word, index) => {
    const li = document.createElement('li');
    li.classList.add('list-item');
    li.textContent = word;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', async () => {
      await removeWordFromFullList(index);
    });
    li.appendChild(removeBtn);
    currentWordList.appendChild(li);
  });
}

async function addWordToList() {
  const newWord = addWordInput.value.trim();
  if (newWord && !fullWordList.includes(newWord)) {
    fullWordList.push(newWord);
    await saveFullWordList();
    renderCurrentWordList();
  }
  addWordInput.value = '';
}

async function removeWordFromFullList(index) {
  fullWordList.splice(index, 1);
  await saveFullWordList();
  renderCurrentWordList();
}

function openMistakesManager() {
  hideAllContainers();
  mistakesManager.classList.remove('hidden');
  renderAllTimeMistakes();
}

function closeMistakesManager() {
  mistakesManager.classList.add('hidden');
  if (gameState.isGameActive) {
    gameContainer.classList.remove('hidden');
  } else {
    startContainer.classList.remove('hidden');
  }
}

function renderAllTimeMistakes() {
  allMistakesList.innerHTML = '';
  allTimeMistakes.forEach((word, index) => {
    const li = document.createElement('li');
    li.classList.add('list-item');
    li.textContent = word;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', async () => {
      await removeWordFromMistakes(index);
    });
    li.appendChild(removeBtn);
    allMistakesList.appendChild(li);
  });
}

async function addWordToMistakes() {
  const newWord = addMistakeInput.value.trim();
  if (newWord && !allTimeMistakes.includes(newWord)) {
    allTimeMistakes.push(newWord);
    await saveAllTimeMistakes();
  } else if (allTimeMistakes.includes(newWord)) {
    alert("Word is already in the all-time mistakes list!");
  }
  addMistakeInput.value = '';
  renderAllTimeMistakes();
}

async function removeWordFromMistakes(index) {
  allTimeMistakes.splice(index, 1);
  await saveAllTimeMistakes();
  renderAllTimeMistakes();
}

/********************************************************
 *                   GAME FLOW & LOGIC
 ********************************************************/
function hideAllContainers() {
  startContainer.classList.add('hidden');
  listManager.classList.add('hidden');
  mistakesManager.classList.add('hidden');
  gameContainer.classList.add('hidden');
  resultContainer.classList.add('hidden');
}

function speakNextWord() {
  if (!gameState.words.length) {
    endGame();
    return;
  }
  if (gameState.mode === 'in-line') {
    if (gameState.currentIndex >= gameState.words.length) {
      endGame();
      return;
    }
    speakWord(gameState.words[gameState.currentIndex]);
  } else {
    if (gameState.usedIndices.length === gameState.words.length) {
      endGame();
      return;
    }
    let randomIndex;
    do {
      randomIndex = Math.floor(Math.random() * gameState.words.length);
    } while (gameState.usedIndices.includes(randomIndex));
    gameState.usedIndices.push(randomIndex);
    saveGameState(); // Save progress (no await needed)
    speakWord(gameState.words[randomIndex]);
  }
}

function speakWord(word) {
  if ('speechSynthesis' in window) {
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    speechSynthesis.speak(utterance);
  } else {
    console.error("Speech synthesis not supported in this browser.");
  }
}

async function checkSpelling() {
  const userAnswer = userSpelling.value.trim();
  userSpelling.value = '';
  let correctWord = (gameState.mode === 'in-line') ?
                    gameState.words[gameState.currentIndex] :
                    gameState.words[gameState.usedIndices[gameState.usedIndices.length - 1]];
  
  if (!userAnswer) {
    feedback.textContent = 'Please type the spelling.';
    feedback.className = 'message';
    return;
  }
  
  if (userAnswer.toLowerCase() === correctWord.toLowerCase()) {
    gameState.score++;
    feedback.textContent = `Correct! The spelling is "${correctWord}".`;
    feedback.className = 'message correct';
  } else {
    feedback.textContent = `Incorrect! The correct spelling is "${correctWord}".`;
    feedback.className = 'message incorrect';
    if (!allTimeMistakes.includes(correctWord)) {
      allTimeMistakes.push(correctWord);
      await saveAllTimeMistakes();
    }
  }
  
  if (gameState.mode === 'in-line') {
    gameState.currentIndex++;
  }
  
  scoreDisplay.textContent = gameState.score;
  await saveGameState();
  
  setTimeout(() => {
    feedback.textContent = '';
    feedback.className = 'message';
    speakNextWord();
  }, 1500);
}

function quitGame() {
  if (confirm('Are you sure you want to quit?')) {
    endGame();
  }
}

async function endGame() {
  gameState.isGameActive = false;
  await saveGameState();
  hideAllContainers();
  resultContainer.classList.remove('hidden');
  finalScore.textContent = gameState.score;
  updateResumeButtonVisibility();
}
