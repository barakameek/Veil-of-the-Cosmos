// --- 1. Game State Variables ---
let gameState = {
    sanity: 10,
    knowledge: 0,
    influence: 0,
    stability: 0, // Stability Track (0-10)
    actionsRemaining: 2,
    turn: 1,
    deck: [],
    discardPile: [],
    playerHand: [],
    board: [], // 5x5 array, stores card objects or null
    activeGod: null,
    selectedCardInHand: null, // Stores the card object selected in hand
    selectedBoardCell: null, // Stores the cell ID 'rXcY' selected on board
    originCardPosition: 'r3c3', // Fixed center for a 5x5 grid (1-indexed)
    cardsPlayedThisTurn: [], // To track for God effects etc.
    cardsActivatedThisTurn: [], // To track for God effects etc.
};

// --- 2. Core Game Data (Cards & Gods) ---
// Define all card definitions here
const cardDefinitions = {
    // Origin Card
    'Ruined Temple': {
        id: 'Ruined Temple',
        name: 'Ruined Temple',
        type: 'Location',
        aspect: 'Order',
        flavor: 'A crumbling edifice, once a beacon of forgotten faith. Its presence stabilizes the mundane world.',
        effects: 'Origin. Activate: Gain 1 Influence. Cannot be removed.',
        onActivate: function() {
            gameState.influence++;
            logMessage('The Ruined Temple echoes with forgotten prayers, granting 1 Influence.');
            updateUI();
        },
        zone: 'Inner', // Categorized as Inner for consistency
        permanent: true // Cannot be destroyed
    },
    // Sample Minor Card (Glyph of Stability)
    'Glyph of Stability': {
        id: 'Glyph of Stability',
        name: 'Glyph of Stability',
        type: 'Artifact',
        aspect: 'Order',
        flavor: 'A fragile inscription against the encroaching chaos, offering a fleeting sense of peace.',
        effects: 'When played: +1 Stability (+1 additional if adjacent to Order). Reduces Sanity loss by 1 for adjacent Mid Zone cards (passive).',
        onPlay: function(cellId) {
            updateStability(1); // Base stability gain
            const adjacentCards = getAdjacentCardsData(cellId);
            const isAdjacentToOrder = adjacentCards.some(c => c && c.aspect === 'Order');
            if (isAdjacentToOrder) {
                updateStability(1);
                logMessage('Glyph of Stability resonates with an adjacent Order card, gaining an extra Stability.');
            }
            logMessage('Glyph of Stability hums, providing calm.');
        },
        // Passive effect handled in triggerMadnessCheck and playCard
        zone: 'Inner' // Primary intended zone
    },
    // Sample Outer Zone Card (Void's Edge)
    'Void\'s Edge': {
        id: 'Void\'s Edge',
        name: 'Void\'s Edge',
        type: 'Location',
        aspect: 'Void',
        flavor: 'Where stars scream and reality frays at the touch of the unknown. The veil thins here.',
        effects: 'Play Cost: 2 Influence. When played: Gain 3 Knowledge. Triggers Madness Check. Adjacent Void: Draw 1 Revelation Card.',
        onPlay: function(cellId) {
            if (gameState.influence < 2) {
                logMessage('Not enough Influence to play Void\'s Edge (needs 2).');
                return false; // Indicate failure to play
            }
            gameState.influence -= 2;
            gameState.knowledge += 3;
            logMessage('Void\'s Edge opens, granting 3 Knowledge.');

            const adjacentCards = getAdjacentCardsData(cellId);
            const isAdjacentToVoid = adjacentCards.some(c => c && c.aspect === 'Void');
            if (isAdjacentToVoid) {
                // In a full game, this would draw from a Revelation Deck.
                // For this demo, we'll just give a small bonus or message.
                logMessage('The Void\'s Edge deepens with an adjacent Void card, revealing a Revelation!');
                gameState.knowledge += 1; // Small demo bonus for Revelation
            }
            return true; // Indicate success
        },
        zone: 'Outer' // Primary intended zone
    },
    // Another sample card (Crimson Spire)
    'Crimson Spire': {
        id: 'Crimson Spire',
        name: 'Crimson Spire',
        type: 'Location',
        aspect: 'Chaos',
        flavor: 'A jagged monument bleeding chaotic energies into the sky, unstable and alluring.',
        effects: 'Mid Zone (Play): Gain 2 Knowledge. Outer Zone (Play): Lose 1 Sanity, gain 4 Knowledge. Adjacent Chaos (Play): Lose 1 Sanity, gain 2 Knowledge.',
        onPlay: function(cellId) {
            const distance = getDistance(cellId);
            if (distance === 2) { // Mid Zone
                gameState.knowledge += 2;
                logMessage('Crimson Spire pulsates in the Mid Zone, granting 2 Knowledge.');
            } else if (distance === 3) { // Outer Zone
                gameState.sanity -= 1;
                gameState.knowledge += 4;
                logMessage('Crimson Spire rips through the Outer Zone, granting 4 Knowledge but draining 1 Sanity.');
            }
            const adjacentCards = getAdjacentCardsData(cellId);
            const isAdjacentToChaos = adjacentCards.some(c => c && c.aspect === 'Chaos');
            if (isAdjacentToChaos) {
                gameState.sanity -= 1;
                gameState.knowledge += 2;
                logMessage('Crimson Spire amplifies chaotic energies with an adjacent Chaos card, losing 1 Sanity but gaining 2 Knowledge.');
            }
        },
        zone: 'Mid' // Primary intended zone
    },
    // Sample Entity (Faceless Wanderer)
    'Faceless Wanderer': {
        id: 'Faceless Wanderer',
        name: 'Faceless Wanderer',
        type: 'Entity',
        aspect: 'Void',
        flavor: 'An empty cloak drifting through impossible spaces, seeking something nameless or an answer to unasked questions.',
        effects: 'Activate: Gain 2 Knowledge. Outer Zone (Activate): Gain 1 Knowledge and Draw 1 Revelation Card. Adjacent Life (Activate): Gain 1 Influence instead of Revelation.',
        onActivate: function(cellId) {
            const distance = getDistance(cellId);
            if (distance === 1 || distance === 2) { // Inner or Mid Zone (default activation)
                gameState.knowledge += 2;
                logMessage('The Faceless Wanderer reveals forgotten truths, granting 2 Knowledge.');
            } else if (distance === 3) { // Outer Zone activation
                const adjacentCards = getAdjacentCardsData(cellId);
                const isAdjacentToLife = adjacentCards.some(c => c && c.aspect === 'Life');
                if (isAdjacentToLife) {
                    gameState.influence += 1;
                    logMessage('The Faceless Wanderer connects with Life energies, granting 1 Influence.');
                } else {
                    gameState.knowledge += 1;
                    // In a full game, this would draw from a Revelation Deck.
                    logMessage('The Faceless Wanderer peers into the abyss, gaining 1 Knowledge and revealing a Revelation!');
                }
            }
        },
        zone: 'Mid' // Primary intended zone
    },
    // Another minor card for variety
    'Ancient Spring': {
        id: 'Ancient Spring',
        name: 'Ancient Spring',
        type: 'Location',
        aspect: 'Life',
        flavor: 'Waters of clarity flow from cracks in reality, soothing the mind.',
        effects: 'Inner/Mid Zone: Activate to gain 1 Sanity (max 10).',
        onActivate: function() {
            if (gameState.sanity < 10) {
                gameState.sanity = Math.min(10, gameState.sanity + 1);
                logMessage('The Ancient Spring soothes your mind, gaining 1 Sanity.');
                updateUI();
            } else {
                logMessage('Sanity already full.');
            }
        },
        zone: 'Inner'
    },
    'Orb of Foresight': {
        id: 'Orb of Foresight',
        name: 'Orb of Foresight',
        type: 'Artifact',
        aspect: 'Void',
        flavor: 'Peering into the future often costs a piece of the present.',
        effects: 'Mid/Outer Zone (Play): Lose 1 Sanity. Draw 2 cards.',
        onPlay: function(cellId) {
            const distance = getDistance(cellId);
            if (distance === 2 || distance === 3) {
                gameState.sanity -= 1;
                drawCard();
                drawCard();
                logMessage('The Orb of Foresight offers glimpses, costing 1 Sanity but granting 2 new cards.');
            }
        },
        zone: 'Mid'
    }
};

