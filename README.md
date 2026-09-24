# Our Little Corner

Retro shared calendar, diary, album, to-do list and wishlist.

Website: https://redpanda0614.github.io/our-corner/

This repository contains only the website code and decorative assets. Personal records and uploaded photos are stored separately in a private repository. A fine-grained GitHub token with Contents read/write access to that data repository is required to open the app; do not put tokens or personal records in this repository.

GitHub Pages deploys the `main` branch from the repository root. All asset paths are relative so the site works under `/our-corner/`. Increment the version suffix in `sw.js` when deploying changes.

## Data behavior

Changes are queued locally and saved through the GitHub Contents API. The app polls for updates approximately every 20 seconds while open, and replays queued operations after a conflicting save. If both people edit the same field, the later save wins. Check the sync indicator before closing the page.

Fonts and the calendar parser include their respective licenses in `assets/`. Decorative artwork is not granted a redistribution license by this repository.
