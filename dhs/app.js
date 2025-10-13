// DHS Case Management System - Application Logic

let database = [];
let peopleById = {};
let currentRecord = null;
let searchResults = [];
let lastScreen = 'mainMenu';

const MAX_RESULTS = 20;
const CUTOFF_DATE_WARNING = '1960-01-01';
const ALLOW_ADDRESS_SEARCH = true;

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadDatabase();
    updateTimestamp();
    setInterval(updateTimestamp, 1000);
});

// Check authentication
function checkAuth() {
    const authenticated = sessionStorage.getItem('dhs_authenticated');
    if (!authenticated) {
        window.location.href = 'login.html';
        return;
    }

    const username = sessionStorage.getItem('dhs_username') || 'Guest';
    document.getElementById('currentUser').textContent = username;
    document.querySelectorAll('.current-user').forEach(el => {
        el.textContent = username;
    });
}

// Update timestamp
function updateTimestamp() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: true });
    const dateStr = now.toLocaleDateString('en-US');
    const timestamp = document.getElementById('timestamp');
    if (timestamp) {
        timestamp.textContent = `${dateStr} ${timeStr}`;
    }
}

// Load database
async function loadDatabase() {
    try {
        const response = await fetch('../databases/gods-teeth.json');
        const data = await response.json();

        const stage = data.gameStage || 1;
        database = data.records.filter(record => {
            const minStage = record.notBefore || 0;
            const maxStage = record.notAfter || 999999999;
            return (stage >= minStage && stage <= maxStage);
        });

        // Set defaults
        database.forEach(record => {
            if (record.type === undefined) {
                record.type = 'Individual';
            }

            // Fix date issues
            if (record.dateOfDeath && record.dateOfDeath < record.dateOfBirth) {
                let tmp = record.dateOfBirth;
                record.dateOfBirth = record.dateOfDeath;
                record.dateOfDeath = tmp;
            }

            // Set status
            if (!record.status && record.type === 'Individual') {
                record.status = record.dateOfDeath ? 'Deceased' : 'Alive';
            }

            // Set ID
            if (!record.id) {
                record.id = record.surname.toUpperCase() + ', ' + record.forename.toUpperCase();
            }
        });

        // Index by ID
        database.forEach(record => {
            peopleById[record.id] = record;
        });

        // Build backlinks
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

        document.getElementById('recordCount').textContent = database.length;

    } catch (error) {
        showMessage('Database Error', 'Failed to load database: ' + error.message);
    }
}

// Navigation functions
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function showMainMenu() {
    showScreen('mainMenu');
}

function showSearch() {
    showScreen('searchScreen');
    document.getElementById('searchInput').value = '';
    document.getElementById('searchInput').focus();
}

function backToResults() {
    showScreen('resultsScreen');
}

function backToDetails() {
    showScreen('detailsScreen');
}

function logout() {
    sessionStorage.removeItem('dhs_authenticated');
    sessionStorage.removeItem('dhs_username');
    window.location.href = 'login.html';
}

// Search functionality
function performSearch() {
    const query = document.getElementById('searchInput').value.trim();

    if (query.length < 4 && query.toLowerCase() !== '') {
        showMessage('Search Error', 'Please enter at least 4 characters to search.');
        return;
    }

    searchResults = runSearch(query);

    if (searchResults.length === 0) {
        showMessage('No Results', 'No records found matching your search criteria.');
        return;
    }

    if (searchResults.length > MAX_RESULTS) {
        showMessage('Too Many Results', `Your search returned ${searchResults.length} results. Please refine your search. Maximum ${MAX_RESULTS} results can be displayed.`);
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
            if (a.forename.toLowerCase() < b.forename.toLowerCase()) return -1;
            if (a.forename.toLowerCase() > b.forename.toLowerCase()) return 1;
            if (a.dateOfBirth < b.dateOfBirth) return -1;
            if (a.dateOfBirth > b.dateOfBirth) return 1;
            return 0;
        });
}