// Define Cosmic Gods
const cosmicGods = {
    'The Devourer': {
        name: 'The Devourer',
        effectDescription: 'At turn end: Places a Devoured token on an Outer Zone card (if any). If a card has 2+ Devoured tokens, destroy it and lose 2 Sanity. (No Outer Zone cards: places on a random Mid Zone card instead).',
        applyInfluence: function() {
            logMessage(`The Devourer stirs...`);
            let targetCellId = null;
            const outerZoneCells = getCellsInZone('Outer').filter(id => getCardAt(id));
            const midZoneCells = getCellsInZone('Mid').filter(id => getCardAt(id));

            if (outerZoneCells.length > 0) {
                targetCellId = outerZoneCells[Math.floor(Math.random() * outerZoneCells.length)];
            } else if (midZoneCells.length > 0) {
                targetCellId = midZoneCells[Math.floor(Math.random() * midZoneCells.length)];
                logMessage('No Outer Zone cards to devour, targeting Mid Zone instead.');
            }

            if (targetCellId) {
                const [r, c] = getCoordsFromCellId(targetCellId);
                const targetCard = gameState.board[r][c];

                if (targetCard && !targetCard.permanent) { // Check if card can be destroyed
                    targetCard.devouredTokens = (targetCard.devouredTokens || 0) + 1;
                    logMessage(`${targetCard.name} at ${targetCellId} gains a Devoured token (Total: ${targetCard.devouredTokens}).`);
                    if (targetCard.devouredTokens >= 2) {
                        logMessage(`${targetCard.name} at ${targetCellId} is devoured by The Devourer!`);
                        removeCardFromBoard(targetCard.id); // Assuming ID is unique enough
                        gameState.sanity -= 2;
                        logMessage('You lose 2 Sanity from the Devourer\'s wrath.');
                    }
                } else if (targetCard && targetCard.permanent) {
                    logMessage(`${targetCard.name} is permanent and cannot be devoured.`);
                }
            } else {
                logMessage('The Devourer finds no cards to consume... for now.');
            }
        }
    },
    'The Silent Watcher': {
        name: 'The Silent Watcher',
        effectDescription: 'At turn end: If you played a Void card this turn, lose 1 Stability unless you spend 2 Influence. If you played an Order card this turn, gain 1 Sanity.',
        applyInfluence: function() {
            logMessage(`The Silent Watcher observes...`);
            const playedVoidCard = gameState.cardsPlayedThisTurn.some(card => card.aspect === 'Void');
            const playedOrderCard = gameState.cardsPlayedThisTurn.some(card => card.aspect === 'Order');

            if (playedVoidCard) {
                if (gameState.influence >= 2) {
                    logMessage('The Silent Watcher demands Influence for your Void actions. 2 Influence spent.');
                    gameState.influence -= 2;
                } else {
                    updateStability(-1);
                    logMessage('Not enough Influence to appease The Silent Watcher after Void actions. Lose 1 Stability.');
                }
            }

            if (playedOrderCard) {
                gameState.sanity = Math.min(10, gameState.sanity + 1);
                logMessage('The Silent Watcher acknowledges your Order. Gain 1 Sanity.');
            }

            if (!playedVoidCard && !playedOrderCard) {
                logMessage('The Silent Watcher finds nothing noteworthy this turn.');
            }
        }
    }
};

