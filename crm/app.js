// Enterprise CRM System - Application Logic

let database = [];
let peopleById = {};
let currentRecord = null;
let searchResults = [];
let selectedRow = null;

const MAX_RESULTS = 20;
const CUTOFF_DATE_WARNING = '1960-01-01';
const ALLOW_ADDRESS_SEARCH = true;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadDatabase();
    updateClock();
    setInterval(updateClock, 1000);
});

// Authentication
function checkAuth() {
    const authenticated = sessionStorage.getItem('crm_authenticated');
    if (!authenticated) {
        window.location.href = 'login.html';
        return;
    }

    const username = sessionStorage.getItem('crm_username') || 'Guest';
    document.getElementById('currentUser').textContent = username;
}

// Clock
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: true });
    const timeEl = document.getElementById('statusTime');
    if (timeEl) {
        timeEl.textContent = timeStr;
    }
}

// Load Database
async function loadDatabase() {
    try {
        updateStatus('Loading database...');

        const response = await fetch('../databases/gods-teeth.json');
        const data = await response.json();

        const stage = data.gameStage || 1;
        database = data.records.filter(record => {
            const minStage = record.notBefore || 0;
            const maxStage = record.notAfter || 999999999;
            return (stage >= minStage && stage <= maxStage);
        });

        // Process records
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

        updateRecordCounts(database.length, 0);
        updateStatus('Ready');

    } catch (error) {
        updateStatus('Error loading database: ' + error.message);
    }
}

// View Management
function switchView(viewName) {
    // Update tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`.tab[data-view="${viewName}"]`).classList.add('active');

    // Update view panels
    document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.remove('active');
    });

    if (viewName === 'records') {
        document.getElementById('recordsView').classList.add('active');
    } else if (viewName === 'search') {
        document.getElementById('searchView').classList.add('active');
        document.getElementById('queryInput').focus();
    }
}

function selectView(viewType) {
    document.querySelectorAll('.view-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.classList.add('active');
}

function toggleGrid() {
    const gridContainer = document.querySelector('.grid-container');
    const formContainer = document.getElementById('recordForm');

    if (formContainer.style.display === 'none') {
        formContainer.style.display = 'block';
    } else {
        formContainer.style.display = 'none';
    }
}

// Query Functions
function showQueryPanel() {
    switchView('search');
}

function executeQuery() {
    const query = document.getElementById('queryInput').value.trim();

    if (query.length < 4 && query !== '') {
        alert('Please enter at least 4 characters to search.');
        return;
    }

    updateStatus('Executing query...');

    searchResults = runSearch(query);

    if (searchResults.length === 0) {
        alert('No records found matching your query.');
        updateStatus('Query returned 0 records');
        return;
    }

    if (searchResults.length > MAX_RESULTS) {
        alert(`Query returned ${searchResults.length} records. Maximum ${MAX_RESULTS} results can be displayed. Please refine your search.`);
        return;
    }

    displayResults();
    switchView('records');
    updateStatus(`Query returned ${searchResults.length} records`);
}

function clearQuery() {
    document.getElementById('queryInput').value = '';
    searchResults = [];
    clearGrid();
    updateRecordCounts(database.length, 0);
    updateStatus('Query cleared');
}

function refreshData() {
    if (searchResults.length > 0) {
        displayResults();
        updateStatus('Data refreshed');
    }
}

// Search Logic
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
            return 0;
        });
}

// Display Results
function displayResults() {
    const tbody = document.getElementById('gridBody');
    tbody.innerHTML = '';

    searchResults.forEach((record, index) => {
        const row = tbody.insertRow();
        row.dataset.index = index;

        row.insertCell(0).textContent = (record.surname || '').toUpperCase();
        row.insertCell(1).textContent = (record.forename || '').toUpperCase();
        row.insertCell(2).textContent = record.dateOfBirth || '-';
        row.insertCell(3).textContent = record.status || 'Unknown';
        row.insertCell(4).textContent = record.type || 'Unknown';
        row.insertCell(5).textContent = record.lastKnownAddress || 'Unknown';

        row.addEventListener('click', () => {
            if (selectedRow) {
                selectedRow.classList.remove('selected');
            }
            row.classList.add('selected');
            selectedRow = row;
            showRecordDetails(record);
        });
    });

    updateRecordCounts(database.length, searchResults.length);
}

function clearGrid() {
    const tbody = document.getElementById('gridBody');
    tbody.innerHTML = '<tr><td colspan="6" class="no-records">No records to display. Use Query to search.</td></tr>';
    document.getElementById('recordForm').style.display = 'none';
}

// Record Details
function showRecordDetails(record) {
    currentRecord = record;

    document.getElementById('detailSurname').textContent = record.surname || 'N/A';
    document.getElementById('detailForename').textContent = record.forename || 'N/A';
    document.getElementById('detailType').textContent = record.type || 'Unknown';
    document.getElementById('detailStatus').textContent = record.status || 'Unknown';
    document.getElementById('detailDOB').textContent = record.dateOfBirth || 'N/A';
    document.getElementById('detailDOD').textContent = record.dateOfDeath || 'N/A';
    document.getElementById('detailClassifier').textContent = record.classifier || 'N/A';
    document.getElementById('detailAddress').textContent = record.lastKnownAddress || 'N/A';
    document.getElementById('detailNotes').textContent = record.notes || 'None';

    // Linked records
    const linkedSection = document.getElementById('linkedSection');
    const linkedContainer = document.getElementById('linkedContainer');

    if (record.related && record.related.length > 0) {
        linkedSection.style.display = 'block';
        document.getElementById('linkedCountLabel').textContent = record.related.length;

        linkedContainer.innerHTML = '';
        record.related.forEach(term => {
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
                div.textContent = '✗ ' + caption;
            } else {
                div.className += ' available';
                div.textContent = '→ ' + caption;

                div.addEventListener('click', () => {
                    if (results.length === 1) {
                        searchResults = [results[0]];
                        displayResults();
                        // Auto-select the first row
                        const firstRow = document.querySelector('#gridBody tr');
                        if (firstRow) firstRow.click();
                    } else {
                        searchResults = results;
                        displayResults();
                    }
                });
            }

            linkedContainer.appendChild(div);
        });
    } else {
        linkedSection.style.display = 'none';
    }

    document.getElementById('recordForm').style.display = 'block';
}

// Status & Counts
function updateStatus(message) {
    document.getElementById('statusMessage').textContent = message;
}

function updateRecordCounts(total, displayed) {
    document.getElementById('totalCount').textContent = total;
    document.getElementById('displayCount').textContent = displayed;
    document.getElementById('statusRecordCount').textContent = displayed;
}

// Logout
function logout() {
    sessionStorage.removeItem('crm_authenticated');
    sessionStorage.removeItem('crm_username');
    window.location.href = 'login.html';
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl+Q for query
    if (e.ctrlKey && e.key === 'q') {
        e.preventDefault();
        showQueryPanel();
    }

    // Ctrl+R for refresh
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        refreshData();
    }

    // Enter on query input
    const queryInput = document.getElementById('queryInput');
    if (e.key === 'Enter' && document.activeElement === queryInput) {
        executeQuery();
    }
});
