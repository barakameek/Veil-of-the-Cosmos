// =================================================================================
// --- 1. GAME DATA: CARDS, GODS, EVENTS, REVELATIONS ---
// =================================================================================

const cardDefinitions = {
    // --- Origin ---
    'Ruined Temple': {
        name: 'Ruined Temple', type: 'Location', aspect: 'Order',
        flavor: 'A crumbling edifice, a beacon of forgotten faith. Its presence stabilizes the mundane world.',
        effects: 'Origin. Activate: Gain 1 Influence.',
        onActivate: () => { gameState.influence++; logMessage('The Ruined Temple grants 1 Influence.'); },
        isPermanent: true
    },
    // --- Minor Cards ---
    'Glyph of Stability': {
        name: 'Glyph of Stability', type: 'Artifact', aspect: 'Order',
        flavor: 'A fragile inscription against the encroaching chaos, offering a fleeting sense of peace.',
        effects: 'When played: +1 Stability (+1 additional if adjacent to Order). Reduces Sanity loss by 1 from adjacent Mid Zone cards (passive).',
        onPlay: (cellId) => {
            updateStability(1);
            if (getAdjacentCards(cellId).some(c => c.aspect === 'Order')) updateStability(1);
        },
    },
    'Crimson Spire': {
        name: 'Crimson Spire', type: 'Location', aspect: 'Chaos',
        flavor: 'A jagged monument bleeding chaotic energies into the sky, unstable and alluring.',
        effects: 'Mid Zone (Play): Gain 2 Knowledge. Outer Zone (Play): Lose 1 Sanity, gain 4 Knowledge. Adjacent Chaos: +1 Sanity cost, +2 Knowledge.',
        onPlay: (cellId) => {
            if (getDistance(cellId) === 2) gameState.knowledge += 2;
            if (getDistance(cellId) === 3) { updateSanity(-1); gameState.knowledge += 4; }
            if (getAdjacentCards(cellId).some(c => c.aspect === 'Chaos')) { updateSanity(-1); gameState.knowledge += 2; }
        },
    },
    'Faceless Wanderer': {
        name: 'Faceless Wanderer', type: 'Entity', aspect: 'Void',
        flavor: 'An empty cloak drifting through impossible spaces, seeking something nameless.',
        effects: 'Activate: Gain 2 Knowledge. Outer Zone (Activate): Trigger a Revelation.',
        onActivate: (cellId) => {
            if (getDistance(cellId) === 3) triggerRevelation();
            else gameState.knowledge += 2;
        },
    },
    'Ancient Spring': {
        name: 'Ancient Spring', type: 'Location', aspect: 'Life',
        flavor: 'Waters of clarity flow from cracks in reality, soothing the mind.',
        effects: 'Activate: Gain 1 Sanity.',
        onActivate: () => updateSanity(1),
    },
    // --- Major Cards ---
    'Void\'s Edge': {
        name: 'Void\'s Edge', type: 'Location', aspect: 'Void',
        flavor: 'Where stars scream and reality frays. The veil thins here.',
        effects: 'Play Cost: 2 Influence. When played: Gain 3 Knowledge. Triggers Madness Check. Adjacent Void: Trigger a Revelation.',
        playCost: { influence: 2 },
        onPlay: (cellId) => {
            gameState.knowledge += 3;
            if (getAdjacentCards(cellId).some(c => c.aspect === 'Void')) triggerRevelation();
        },
    }
};

