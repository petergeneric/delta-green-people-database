const fs = require('fs');
const blessed = require('blessed');
const contrib = require('blessed-contrib');

function loadDatabase() {
	if (!fs.existsSync('people.json')) {
		console.error('No people.json database found!');
		console.exit(1);
	}

	const config = JSON.parse(fs.readFileSync('people.json', 'utf-8'));
	let people = config.records;

	if (fs.existsSync('players.json')) {
		const players = JSON.parse(fs.readFileSync('players.json', 'utf-8'));

		players.forEach(p => people.push(p));
	}

	// Fix-up nonsensical records whose dateOfDeath is before dateOfBirth
	people.forEach(person => {
		if ('dateOfDeath' in person && person.dateOfDeath < person.dateOfBirth) {
			let tmp = person.dateOfBirth;
			person.dateOfBirth = person.dateOfDeath;
			person.dateOfDeath = tmp;
		}
	});

	// Apply default status value
	people.forEach(person => {
		if (!('status' in person)){
			person.status = ('dateOfDeath' in person) ? 'Deceased' : 'Alive';
		}
	});

	// Remove any records that should not be visible in the current game stage
	const stage = config.gameStage || 1;
	return people.filter(person => {
		const minStage = person.notBefore || 0;
		const maxStage = person.notAfter || 999999999;

		return (stage >= minStage && stage <= maxStage);
	});
}

const people = loadDatabase();

// For records with DoB+DoD older than this, warn that a physical record is required
// Set to null if not desired. This feature lets you force players into a dusty dark archives room for old records.
const cutoffDateWarning = '1960-01-01';
const maxResults = 20;

const screen = blessed.screen({ smartCSR: true, title: 'FBI KNOWN PERSONS DATABASE' });

let mainMenu, searchResultsTable, detailsBox, searchInput;

function createMainMenu() {
	mainMenu = blessed.box({
		top: 'center',
		left: 'center',
		width: '60%',
		height: '70%',
		border: { type: 'line' },
		label: 'KNOWN PERSONS DATABASE',
		align: 'center'
	});

	blessed.text({
		parent: mainMenu,
		content: 'THIS IS A FEDERAL LAW ENFORCEMENT SYSTEM. UNAUTHORIZED ACCESS IS A FEDERAL CRIME PUNISHABLE PER 18 USC § 1030\n\nSelect Function:',
		align: 'left'
	});
	
	menuList = blessed.list({
		parent: mainMenu,
		top: 4,
		left: 2,
		width: '90%',
		height: '60%',
		keys: true,
		vi: true,
		items: [
			'Search Records',
			'Modify Record',
			'Delete Record',
			'Access Logs',
			'Administrative Settings',
			'LOG OUT'
		],
		style: {
			selected: { bg: 'blue' }
		}
	});
	
	screen.append(mainMenu);
	menuList.focus();
	screen.render();

	menuList.on('select', (item, index) => {
		if (index === 0) {
			screen.remove(mainMenu);
			showSearchScreen();
		} else if (index === 5) {
			process.exit(0);
		} else {
			showAccessDenied();
		}
	});


	// Create a box for the dummy menu bar at the top
	const menuBar = blessed.box({
		top: 0,
		left: 0,
		width: '100%',
		height: 1,
		content: '{green-fg}LOGGED IN <3204-412-41-C>{/}     {underline}S{/}ystem    {underline}A{/}ccess    S{underline}c{/}reen    Edit {underline}P{/}rofile    Se{underline}t{/}tings    {underline}P{/}rint Screen    {underline}H{/}elp{/bold}',
		tags: true,
		style: {
			fg: 'white',
			bg: 'blue',
			bold: true,
		},
	});
	screen.append(menuBar);


	menuList.key(['escape'], () => {
		process.exit(0);
	});

	screen.render();
}

// Possible option to swap out process exit with; currently unused
function showLoggedOut() {
	const errorBox = blessed.message({
		top: 'center',
		left: 'center',
		width: '65%',
		height: '70%',
		border: { type: 'line' },
		label: 'Logged Out',
		content: 'You have been successfully logged out.\n\nYou may now disconnect from this terminal.',
		align: 'center'
	});

	screen.children.forEach(child => screen.remove(child));
	
	screen.append(errorBox);
	screen.render();
}

function showAccessDenied() {
	showErrorBox('ACCESS DENIED', 'You do not have access to this function.');
}


function showErrorBox(title, body) {
	const errorBox = blessed.message({
		top: 'center',
		left: 'center',
		width: '50%',
		height: '20%',
		border: { type: 'line' },
		label: ' ' + title + ' ',
		content: body,
		align: 'center'
	});
	
	screen.append(errorBox);
	screen.render();

	setTimeout(() => {
		screen.remove(errorBox);
		screen.render();
	}, 1000);
}



