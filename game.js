document.addEventListener('DOMContentLoaded', () => {

    // --- 1. DATA: Cards and Game State ---

    // A database of all cards in the game. In a real game, this would be much larger.
    const cardDatabase = {
        'IND01': {
            id: 'IND01',
            name: 'Strip Mine',
            faction: 'Industry',
            cost: 2,
            description: 'Produces 3 Production. Negative Effect: -1 Defense to one adjacent location.',
            defense: 3,
            isBlighted: false,
            blightedName: 'Polluted Chasm',
            blightedDescription: 'Produces 1 Dread. All adjacent locations are at -1 Defense.',
            onPlay: (cell, state) => { 
                state.resources.production += 3; 
                logMessage('Gained 3 Production from Strip Mine.');
                // We'll handle the negative effect visually or in a more complex system later
            },
            onBlight: (state) => { state.resources.production -= 3; }
        },
        'CIV01': {
            id: 'CIV01',
            name: 'Walled Village',
            faction: 'Civilization',
            cost: 3,
            description: 'Produces 2 Faith. Has Guardian: can protect an adjacent location.',
            defense: 5,
            isBlighted: false,
            blightedName: 'Abandoned Hovel',
            blightedDescription: 'Produces 1 Dread. All adjacent locations are easier to corrupt.',
            onPlay: (cell, state) => { 
                state.resources.faith += 2; 
                logMessage('Gained 2 Faith from Walled Village.');
            },
            onBlight: (state) => { state.resources.faith -= 2; }
        },
        'NAT01': {
            id: 'NAT01',
            name: 'Sacred Grove',
            faction: 'Nature',
            cost: 2,
            description: 'Produces 1 Faith and 1 Insight.',
            defense: 4,
            isBlighted: false,
            blightedName: 'Weeping Woods',
            blightedDescription: 'Produces 1 Dread. Spreads Blight to adjacent Nature cards.',
            onPlay: (cell, state) => {
                state.resources.faith += 1;
                state.resources.insight += 1;
                logMessage('Gained 1 Faith and 1 Insight from Sacred Grove.');
            },
            onBlight: (state) => {
                state.resources.faith -= 1;
                state.resources.insight -= 1;
            }
        },
        'ARC01': {
            id: 'ARC01',
            name: 'Hedge Mage Tower',
            faction: 'Arcane',
            cost: 4,
            description: 'Produces 3 Insight. Risk: May advance Awakening Track.',
            defense: 2,
            isBlighted: false,
            blightedName: 'Tower of Madness',
            blightedDescription: 'Produces 2 Dread. Reveals top card of Despair deck.',
             onPlay: (cell, state) => {
                state.resources.insight += 3;
                logMessage('Gained 3 Insight. The arcane energies are unstable...');
                if (Math.random() < 0.33) { // 33% chance of backlash
                    logMessage('Backlash! The God stirs...', 'error');
                    state.awakening += 1;
                }
            },
            onBlight: (state) => { state.resources.insight -= 3; }
        }
    };

    // The main game state object
    const gameState = {
        phase: 'The Shaping',
        awakening: 0,
        dread: 0,
        resources: {
            aegis: 5,
            production: 5,
            insight: 2,
            faith: 1
        },
        playerHand: [],
        worldGrid: Array(20).fill(null), // 5x4 grid
        selectedCard: null,
        hasTakenTurnAction: false,
        turn: 1
    };

    // --- 2. DOM Element References ---
    const worldGridEl = document.getElementById('world-grid');
    const playerHandEl = document.getElementById('player-hand');
    const awakeningValueEl = document.getElementById('awakening-value');
    const gameLogEl = document.getElementById('game-log');
    const endTurnButton = document.getElementById('end-turn-button');
    const gatherButton = document.getElementById('gather-button');
    // Resource display elements
    const aegisEl = document.getElementById('aegis-value');
    const productionEl = document.getElementById('production-value');
    const insightEl = document.getElementById('insight-value');
    const faithEl = document.getElementById('faith-value');


    // --- 3. CORE FUNCTIONS: Update, Render, and Actions ---

    /**
     * Updates all visible UI elements to match the current gameState
     */
    function render() {
        // Update resource displays
        aegisEl.textContent = gameState.resources.aegis;
        productionEl.textContent = gameState.resources.production;
        insightEl.textContent = gameState.resources.insight;
        faithEl.textContent = gameState.resources.faith;

        // Update Awakening track
        awakeningValueEl.textContent = `${gameState.awakening} / 20`;
        if (gameState.awakening >= 10) {
            awakeningValueEl.style.color = 'orange';
        }
        if (gameState.awakening >= 15) {
            awakeningValueEl.style.color = 'var(--highlight-color)';
        }

        // Render player hand
        playerHandEl.innerHTML = '';
        gameState.playerHand.forEach((cardId, index) => {
            const cardData = cardDatabase[cardId];
            const cardEl = createCardElement(cardData);
            cardEl.dataset.handIndex = index;
            if (gameState.selectedCard && gameState.selectedCard.index === index) {
                cardEl.classList.add('selected');
            }
            playerHandEl.appendChild(cardEl);
        });
        
        // Render world grid
        worldGridEl.innerHTML = '';
        gameState.worldGrid.forEach((cardData, index) => {
            const cellEl = document.createElement('div');
            cellEl.classList.add('grid-cell');
            cellEl.dataset.cellIndex = index;
            if (cardData) {
                const cardEl = createCardElement(cardData, false); // false = not a hand card
                if (cardData.isBlighted) {
                    cardEl.classList.add('blighted');
                }
                cellEl.appendChild(cardEl);
            } else if (gameState.selectedCard) {
                cellEl.classList.add('valid-target'); // Highlight empty cells if a card is selected
            }
            worldGridEl.appendChild(cellEl);
        });
    }

    /**
     * Creates an HTML element for a card
     * @param {object} cardData - The card's data from the database
     * @returns {HTMLElement} - The generated card element
     */
    function createCardElement(cardData) {
        const cardEl = document.createElement('div');
        cardEl.classList.add('card');
        cardEl.id = `card-${cardData.id}`;

        const name = cardData.isBlighted ? cardData.blightedName : cardData.name;
        const description = cardData.isBlighted ? cardData.blightedDescription : cardData.description;
        const faction = cardData.isBlighted ? 'Void' : cardData.faction;

        cardEl.innerHTML = `
            <div class="card-header">
                <span class="card-name">${name}</span>
                <span class="card-faction faction-${faction}">${faction}</span>
            </div>
            <p class="card-description">${description}</p>
            <span class="card-cost">Cost: ${cardData.cost} Prod.</span>
            <span class="card-defense">Defense: ${cardData.defense}</span>
        `;
        return cardEl;
    }

    /**
     * Adds a message to the game log
     * @param {string} message - The text to log
     * @param {string} type - 'info' (default), 'error', or 'success' for styling
     */
    function logMessage(message, type = 'info') {
        const p = document.createElement('p');
        p.textContent = message;
        if (type === 'error') p.style.color = 'var(--highlight-color)';
        if (type === 'success') p.style.color = 'var(--faction-civilization)';
        gameLogEl.prepend(p);
    }
    
    /**
     * Draws a random card from the database into the player's hand
     */
    function drawCard() {
        const cardIds = Object.keys(cardDatabase);
        const randomId = cardIds[Math.floor(Math.random() * cardIds.length)];
        if (gameState.playerHand.length < 5) {
            gameState.playerHand.push(randomId);
        }
    }

    // --- 4. Event Handlers ---

    // Handle clicks on cards in hand
    playerHandEl.addEventListener('click', (e) => {
        const cardEl = e.target.closest('.card');
        if (!cardEl) return;

        const handIndex = parseInt(cardEl.dataset.handIndex);
        const cardId = gameState.playerHand[handIndex];
        const cardData = cardDatabase[cardId];

        if (gameState.selectedCard && gameState.selectedCard.index === handIndex) {
            gameState.selectedCard = null;
            logMessage('Card deselected.');
        } else {
            gameState.selectedCard = { index: handIndex, data: cardData };
            logMessage(`Selected ${cardData.name}. Click an empty grid cell to play.`);
        }
        render();
    });

    // Handle clicks on the world grid to play cards
    worldGridEl.addEventListener('click', (e) => {
        const cellEl = e.target.closest('.grid-cell');
        if (!cellEl) return;

        const cellIndex = parseInt(cellEl.dataset.cellIndex);

        if (gameState.hasTakenTurnAction) {
            logMessage('You have already taken your action for this turn.', 'error');
            return;
        }

        if (gameState.selectedCard && !gameState.worldGrid[cellIndex]) {
            const { index, data } = gameState.selectedCard;

            if (gameState.resources.production >= data.cost) {
                gameState.resources.production -= data.cost;
                logMessage(`Paid ${data.cost} Production.`);
                
                gameState.worldGrid[cellIndex] = { ...data };
                gameState.playerHand.splice(index, 1);
                
                data.onPlay(cellIndex, gameState);

                gameState.selectedCard = null;
                gameState.hasTakenTurnAction = true;
                gatherButton.disabled = true;
                
                logMessage(`Played ${data.name}. End your turn when ready.`, 'success');
                render();

            } else {
                logMessage(`Not enough Production! Need ${data.cost}.`, 'error');
            }
        }
    });
    
    // Handle the Gather Resources button
    gatherButton.addEventListener('click', () => {
        if (gameState.hasTakenTurnAction) {
            logMessage('You have already taken your action for this turn.', 'error');
            return;
        }
    
        const gainedProduction = 2;
        const gainedFaith = 1;
        gameState.resources.production += gainedProduction;
        gameState.resources.faith += gainedFaith;

        gameState.hasTakenTurnAction = true;
        gatherButton.disabled = true;

        logMessage(`You consolidate power, gaining ${gainedProduction} Production and ${gainedFaith} Faith. End your turn.`, 'success');
        render();
    });

    // Handle the End Turn button
    endTurnButton.addEventListener('click', () => {
        logMessage(`--- End of Turn ${gameState.turn} ---`);
        gameState.turn++;

        gameState.hasTakenTurnAction = false;
        gatherButton.disabled = false;

        gameState.awakening++;
        logMessage('The world groans... Awakening advances.');

        if (Math.random() < 0.20 && gameState.worldGrid.some(c => c)) {
            let attempts = 0;
            while(attempts < 20) {
                let randomIndex = Math.floor(Math.random() * 20);
                let cardToBlight = gameState.worldGrid[randomIndex];
                if (cardToBlight && !cardToBlight.isBlighted) {
                    cardToBlight.isBlighted = true;
                    cardToBlight.onBlight(gameState);
                    logMessage(`${cardToBlight.name} has been corrupted into ${cardToBlight.blightedName}!`, 'error');
                    break;
                }
                attempts++;
            }
        }

        drawCard();
        logMessage('You draw a new Location card.');

        if (gameState.awakening >= 20) {
            document.body.innerHTML = `<h1 style="color:var(--highlight-color); text-align:center; padding-top: 40vh; font-family: 'Cinzel', serif;">THE GOD HAS AWAKENED.</h1>`;
        } else {
            render();
        }
    });

    // --- 5. Game Initialization ---

    function init() {
        // Create initial grid
        for (let i = 0; i < 20; i++) {
            const cell = document.createElement('div');
            cell.classList.add('grid-cell');
            cell.dataset.cellIndex = i;
            worldGridEl.appendChild(cell);
        }

        drawCard();
        drawCard();
        drawCard();

        render();
    }

f    init();
});