const cosmicGods = {
    'The Devourer': {
        name: 'The Devourer',
        description: 'At turn end: Places a Devoured token on an Outer Zone card. If a card has 2 tokens, it is destroyed (lose 2 Sanity).',
        onTurnEnd: () => {
            logMessage(`The Devourer stirs...`);
            const outerZoneCards = getCardsInZone('Outer');
            const midZoneCards = getCardsInZone('Mid');
            const target = outerZoneCards.length > 0 ? outerZoneCards[Math.floor(Math.random() * outerZoneCards.length)]
                : midZoneCards.length > 0 ? midZoneCards[Math.floor(Math.random() * midZoneCards.length)]
                : null;

            if (target && !target.isPermanent) {
                target.tokens.devoured = (target.tokens.devoured || 0) + 1;
                logMessage(`${target.name} gains a Devoured token.`);
                if (target.tokens.devoured >= 2) {
                    logMessage(`${target.name} is devoured!`);
                    updateSanity(-2);
                    removeCardFromBoard(target.id);
                }
            } else {
                logMessage('The Devourer finds nothing to consume.');
            }
        }
    },
    'The Silent Watcher': {
        name: 'The Silent Watcher',
        description: 'At turn end: If you played a Void card, lose 1 Stability. If you played an Order card, gain 1 Sanity.',
        onTurnEnd: () => {
            logMessage(`The Silent Watcher observes...`);
            if (gameState.cardsPlayedThisTurn.some(c => c.aspect === 'Void')) {
                updateStability(-1);
                logMessage('Your dabbling in the Void has been noted. Lose 1 Stability.');
            }
            if (gameState.cardsPlayedThisTurn.some(c => c.aspect === 'Order')) {
                updateSanity(1);
                logMessage('Your sense of order is a comfort. Gain 1 Sanity.');
            }
        }
    }
};

const eventDeck = [
    { name: 'Cosmic Alignment', aspect: 'Chaos', effects: 'This turn: Chaos cards cost 1 less Sanity to play, but Order cards cost 1 more.', onTurnStart: () => { /* Logic handled in play cost calc */ } },
    { name: 'Ethereal Calm', aspect: 'Order', effects: 'This turn: The first time you would lose Sanity, prevent it.', onTurnStart: (state) => state.turnFlags.preventFirstSanityLoss = true },
    { name: 'Whispers from the Void', aspect: 'Void', effects: 'This turn: Activating Void cards does not cost an action.', onTurnStart: (state) => state.turnFlags.freeVoidActivation = true },
    { name: 'Surge of Life', aspect: 'Life', effects: 'This turn: Gain +1 Stability when playing a Life card.', onTurnStart: (state) => state.turnFlags.lifeStabilityBonus = true },
    { name: 'Stifling Static', aspect: 'Neutral', effects: 'This turn: Draw one fewer card at the start of your next turn.', onTurnStart: (state) => state.turnFlags.drawMinusOneNextTurn = true }
];

const revelationDeck = [
    {
        title: 'A Glimpse of the Mechanism',
        text: 'You see the grinding gears of reality. It is vast and uncaring, but offers a choice.',
        choiceA: { text: 'Embrace the chaos (+3 Knowledge, -1 Sanity)', onChoose: () => { gameState.knowledge += 3; updateSanity(-1); } },
        choiceB: { text: 'Reinforce your mind (+2 Stability)', onChoose: () => updateStability(2) }
    },
    {
        title: 'An Echo of a Voice',
        text: 'A voice, not of this world, offers a pact.',
        choiceA: { text: 'Accept the pact (+3 Influence, add 2 Devoured tokens to a card)', onChoose: () => { gameState.influence += 3; /* Add targeting logic */ logMessage("A pact is sealed...") } },
        choiceB: { text: 'Refuse and stand alone (Gain 2 Sanity)', onChoose: () => updateSanity(2) }
    }
];

// =================================================================================
// --- 2. GAME STATE & UI ELEMENTS ---
// =================================================================================

let gameState = {};

