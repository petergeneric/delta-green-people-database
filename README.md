Delta Green People Database
===========================

First, run the following to get the dependencies:

```
npm install
```

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
			"notes": "Optional notes section",
			"related": [ "Optional related record text" ]
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
- status will default to "Alive" or "Deceased" based on presence of dateOfDeath
- If "suppressLegacyWarning" is set to true, a record with dates prior to a given cutoff (1960-01-01 by default) will not have a physical record warning presented


Optional Feature: Conditional Records
-------------------------------------

The `gameStage` property can be used to control whether records are visible at a given stage of the game. To use it, each record may also have the following keys:

 - `notBefore`: an integer that defines the `gameStage` at which this record will appear
 - `notAfter`: an integer that defines the `gameStage` after which this record will not appear

Then simply edit the `gameStage` property as appropriate as the game progresses.


Optional Feature: Putting Your Players In The Database
-------------------------------------------------------

You can add another file, `players.json` (that won't be committed) and put the real details of your players in.
Here's an example of what that file would look like for a single player:

```
[
  {
    "surname": "PlayerSurname",
    "forename": "PlayerForename",
    "classifier": "P",
    "dateOfBirth": "2000-01-01",
    "nationality": "...",
    "warning": "{yellow-bg}{blue-fg}STOP PLAYING NOW YOU AREN'T SAFE{/}{/}",
    "status": "Playing",
    "lastKnownAddress": "Behind Your Eyes, Can't You Smell It?",
    "notes": "{yellow-fg}<<Take 1D10 of Sanity Damage>>{/}"
  }
]
```