// --- 3. UI Elements and Event Listeners ---
const sanityValueSpan = document.getElementById('sanity-value');
const knowledgeValueSpan = document.getElementById('knowledge-value');
const influenceValueSpan = document.getElementById('influence-value');
const stabilityValueSpan = document.getElementById('stability-value');
const godNameSpan = document.getElementById('god-name');
const godEffectP = document.getElementById('god-effect');
const gameBoardDiv = document.getElementById('game-board');
const playerHandDiv = document.getElementById('hand-cards');
const playCardBtn = document.getElementById('play-card-btn');
const activateCardBtn = document.getElementById('activate-card-btn');
const manageResourcesBtn = document.getElementById('manage-resources-btn');
const endTurnBtn = document.getElementById('end-turn-btn');
const messageList = document.getElementById('message-list');

// Modal Elements
const resourceModal = document.getElementById('resource-modal');
const closeModalBtns = document.querySelectorAll('.close-modal-btn');
const spendKnowledgeSanityBtn = document.getElementById('spend-knowledge-sanity-btn');
const spendInfluenceSanityBtn = document.getElementById('spend-influence-sanity-btn');
const spendKnowledgeStabilityBtn = document.getElementById('spend-knowledge-stability-btn');
const spendInfluenceStabilityBtn = document.getElementById('spend-influence-stability-btn');


// Event Listeners
playCardBtn.addEventListener('click', handlePlayCard);
activateCardBtn.addEventListener('click', handleActivateCard);
manageResourcesBtn.addEventListener('click', () => {
    if (gameState.actionsRemaining > 0) {
        resourceModal.style.display = 'flex'; // Show modal
        updateResourceModalButtons();
    } else {
        logMessage('No actions remaining to manage resources.');
    }
});
endTurnBtn.addEventListener('click', endTurn);

closeModalBtns.forEach(btn => {
    btn.addEventListener('click', () => resourceModal.style.display = 'none');
});

spendKnowledgeSanityBtn.addEventListener('click', () => {
    if (gameState.knowledge >= 2 && gameState.sanity < 10 && gameState.actionsRemaining > 0) {
        gameState.knowledge -= 2;
        gameState.sanity = Math.min(10, gameState.sanity + 1);
        gameState.actionsRemaining--;
        logMessage('Spent 2 Knowledge for 1 Sanity.');
        updateUI();
        resourceModal.style.display = 'none';
    } else {
        logMessage('Cannot spend Knowledge for Sanity: Insufficient Knowledge, Sanity full, or no actions left.');
    }
});
spendInfluenceSanityBtn.addEventListener('click', () => {
    if (gameState.influence >= 2 && gameState.sanity < 10 && gameState.actionsRemaining > 0) {
        gameState.influence -= 2;
        gameState.sanity = Math.min(10, gameState.sanity + 1);
        gameState.actionsRemaining--;
        logMessage('Spent 2 Influence for 1 Sanity.');
        updateUI();
        resourceModal.style.display = 'none';
    } else {
        logMessage('Cannot spend Influence for Sanity: Insufficient Influence, Sanity full, or no actions left.');
    }
});
spendKnowledgeStabilityBtn.addEventListener('click', () => {
    if (gameState.knowledge >= 2 && gameState.stability < 10 && gameState.actionsRemaining > 0) {
        gameState.knowledge -= 2;
        updateStability(1); // Call updateStability to handle logging and milestones
        gameState.actionsRemaining--;
        logMessage('Spent 2 Knowledge for 1 Stability.');
        updateUI();
        resourceModal.style.display = 'none';
    } else {
        logMessage('Cannot spend Knowledge for Stability: Insufficient Knowledge, Stability full, or no actions left.');
    }
});
spendInfluenceStabilityBtn.addEventListener('click', () => {
    if (gameState.influence >= 2 && gameState.stability < 10 && gameState.actionsRemaining > 0) {
        gameState.influence -= 2;
        updateStability(1); // Call updateStability to handle logging and milestones
        gameState.actionsRemaining--;
        logMessage('Spent 2 Influence for 1 Stability.');
        updateUI();
        resourceModal.style.display = 'none';
    } else {
        logMessage('Cannot spend Influence for Stability: Insufficient Influence, Stability full, or no actions left.');
    }
});


// --- 4. Game Logic Functions ---

/**
 * Initializes the game state, board, deck, and hand.
 */