const ui = {
    startScreen: document.getElementById('start-screen'),
    adeptChoices: document.querySelectorAll('.adept-choice'),
    startGameBtn: document.getElementById('start-game-btn'),
    gameUI: document.getElementById('game-ui'),
    godName: document.getElementById('god-name'),
    godEffect: document.getElementById('god-effect'),
    sanity: document.getElementById('sanity-value'),
    knowledge: document.getElementById('knowledge-value'),
    influence: document.getElementById('influence-value'),
    stability: document.getElementById('stability-value'),
    actions: document.getElementById('actions-remaining'),
    endTurnBtn: document.getElementById('end-turn-btn'),
    messageList: document.getElementById('message-list'),
    gameBoard: document.getElementById('game-board'),
    eventCard: document.getElementById('event-card-content'),
    cardInspector: document.getElementById('inspector-content'),
    playerHand: document.getElementById('hand-cards'),
    revelationModal: document.getElementById('revelation-modal'),
    revelationTitle: document.getElementById('revelation-title'),
    revelationText: document.getElementById('revelation-text'),
    revelationChoiceA: document.getElementById('revelation-choice-a'),
    revelationChoiceB: document.getElementById('revelation-choice-b'),
    gameOverScreen: document.getElementById('game-over-screen'),
    gameOverTitle: document.getElementById('game-over-title'),
    gameOverText: document.getElementById('game-over-text'),
    playAgainBtn: document.getElementById('play-again-btn'),
};

let selectedAdept = null;
let selectedCardInHand = null;
let selectedCardOnBoard = null;

// =================================================================================
// --- 3. INITIALIZATION & GAME FLOW ---
// =================================================================================

function initializeGame() {
    // Reset state object
    gameState = {
        sanity: 10, knowledge: 0, influence: 0, stability: 0,
        actions: 2, turn: 1,
        deck: [], discardPile: [], hand: [], board: Array(5).fill(null).map(() => Array(5).fill(null)),
        activeGod: null, currentEvent: null,
        cardsPlayedThisTurn: [],
        turnFlags: {}, // For temporary event effects
        gameOver: false
    };

    // Apply Adept bonuses
    if (selectedAdept === 'Scholar') gameState.knowledge = 3;
    if (selectedAdept === 'Mystic') { gameState.influence = 2; gameState.stability = 1; }
    
    // Build and shuffle deck
    const fullDeck = [];
    Object.values(cardDefinitions).forEach(card => {
        if (card.name !== 'Ruined Temple') fullDeck.push(card);
    });
    // Add duplicates for a larger deck
    gameState.deck = [...fullDeck, ...fullDeck, ...fullDeck];
    shuffle(gameState.deck);
    
    // Place Origin Card
    gameState.board[2][2] = createCardInstance(cardDefinitions['Ruined Temple'], 'r3c3');
    
    // Draw starting hand
    const handSize = selectedAdept === 'Archivist' ? 6 : 5;
    for (let i = 0; i < handSize; i++) drawCard();

    // Select Cosmic God
    const godKeys = Object.keys(cosmicGods);
    gameState.activeGod = cosmicGods[godKeys[Math.floor(Math.random() * godKeys.length)]];
    
    // Initial UI setup
    ui.startScreen.classList.add('hidden');
    ui.gameUI.classList.remove('hidden');
    ui.gameOverScreen.classList.add('hidden');
    
    startTurn();
}

function startTurn() {
    logMessage(`--- Turn ${gameState.turn} Begins ---`);
    gameState.actions = 2;
    gameState.cardsPlayedThisTurn = [];
    gameState.turnFlags = {};
    selectedCardInHand = null;
    selectedCardOnBoard = null;

    // 1. Event Phase
    drawEvent();
    
    // 2. Draw Phase
    let cardsToDraw = 1;
    if (gameState.stability >= 3) cardsToDraw++; // Stability milestone
    if (gameState.turnFlags.drawMinusOneNextTurn) cardsToDraw--;
    
    for (let i = 0; i < cardsToDraw; i++) drawCard();

    // 3. Upkeep Phase (e.g., gain resources from milestones)
    if (gameState.stability >= 9) {
        gameState.influence++;
        logMessage('Stability 9 milestone grants 1 Influence.');
    }

    renderAll();
}

