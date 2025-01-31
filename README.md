Delta Green People Database
===========================

Populate a `people.json` file with the following format:

```
{
	"gameStage": 1,
	"records": [
		{
			"surname": "Doe",
			"forename": "Jane",
			"classifier": "I",
			"dateOfBirth": "1980-01-01",
			"nationality": "USA",
			"status": "Alive",
			"lastKnownAddress": "1 Main Street",
			"notes": "Optional notes section"
		},
	...
	]
}
```

Then, simply run the program:

```
npm start
```

Optional Record Fields
----------------------

- Nationality will default to "USA"
- dateOfDeath can be specified (N.B. cannot be before dateOfBirth)


Optional Feature: Conditional Records
-------------------------------------

The `gameStage` property can be used to control whether records are visible at a given stage of the game. To use it, each record may also have the following keys:

 - `notBefore`: an integer that defines the `gameStage` at which this record will appear
 - `notAfter`: an integer that defines the `gameStage` after which this record will not appear

Then simply edit the `gameStage` property as appropriate as the game progresses.