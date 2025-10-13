// FBI Known Persons Database - Web UI
// Windows 95 / 2001 Police Database Style

let database = [];
let peopleById = {};
let currentRecord = null;
let searchResults = [];

const MAX_RESULTS = 20;
const CUTOFF_DATE_WARNING = '1960-01-01';
const ALLOW_ALL_QUERY = false;
const ALLOW_ADDRESS_SEARCH = true;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    loadDatabase();
    setupMainMenu();
    setupSearchScreen();
    setupKeyboardShortcuts();
});

// Load database from JSON file
async function loadDatabase() {
    try {
        // Get database name from query parameter, default to 'gods-teeth'
        const urlParams = new URLSearchParams(window.location.search);
        const dbName = urlParams.get('db') || 'gods-teeth';
        const dbPath = `../databases/${dbName}.json`;

        const response = await fetch(dbPath);
        const data = await response.json();

        // Filter by game stage (default to stage 1 if not specified)
        const stage = data.gameStage || 1;
        database = data.records.filter(record => {
            const minStage = record.notBefore || 0;
            const maxStage = record.notAfter || 999999999;
            return (stage >= minStage && stage <= maxStage);
        });

        // Default record types to Individual
        database.forEach(record => {
            if (record.type === undefined) {
                record.type = 'Individual';
            }
        });

        // Fix nonsensical dateOfDeath before dateOfBirth
        database.forEach(record => {
            if (record.dateOfDeath && record.dateOfDeath < record.dateOfBirth) {
                let tmp = record.dateOfBirth;
                record.dateOfBirth = record.dateOfDeath;
                record.dateOfDeath = tmp;
            }
        });

        // Apply default status values
        database.forEach(record => {
            if (!record.status && record.type === 'Individual') {
                record.status = record.dateOfDeath ? 'Deceased' : 'Alive';
            }
        });

        // Apply default IDs
        database.forEach(record => {
            if (!record.id) {
                record.id = record.surname.toUpperCase() + ', ' + record.forename.toUpperCase();
            }
        });

        // Index records by ID
        database.forEach(record => {
            peopleById[record.id] = record;
        });

        // Build backlinks for related records
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

    } catch (error) {
        showError('DATABASE ERROR', 'Failed to load database file: ' + error.message);
    }
}

// Setup Main Menu
function setupMainMenu() {
    const menuItems = document.querySelectorAll('#mainMenu .menu-item-row');

    menuItems.forEach(item => {
        item.addEventListener('click', () => handleMainMenuClick(item.dataset.action));
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleMainMenuClick(item.dataset.action);
            }
        });
    });
}

function handleMainMenuClick(action) {
    switch(action) {
        case 'search':
            showScreen('searchScreen');
            document.getElementById('searchInput').focus();
            break;
        case 'logout':
            window.close();
            break;
        default:
            showError('ACCESS DENIED', 'You do not have access to this function.');
    }
}

// Setup Search Screen
function setupSearchScreen() {
    const searchInput = document.getElementById('searchInput');

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleSearch(searchInput.value);
        } else if (e.key === 'Escape') {
            showScreen('mainMenu');
        }
    });
}

// Handle search query
function handleSearch(query) {
    query = query.trim();

    if (query.toLowerCase() === 'all') {
        if (ALLOW_ALL_QUERY) {
            searchResults = database;
            showSearchResults();
        } else {
            showError('DENIED', 'Your account does not have sufficient privileges to use the supplied search operator');
        }
        return;
    }

    searchResults = runSearch(query);

    if ((query.length < 4 && query.toLowerCase() !== '') || searchResults.length > MAX_RESULTS) {
        showError('TOO MANY RESULTS', 'Your search selector was insufficiently precise and matched too many results to display. Please refine your search and try again.');
    } else if (searchResults.length === 0) {
        showError('NON-RESPONSIVE QUERY', 'No records were responsive to your search selector');
    } else {
        showSearchResults();
    }
}

// Run search on database
function runSearch(query) {
    if (query.includes('|')) {
        query = query.split('|')[0];
    }

    query = query.toLowerCase();
    const q = query.replace(', ', ' ');

    if (q === 'all' && ALLOW_ALL_QUERY) {
        return database;
    }

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
            if (a.forename.toLowerCase() < b.forename.toLowerCase()) return -1;
            if (a.forename.toLowerCase() > b.forename.toLowerCase()) return 1;
            if (a.dateOfBirth < b.dateOfBirth) return -1;
            if (a.dateOfBirth > b.dateOfBirth) return 1;
            return 0;
        });
}

// Show search results
function showSearchResults() {
    const tbody = document.getElementById('resultsTableBody');
    tbody.innerHTML = '';

    searchResults.forEach((record, index) => {
        const row = tbody.insertRow();
        row.dataset.index = index;
        row.tabIndex = 0;

        row.insertCell(0).textContent = (record.surname || '').toUpperCase();
        row.insertCell(1).textContent = (record.forename || '').toUpperCase();
        row.insertCell(2).textContent = record.dateOfBirth || '-';
        row.insertCell(3).textContent = record.status || 'Unknown';
        row.insertCell(4).textContent = record.classifier || '';
        row.insertCell(5).textContent = record.lastKnownAddress || 'Unknown';

        row.addEventListener('click', () => showDetails(record));
        row.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                showDetails(record);
            } else if (e.key === 'Escape' || e.key === '/') {
                showScreen('searchScreen');
                document.getElementById('searchInput').focus();
            }
        });
    });

    showScreen('resultsScreen');
    if (tbody.rows.length > 0) {
        tbody.rows[0].focus();
    }
}