function endTurn() {
    if (gameState.gameOver) return;
    logMessage(`--- End of Turn ${gameState.turn} ---`);
    
    // 1. God Influence Phase
    if (gameState.activeGod.onTurnEnd) gameState.activeGod.onTurnEnd();

    // Reset card states for next turn
    getAllCardsOnBoard().forEach(c => c.activatedThisTurn = false);

    gameState.turn++;
    checkLossCondition();
    if (gameState.gameOver) return;

    startTurn();
}

// =================================================================================
// --- 4. CORE ACTIONS & LOGIC ---
// =================================================================================

function tryPlayCard(card, cellId) {
    if (gameState.actions <= 0) return logMessage("No actions remaining.");
    const [row, col] = getCoordsFromCellId(cellId);
    if (gameState.board[row][col]) return logMessage("Cell is occupied.");
    if (!isValidPlacement(cellId)) return logMessage("Invalid placement.");

    const distance = getDistance(cellId);
    let sanityCost = 0;
    if (distance === 2) sanityCost = 1;
    if (distance === 3) {
        if (gameState.stability < 6) return logMessage("Stability must be 6+ to play in the Outer Zone.");
        sanityCost = 3;
    }
    
    // Event modifications
    if (gameState.currentEvent.name === 'Cosmic Alignment') {
        if (card.aspect === 'Chaos') sanityCost--;
        if (card.aspect === 'Order') sanityCost++;
    }
    
    let totalCost = { sanity: sanityCost, ...card.playCost };
    
    if (!hasResources(totalCost)) return logMessage("Insufficient resources to play this card.");
    
    // Spend resources and take action
    spendResources(totalCost);
    gameState.actions--;

    // Place card on board
    const cardInstance = createCardInstance(card, cellId);
    gameState.board[row][col] = cardInstance;
    gameState.hand = gameState.hand.filter(c => c.uuid !== card.uuid);
    gameState.cardsPlayedThisTurn.push(cardInstance);
    logMessage(`${card.name} played at ${cellId}.`);

    // Trigger onPlay effects
    if (card.onPlay) card.onPlay(cellId);

    // Stability for Order/Life
    if (card.aspect === 'Order' || card.aspect === 'Life') {
        let stabilityGain = 1;
        if (gameState.turnFlags.lifeStabilityBonus && card.aspect === 'Life') stabilityGain++;
        updateStability(stabilityGain);
    }
    
    // Madness Check
    if (distance === 3) triggerMadnessCheck(cellId);

    // Cleanup and update
    selectedCardInHand = null;
    renderAll();
    checkWinCondition();
}

function tryActivateCard(card) {
    if (gameState.actions <= 0) return logMessage("No actions remaining.");
    if (card.activatedThisTurn) return logMessage(`${card.name} already activated.`);
    if (!card.onActivate) return logMessage(`${card.name} has no activation effect.`);

    let actionCost = 1;
    if (gameState.turnFlags.freeVoidActivation && card.aspect === 'Void') actionCost = 0;

    if (gameState.actions < actionCost) return logMessage("Not enough actions.");

    gameState.actions -= actionCost;
    card.activatedThisTurn = true;
    card.onActivate(card.cellId);
    logMessage(`Activated ${card.name}.`);

    selectedCardOnBoard = null;
    renderAll();
}

function triggerMadnessCheck(cellId) {
    const roll = Math.floor(Math.random() * 6) + 1;
    let sanityLoss = (roll <= 2) ? 3 : (roll <= 4) ? 2 : 1;
    logMessage(`Madness Check (Rolled ${roll}): Base loss is ${sanityLoss}.`);

    // Support reduction
    const support = getAllCardsOnBoard().filter(c => (c.aspect === 'Order' || c.aspect === 'Life') && getDistance(c.cellId) < 3).length;
    sanityLoss = Math.max(0, sanityLoss - support);
    logMessage(`Support from ${support} cards reduces loss.`);
    
    updateSanity(-sanityLoss);
}

