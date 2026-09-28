# Bibo & Bobi: Save Point

Retro shared calendar, diary, album, to-do list, wishlist and a daily question for the two of us.

Website: https://redpanda0614.github.io/our-corner/

Design and development agreement: [AGENTS.md](AGENTS.md).

This repository contains only the website code and decorative assets. Personal records and uploaded photos are stored separately in a private repository. A fine-grained GitHub token with Contents read/write access to that data repository is required to open the app; do not put tokens or personal records in this repository.

GitHub Pages deploys the `main` branch from the repository root. All asset paths are relative so the site works under `/our-corner/`. Increment the version suffix in `sw.js` when deploying changes.

## Data behavior

The data repository keeps the records in `data/` as gzip-compressed JSON: `main.json.gz` (all collections and shared settings), `imported.json.gz` (events imported from a calendar file) and one file per person (`sijie.json.gz`, `zhenzhen.json.gz`) with that person's own settings and message read receipts. Photos stay in `photos/`. The app compresses with the browser's built-in CompressionStream, so it needs Safari 16.4 or newer on iPhone; an older browser shows an error and saves nothing.

Changes are queued locally and saved through the GitHub Contents API, each file on its own, so marking messages read uploads only a small person file. The app polls for updates approximately every 20 seconds while open (one listing of `data/`, which costs nothing when unchanged), and replays queued operations after a conflicting save. If both people edit the same field, the later save wins. Check the sync indicator before closing the page.

The old single `data.json` is left as it was when the first phone moved to the new files, and each file records which version of it it came from. While a phone still runs an older version of the app and saves to `data.json`, the updated app takes those changes in (on start and every 10 minutes). If a data file looks damaged or goes missing, the app stops saving and says so instead of overwriting it.

Readable backups: copy `tools/data-repo/.github/workflows/readable-backup.yml` to `.github/workflows/` in the data repository. Once a day it writes plain, indented copies of the data to that repository's `readable-backup` branch (`readable/everything.json`, and one file per data file), so the branch history shows what changed. Every backup from the last 14 days is kept; older ones are thinned to one per two weeks. To put a file back, gzip the copy and upload it to `data/`.

Fonts and the calendar parser include their respective licenses in `assets/`. Decorative artwork is not granted a redistribution license by this repository.