function initializeGame() {
    // Reset game state
    gameState.sanity = 10;
    gameState.knowledge = 0;
    gameState.influence = 0;
    gameState.stability = 0;
    gameState.actionsRemaining = 2;
    gameState.turn = 1;
    gameState.deck = [];
    gameState.discardPile = [];
    gameState.playerHand = [];
    gameState.board = Array(5).fill(null).map(() => Array(5).fill(null)); // 5x5 grid of nulls
    gameState.selectedCardInHand = null;
    gameState.selectedBoardCell = null;
    gameState.cardsPlayedThisTurn = [];
    gameState.cardsActivatedThisTurn = [];

    // Clear message log
    messageList.innerHTML = '<li>Welcome to Veil of the Cosmos!</li>';

    // Create deck (add more variety as you add more cards)
    // For demo, making sure there are enough cards to play for a few turns.
    const standardCards = ['Glyph of Stability', 'Crimson Spire', 'Faceless Wanderer', 'Ancient Spring', 'Orb of Foresight'];
    for (let i = 0; i < 4; i++) { // Add duplicates to make deck larger
        standardCards.forEach(cardName => gameState.deck.push(cardDefinitions[cardName]));
    }
    // Add some Void's Edge, but keep it a bit rarer
    for (let i = 0; i < 2; i++) {
         gameState.deck.push(cardDefinitions['Void\'s Edge']);
    }

    shuffleDeck(gameState.deck);

    // Place Origin Card
    const originRow = 2; // (3,3) in 0-indexed is (2,2)
    const originCol = 2;
    gameState.board[originRow][originCol] = { ...cardDefinitions['Ruined Temple'], boardPosition: gameState.originCardPosition }; // Store card with its board position
    // No need to set originCardPosition here, it's a fixed constant in gameState

    // Draw starting hand
    for (let i = 0; i < 5; i++) {
        drawCard();
    }

    // Select Cosmic God
    gameState.activeGod = getRandomGod();
    godNameSpan.textContent = gameState.activeGod.name;
    godEffectP.textContent = gameState.activeGod.effectDescription;
    logMessage(`The cosmic currents shift. ${gameState.activeGod.name} awakens!`);

    renderBoard();
    updateUI();
    logMessage('Game Started! Turn 1. Build your foundation!');
}

/**
 * Shuffles an array in place (Fisher-Yates).
 * @param {Array} array
 */
function shuffleDeck(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

/**
 * Draws a card from the deck. If deck is empty, shuffles discard pile.
 */
function drawCard() {
    if (gameState.deck.length === 0) {
        if (gameState.discardPile.length === 0) {
            logMessage('Deck and discard pile are empty! No more cards to draw.');
            return;
        }
        gameState.deck = [...gameState.discardPile]; // Create a new array to avoid reference issues
        gameState.discardPile = [];
        shuffleDeck(gameState.deck);
        updateStability(-2); // Penalty for deck cycling
        logMessage('Deck reshuffled from discard pile. Lost 2 Stability.');
    }
    const card = gameState.deck.pop();
    if (card) {
        gameState.playerHand.push(card);
        logMessage(`Drew: ${card.name}`);
    }
}

/**
 * Renders the game board based on the gameState.board array.
 */
function renderBoard() {
    gameBoardDiv.innerHTML = ''; // Clear existing board
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            const cellId = `r${r+1}c${c+1}`; // 1-indexed for display
            const cellDiv = document.createElement('div');
            cellDiv.classList.add('board-cell');
            cellDiv.dataset.cellId = cellId;

            if (cellId === gameState.originCardPosition) {
                cellDiv.classList.add('origin');
            }

            const cardOnBoard = gameState.board[r][c];
            if (cardOnBoard) {
                const cardElement = createCardElement(cardOnBoard);
                // Adjust card display for board cells to fit the smaller size
                cardElement.classList.add('board-card-visible');
                // For cards on board, hide flavor and effects to prevent clutter
                cardElement.querySelector('.card-flavor').style.display = 'none';
                cardElement.querySelector('.card-effects').style.display = 'none';
                // Show type/aspect for visual identity on board
                if (cardElement.querySelector('.card-type-aspect')) {
                    cardElement.querySelector('.card-type-aspect').style.display = 'block';
                    cardElement.querySelector('.card-type-aspect').style.fontSize = '0.7em'; // Smaller font
                }

                cellDiv.appendChild(cardElement);
                cellDiv.classList.add('occupied');
                
                // Add selected class if this cell is selected
                if (gameState.selectedBoardCell === cellId) {
                    cellDiv.classList.add('selected');
                }
            } else {
                // Add selected class if this empty cell is selected
                if (gameState.selectedBoardCell === cellId) {
                    cellDiv.classList.add('selected');
                }
            }


            // Add click listener for placing/activating cards
            cellDiv.addEventListener('click', () => handleBoardCellClick(cellDiv));

            gameBoardDiv.appendChild(cellDiv);
        }
    }
    highlightValidPlacements(); // Re-highlight valid placements after re-rendering
}

/**
 * Creates a card HTML element from card data.
 * @param {Object} cardData - The card definition object.
 * @returns {HTMLElement} The created card div.
 */
function createCardElement(cardData) {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('card', cardData.aspect.toLowerCase()); // Add aspect class for styling
    cardDiv.dataset.cardId = cardData.id;

    const title = document.createElement('div');
    title.classList.add('card-title');
    title.textContent = cardData.name;
    cardDiv.appendChild(title);

    const typeAspect = document.createElement('div');
    typeAspect.classList.add('card-type-aspect');
    typeAspect.textContent = `${cardData.type} (${cardData.aspect})`;
    cardDiv.appendChild(typeAspect);

    const flavor = document.createElement('div');
    flavor.classList.add('card-flavor');
    flavor.textContent = cardData.flavor;
    cardDiv.appendChild(flavor);

    const effects = document.createElement('div');
    effects.classList.add('card-effects');
    effects.textContent = cardData.effects;
    cardDiv.appendChild(effects);

    return cardDiv;
}

