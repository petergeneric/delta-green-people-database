// FBI NCIC Terminal Emulator - Application Logic

let database = [];
let peopleById = {};
let currentRecord = null;
let searchResults = [];
let currentScreen = 'mainMenu';
let inputBuffer = '';

const MAX_RESULTS = 20;
const CUTOFF_DATE_WARNING = '1960-01-01';
const ALLOW_ADDRESS_SEARCH = true;

const input = document.getElementById('hiddenInput');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadDatabase();
    updateClock();
    setInterval(updateClock, 1000);

    input.focus();
    setupInput();
});

// Keep input focused
document.addEventListener('click', () => {
    input.focus();
});

// Authentication
function checkAuth() {
    const authenticated = sessionStorage.getItem('fbi_authenticated');
    if (!authenticated) {
        window.location.href = 'login.html';
        return;
    }

    const username = sessionStorage.getItem('fbi_username') || 'GUEST';
    document.getElementById('titleUser').textContent = username;
    document.getElementById('statusUser').textContent = username;
}

// Clock
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
    const timeEl = document.getElementById('statusTime');
    if (timeEl) {
        timeEl.textContent = timeStr;
    }
}

// Load Database
async function loadDatabase() {
    try {
        // Get database name from query parameter, default to 'gods-teeth'
        const urlParams = new URLSearchParams(window.location.search);
        const dbName = urlParams.get('db') || 'gods-teeth';
        const dbPath = `../databases/${dbName}.json`;

        const response = await fetch(dbPath);
        const data = await response.json();

        const stage = data.gameStage || 1;
        database = data.records.filter(record => {
            const minStage = record.notBefore || 0;
            const maxStage = record.notAfter || 999999999;
            return (stage >= minStage && stage <= maxStage);
        });

        database.forEach(record => {
            if (record.type === undefined) {
                record.type = 'Individual';
            }

            if (record.dateOfDeath && record.dateOfDeath < record.dateOfBirth) {
                let tmp = record.dateOfBirth;
                record.dateOfBirth = record.dateOfDeath;
                record.dateOfDeath = tmp;
            }

            if (!record.status && record.type === 'Individual') {
                record.status = record.dateOfDeath ? 'Deceased' : 'Alive';
            }

            if (!record.id) {
                record.id = record.surname.toUpperCase() + ', ' + record.forename.toUpperCase();
            }
        });

        database.forEach(record => {
            peopleById[record.id] = record;
        });

        database.forEach(record => {
            if (record.related) {
                for (let relterm of record.related) {
                    if (relterm.includes('|')) {
                        relterm = relterm.split('|')[0];
                    }

                    if (relterm in peopleById) {
                        const rel = peopleById[relterm];
                        if (!rel.related) {
                            rel.related = [record.id];
                        } else if (!rel.related.includes(record.id) &&
                                   !rel.related.some(line => line.startsWith(record.id + '|'))) {
                            rel.related.push(record.id);
                        }
                    }
                }
            }
        });

        document.getElementById('recCount').textContent = database.length;

    } catch (error) {
        console.error('Database load error:', error);
    }
}

// Input Handling
function setupInput() {
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleEnter();
            e.preventDefault();
        } else if (e.key === 'Escape' || e.key === 'F3') {
            handleF3();
            e.preventDefault();
        } else if (e.key === 'F7') {
            handleF7();
            e.preventDefault();
        } else if (e.key === 'F12') {
            handleF12();
            e.preventDefault();
        }
    });

    input.addEventListener('input', () => {
        inputBuffer = input.value;
        updateCursor();
    });
}

function updateCursor() {
    if (currentScreen === 'mainMenu') {
        document.getElementById('mainMenuCursor').textContent = inputBuffer + '_';
    } else if (currentScreen === 'query') {
        document.getElementById('queryText').textContent = inputBuffer.substring(1);
        document.getElementById('queryCursor').textContent = '_';
    }
}

function handleEnter() {
    const value = inputBuffer.trim();
    input.value = '';
    inputBuffer = '';

    if (currentScreen === 'mainMenu') {
        handleMainMenuSelection(value);
    } else if (currentScreen === 'query') {
        executeQuery(value);
    } else if (currentScreen === 'results') {
        selectRecord(value);
    } else if (currentScreen === 'linked') {
        selectLinkedRecord(value);
    }
}

// Screen Management
function showScreen(screenName) {
    document.querySelectorAll('.screen-content').forEach(screen => {
        screen.classList.remove('active');
    });

    const screenMap = {
        'mainMenu': 'mainMenuScreen',
        'query': 'queryScreen',
        'results': 'resultsScreen',
        'details': 'detailsScreen',
        'linked': 'linkedScreen'
    };

    const screenId = screenMap[screenName];
    if (screenId) {
        document.getElementById(screenId).classList.add('active');
        currentScreen = screenName;
    }
}