function showSearchScreen() {
    searchInput = blessed.textbox({
        top: 'center',
        left: 'center',
        width: '50%',
        height: 3,
        inputOnFocus: true,
        border: { type: 'line' },
        label: ' Enter Surname Selector ',
        keys: true,
        vi: true
    });

    screen.append(searchInput);
    searchInput.focus();
    screen.render();

    searchInput.on('submit', query => {
        if ((query.length < 4 && query.toLowerCase() !== '') || runSearch(query).length > maxResults) {
            showErrorBox('TOO MANY RESULTS', 'Your search selector was insufficiently precise and matched too many results to display. Please refine your search and try again.');
            searchInput.focus();
        }
		else if (runSearch(query).length === 0) {
			showErrorBox('NON-RESPONSIVE QUERY', 'No records were responsive to your search selector')
			searchInput.focus();
		}
        else {
            screen.remove(searchInput);
            showSearchResultsScreen(query);
        }
    });

    searchInput.key(['escape'], () => {
        screen.remove(searchInput);
        createMainMenu();
    });
}

function runSearch(query) {
	const q = query.toLowerCase().replaceAll(', ', ' ');

	const matches = (surname, forename, address) => {
		if (q.includes(' ')) {
			let parts = q.replaceAll('[^a-z]+', ' ') .split(' ', 2);

			return surname.toLowerCase().startsWith(parts[0]) && forename.toLowerCase().startsWith(parts[1]) || address.toLowerCase().includes(query);
		}
		else {
			return surname.toLowerCase().startsWith(q)  || address.toLowerCase().includes(query);
		}
	}

	return people
		.filter((p) => matches(p.surname, p.forename, p.lastKnownAddress || ''))
		.sort((a, b) => {
			// First, compare by surname
			if (a.surname.toLowerCase() < b.surname.toLowerCase()) return -1;
			if (a.surname.toLowerCase() > b.surname.toLowerCase()) return 1;

			// If surnames are the same, compare by forename
			if (a.forename.toLowerCase() < b.forename.toLowerCase()) return -1;
			if (a.forename.toLowerCase() > b.forename.toLowerCase()) return 1;

			// If names are the same, compare by dateOfBirth
			if (a.dateOfBirth.toLowerCase() < b.dateOfBirth.toLowerCase()) return -1;
			if (a.dateOfBirth.toLowerCase() > b.dateOfBirth.toLowerCase()) return 1;

			return 0;
		});
}
function showSearchResultsScreen(query) {
    searchResultsTable = contrib.table({
        top: 'center',
        left: 'center',
        width: '80%',
        height: '60%',
        border: { type: 'line' },
        label: ' Search Results ',
        keys: true,
		tags: true,
        vi: true,
        columnSpacing: 2,
        columnWidth: [15, 15, 10, 12, 15, 30],
        columns: ['Surname', 'Forename', 'Date', 'Status', 'Classifier', 'Address']
    });

    const results = runSearch(query);
    const formattedResults = results.map(p => {
        return [p.surname.toUpperCase(), p.forename.toUpperCase(), p.dateOfBirth, p.status, p.classifier || '', p.lastKnownAddress,];
    });

    searchResultsTable.setData({
        headers: ['Surname', 'Forename', 'Date', 'Status', 'Classifier', 'Address'],
        data: formattedResults
    });

    screen.append(searchResultsTable);
    searchResultsTable.focus();
    screen.render();

    searchResultsTable.rows.on('select', (_, index) => {
        showDetails(results[index]);
    });

	searchResultsTable.key(['escape'], () => {
		screen.remove(searchResultsTable);

		showSearchScreen();

		screen.render();
	});


	searchResultsTable.rows.key(['escape'], () => {
		screen.remove(searchResultsTable);

		showSearchScreen();

		screen.render();
	});
}

function showDetails(person) {
	detailsBox = blessed.box({
		top: 'center',
		left: 'center',
		width: '60%',
		height: '80%',
		border: { type: 'line' },
		tags: true,
		label: ' Record Content ',
		content: formatPersonDetails(person),
		scrollable: true,
		alwaysScroll: true,
		scrollbar: {
			style: {
				bg: 'yellow'
			}
		},
		keys: true,
		vi: true,
	});
	screen.append(detailsBox);
	detailsBox.focus();

	detailsBox.key(['escape'], () => {
		screen.remove(detailsBox);
		searchResultsTable.focus();

		screen.render();
	});

	screen.render();
}

function formatPersonDetails(person) {
	let content = '';

	if ('warning' in person) {
		content = '{red-bg}{white-fg}{bold}NOTE{/bold} ' + person.warning + '{/white-fg}{/red-bg}';
		content += "\n\n";
	}

	// Optional warning for 'legacy records' for deep history if you want players to have to go hunting in a physical archive
	if (cutoffDateWarning != null) {
		let dod = person.dateOfDeath || null;
		const cutoff = cutoffDateWarning;
	
		if (person.dateOfBirth < cutoff) {
			if (dod == null || dod < cutoff) {
				content = '{blue-bg}{white-fg}{bold}Legacy Record{/bold} Consult physical original{/white-fg}{/blue-bg}';
				content += "\n\n";
			}
		}
	}

	content += `Surname: ${person.surname}\nForename: ${person.forename}\nAliases: N/A\nRecord Type: ${person.type || 'Individual'}\nRecord Classifiers: ${person.classifier || 'N/A'}\nBorn: ${person.dateOfBirth}\nDied: ${person.dateOfDeath || 'N/A'}\nStatus: ${person.status || 'N/A'}\nNationality: ${person.nationality || 'USA'}\nLast Known Address: ${person.lastKnownAddress || 'N/A'}\n\nNotes:\n${person.notes || 'None'}`;

	return content;
}

createMainMenu();
screen.key(['C-c'], () => process.exit(0));