function triggerRevelation() {
    const revelation = revelationDeck[Math.floor(Math.random() * revelationDeck.length)];
    ui.revelationTitle.textContent = revelation.title;
    ui.revelationText.textContent = revelation.text;
    ui.revelationChoiceA.textContent = revelation.choiceA.text;
    ui.revelationChoiceB.textContent = revelation.choiceB.text;
    
    // Use .onclick to easily replace the function each time
    ui.revelationChoiceA.onclick = () => {
        revelation.choiceA.onChoose();
        ui.revelationModal.classList.add('hidden');
        renderAll();
    };
    ui.revelationChoiceB.onclick = () => {
        revelation.choiceB.onChoose();
        ui.revelationModal.classList.add('hidden');
        renderAll();
    };
    
    ui.revelationModal.classList.remove('hidden');
}

function checkWinCondition() {
    const cardInOuterZone = getAllCardsOnBoard().some(c => getDistance(c.cellId) === 3);
    if (cardInOuterZone && gameState.stability >= 6) {
        endGame(true, "You have confronted the cosmic horror and survived... for now.");
    }
}

function checkLossCondition() {
    if (gameState.sanity <= 0) {
        endGame(false, "Your mind has shattered. You are consumed by the void.");
    }
}

function endGame(isWin, message) {
    gameState.gameOver = true;
    ui.gameOverTitle.textContent = isWin ? "Victory?" : "Madness Consumes";
    ui.gameOverText.textContent = message;
    ui.gameOverScreen.classList.remove('hidden');
}

// =================================================================================
// --- 5. RENDER & UI FUNCTIONS ---
// =================================================================================

function renderAll() {
    if (gameState.gameOver) return;
    // Update resource panel
    ui.sanity.textContent = gameState.sanity;
    ui.knowledge.textContent = gameState.knowledge;
    ui.influence.textContent = gameState.influence;
    ui.stability.textContent = gameState.stability;
    ui.actions.textContent = gameState.actions;
    
    // Update god display
    ui.godName.textContent = gameState.activeGod.name;
    ui.godEffect.textContent = gameState.activeGod.description;
    
    renderBoard();
    renderHand();
    renderEventCard();
    updateInspector();
}

function renderBoard() {
    ui.gameBoard.innerHTML = '';
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            const cellId = getCellIdFromCoords(r, c);
            const cellDiv = document.createElement('div');
            cellDiv.className = 'board-cell';
            cellDiv.dataset.cellId = cellId;
            cellDiv.onclick = () => handleCellClick(cellId);
            
            if (cellId === 'r3c3') cellDiv.classList.add('origin');

            const card = gameState.board[r][c];
            if (card) {
                const cardEl = createCardElement(card, 'board');
                // Add visual effects like tokens or overlays
                const tokenContainer = document.createElement('div');
                tokenContainer.className = 'token-container';
                if (card.tokens.devoured) {
                    const token = document.createElement('div');
                    token.className = 'token devoured';
                    token.textContent = card.tokens.devoured;
                    tokenContainer.appendChild(token);
                }
                cardEl.appendChild(tokenContainer);

                if (card.activatedThisTurn) {
                    const overlay = document.createElement('div');
                    overlay.className = 'card-overlay activated';
                    overlay.textContent = '✓';
                    cardEl.appendChild(overlay);
                }

                cellDiv.appendChild(cardEl);
            } else if (selectedCardInHand && isValidPlacement(cellId)) {
                cellDiv.classList.add('valid-placement');
            }
            ui.gameBoard.appendChild(cellDiv);
        }
    }
}

function renderHand() {
    ui.playerHand.innerHTML = '';
    gameState.hand.forEach(card => {
        const cardEl = createCardElement(card, 'hand');
        if (selectedCardInHand && card.uuid === selectedCardInHand.uuid) {
            cardEl.classList.add('selected-in-hand');
        }
        cardEl.onclick = (e) => { e.stopPropagation(); handleHandCardClick(card); };
        ui.playerHand.appendChild(cardEl);
    });
}

function renderEventCard() {
    if (gameState.currentEvent) {
        ui.eventCard.innerHTML = '';
        ui.eventCard.appendChild(createCardElement(gameState.currentEvent, 'inspector'));
    }
}