/**
 * Updates the UI with current game state values and renders hand.
 */
function updateUI() {
    sanityValueSpan.textContent = gameState.sanity;
    knowledgeValueSpan.textContent = gameState.knowledge;
    influenceValueSpan.textContent = gameState.influence;
    stabilityValueSpan.textContent = gameState.stability;

    renderPlayerHand();
    updateActionButtons();
    checkLossCondition();
}

/**
 * Renders the player's hand.
 */
function renderPlayerHand() {
    playerHandDiv.innerHTML = ''; // Clear hand
    gameState.playerHand.forEach(card => {
        const cardElement = createCardElement(card);
        cardElement.addEventListener('click', () => handleCardSelection(cardElement));
        if (gameState.selectedCardInHand && gameState.selectedCardInHand.id === card.id) {
            cardElement.classList.add('selected-in-hand');
        }
        playerHandDiv.appendChild(cardElement);
    });
}

/**
 * Updates the state of action buttons based on actions remaining and selections.
 */
function updateActionButtons() {
    const hasSelectedCardInHand = gameState.selectedCardInHand !== null;
    const hasSelectedCell = gameState.selectedBoardCell !== null;
    const [selectedCellRow, selectedCellCol] = hasSelectedCell ? getCoordsFromCellId(gameState.selectedBoardCell) : [null, null];
    const cardInSelectedCell = (selectedCellRow !== null && selectedCellCol !== null) ? gameState.board[selectedCellRow][selectedCellCol] : null;

    playCardBtn.disabled = !(hasSelectedCardInHand && hasSelectedCell && gameState.actionsRemaining > 0 && !cardInSelectedCell && isValidPlacement(gameState.selectedBoardCell));
    activateCardBtn.disabled = !(hasSelectedCell && cardInSelectedCell && !cardInSelectedCell.activatedThisTurn && cardInSelectedCell.onActivate && gameState.actionsRemaining > 0);
    manageResourcesBtn.disabled = gameState.actionsRemaining === 0;
    endTurnBtn.disabled = gameState.actionsRemaining === 2; // Only enable after at least one action is taken, or if player explicitly wants to end early.
}

/**
 * Logs a message to the game log.
 * @param {string} message
 */
function logMessage(message) {
    const li = document.createElement('li');
    li.textContent = `Turn ${gameState.turn}: ${message}`;
    messageList.prepend(li); // Add to the top
    // Keep log from getting too long
    if (messageList.children.length > 20) {
        messageList.lastChild.remove();
    }
}

/**
 * Handles selection of a card in the player's hand.
 * @param {HTMLElement} cardElement - The HTML element of the clicked card.
 */
function handleCardSelection(cardElement) {
    const cardId = cardElement.dataset.cardId;
    const cardData = cardDefinitions[cardId];

    // Deselect if already selected
    if (gameState.selectedCardInHand && gameState.selectedCardInHand.id === cardId) {
        gameState.selectedCardInHand = null;
        logMessage('Card deselected.');
    } else {
        // Deselect any previously selected card in hand
        const previouslySelected = document.querySelector('.card.selected-in-hand');
        if (previouslySelected) {
            previouslySelected.classList.remove('selected-in-hand');
        }
        gameState.selectedCardInHand = cardData;
        logMessage(`Selected card: ${cardData.name}`);
    }
    // Always re-render hand to update selected class and highlight valid placements
    renderPlayerHand();
    highlightValidPlacements();
    updateActionButtons();
}

/**
 * Highlights cells where the selected card can be played.
 */
function highlightValidPlacements() {
    // Clear previous highlights
    document.querySelectorAll('.board-cell.valid-placement').forEach(cell => {
        cell.classList.remove('valid-placement');
    });

    if (!gameState.selectedCardInHand) return;

    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            const cellId = `r${r+1}c${c+1}`;
            if (isValidPlacement(cellId)) {
                document.querySelector(`[data-cell-id="${cellId}"]`).classList.add('valid-placement');
            }
        }
    }
}

/**
 * Handles clicks on board cells.
 * @param {HTMLElement} cellElement - The HTML element of the clicked cell.
 */
function handleBoardCellClick(cellElement) {
    const cellId = cellElement.dataset.cellId;

    // Deselect if already selected
    if (gameState.selectedBoardCell === cellId) {
        gameState.selectedBoardCell = null;
        logMessage('Board cell deselected.');
    } else {
        // Deselect any previously selected cell
        const previouslySelected = document.querySelector('.board-cell.selected');
        if (previouslySelected) {
            previouslySelected.classList.remove('selected');
        }
        gameState.selectedBoardCell = cellId;
        logMessage(`Selected board cell: ${cellId}`);
    }
    renderBoard(); // Re-render to update selected class
    updateActionButtons();
}

/**
 * Handles the "Play Card" action.
 */
