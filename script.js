const moves = {
    rock: { emoji: '✊', beats: 'scissors', label: 'Rock' },
    paper: { emoji: '✋', beats: 'rock', label: 'Paper' },
    scissors: { emoji: '✌️', beats: 'paper', label: 'Scissors' }
};

const scoreStorageKey = 'showdown-score-v1';
const playerNameStorageKey = 'showdown-player-name-v1';
const setupPanel = document.getElementById('setup-panel');
const setupMessage = document.getElementById('setup-message');
const lobbyForm = document.getElementById('lobby-form');
const playerNameInput = document.getElementById('player-name-input');
const roomIdInput = document.getElementById('room-id-input');
const enterGameButton = document.getElementById('enter-game-button');
const gameScreen = document.getElementById('game-screen');
const playerScoreElement = document.getElementById('player-score');
const computerScoreElement = document.getElementById('computer-score');
const playerChoiceElement = document.getElementById('player-choice');
const computerChoiceElement = document.getElementById('computer-choice');
const resultMessage = document.querySelector('.round-message');
const resultTitle = document.getElementById('result-title');
const resultDetail = document.getElementById('result-detail');
const roundCount = document.getElementById('round-count');
const moveButtons = document.querySelectorAll('.move-button');
const movePicker = document.querySelector('.move-picker');
const simultaneousPlay = document.getElementById('simultaneous-play');
const localPhase = document.getElementById('local-phase');
const localCountdown = document.getElementById('local-countdown');
const simultaneousInstructions = document.getElementById('simultaneous-instructions');
const localPlayerOneName = document.getElementById('local-player-one-name');
const localPlayerOneStatus = document.getElementById('local-player-one-status');
const localPlayerTwoStatus = document.getElementById('local-player-two-status');
const localFallbackButtons = document.querySelectorAll('.local-fallback-buttons button');
const keyboardHint = document.querySelector('.keyboard-hint');
const resetButton = document.getElementById('reset-button');
const roomBanner = document.getElementById('room-banner');
const roomIdDisplay = document.getElementById('room-id-display');
const copyRoomButton = document.getElementById('copy-room-button');
const leftPlayerLabel = document.getElementById('left-player-label');
const rightPlayerLabel = document.getElementById('right-player-label');
const leftFighterLabel = document.getElementById('left-fighter-label');
const rightFighterLabel = document.getElementById('right-fighter-label');

let score = loadScore();
let gameMode = 'computer';
let localRoundMoves = [null, null];
let localRoundActive = false;
let localPhaseEndsAt = 0;
let localRoundInterval = null;
let localNextRoundTimer = null;
let onlineGame = null;
let pollTimer = null;
let pollInFlight = false;
let lastRenderedOnlineRound = 0;
let currentPlayerName = '';

function loadScore() {
    try {
        const savedScore = JSON.parse(localStorage.getItem(scoreStorageKey));
        if (
            savedScore &&
            Number.isSafeInteger(savedScore.player) &&
            savedScore.player >= 0 &&
            Number.isSafeInteger(savedScore.computer) &&
            savedScore.computer >= 0 &&
            Number.isSafeInteger(savedScore.draws) &&
            savedScore.draws >= 0
        ) {
            return savedScore;
        }
    } catch (error) {
        console.warn('Could not load the saved score. The game will start a fresh score.', error);
    }

    return { player: 0, computer: 0, draws: 0 };
}

function saveScore() {
    try {
        localStorage.setItem(scoreStorageKey, JSON.stringify(score));
    } catch (error) {
        console.warn('Could not save the score. It will reset when this page is closed.', error);
    }
}

function renderScore() {
    playerScoreElement.textContent = score.player;
    computerScoreElement.textContent = score.computer;
    roundCount.textContent = `ROUND ${score.player + score.computer + score.draws}`;
}

