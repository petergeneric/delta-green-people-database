const fs = require('fs');
const blessed = require('neo-blessed');
const contrib = require('neo-blessed-contrib');

function loadDatabaseFile(file, defaultStage = 1) {
	if (fs.existsSync(file)) {
		let config = JSON.parse(fs.readFileSync(file, 'utf-8'));

		// Remove any records that should not be visible in the current game stage
		// If the datafile specifies a stage then use that, otherwise default to the master datafile's stage
		const stage = config.gameStage || defaultStage;
		config.records = config.records.filter(person => {
			const minStage = person.notBefore || 0;
			const maxStage = person.notAfter || 999999999;

			return (stage >= minStage && stage <= maxStage);
		});

		// Default record types to Individual
		config.records.filter(record=>record.type === undefined).forEach(record => {
			record.type = 'Individual';
		});

		// Fix-up nonsensical records whose dateOfDeath is before dateOfBirth
		config.records.forEach(person => {
			if ('dateOfDeath' in person && person.dateOfDeath < person.dateOfBirth) {
				let tmp = person.dateOfBirth;
				person.dateOfBirth = person.dateOfDeath;
				person.dateOfDeath = tmp;
			}
		});

		// Apply default status value
		config.records.forEach(record => {
			if (!('status' in record) && record.type === 'Individual'){
				record.status = ('dateOfDeath' in record) ? 'Deceased' : 'Alive';
			}
		});

		// Apply default id
		config.records.forEach(record => {
			if (!('id' in record)){
				record.id = record.surname.toUpperCase() + ', ' + record.forename.toUpperCase();
			}
		});

		return config;
	}
	else {
		return null;
	}
}

function loadDatabase(files) {
	let config = null;
	if (files.length === 0) {
		config = loadDatabaseFile('people.json');

		if (config === null) {
			console.error('people.json datafile not found in working directory. To run with a custom datafile, add it as an argument to this program.');
			console.exit(1);
		}
	}
	else {
		for (let file of files) {
			if (fs.existsSync(file)) {
				const cfg = loadDatabaseFile(file, config?.gameStage || 1);

				if (config === null) {
					config = cfg; // Master datafile
				}
				else {
					// Add records from other file
					cfg.records.forEach(p => config.records.push(p));
				}
			}
			else {
				console.error('Supplied database file not found: ' + process.argv[2]);
				process.exit(1);
			}
		}
	}

	if (!files.includes('players.json') && fs.existsSync('players.json')) {
		const cfg = loadDatabaseFile('players.json');

		cfg.records.forEach(record => config.records.push(record));
	}

	let people = config.records;

	// Index person -> related links
	let peopleByIds = {};
	people.forEach(person => {
		peopleByIds[person.id] = person;
	});

	// Include backlinks for related records
	people.forEach(person => {
		if (person.related !== undefined) {
			for (let relterm of person.related) {
				if (relterm.includes('|'))
					relterm = relterm.split('|')[0]; // ignore label

				if (relterm in peopleByIds) {
					const rel = peopleByIds[relterm];
					if (rel.related === undefined)
						rel.related = [person.id];
					else if (!rel.related.includes(person.id) && rel.related.filter(line=>line.startsWith(person.id + '|')).length === 0)
						rel.related.push(person.id);
				}
			}
		}
	});

	return people;
}

// Load all the datafiles supplied as args
const people = loadDatabase(process.argv.slice(2));