function handlePlayCard() {
    if (!gameState.selectedCardInHand || !gameState.selectedBoardCell || gameState.actionsRemaining === 0) {
        logMessage('Error: Select a card and a valid board cell, and have actions remaining.');
        return;
    }

    const cardToPlay = gameState.selectedCardInHand;
    const targetCellId = gameState.selectedBoardCell;

    if (!isValidPlacement(targetCellId)) {
        logMessage('Cannot play card there. Must be adjacent to an existing card or origin.');
        return;
    }

    const [row, col] = getCoordsFromCellId(targetCellId);
    if (gameState.board[row][col] !== null) {
        logMessage('Cell is already occupied.');
        return;
    }

    const distance = getDistance(targetCellId);
    let sanityCost = 0;
    let placementAllowed = true;
    let cardPlayedSuccessfully = false;

    if (distance === 0) { // Origin is a special case, should only hold Ruined Temple
        logMessage('Cannot play cards on the Origin cell.');
        placementAllowed = false;
    } else if (distance === 1) { // Inner Zone
        sanityCost = 0;
        logMessage(`Attempting to play ${cardToPlay.name} in Inner Zone. Cost: ${sanityCost} Sanity.`);
    } else if (distance === 2) { // Mid Zone
        sanityCost = 1;
        logMessage(`Attempting to play ${cardToPlay.name} in Mid Zone. Cost: ${sanityCost} Sanity.`);
    } else if (distance === 3) { // Outer Zone
        sanityCost = 3;
        if (gameState.stability < 6) {
            logMessage(`Cannot play ${cardToPlay.name} in Outer Zone. Stability must be 6+ (Current: ${gameState.stability}).`);
            placementAllowed = false;
        } else {
            logMessage(`Attempting to play ${cardToPlay.name} in Outer Zone. Cost: ${sanityCost} Sanity. Stability 6+ met.`);
        }
    } else {
        logMessage('Invalid placement zone detected.'); // Should not happen with current getDistance logic
        placementAllowed = false;
    }

    if (placementAllowed && gameState.sanity >= sanityCost) {
        // Temporarily deduct sanity to check if onPlay effects might fail or refund
        gameState.sanity -= sanityCost;

        // Apply onPlay effects defined on the card
        if (cardToPlay.onPlay) {
            const success = cardToPlay.onPlay(targetCellId);
            if (success === false) { // Card's onPlay can return false to cancel placement
                logMessage(`${cardToPlay.name} failed its onPlay effect, placement aborted.`);
                gameState.sanity += sanityCost; // Refund cost
                return;
            }
        }

        // Place card on board
        const cardIndexInHand = gameState.playerHand.findIndex(c => c.id === cardToPlay.id);
        if (cardIndexInHand > -1) {
            gameState.playerHand.splice(cardIndexInHand, 1);
            // Create a *copy* of the card definition for the board, so we can add board-specific properties
            gameState.board[row][col] = { ...cardToPlay, boardPosition: targetCellId };
            gameState.cardsPlayedThisTurn.push(cardToPlay); // Track for God effects
            cardPlayedSuccessfully = true;
            logMessage(`${cardToPlay.name} placed at ${targetCellId}.`);
        }

        if (distance === 3 && cardPlayedSuccessfully) { // Outer Zone Madness Check
            triggerMadnessCheck(targetCellId);
            checkWinCondition(); // Check for win after Madness Check
        }

        // Apply Stability gain for playing Order/Life cards
        if (cardToPlay.aspect === 'Order' || cardToPlay.aspect === 'Life') {
            updateStability(1); // Base stability gain
            const adjacentCards = getAdjacentCardsData(targetCellId);
            const isAdjacentToMatchingAspect = adjacentCards.some(c => c && c.aspect === cardToPlay.aspect);
            if (isAdjacentToMatchingAspect) {
                updateStability(1);
                logMessage(`${cardToPlay.name} resonated with adjacent ${cardToPlay.aspect} card, gaining extra Stability.`);
            }
        }

        gameState.actionsRemaining--;
        gameState.selectedCardInHand = null;
        gameState.selectedBoardCell = null;
        renderBoard(); // Re-render board to show new card
        updateUI();
        highlightValidPlacements(); // Clear highlights
    } else {
        logMessage('Not enough Sanity or placement conditions not met.');
    }
}


/**
 * Handles the "Activate Card" action.
 */
function handleActivateCard() {
    if (!gameState.selectedBoardCell || gameState.actionsRemaining === 0) {
        logMessage('Error: Select a card on the board to activate, and have actions remaining.');
        return;
    }

    const [row, col] = getCoordsFromCellId(gameState.selectedBoardCell);
    const cardToActivate = gameState.board[row][col];

    if (!cardToActivate) {
        logMessage('No card at selected board cell to activate.');
        return;
    }

    if (cardToActivate.activatedThisTurn) {
        logMessage(`${cardToActivate.name} has already been activated this turn.`);
        return;
    }

    if (cardToActivate.onActivate) {
        // Execute the card's activation function
        cardToActivate.onActivate(gameState.selectedBoardCell);
        cardToActivate.activatedThisTurn = true; // Mark as activated for current turn
        gameState.cardsActivatedThisTurn.push(cardToActivate); // Track for God effects
        gameState.actionsRemaining--;
        logMessage(`Activated ${cardToActivate.name}.`);
    } else {
        logMessage(`${cardToActivate.name} has no activation effect.`);
    }

    gameState.selectedBoardCell = null; // Deselect after activation
    renderBoard(); // Re-render to clear selection, or update UI
    updateUI();
}

/**
 * Handles the end of a player's turn.
 */