function updateInspector() {
    const target = selectedCardOnBoard || selectedCardInHand;
    if (target) {
        ui.cardInspector.innerHTML = '';
        const cardEl = createCardElement(target, 'inspector');
        
        // Add action button if applicable
        if (selectedCardOnBoard && selectedCardOnBoard.onActivate && !selectedCardOnBoard.activatedThisTurn) {
            const activateBtn = document.createElement('button');
            activateBtn.textContent = 'Activate';
            activateBtn.onclick = () => tryActivateCard(selectedCardOnBoard);
            cardEl.appendChild(activateBtn);
        }
        
        ui.cardInspector.appendChild(cardEl);
    } else {
        ui.cardInspector.innerHTML = '<p class="placeholder-text">Select a card to inspect it.</p>';
    }
}

function createCardElement(cardData, context) {
    const cardDiv = document.createElement('div');
    cardDiv.className = `card ${cardData.aspect.toLowerCase()}`;
    
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = cardData.name;
    cardDiv.appendChild(title);
    
    const typeAspect = document.createElement('div');
    typeAspect.className = 'card-type-aspect';
    typeAspect.textContent = `${cardData.type} - ${cardData.aspect}`;
    cardDiv.appendChild(typeAspect);
    
    if (context !== 'board') {
        const effects = document.createElement('div');
        effects.className = 'card-effects';
        effects.textContent = cardData.effects;
        cardDiv.appendChild(effects);
        
        const flavor = document.createElement('div');
        flavor.className = 'card-flavor';
        flavor.textContent = cardData.flavor;
        cardDiv.appendChild(flavor);
    }
    
    return cardDiv;
}

// =================================================================================
// --- 6. EVENT HANDLERS ---
// =================================================================================

ui.adeptChoices.forEach(choice => {
    choice.addEventListener('click', () => {
        ui.adeptChoices.forEach(c => c.classList.remove('selected'));
        choice.classList.add('selected');
        selectedAdept = choice.dataset.adept;
        ui.startGameBtn.disabled = false;
    });
});
ui.startGameBtn.addEventListener('click', initializeGame);
ui.playAgainBtn.addEventListener('click', () => {
    ui.gameUI.classList.add('hidden');
    ui.startScreen.classList.remove('hidden');
});
ui.endTurnBtn.addEventListener('click', endTurn);

function handleHandCardClick(card) {
    if (selectedCardInHand && selectedCardInHand.uuid === card.uuid) {
        selectedCardInHand = null; // Deselect
    } else {
        selectedCardInHand = card;
        selectedCardOnBoard = null;
    }
    renderHand(); // To update selection class
    renderBoard(); // To update valid placements
    updateInspector();
}

function handleCellClick(cellId) {
    const cardOnBoard = getCardAt(cellId);
    
    if (selectedCardInHand) {
        // Try to play card from hand
        tryPlayCard(selectedCardInHand, cellId);
    } else if (cardOnBoard) {
        // Select card on board
        if (selectedCardOnBoard && selectedCardOnBoard.uuid === cardOnBoard.uuid) {
            selectedCardOnBoard = null; // Deselect
        } else {
            selectedCardOnBoard = cardOnBoard;
        }
        updateInspector();
    } else {
        // Clicked an empty cell with nothing selected
        selectedCardOnBoard = null;
        selectedCardInHand = null;
        updateInspector();
    }
}

// =================================================================================
// --- 7. HELPER & UTILITY FUNCTIONS ---
// =================================================================================

function logMessage(message) {
    const li = document.createElement('li');
    li.textContent = message;
    ui.messageList.prepend(li);
    if (ui.messageList.children.length > 50) ui.messageList.lastChild.remove();
}