// Main Menu
function handleMainMenuSelection(choice) {
    switch(choice) {
        case '1':
            showScreen('query');
            break;
        case '6':
            confirmExit();
            break;
        default:
            document.getElementById('mainMenuMsg').innerHTML = '<span class="error-msg">INVALID SELECTION - ENTER 1-6</span>';
            setTimeout(() => {
                document.getElementById('mainMenuMsg').innerHTML = '<span class="status-msg">ENTER FUNCTION NUMBER (1-6) AND PRESS ENTER</span>';
            }, 2000);
    }
}

// Query
function executeQuery(query) {
    if (query.length < 4) {
        document.getElementById('queryMsg').innerHTML = '<span class="error-msg">ERROR: MINIMUM 4 CHARACTERS REQUIRED</span>';
        setTimeout(() => {
            document.getElementById('queryMsg').innerHTML = '<span class="status-msg">ENTER SEARCH CRITERIA AND PRESS ENTER (F3=CANCEL)</span>';
        }, 2000);
        return;
    }

    searchResults = runSearch(query);

    if (searchResults.length === 0) {
        document.getElementById('queryMsg').innerHTML = '<span class="error-msg">NO RECORDS FOUND</span>';
        setTimeout(() => {
            document.getElementById('queryMsg').innerHTML = '<span class="status-msg">ENTER SEARCH CRITERIA AND PRESS ENTER (F3=CANCEL)</span>';
        }, 2000);
        return;
    }

    if (searchResults.length > MAX_RESULTS) {
        document.getElementById('queryMsg').innerHTML = `<span class="error-msg">TOO MANY RESULTS (${searchResults.length}) - REFINE SEARCH</span>`;
        setTimeout(() => {
            document.getElementById('queryMsg').innerHTML = '<span class="status-msg">ENTER SEARCH CRITERIA AND PRESS ENTER (F3=CANCEL)</span>';
        }, 2000);
        return;
    }

    displayResults();
}

function runSearch(query) {
    if (query.includes('|')) {
        query = query.split('|')[0];
    }

    query = query.toLowerCase();
    const q = query.replace(', ', ' ');

    const matches = (id, surname, forename, address) => {
        if (q === id.toLowerCase() || query === id.toLowerCase()) {
            return true;
        }

        if (q.includes(' ')) {
            let parts = q.replace(/[^a-z ]+/g, ' ').split(' ', 2);
            return (surname.toLowerCase().startsWith(parts[0]) &&
                    forename.toLowerCase().startsWith(parts[1])) ||
                   (ALLOW_ADDRESS_SEARCH && address.toLowerCase().includes(q));
        } else {
            return surname.toLowerCase().startsWith(q);
        }
    };

    return database
        .filter(p => matches(
            p.id || (p.surname + ', ' + p.forename),
            p.surname || '',
            p.forename || '',
            p.lastKnownAddress || ''
        ))
        .sort((a, b) => {
            if (a.surname.toLowerCase() < b.surname.toLowerCase()) return -1;
            if (a.surname.toLowerCase() > b.surname.toLowerCase()) return 1;
            return 0;
        });
}

// Display Results
function displayResults() {
    const count = searchResults.length.toString().padStart(2, '0');
    document.getElementById('resultCount').textContent = count;

    let table = '  ┌────┬──────────────────┬──────────────────┬────────────┬──────────────┐\n';
    table += '  │ ## │ SURNAME          │ FORENAME         │ DOB        │ STATUS       │\n';
    table += '  ├────┼──────────────────┼──────────────────┼────────────┼──────────────┤\n';

    searchResults.forEach((record, index) => {
        const num = (index + 1).toString().padStart(2, '0');
        const surname = (record.surname || '').substring(0, 16).toUpperCase().padEnd(16);
        const forename = (record.forename || '').substring(0, 16).toUpperCase().padEnd(16);
        const dob = (record.dateOfBirth || 'N/A').substring(0, 10).padEnd(10);
        const status = (record.status || 'UNKNOWN').substring(0, 12).toUpperCase().padEnd(12);

        table += `  │ ${num} │ ${surname} │ ${forename} │ ${dob} │ ${status} │\n`;
    });

    table += '  └────┴──────────────────┴──────────────────┴────────────┴──────────────┘\n\n';

    document.getElementById('resultsTable').textContent = table;
    showScreen('results');
}

// Select Record
function selectRecord(num) {
    const index = parseInt(num) - 1;
    if (isNaN(index) || index < 0 || index >= searchResults.length) {
        document.getElementById('resultsMsg').innerHTML = '<span class="error-msg">INVALID RECORD NUMBER</span>';
        setTimeout(() => {
            document.getElementById('resultsMsg').innerHTML = '<span class="status-msg">ENTER RECORD NUMBER TO VIEW DETAILS (F3=RETURN TO MENU)</span>';
        }, 2000);
        return;
    }

    showRecordDetails(searchResults[index]);
}