function endTurn() {
    logMessage('--- End of Turn ' + gameState.turn + ' ---');

    // Reset activated status for all cards on board
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            if (gameState.board[r][c]) {
                gameState.board[r][c].activatedThisTurn = false;
            }
        }
    }
    gameState.cardsPlayedThisTurn = []; // Reset for next turn's God effects
    gameState.cardsActivatedThisTurn = []; // Reset for next turn's God effects

    applyGodInfluence(); // Cosmic God's effect

    // Draw Phase for next turn
    logMessage('Drawing card...');
    drawCard();
    // Check Stability Milestones for extra draws if applicable (not fully implemented, just log)
    if (gameState.stability >= 3) {
        // Draw 1 extra card due to Stability 3 milestone (demo implementation)
        drawCard();
        logMessage('Stability 3 milestone: Drew an extra card!');
    }
    // Check Stability Milestones for Influence if applicable (not fully implemented, just log)
    if (gameState.stability >= 9) {
        gameState.influence++;
        logMessage('Stability 9 milestone: Gained 1 Influence!');
    }


    // Reset actions and increment turn
    gameState.actionsRemaining = 2;
    gameState.turn++;

    gameState.selectedCardInHand = null;
    gameState.selectedBoardCell = null;
    highlightValidPlacements(); // Clear highlights
    renderBoard(); // Ensure board is updated after god influence
    updateUI();
    logMessage(`--- Turn ${gameState.turn} begins ---`);
}


/**
 * Applies the active Cosmic God's influence.
 */
function applyGodInfluence() {
    if (gameState.activeGod && gameState.activeGod.applyInfluence) {
        gameState.activeGod.applyInfluence();
    }
}

/**
 * Handles the Madness Check for Outer Zone placement.
 * @param {string} cellId - The ID of the cell where the card was played.
 */
function triggerMadnessCheck(cellId) {
    const roll = Math.floor(Math.random() * 6) + 1; // 1d6
    let sanityLoss = 0;

    if (roll >= 1 && roll <= 2) {
        sanityLoss = 3;
        logMessage(`Madness Check (Rolled ${roll}): Severe drain!`);
    } else if (roll >= 3 && roll <= 4) {
        sanityLoss = 2;
        logMessage(`Madness Check (Rolled ${roll}): Significant drain.`);
    } else { // 5-6
        sanityLoss = 1;
        logMessage(`Madness Check (Rolled ${roll}): Minor drain.`);
    }

    // Apply modifier from Order/Life cards in Inner/Mid Zones
    const orderLifeSupportCount = gameState.board.flat().filter(card =>
        card && (card.aspect === 'Order' || card.aspect === 'Life') && (getDistance(card.boardPosition) === 1 || getDistance(card.boardPosition) === 2)
    ).length;
    
    const reducedSanityLoss = Math.max(0, sanityLoss - orderLifeSupportCount);
    gameState.sanity -= reducedSanityLoss;
    logMessage(`You lose ${reducedSanityLoss} Sanity from the Madness Check (reduced by ${orderLifeSupportCount} support). Current Sanity: ${gameState.sanity}.`);
}


/**
 * Updates the Stability Track.
 * @param {number} amount - Amount to add or subtract from Stability.
 */
function updateStability(amount) {
    const oldStability = gameState.stability;
    gameState.stability = Math.max(0, Math.min(10, gameState.stability + amount));
    logMessage(`Stability changed by ${amount}. New Stability: ${gameState.stability}.`);

    // Check for Stability milestones (these effects are mostly logged for demo)
    if (oldStability < 3 && gameState.stability >= 3) {
        logMessage('Stability Milestone Reached (3): You feel more prepared!');
    }
    if (oldStability < 6 && gameState.stability >= 6) {
        logMessage('Stability Milestone Reached (6): The Outer Zone is within reach!');
    }
    if (oldStability < 9 && gameState.stability >= 9) {
        logMessage('Stability Milestone Reached (9): You command greater presence!');
    }
}

/**
 * Checks for win condition.
 */
function checkWinCondition() {
    const outerZoneCells = getCellsInZone('Outer');
    const hasOuterZoneCard = outerZoneCells.some(id => getCardAt(id) !== null);

    if (hasOuterZoneCard && gameState.stability >= 6) {
        logMessage('A card has been placed in the Outer Zone with sufficient Stability (6+)!');
        logMessage('YOU WIN! You have confronted the cosmic horror and survived.');
        playCardBtn.disabled = true;
        activateCardBtn.disabled = true;
        manageResourcesBtn.disabled = true;
        endTurnBtn.disabled = true;
        // Optionally show a win modal or reset game option
    }
}

/**
 * Checks for loss condition.
 */
function checkLossCondition() {
    if (gameState.sanity <= 0) {
        gameState.sanity = 0; // Ensure it doesn't go negative in display
        updateUI();
        logMessage('Sanity reached 0. You are consumed by madness.');
        logMessage('GAME OVER!');
        playCardBtn.disabled = true;
        activateCardBtn.disabled = true;
        manageResourcesBtn.disabled = true;
        endTurnBtn.disabled = true;
        // Optionally show a loss modal or reset game option
    }
}

/**
 * Updates the state of the resource modal buttons based on current resources and actions.
 */
function updateResourceModalButtons() {
    spendKnowledgeSanityBtn.disabled = gameState.knowledge < 2 || gameState.sanity >= 10 || gameState.actionsRemaining === 0;
    spendInfluenceSanityBtn.disabled = gameState.influence < 2 || gameState.sanity >= 10 || gameState.actionsRemaining === 0;
    spendKnowledgeStabilityBtn.disabled = gameState.knowledge < 2 || gameState.stability >= 10 || gameState.actionsRemaining === 0;
    spendInfluenceStabilityBtn.disabled = gameState.influence < 2 || gameState.stability >= 10 || gameState.actionsRemaining === 0;
}

// --- Helper Functions ---

/**
 * Gets the distance from the origin (r3c3 / 0-indexed 2,2) for a given cell ID.
 * Based on the custom zone definition (Inner, Mid, Outer Perimeter).
 * @param {string} cellId - e.g., 'r1c1'
 * @returns {number} Distance: 0 (origin), 1 (inner), 2 (mid), 3 (outer perimeter)
 */