// Show record details
function showDetails(record) {
    currentRecord = record;
    const detailsContent = document.getElementById('detailsContent');

    let content = '';

    // Warning banner if present
    if (record.warning) {
        content += `<div class="access-warning">NOTE: ${record.warning}</div>`;
    }

    // Legacy record warning
    if (CUTOFF_DATE_WARNING && !record.suppressLegacyWarning) {
        let dod = record.dateOfDeath || null;
        const cutoff = CUTOFF_DATE_WARNING;

        if (record.dateOfBirth < cutoff) {
            if (!dod || dod < cutoff) {
                content += '<div class="legacy-warning">Legacy Record - Consult physical original</div>';
            }
        }
    }

    // Record details
    content += `Surname: ${record.surname}
Forename: ${record.forename}
Aliases: N/A
Record Type: ${record.type || 'Unknown'}
Record Classifiers: ${record.classifier || 'N/A'}
Born: ${record.dateOfBirth}
Died: ${record.dateOfDeath || 'N/A'}
Status: ${record.status || 'N/A'}
Last Known Address: ${record.lastKnownAddress || 'N/A'}
`;

    if (record.nationality || record.type === 'Individual') {
        content += `Nationality: ${record.nationality || 'USA'}\n`;
    }

    content += `\n\nNotes:\n${record.notes || 'None'}`;

    content += '\n\n';

    if (record.related && record.related.length > 0) {
        content += `${record.related.length} Linked Records Found. Click "Linked Records" to view\n`;
    }

    if (record.events && record.events.length > 0) {
        content += `${record.events.length} events available\n`;
    }

    detailsContent.innerHTML = content;

    showScreen('detailsScreen');

    // Setup detail menu bar clicks
    const detailMenuBar = document.querySelector('#detailsScreen .detail-menu-bar');
    const menuItems = detailMenuBar.querySelectorAll('.menu-item');

    menuItems[0].onclick = () => {
        if (record.events) {
            showError('No Events Found', 'No relevant events were found');
        }
    };

    menuItems[1].onclick = () => {
        if (record.related && record.related.length > 0) {
            showLinkedRecords(record);
        } else {
            showError('No Linked Records Found', 'No record links were found');
        }
    };
}

// Show linked records
function showLinkedRecords(record) {
    const linkedList = document.getElementById('linkedList');
    linkedList.innerHTML = '';

    record.related.forEach(term => {
        const div = document.createElement('div');
        div.className = 'linked-item';
        div.tabIndex = 0;

        let caption = term;
        let searchTerm = term;

        if (term.includes('|')) {
            const parts = term.split('|');
            searchTerm = parts[0];
            caption = parts[1];
        }

        const results = runSearch(searchTerm);

        if (results.length === 0) {
            div.className += ' unavailable';
            div.textContent = caption;
        } else {
            div.className += ' available';
            div.textContent = caption;

            div.addEventListener('click', () => handleLinkedRecordClick(searchTerm, results));
            div.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    handleLinkedRecordClick(searchTerm, results);
                }
            });
        }

        linkedList.appendChild(div);
    });

    showScreen('linkedScreen');
}

function handleLinkedRecordClick(searchTerm, results) {
    if (results.length === 0) {
        const displayTerm = searchTerm.includes('|') ? searchTerm.split('|')[1] : searchTerm;
        showError('Unavailable', `Linked record unavailable:\n${displayTerm}`);
    } else if (results.length === 1) {
        showDetails(results[0]);
    } else {
        searchResults = results;
        showSearchResults();
    }
}

// Show/hide screens
function showScreen(screenId) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
        screen.style.display = 'none';
    });

    const targetScreen = document.getElementById(screenId);
    targetScreen.style.display = 'flex';

    // Clear search input when returning to search screen
    if (screenId === 'searchScreen') {
        document.getElementById('searchInput').value = '';
    }
}

// Show error dialog
function showError(title, message) {
    const errorDialog = document.getElementById('errorDialog');
    const errorTitle = document.getElementById('errorTitle');
    const errorMessage = document.getElementById('errorMessage');

    errorTitle.textContent = title;
    errorMessage.textContent = message;

    errorDialog.style.display = 'flex';

    setTimeout(() => {
        errorDialog.style.display = 'none';
    }, 1500);
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // ESC key handling for different screens
        if (e.key === 'Escape') {
            const currentScreen = getCurrentScreen();

            if (currentScreen === 'detailsScreen') {
                showScreen('resultsScreen');
                e.preventDefault();
            } else if (currentScreen === 'linkedScreen') {
                showScreen('detailsScreen');
                e.preventDefault();
            } else if (currentScreen === 'resultsScreen') {
                showScreen('searchScreen');
                document.getElementById('searchInput').focus();
                e.preventDefault();
            } else if (currentScreen === 'searchScreen') {
                showScreen('mainMenu');
                e.preventDefault();
            }
        }

        // Forward slash for search
        if (e.key === '/' && !e.target.matches('input')) {
            showScreen('searchScreen');
            document.getElementById('searchInput').focus();
            e.preventDefault();
        }
    });
}

function getCurrentScreen() {
    const screens = document.querySelectorAll('.screen');
    for (let screen of screens) {
        if (screen.style.display !== 'none') {
            return screen.id;
        }
    }
    return 'mainMenu';
}