// Record Details
function showRecordDetails(record) {
    currentRecord = record;

    let details = '  ┌────────────────────────────────────────────────────────────────────────────┐\n';
    details += `  │ SURNAME:      ${(record.surname || 'N/A').substring(0, 60).padEnd(60)} │\n`;
    details += `  │ FORENAME:     ${(record.forename || 'N/A').substring(0, 60).padEnd(60)} │\n`;
    details += `  │ TYPE:         ${(record.type || 'UNKNOWN').substring(0, 60).padEnd(60)} │\n`;
    details += `  │ CLASSIFIER:   ${(record.classifier || 'N/A').substring(0, 60).padEnd(60)} │\n`;
    details += `  │ DOB:          ${(record.dateOfBirth || 'N/A').substring(0, 60).padEnd(60)} │\n`;
    details += `  │ DOD:          ${(record.dateOfDeath || 'N/A').substring(0, 60).padEnd(60)} │\n`;
    details += `  │ STATUS:       ${(record.status || 'UNKNOWN').substring(0, 60).padEnd(60)} │\n`;
    details += `  │ ADDRESS:      ${(record.lastKnownAddress || 'N/A').substring(0, 60).padEnd(60)} │\n`;
    details += '  ├────────────────────────────────────────────────────────────────────────────┤\n';
    details += '  │ NOTES:                                                                     │\n';

    const notes = record.notes || 'NONE';
    const noteLines = notes.match(/.{1,74}/g) || ['NONE'];
    noteLines.forEach(line => {
        details += `  │ ${line.padEnd(74)} │\n`;
    });

    details += '  └────────────────────────────────────────────────────────────────────────────┘\n\n';

    if (record.related && record.related.length > 0) {
        details += `  LINKED RECORDS: ${record.related.length} FOUND - PRESS F7 TO VIEW\n\n`;
    }

    document.getElementById('recordDetails').textContent = details;
    showScreen('details');
}

// Linked Records
function showLinkedRecords() {
    if (!currentRecord || !currentRecord.related || currentRecord.related.length === 0) {
        return;
    }

    let list = '  ┌────┬──────────────────────────────────────────────────────────────────────┐\n';
    list += '  │ ## │ LINKED RECORD                                                        │\n';
    list += '  ├────┼──────────────────────────────────────────────────────────────────────┤\n';

    currentRecord.related.forEach((term, index) => {
        const num = (index + 1).toString().padStart(2, '0');
        let caption = term;
        if (term.includes('|')) {
            caption = term.split('|')[1];
        }

        const results = runSearch(term);
        const status = results.length > 0 ? '✓' : '✗';
        const text = `${status} ${caption}`.substring(0, 70).padEnd(70);

        list += `  │ ${num} │ ${text} │\n`;
    });

    list += '  └────┴──────────────────────────────────────────────────────────────────────┘\n\n';

    document.getElementById('linkedList').textContent = list;
    showScreen('linked');
}

function selectLinkedRecord(num) {
    if (!currentRecord || !currentRecord.related) return;

    const index = parseInt(num) - 1;
    if (isNaN(index) || index < 0 || index >= currentRecord.related.length) {
        document.getElementById('linkedMsg').innerHTML = '<span class="error-msg">INVALID RECORD NUMBER</span>';
        setTimeout(() => {
            document.getElementById('linkedMsg').innerHTML = '<span class="status-msg">ENTER RECORD NUMBER TO VIEW (F3=RETURN TO DETAILS)</span>';
        }, 2000);
        return;
    }

    const term = currentRecord.related[index];
    const searchTerm = term.includes('|') ? term.split('|')[0] : term;
    const results = runSearch(searchTerm);

    if (results.length === 0) {
        document.getElementById('linkedMsg').innerHTML = '<span class="error-msg">RECORD NOT AVAILABLE</span>';
        setTimeout(() => {
            document.getElementById('linkedMsg').innerHTML = '<span class="status-msg">ENTER RECORD NUMBER TO VIEW (F3=RETURN TO DETAILS)</span>';
        }, 2000);
    } else if (results.length === 1) {
        showRecordDetails(results[0]);
    } else {
        searchResults = results;
        displayResults();
    }
}

// Function Keys
function handleF3() {
    input.value = '';
    inputBuffer = '';

    if (currentScreen === 'linked') {
        showScreen('details');
    } else if (currentScreen === 'details') {
        showScreen('results');
    } else if (currentScreen === 'results' || currentScreen === 'query') {
        showScreen('mainMenu');
    }
}

function handleF7() {
    if (currentScreen === 'details' && currentRecord && currentRecord.related) {
        showLinkedRecords();
    }
}

function handleF12() {
    input.value = '';
    inputBuffer = '';
    updateCursor();
}

function showHelp() {
    alert('FBI NCIC TERMINAL HELP\n\nNavigation:\n- Enter numbers to select menu options\n- F3: Exit/Back\n- F7: View linked records\n- F12: Clear input\n\nQuery: Enter at least 4 characters');
}

function refreshScreen() {
    if (currentScreen === 'results' && searchResults.length > 0) {
        displayResults();
    }
}

function confirmExit() {
    if (confirm('LOGOFF FROM NCIC TERMINAL?')) {
        sessionStorage.removeItem('fbi_authenticated');
        sessionStorage.removeItem('fbi_username');
        window.location.href = 'login.html';
    }
}