function startGame(mode) {
    stopPolling();
    stopLocalTimers();
    gameMode = mode;
    score = mode === 'computer' ? loadScore() : { player: 0, computer: 0, draws: 0 };
    localRoundMoves = [null, null];
    localRoundActive = false;
    onlineGame = null;
    setupPanel.hidden = true;
    gameScreen.hidden = false;
    roomBanner.hidden = true;
    setupMessage.textContent = '';
    resetBoard();

    const isLocal = mode === 'local';
    const isOnline = mode === 'online';
    leftPlayerLabel.textContent = isLocal ? 'PLAYER 1' : 'YOU';
    leftFighterLabel.textContent = leftPlayerLabel.textContent;
    rightPlayerLabel.textContent = isLocal ? 'PLAYER 2' : isOnline ? 'OPPONENT' : 'COMPUTER';
    rightFighterLabel.textContent = rightPlayerLabel.textContent;
    resetButton.hidden = isOnline;
    keyboardHint.hidden = isLocal;
    setMoveButtonsDisabled(isOnline);
    movePicker.hidden = isLocal;
    simultaneousPlay.hidden = !isLocal;
    localPlayerOneName.textContent = isLocal && currentPlayerName
        ? currentPlayerName.toUpperCase()
        : 'PLAYER 1';
    renderScore();
    if (isLocal) {
        startLocalRound();
    }
}

function playComputerRound(playerMove) {
    const moveNames = Object.keys(moves);
    const computerMove = moveNames[Math.floor(Math.random() * moveNames.length)];
    const playerWon = moves[playerMove].beats === computerMove;
    const computerWon = moves[computerMove].beats === playerMove;

    revealMoves(playerMove, computerMove);
    if (playerWon) {
        score.player += 1;
        showResult('win', 'You win this round!', `${moves[playerMove].label} beats ${moves[computerMove].label.toLowerCase()}. Nice move!`);
        animateScore(playerScoreElement);
    } else if (computerWon) {
        score.computer += 1;
        showResult('loss', 'Computer wins this round', `${moves[computerMove].label} beats ${moves[playerMove].label.toLowerCase()}. Try again!`);
        animateScore(computerScoreElement);
    } else {
        score.draws += 1;
        showResult('draw', "It's a draw!", `You both picked ${moves[playerMove].label.toLowerCase()}. Go again!`);
    }

    renderScore();
    saveScore();
}

function startLocalRound() {
    localRoundMoves = [null, null];
    localRoundActive = false;
    localPlayerOneStatus.textContent = 'Ready';
    localPlayerTwoStatus.textContent = 'Ready';
    for (const button of localFallbackButtons) {
        button.disabled = false;
    }
    localPhase.textContent = 'GET READY';
    simultaneousInstructions.textContent = 'After the 3-second countdown, both players have 10 seconds to enter a move. Keys work only while this game page is active; buttons are available below as a backup.';
    playerChoiceElement.textContent = '?';
    computerChoiceElement.textContent = '?';
    const countdownEndsAt = Date.now() + 3000;
    localPhaseEndsAt = countdownEndsAt;
    updateLocalClock();
    localRoundInterval = window.setInterval(() => {
        updateLocalClock();
        if (!localRoundActive && Date.now() >= countdownEndsAt) {
            localRoundActive = true;
            localPhase.textContent = 'GO!';
            localPhaseEndsAt = Date.now() + 10000;
            updateLocalClock();
            simultaneousInstructions.textContent = 'Press A/S/D or J/K/L now. Moves remain hidden until the round ends.';
        } else if (localRoundActive && Date.now() >= localPhaseEndsAt) {
            finishLocalRound();
        }
    }, 50);
}

function updateLocalClock() {
    const remainingMs = Math.max(0, localPhaseEndsAt - Date.now());
    localCountdown.textContent = String(Math.ceil(remainingMs / 1000));
}

function chooseLocalMove(playerIndex, move) {
    if (gameMode !== 'local' || !localRoundActive || localRoundMoves[playerIndex] !== null) {
        return;
    }
    if (Date.now() >= localPhaseEndsAt) {
        finishLocalRound();
        return;
    }

    localRoundMoves[playerIndex] = move;
    const statusElement = playerIndex === 0 ? localPlayerOneStatus : localPlayerTwoStatus;
    statusElement.textContent = 'Move locked in';
    for (const button of localFallbackButtons) {
        if (Number(button.dataset.player) === playerIndex) {
            button.disabled = true;
        }
    }
}