// For records with DoB+DoD older than this, warn that a physical record is required
// Set to null if not desired. This feature lets you force players into a dusty dark archives room for old records.
const cutoffDateWarning = '1960-01-01';
const maxResults = 20;
// Set to true to allow showing entire db
const allowAllQuery = false;
// Set to true to allow partial matches based on address field
const allowAddressSearch = true;

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


	menuList.key(['/'], (item, index) => {
		screen.remove(mainMenu);
		showSearchScreen();
	});

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

	menuList.key(['escape'], () => {
		process.exit(0);
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
        label: ' Enter Selector ',
        keys: true,
        vi: false
    });

    screen.append(searchInput);
    searchInput.focus();
    screen.render();

    searchInput.on('submit', query => {
		if (query.toLowerCase() === 'all') {
			if (allowAllQuery) {
				screen.remove(searchInput);
				showSearchResultsScreen('all');
			}
			else {
				showErrorBox('DENIED', 'Your account does not have sufficient privileges to use the supplied search operator');
				searchInput.focus();
			}
		}
        else if ((query.length < 4 && query.toLowerCase() !== '') || runSearch(query).length > maxResults) {
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
	if (query.includes('|'))
		query = query.split('|')[0]; // if query is of form "real term|caption" then strip the caption

	query = query.toLowerCase();
	const q = query.replaceAll(', ', ' ');

	if (q === 'all' && allowAllQuery)
		return people;

	const matches = (id, surname, forename, address) => {
		if (q === id.toLowerCase() || query === id.toLowerCase()) {
			return true; // record id matches
		}

		if (q.includes(' ')) {
			let parts = q.replaceAll('[^a-z]+', ' ') .split(' ', 2);

			return surname.toLowerCase().startsWith(parts[0]) && forename.toLowerCase().startsWith(parts[1]) || (allowAddressSearch && address.toLowerCase().includes(q));
		}
		else {
			return surname.toLowerCase().startsWith(q);
		}
	}

	return people
		.filter((p) => matches(p.id || (p.surname + ', ' + p.forename), p.surname || '', p.forename || '', p.lastKnownAddress || ''))
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
        
        columnSpacing: 2,
        columnWidth: [15, 15, 10, 12, 15, 30],
        columns: ['Surname', 'Forename', 'Date', 'Status', 'Classifier', 'Address']
    });

    const results = runSearch(query);
    const formattedResults = results.map(p => {
        return [p?.surname?.toUpperCase() || '', p?.forename?.toUpperCase() || '', p?.dateOfBirth || '-', p?.status || 'Unknown', p?.classifier || '', p?.lastKnownAddress || 'Unknown'];
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


	
	const closeScreen = () => {
		screen.remove(searchResultsTable);

		showSearchScreen();

		screen.render();
	};

	searchResultsTable.key(['escape'], closeScreen);
	searchResultsTable.key(['/'], closeScreen);
	searchResultsTable.rows.key(['escape'], closeScreen);
	searchResultsTable.rows.key(['/'], closeScreen);
}

function showDetails(record) {
	detailsBox = blessed.box({
		top: 'center',
		left: 'center',
		width: '60%',
		height: '80%',
		border: { type: 'line' },
		tags: true,
		label: ' Record Content ',
		scrollable: true,
		alwaysScroll: true,
		content: renderRecordText(record),
		scrollbar: {
			style: {
				bg: 'yellow'
			}
		},
		keys: true,
		vi: true
	});

	screen.append(detailsBox);

	// Create a box for the dummy menu bar at the top
	const menuBar = blessed.box({
		top: 1,
		left: 0,
		width: '100%',
		height: 1,
		content: '{underline}E{/}vent Log    {underline}L{/}inked Records',
		tags: true,
		style: {
			fg: 'black',
			bg: 'yellow',
			bold: true,
		},
	});
	screen.append(menuBar);


	detailsBox.key(['escape'], () => {
		screen.remove(menuBar);
		screen.remove(detailsBox);
		searchResultsTable.focus();

		screen.render();
	});

	detailsBox.key(['l'], () => {
		if (record.related !== undefined) {
			showLinkedRecords(record, () => {
				screen.remove(menuBar);
				screen.remove(detailsBox);
			});
		} else {
			showErrorBox('No Linked Records Found', 'No record links were found');
		}
	});


	detailsBox.key(['e'], () => {
		if (record.events !== undefined) {
			showEventLog(record, () => {
				screen.remove(menuBar);
				screen.remove(detailsBox);
			});
		}
		else {
			showErrorBox('No Events Found', 'No relevant events were found');
		}
	});

	detailsBox.focus();
	screen.render();
}

function showEventLog(record, cleanupFunc) {
	const table = contrib.table({
		top: 'center',
		left: 'center',
		width: '80%',
		height: '60%',
		border: { type: 'line' },
		label: ' Event Log ',
		keys: true,
		tags: true,
		columnSpacing: 2,
		columnWidth: [14, 15, 60],
		columns: ['Event ID', 'User', 'Comment']
	});

	const formattedResults = record.events.map(e => {
		return [e.id || '-', e.user || '-', e.event || '-'];
	});

	table.setData({
		headers: ['Event ID', 'User', 'Comment'],
		data: formattedResults
	});

	const closeScreen = () => {
		screen.remove(table);

		try {
			if (cleanupFunc !== undefined)
				cleanupFunc();
		}
		catch (e) {
			console.error(e);
		}

		showDetails(record);

		screen.render();
	};

	table.key(['escape'], closeScreen);
	table.rows.key(['escape'], closeScreen);

	screen.append(table);
	table.focus();
	screen.render();
}

function showLinkedRecords(record, cleanupFunc) {
	const list = blessed.list({
		top: 'center',
		left: 'center',
		width: '50%',
		height: '40%',
		keys: true,
		tags: true,
		border: { type: 'line' },
		label: ' Linked Records ',
		items: Array.from(record.related).map(term => {
			let caption = term;

			if (term.includes('|'))
				caption = term.split('|')[1];

			return runSearch(term).length === 0 ? `{red-fg}${caption}{/}` : `{green-fg}${caption}{/}`
		}),
		interactive: true,
		scrollable: true,
		style: {
			selected: { bg: 'blue' },
			item: { hover: { bg: 'green' } }
		}
	});

	const closeScreen = () => {
		// Go directly to result
		screen.remove(list);

		try {
			if (cleanupFunc !== undefined)
				cleanupFunc();
		}
		catch (e) {
			console.error(e);
		}

		screen.render();
	};

	// Handle enter key (on screen)
	list.key(['enter'], () => {
		const term = record.related[list.selected];
		const sterm = term.includes('|') ? term.split('|')[0] : term;
		const results = runSearch(sterm);
		const count = results.length;

		if (count === 0) {
			// Just tell the user there are no results
			const displayterm = term.includes('|') ? term.split('|')[1] : term;
			showErrorBox('Unavailable', `Linked record unavailable:\n${displayterm}`);
		}
		else if (count === 1) {
			// Go directly to result
			closeScreen();

			showDetails(results[0]);

			screen.render();
		} else {
			// Issue search
			closeScreen();

			showSearchResultsScreen(sterm);

			screen.render();
		}
	});

	list.key(['escape'], () => {
		closeScreen();

		showDetails(record);

		screen.render();
	});

	screen.append(list);
	list.focus();
	screen.render();
}

function renderRecordText(record) {
	let content = '';

	if ('warning' in record) {
		content = `{red-bg}{white-fg}{bold}NOTE{/bold} ${record.warning}{/white-fg}{/red-bg}`;
		content += "\n\n";
	}

	// Optional warning for 'legacy records' for deep history if you want players to have to go hunting in a physical archive
	if (cutoffDateWarning != null && record.suppressLegacyWarning !== true) {
		let dod = record.dateOfDeath || null;
		const cutoff = cutoffDateWarning;
	
		if (record.dateOfBirth < cutoff) {
			if (dod == null || dod < cutoff) {
				content += '{blue-bg}{white-fg}{bold}Legacy Record{/bold} Consult physical original{/white-fg}{/blue-bg}';
				content += "\n\n";
			}
		}
	}

	content += `Surname: ${record.surname}\nForename: ${record.forename}\nAliases: N/A\nRecord Type: ${record.type || 'Unknown'}\nRecord Classifiers: ${record.classifier || 'N/A'}\nBorn: ${record.dateOfBirth}\nDied: ${record.dateOfDeath || 'N/A'}\nStatus: ${record.status || 'N/A'}\nLast Known Address: ${record.lastKnownAddress || 'N/A'}\n`;
	
	if (record.nationality || record.type === 'Individual')
		content += `Nationality: ${record.nationality || 'USA'}\n`;
	
	content += `\n\nNotes:\n${record.notes || 'None'}`;

	content += '\n\n';

	if (record.related !== undefined) {
		content += `${record.related.length} Linked Records Found. Press <L> to view\n`;
	}

	if (record.events !== undefined) {
		content += `Press <E> to view ${record.events.length} events\n`;
	}

	return content;
}

createMainMenu();
screen.key(['C-c'], () => process.exit(0));