function getDistance(cellId) {
    const [row, col] = getCoordsFromCellId(cellId);
    const originRow = 2; // 0-indexed
    const originCol = 2;

    const isOrigin = (row === originRow && col === originCol);
    const isInnerZone = (Math.abs(row - originRow) + Math.abs(col - originCol) === 1); // Manhattan distance 1 from origin
    const isOuterPerimeter = (row === 0 || row === 4 || col === 0 || col === 4); // Any cell on the actual 5x5 border

    if (isOrigin) return 0; // The origin cell itself
    if (isOuterPerimeter) return 3; // The true outer edge
    if (isInnerZone) return 1; // Directly adjacent to origin
    
    // If not origin, not inner, and not outer perimeter, it must be mid-zone.
    // This catches cells like (1,1), (1,3), (3,1), (3,3) in 0-indexed terms.
    return 2;
}


/**
 * Converts cell ID (e.g., 'r1c1') to 0-indexed [row, col] coordinates.
 * @param {string} cellId
 * @returns {[number, number]} [row, col]
 */
function getCoordsFromCellId(cellId) {
    const r = parseInt(cellId.charAt(1)) - 1;
    const c = parseInt(cellId.charAt(3)) - 1;
    return [r, c];
}

/**
 * Converts 0-indexed [row, col] coordinates to cell ID (e.g., 'r1c1').
 * @param {number} row
 * @param {number} col
 * @returns {string} cellId
 */
function getCellIdFromCoords(row, col) {
    return `r${row+1}c${col+1}`;
}

/**
 * Checks if a cell is a valid placement for a card (adjacent to an existing card or is the origin itself).
 * @param {string} cellId - The ID of the cell to check.
 * @returns {boolean}
 */
function isValidPlacement(cellId) {
    const [r, c] = getCoordsFromCellId(cellId);

    // Cannot place if already occupied
    if (gameState.board[r][c] !== null) {
        return false;
    }

    // Check if origin is already placed (only place one card at origin on setup)
    if (cellId === gameState.originCardPosition) {
        // Allow placement on origin only if it's empty AND it's the specific origin card
        // This is handled in initializeGame for the Ruined Temple.
        // For other cards, you can't play on the occupied origin.
        return false;
    }

    // Check if adjacent to an existing card
    const adjacentCellsCoords = [
        [r - 1, c], // North
        [r + 1, c], // South
        [r, c - 1], // West
        [r, c + 1]  // East
    ];

    for (const [ar, ac] of adjacentCellsCoords) {
        if (ar >= 0 && ar < 5 && ac >= 0 && ac < 5) { // Check bounds
            if (gameState.board[ar][ac] !== null) {
                return true; // Found an adjacent occupied cell
            }
        }
    }
    return false; // No adjacent occupied cells
}

/**
 * Gets card data objects in adjacent cells.
 * @param {string} cellId
 * @returns {Array<Object>} Array of adjacent card objects (or null for empty cells).
 */
function getAdjacentCardsData(cellId) {
    const [r, c] = getCoordsFromCellId(cellId);
    const adjacentCards = [];
    const neighbors = [
        [r - 1, c], // North
        [r + 1, c], // South
        [r, c - 1], // West
        [r, c + 1]  // East
    ];

    for (const [nr, nc] of neighbors) {
        if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) {
            adjacentCards.push(gameState.board[nr][nc]);
        }
    }
    return adjacentCards;
}

/**
 * Gets a card object at a specific cell ID.
 * @param {string} cellId
 * @returns {Object|null} The card object or null if cell is empty.
 */
function getCardAt(cellId) {
    const [r, c] = getCoordsFromCellId(cellId);
    return gameState.board[r][c];
}

/**
 * Removes a card from the board (e.g., due to Devourer).
 * @param {string} cardIdToRemove - The ID of the card to remove.
 */
function removeCardFromBoard(cardIdToRemove) {
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            const card = gameState.board[r][c];
            if (card && card.id === cardIdToRemove) {
                if (!card.permanent) { // Check if the card is permanent (like Ruined Temple)
                    gameState.discardPile.push(card); // Move to discard
                    gameState.board[r][c] = null; // Clear from board
                    logMessage(`${card.name} was removed from the board and sent to the discard pile.`);
                    renderBoard(); // Update display
                    return;
                } else {
                    logMessage(`${card.name} is a permanent fixture and cannot be removed.`);
                }
            }
        }
    }
}


/**
 * Gets all cell IDs in a specific zone.
 * @param {'Inner'|'Mid'|'Outer'} zoneName
 * @returns {string[]} Array of cell IDs.
 */
function getCellsInZone(zoneName) {
    const cells = [];
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            const cellId = getCellIdFromCoords(r, c);
            const dist = getDistance(cellId);
            if (zoneName === 'Inner' && dist === 1) cells.push(cellId);
            if (zoneName === 'Mid' && dist === 2) cells.push(cellId);
            if (zoneName === 'Outer' && dist === 3) cells.push(cellId);
        }
    }
    return cells;
}


/**
 * Selects a random Cosmic God from the defined list.
 * @returns {Object} A random Cosmic God object.
 */
function getRandomGod() {
    const godKeys = Object.keys(cosmicGods);
    const randomKey = godKeys[Math.floor(Math.random() * godKeys.length)];
    return cosmicGods[randomKey];
}

// --- 5. Initial Setup and Call ---
// Initialize the game when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeGame);