function finishLocalRound() {
    if (localRoundInterval !== null) {
        window.clearInterval(localRoundInterval);
        localRoundInterval = null;
    }
    localRoundActive = false;

    const [firstMove, secondMove] = localRoundMoves;
    if (firstMove && secondMove) {
        revealMoves(firstMove, secondMove);
        resolveRound(firstMove, secondMove, currentPlayerName || 'Player 1', 'Player 2');
        simultaneousInstructions.textContent = 'Both players entered a move in the shared time window.';
    } else {
        playerChoiceElement.textContent = '?';
        computerChoiceElement.textContent = '?';
        const missingPlayer = firstMove ? 'Player 2' : secondMove ? 'Player 1' : 'Both players';
        showResult('', 'Round cancelled — both moves are needed', `${missingPlayer} did not enter a move in time. No point awarded; get ready to try again.`);
        simultaneousInstructions.textContent = 'A round only counts when both players press a key during the same window.';
    }
    localPhase.textContent = 'ROUND OVER';
    localCountdown.textContent = '0';
    localPlayerOneStatus.textContent = firstMove ? 'Move locked in' : 'No move';
    localPlayerTwoStatus.textContent = secondMove ? 'Move locked in' : 'No move';
    localNextRoundTimer = window.setTimeout(() => {
        localNextRoundTimer = null;
        if (gameMode === 'local') {
            startLocalRound();
        }
    }, 2500);
}

function stopLocalTimers() {
    if (localRoundInterval !== null) {
        window.clearInterval(localRoundInterval);
        localRoundInterval = null;
    }
    if (localNextRoundTimer !== null) {
        window.clearTimeout(localNextRoundTimer);
        localNextRoundTimer = null;
    }
}

async function playOnlineMove(move) {
    if (!onlineGame || onlineGame.hasSubmitted) {
        return;
    }

    const currentGame = onlineGame;
    currentGame.hasSubmitted = true;
    setMoveButtonsDisabled(true);
    showResult('', 'Move locked in!', 'Waiting for the other player...');
    try {
        const moveUrl = `/api/rooms/${encodeURIComponent(currentGame.roomId)}/moves?playerId=${encodeURIComponent(currentGame.playerId)}`;
        await requestJson(moveUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ move })
        });
        if (onlineGame !== currentGame) {
            return;
        }
        await pollOnlineRoom();
    } catch (error) {
        if (onlineGame !== currentGame) {
            return;
        }
        currentGame.hasSubmitted = false;
        setMoveButtonsDisabled(false);
        showResult('loss', 'Could not send your move', error.message);
    }
}

function resolveRound(leftMove, rightMove, leftName, rightName) {
    const leftWon = moves[leftMove].beats === rightMove;
    const rightWon = moves[rightMove].beats === leftMove;
    if (leftWon) {
        score.player += 1;
        showResult('win', `${leftName} wins this round!`, `${moves[leftMove].label} beats ${moves[rightMove].label.toLowerCase()}.`);
        animateScore(playerScoreElement);
    } else if (rightWon) {
        score.computer += 1;
        showResult('loss', `${rightName} wins this round!`, `${moves[rightMove].label} beats ${moves[leftMove].label.toLowerCase()}.`);
        animateScore(computerScoreElement);
    } else {
        score.draws += 1;
        showResult('draw', "It's a draw!", `Both players picked ${moves[leftMove].label.toLowerCase()}.`);
    }
    renderScore();
}

function renderOnlineResult(result) {
    if (!result || result.round <= lastRenderedOnlineRound) {
        return false;
    }

    lastRenderedOnlineRound = result.round;
    const leftMove = result.moves[onlineGame.role];
    const otherRole = onlineGame.role === 'host' ? 'guest' : 'host';
    const rightMove = result.moves[otherRole];
    revealMoves(leftMove, rightMove);

    if (result.winner === 'draw') {
        showResult('draw', "It's a draw!", `Both players picked ${moves[leftMove].label.toLowerCase()}.`);
        score.draws += 1;
    } else if (result.winner === onlineGame.role) {
        score.player += 1;
        showResult('win', 'You win this round!', `${moves[leftMove].label} beats ${moves[rightMove].label.toLowerCase()}.`);
        animateScore(playerScoreElement);
    } else {
        score.computer += 1;
        showResult('loss', 'Your opponent wins this round', `${moves[rightMove].label} beats ${moves[leftMove].label.toLowerCase()}.`);
        animateScore(computerScoreElement);
    }
    renderScore();
    return true;
}

