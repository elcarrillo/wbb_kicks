# WBB Kicks

Every shoe worn in women's basketball, college and pro: signatures, player exclusives and general releases, each tied to a source.

## Why this exists

This project started because the Sabrina 1 is my favorite hoop shoe, and Sabrina's Oregon PEs are some of the best-looking shoes out there. Women's college basketball is full of heat like that, from UCLA's Jordan PEs to everything Oregon gets from Nike, and nobody was keeping track of it all in one place. So this is that place.

## How it works

The site is plain HTML, CSS and JavaScript with no build step. GitHub Pages serves it straight from this repo.

## Data

All data lives in five CSV files you can edit in any spreadsheet app or on GitHub directly.

| File | One row is | Key columns |
|---|---|---|
| `data/players.csv` | a player | `id` (e.g. `juju-watkins`), `name`, `current_team`, `league` (`WNBA` or `NCAA`), `school` |
| `data/shoes.csv` | a shoe or colorway | `id`, `brand`, `model`, `colorway`, `style_code`, `type` (`signature`, `pe` or `general`), `player_id` (whose shoe it is; blank for team PEs and general releases), `team_at_release`, `league`, `wbb_confirmed` (`yes`, or `no` if a women's team hasn't been confirmed wearing it), `release_date` (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`), `colors` (hex codes separated by `\|`), `note` |
| `data/sightings.csv` | one player wearing one shoe in one game | `id`, `date`, `player_id`, `shoe_id`, `team_at_time`, `opponent`, `league`, `photo_url`, `note` |
| `data/sources.csv` | one source backing one entry | `entry_type` (`shoe`, `sighting` or `player`), `entry_id`, `source`, `url` |
| `data/photos.csv` | one photo of a shoe | `shoe_id`, `file` (a file name in `images/`, or a full `https://` link), `credit` (who took it or owns it), `credit_url` |

Rules:
- Every shoe and sighting needs at least one row in `sources.csv`. Add as many as you have; more sources make an entry more trustworthy.
- `team_at_time` and `team_at_release` record where the player was then, so entries stay correct after transfers, drafts and trades. Update `current_team` in `players.csv` when a player moves, and add a `player` source for the move.
- Wrap a field in double quotes if it contains a comma.

## Photos

1. On GitHub, open the `images` folder, click **Add file → Upload files** and drag the photo in. This works from a phone browser too. Name it after the shoe, like `air-jordan-7-oregon-wbb-pe-1.jpg`.
2. Open `data/photos.csv`, click the pencil icon and add a line: the shoe's `id`, the file name and the credit, for example `air-jordan-7-oregon-wbb-pe,air-jordan-7-oregon-wbb-pe-1.jpg,Nike,https://www.nike.com`.

The first photo listed for a shoe is the one on its card; all of them show on the shoe's page with their credit. Keep photos under about 500 KB. On a Mac, `sips -Z 1600 photo.jpg` shrinks one in place.

Only use photos you took or have permission to use, and always fill in the credit.

## Run it locally

```
python3 -m http.server
```

Then open http://localhost:8000. Opening `index.html` directly won't load the data.
