# Parity

Parity builds fair teams for a multi-game tournament. Add your players, their ranks and the roles they can play, and it shows the fairest split.

Parity converts ranks into ELO and compares teams on overall ELO, ELO in each game, and whether every role has someone to play it. It then tries thousands of arrangements and shows the fairest one.

## Run it

Open `index.html` in a browser. Nothing to install.

## Test it

```bash
node --test test
```

## Files

- `core.js` turns ranks into ELO, fills roles and balances teams
- `app.js` is the page
- `copy.js` holds every word shown on the page, `text.js` fills in its values
- `style.css` is the look, `banner.jpg` is the picture at the top