async function pollOnlineRoom() {
    if (!onlineGame || pollInFlight) {
        return;
    }

    pollInFlight = true;
    const currentGame = onlineGame;
    try {
        const room = await requestJson(`/api/rooms/${encodeURIComponent(currentGame.roomId)}?playerId=${encodeURIComponent(currentGame.playerId)}`);
        if (onlineGame !== currentGame) {
            return;
        }
        if (room.opponentName) {
            const opponentLabel = room.opponentName.toUpperCase();
            rightPlayerLabel.textContent = opponentLabel;
            rightFighterLabel.textContent = opponentLabel;
        }
        const showedResult = renderOnlineResult(room.lastResult);
        onlineGame.hasSubmitted = room.hasSubmitted;
        setMoveButtonsDisabled(room.hasSubmitted || !room.opponentJoined);

        if (!room.opponentJoined) {
            showResult('', 'Room is ready!', 'Share the room ID and invite a friend to join.');
        } else if (showedResult) {
            return;
        } else if (room.lastResult && room.lastResult.round === lastRenderedOnlineRound && !room.hasSubmitted) {
            showResult('', 'Enjoy the game!', 'Choose your next move when you are ready.');
        } else if (room.hasSubmitted) {
            showResult('', 'Move locked in!', 'Waiting for the other player...');
        } else if (room.opponentHasSubmitted) {
            showResult('', 'Your opponent is ready!', 'Choose your move to reveal both moves.');
        } else if (lastRenderedOnlineRound === 0) {
            showResult('', 'Enjoy the game!', 'Choose a move when you are ready.');
        }
    } catch (error) {
        if (onlineGame !== currentGame) {
            return;
        }
        showResult('loss', 'Room connection lost', error.message);
    } finally {
        pollInFlight = false;
    }
}

function showResult(outcome, title, detail) {
    if (outcome) {
        resultMessage.dataset.result = outcome;
    } else {
        resultMessage.removeAttribute('data-result');
    }
    resultTitle.textContent = title;
    resultDetail.textContent = detail;
}

function revealMoves(leftMove, rightMove) {
    playerChoiceElement.textContent = moves[leftMove].emoji;
    computerChoiceElement.textContent = moves[rightMove].emoji;
    playerChoiceElement.setAttribute('aria-label', `Your move: ${moves[leftMove].label}`);
    computerChoiceElement.setAttribute('aria-label', `Opponent's move: ${moves[rightMove].label}`);
    animateChoices();
}

function resetBoard() {
    playerChoiceElement.textContent = '?';
    computerChoiceElement.textContent = '?';
    playerChoiceElement.setAttribute('aria-label', 'Your move');
    computerChoiceElement.setAttribute('aria-label', "Opponent's move");
    showResult('', 'Ready when you are', 'Pick a move to start the game');
}

function animateChoices() {
    for (const choice of [playerChoiceElement, computerChoiceElement]) {
        choice.classList.remove('reveal');
        void choice.offsetWidth;
        choice.classList.add('reveal');
    }
}

function animateScore(element) {
    element.classList.remove('score-pop');
    void element.offsetWidth;
    element.classList.add('score-pop');
    window.setTimeout(() => element.classList.remove('score-pop'), 350);
}

function setMoveButtonsDisabled(disabled) {
    for (const button of moveButtons) {
        button.disabled = disabled;
    }
}

function stopPolling() {
    if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
    }
}

async function requestJson(url, options = {}) {
    let response;
    try {
        response = await fetch(url, options);
    } catch (error) {
        throw new Error('Cannot reach the game server. Make sure the server is running.');
    }
    const body = await response.json();
    if (!response.ok) {
        throw new Error(body.error || 'The request could not be completed.');
    }
    return body;
}

async function createOnlineRoom(playerName) {
    try {
        const room = await requestJson('/api/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerName })
        });
        await enterOnlineRoom(room, 'host');
    } catch (error) {
        setupMessage.textContent = error.message;
    }
}

async function joinOnlineRoom(roomId, playerName) {
    try {
        const room = await requestJson(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerName })
        });
        await enterOnlineRoom(room, 'guest');
    } catch (error) {
        setupMessage.textContent = error.message;
    }
}

async function enterOnlineRoom(room, role) {
    startGame('online');
    onlineGame = { roomId: room.roomId, playerId: room.playerId, role, hasSubmitted: false };
    lastRenderedOnlineRound = 0;
    roomBanner.hidden = false;
    roomIdDisplay.textContent = room.roomId;
    showResult('', 'Enjoy the game!', role === 'host'
        ? `Welcome, ${currentPlayerName}! Share this room ID with the other player to get started.`
        : `Welcome, ${currentPlayerName}! You joined the room. Enjoy the game!`);
    if (role === 'host') {
        leftPlayerLabel.textContent = currentPlayerName.toUpperCase();
        leftFighterLabel.textContent = currentPlayerName.toUpperCase();
        rightPlayerLabel.textContent = 'WAITING...';
        rightFighterLabel.textContent = 'WAITING...';
    } else {
        leftPlayerLabel.textContent = currentPlayerName.toUpperCase();
        leftFighterLabel.textContent = currentPlayerName.toUpperCase();
        rightPlayerLabel.textContent = 'HOST';
        rightFighterLabel.textContent = 'HOST';
    }
    await pollOnlineRoom();
    if (!onlineGame || onlineGame.roomId !== room.roomId) {
        return;
    }
    pollTimer = window.setInterval(pollOnlineRoom, 700);
}

