# Bibo & Bobi: Save Point — development agreement

This is a shared personal site for 斯婕 and 真真 (Bibo and Bobi). Preserve the choices below when changing the site. This file records the agreed product and visual direction; inspect the current code before changing implementation details. If a new user request changes a rule, follow the newer request and update this file.

## Working agreement

- Work in this repository and keep changes reviewable. Do not push to GitHub without the user's explicit approval for that push. A prior approval for another push does not carry forward.
- Do not commit personal records, photos, GitHub tokens, credentials, or generated private-data backups to this public website repository. The private data repository is separate.
- Keep GitHub Pages paths relative to the repository root. When deployable shell files change, update the service-worker version in `sw.js` so devices receive the new shell.
- Run `node --test tests/*.test.cjs` for behavior changes and check relevant interactions and narrow/mobile layouts for UI changes. Do not claim browser or device verification unless it was actually done.

## Identity and copy

- Site name: **Bibo & Bobi: Save Point**. The top name bar says **Bibo & Bobi**. The home title says **Bibo & Bobi**, with **双人存档点 · SAVE POINT** below. The footer label is centered and says **bibo&bobi 2026**.
- Use **斯婕** and **真真** as the Chinese names. In the player card, the visible names are **bibo** and **bobi**; **宝宝一** and **宝宝二** belong in small bubbles on the avatars, not beside the names.
- English is the main interface language, with natural Chinese where it belongs. Keep both languages on one page; do not add a language toggle or mechanically translate every line. Keep Chinese names in Chinese.
- Avoid generic romantic slogans and filler copy, including lines such as “日子慢慢过，回忆慢慢攒”. Keep labels useful, personal, and concise.

## Structure and behavior

- Keep one site experience for the two of them. The main tabs are Home, Diary, Todo, Wishlist, and Album. Do not reintroduce separate Trips and Together tabs or a crowded sidebar. Trips and things to do belong together on Todo.
- Home includes the shared calendar, special-day reminders, and random memory. The current daily question and achievement features may remain without crowding those primary elements.
- Put each subpage's primary add action in the same top-right toolbar position. Keep the diary New entry form folded by default, except when restoring an unfinished draft.
- Paginate long subpage lists at 20 items with a visible page-number navigation. Keep the footer at the bottom on short pages.
- Calendar entries have categories. Keep Apple Calendar `.ics` import and export by calendar category. Special days include birthdays, holidays, and anniversaries; countdowns need readable English.
- Diary editing supports changing its photos, shows **Edited** afterward, and uses the last update time as the displayed date. Show timestamps to the minute. Ask for confirmation before deleting a comment.
- Album supports named albums, photo zoom, and browsing previous/next photos. Avoid regressing touch/swipe behavior.
- Message read state is shared per person across devices so the same notification does not appear as new again after switching devices.

## Visual system

- Keep the cute, lightly colored Y2K / early desktop and game-console mood. The base palette is soft green and warm orange, with small pink, blue, or lilac accents. Maintain readable contrast and avoid replacing the whole page with a saturated neon theme.
- Keep the present button treatment and the selected/unselected tab states coherent. Use the chosen **C** style for small windows: one neutral Paint-like frame, restrained color accents, and the blue-purple CD at the left of window title bars. Avoid unrelated colored borders around every window.
- Use the clover-sky art in the top name bar with one shooting-star icon. The footer uses the same art, cropped lower toward its greener area. Do not put 斯婕 & 真真 back into the top bar.
- Keep the dotted rabbit background tiled diagonally, with no visible seams; its pattern must not shift with the left sidebar's height. Keep the sunflower-cat artwork in the home game scene.
- Keep the home title accent white and green, without a large blurred glow or wash behind it. Effects should be small and legible. Respect reduced-motion settings.
- Wishlist notes use the existing varied blue stationery artwork. Keep each note compact, crop the complete note rather than an adjacent one, and keep all text and controls inside its usable area.

## Typography

The source of truth is `typography.css`:

| Role | Family |
| --- | --- |
| Decorative English display (site name, window chrome, game numbers) | Bibo Neon Dots (local Doto font) |
| English body, captions, metadata, form input, and dropdown content | Avenir Next with readable fallbacks |
| Tabs, buttons, small labels, and form labels | Courier New / typewriter-style fallbacks |
| Chinese text | Songti SC / STSong / SimSun with serif fallback |

Use the dotted pixel face as an accent, not for long body text. Wishlist note text stays readable and rounded through the body-font family. Do not add another font for a new widget without a clear reason.

## Relevant files

- `index.html`: page structure, bars, tabs, and script/style order
- `style.css`, `app.css`: base styles and layout; `theme-vars.css`: theme tokens
- `retro-window.css`: window frames, CD chrome, top and footer artwork
- `typography.css`, `neon-accent.css`: font roles and restrained title effects
- `app.js`: page rendering and interactions; `pagination.js`: shared 20-item pagination
- `store.js`: private data sync; `sw.js`: offline shell version and assets
- `tests/`: behavior checks

Keep visual rules in their existing layer when practical instead of adding another competing override. Verify any replacement asset's crop and mobile rendering before committing it.