function displayResults() {
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';

    document.getElementById('resultCount').textContent = searchResults.length;

    searchResults.forEach((record, index) => {
        const row = tbody.insertRow();
        row.dataset.index = index;

        row.insertCell(0).textContent = (record.surname || '').toUpperCase();
        row.insertCell(1).textContent = (record.forename || '').toUpperCase();
        row.insertCell(2).textContent = record.dateOfBirth || '-';
        row.insertCell(3).textContent = record.status || 'Unknown';
        row.insertCell(4).textContent = record.classifier || '';
        row.insertCell(5).textContent = record.lastKnownAddress || 'Unknown';

        row.addEventListener('click', () => {
            tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
            row.classList.add('selected');
            showDetails(record);
        });
    });

    showScreen('resultsScreen');
}

// Record details
function showDetails(record) {
    currentRecord = record;
    const detailsContent = document.getElementById('detailsContent');

    let content = '';

    // Warning banner
    if (record.warning) {
        content += `<div class="record-warning">⚠ NOTICE: ${record.warning}</div>`;
    }

    // Legacy record warning
    if (CUTOFF_DATE_WARNING && !record.suppressLegacyWarning) {
        let dod = record.dateOfDeath || null;
        const cutoff = CUTOFF_DATE_WARNING;

        if (record.dateOfBirth < cutoff) {
            if (!dod || dod < cutoff) {
                content += '<div class="record-legacy">ℹ LEGACY RECORD - Physical records may be required for complete information</div>';
            }
        }
    }

    // Record details
    content += `Surname: ${record.surname || 'N/A'}
Forename: ${record.forename || 'N/A'}
Aliases: N/A
Record Type: ${record.type || 'Unknown'}
Classifiers: ${record.classifier || 'N/A'}
Date of Birth: ${record.dateOfBirth || 'N/A'}
Date of Death: ${record.dateOfDeath || 'N/A'}
Status: ${record.status || 'N/A'}
Last Known Address: ${record.lastKnownAddress || 'N/A'}
`;

    if (record.nationality || record.type === 'Individual') {
        content += `Nationality: ${record.nationality || 'USA'}\n`;
    }

    content += `\n\nNotes:\n${record.notes || 'None'}`;

    detailsContent.innerHTML = content;

    // Linked records button
    const linkedBtn = document.getElementById('linkedRecordsBtn');
    if (record.related && record.related.length > 0) {
        document.getElementById('linkedCount').textContent = record.related.length;
        linkedBtn.style.display = 'inline-block';
    } else {
        linkedBtn.style.display = 'none';
    }

    showScreen('detailsScreen');
}

// Linked records
function showLinkedRecords() {
    if (!currentRecord || !currentRecord.related) {
        showMessage('No Linked Records', 'This record has no linked records.');
        return;
    }

    const linkedList = document.getElementById('linkedList');
    linkedList.innerHTML = '';

    currentRecord.related.forEach(term => {
        const div = document.createElement('div');
        div.className = 'linked-item';

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
            div.textContent = '✗ ' + caption + ' (Not Available)';
        } else {
            div.className += ' available';
            div.textContent = '→ ' + caption;

            div.addEventListener('click', () => {
                if (results.length === 1) {
                    showDetails(results[0]);
                } else {
                    searchResults = results;
                    displayResults();
                }
            });
        }

        linkedList.appendChild(div);
    });

    showScreen('linkedScreen');
}

// Modal message
function showMessage(title, message) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    document.getElementById('messageDialog').style.display = 'flex';
}

function closeModal() {
    document.getElementById('messageDialog').style.display = 'none';
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // ESC key
    if (e.key === 'Escape') {
        const activeScreen = document.querySelector('.screen.active');
        if (activeScreen) {
            if (activeScreen.id === 'linkedScreen') {
                backToDetails();
            } else if (activeScreen.id === 'detailsScreen') {
                backToResults();
            } else if (activeScreen.id === 'resultsScreen') {
                showSearch();
            } else if (activeScreen.id === 'searchScreen') {
                showMainMenu();
            }
        }
    }

    // Enter on search input
    if (e.key === 'Enter') {
        const searchInput = document.getElementById('searchInput');
        if (document.activeElement === searchInput) {
            performSearch();
        }
    }
});