function setSetupBusy(busy) {
    enterGameButton.disabled = busy;
    document.getElementById('computer-mode').disabled = busy;
    document.getElementById('local-mode').disabled = busy;
}

function resetGame() {
    stopLocalTimers();
    score = { player: 0, computer: 0, draws: 0 };
    localRoundMoves = [null, null];
    localRoundActive = false;
    resetBoard();
    renderScore();
    if (gameMode === 'computer') {
        saveScore();
    } else if (gameMode === 'local') {
        startLocalRound();
    }
}

document.getElementById('computer-mode').addEventListener('click', () => startGame('computer'));
document.getElementById('local-mode').addEventListener('click', () => startGame('local'));
for (const button of localFallbackButtons) {
    button.addEventListener('click', () => {
        chooseLocalMove(Number(button.dataset.player), button.dataset.move);
    });
}
playerNameInput.value = localStorage.getItem(playerNameStorageKey) || '';
lobbyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    currentPlayerName = playerNameInput.value.trim();
    const roomId = roomIdInput.value.trim().toUpperCase();
    if (!currentPlayerName || currentPlayerName.length > 24) {
        setupMessage.textContent = 'Enter a name of 1 to 24 characters.';
        playerNameInput.focus();
        return;
    }

    setupMessage.textContent = '';
    try {
        localStorage.setItem(playerNameStorageKey, currentPlayerName);
    } catch (error) {
        console.warn('Could not save the player name for next time.', error);
    }
    setSetupBusy(true);
    try {
        if (roomId) {
            await joinOnlineRoom(roomId, currentPlayerName);
        } else {
            await createOnlineRoom(currentPlayerName);
        }
    } finally {
        setSetupBusy(false);
    }
});
document.getElementById('back-button').addEventListener('click', () => {
    stopPolling();
    stopLocalTimers();
    onlineGame = null;
    gameScreen.hidden = true;
    setupPanel.hidden = false;
    setMoveButtonsDisabled(false);
    setupMessage.textContent = '';
});
copyRoomButton.addEventListener('click', async () => {
    if (!onlineGame) {
        return;
    }
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set('room', onlineGame.roomId);
    try {
        await navigator.clipboard.writeText(inviteUrl.href);
        copyRoomButton.textContent = 'LINK COPIED!';
        window.setTimeout(() => { copyRoomButton.textContent = 'COPY INVITE LINK'; }, 1800);
    } catch (error) {
        showResult('loss', 'Could not copy invite link', 'Copy the room ID shown above and send it to your friend.');
    }
});

for (const button of moveButtons) {
    button.addEventListener('click', () => {
        if (button.disabled) {
            return;
        }
        if (gameMode === 'computer') {
            playComputerRound(button.dataset.move);
        } else if (gameMode === 'online') {
            playOnlineMove(button.dataset.move);
        }
    });
}

resetButton.addEventListener('click', resetGame);

window.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || gameScreen.hidden) {
        return;
    }

    if (gameMode === 'local') {
        const localKeys = {
            KeyA: [0, 'rock'],
            KeyS: [0, 'paper'],
            KeyD: [0, 'scissors'],
            KeyJ: [1, 'rock'],
            KeyK: [1, 'paper'],
            KeyL: [1, 'scissors']
        };
        const localMove = localKeys[event.code] || localKeys[`Key${event.key.toUpperCase()}`];
        if (localMove) {
            event.preventDefault();
            chooseLocalMove(localMove[0], localMove[1]);
        }
        return;
    }

    const keyMoves = { KeyR: 'rock', KeyP: 'paper', KeyS: 'scissors' };
    const move = keyMoves[event.code];
    if (move) {
        const button = document.querySelector(`.move-button[data-move="${move}"]`);
        if (button && !button.disabled) {
            button.click();
        }
    }
});

roomIdInput.value = new URLSearchParams(window.location.search).get('room') || '';
renderScore();