function drawCard() {
    if (gameState.deck.length === 0) {
        logMessage("Deck empty! Reshuffling discard pile.");
        gameState.deck = gameState.discardPile;
        gameState.discardPile = [];
        shuffle(gameState.deck);
        updateStability(-2);
    }
    const card = gameState.deck.pop();
    if (card) {
        gameState.hand.push(createCardInstance(card));
        logMessage(`Drew: ${card.name}`);
    }
}

function drawEvent() {
    gameState.currentEvent = eventDeck[Math.floor(Math.random() * eventDeck.length)];
    logMessage(`Event: ${gameState.currentEvent.name}`);
    if (gameState.currentEvent.onTurnStart) gameState.currentEvent.onTurnStart(gameState);
}

function updateSanity(amount) {
    if (amount < 0 && gameState.turnFlags.preventFirstSanityLoss) {
        logMessage("Sanity loss prevented by event!");
        gameState.turnFlags.preventFirstSanityLoss = false;
        return;
    }
    gameState.sanity = Math.min(10, gameState.sanity + amount);
    checkLossCondition();
}

function updateStability(amount) {
    const oldStability = gameState.stability;
    gameState.stability = Math.max(0, Math.min(10, gameState.stability + amount));
    if (oldStability < 3 && gameState.stability >= 3) logMessage("Milestone: Draw an extra card each turn!");
    if (oldStability < 6 && gameState.stability >= 6) logMessage("Milestone: Can now play in the Outer Zone!");
    if (oldStability < 9 && gameState.stability >= 9) logMessage("Milestone: Gain 1 Influence at turn start!");
}

function createCardInstance(cardDef, cellId = null) {
    return {
        ...cardDef,
        uuid: self.crypto.randomUUID(), // Unique ID for this specific instance
        cellId: cellId,
        activatedThisTurn: false,
        tokens: {}
    };
}

function removeCardFromBoard(cardId) {
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            if (gameState.board[r][c] && gameState.board[r][c].id === cardId) {
                const card = gameState.board[r][c];
                gameState.discardPile.push(card);
                gameState.board[r][c] = null;
                return;
            }
        }
    }
}

// --- Board Geometry & State Helpers ---
function getCoordsFromCellId(cellId) { return [parseInt(cellId[1]) - 1, parseInt(cellId[3]) - 1]; }
function getCellIdFromCoords(r, c) { return `r${r + 1}c${c + 1}`; }
function getCardAt(cellId) { const [r, c] = getCoordsFromCellId(cellId); return gameState.board[r][c]; }
function getAllCardsOnBoard() { return gameState.board.flat().filter(c => c !== null); }
function getCardsInZone(zoneName) {
    const dist = zoneName === 'Outer' ? 3 : zoneName === 'Mid' ? 2 : 1;
    return getAllCardsOnBoard().filter(c => getDistance(c.cellId) === dist);
}
function getDistance(cellId) {
    const [r, c] = getCoordsFromCellId(cellId);
    if (r === 2 && c === 2) return 0; // Origin
    if (r === 0 || r === 4 || c === 0 || c === 4) return 3; // Outer
    if (Math.abs(r - 2) + Math.abs(c - 2) === 1) return 1; // Inner
    return 2; // Mid
}
function getAdjacentCards(cellId) {
    const [r, c] = getCoordsFromCellId(cellId);
    const neighbors = [];
    [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([nr, nc]) => {
        if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5 && gameState.board[nr][nc]) {
            neighbors.push(gameState.board[nr][nc]);
        }
    });
    return neighbors;
}
function isValidPlacement(cellId) { return getAdjacentCards(cellId).length > 0; }
function hasResources(cost) {
    return (gameState.sanity > (cost.sanity || 0)) && // Must have more than the cost to survive
           (gameState.knowledge >= (cost.knowledge || 0)) &&
           (gameState.influence >= (cost.influence || 0));
}
function spendResources(cost) {
    if (cost.sanity) updateSanity(-cost.sanity);
    if (cost.knowledge) gameState.knowledge -= cost.knowledge;
    if (cost.influence) gameState.influence -= cost.influence;
}
function shuffle(array) { array.sort(() => Math.random() - 0.5); }
