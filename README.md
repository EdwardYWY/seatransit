# seatransit

An interactive map showing how far you can go by train from any station in Malaysia and Singapore.

Inspired by [Chronotrains](https://www.chronotrains.com). The isochrone algorithm is adapted from [benjamintd/chronotrains](https://github.com/benjamintd/chronotrains) (MIT license).

## Features

- **Isochrone map** — see the area reachable within 1h, 2h, 4h, 8h, 24h, and 48h from any station
- **Multi-network** — KTM intercity, Rapid KL urban rail, and Singapore MRT
- **Station search** — find and jump to any station
- **Time slider** — adjust the time window and watch the reachable area expand
- **Static deploy** — everything is pre-computed; no server required

## Data Sources

| Network | Coverage | Source |
|---------|----------|--------|
| KTM | Peninsular Malaysia | [data.gov.my](https://api.data.gov.my/gtfs-static/ktmb) |
| Rapid KL | Klang Valley | [data.gov.my](https://api.data.gov.my/gtfs-static/prasarana) |
| Singapore MRT | Singapore | Community GTFS |

## Development

```bash
# Install dependencies
npm install

# Build data (GTFS parsing → graph → isochrones)
npm run build-data

# Build frontend
npm run build

# Preview the built site
npm run preview

# Run all at once
npm run deploy
```

## Deployment

Push to `main` — GitHub Actions builds and deploys to GitHub Pages automatically.

## License

MIT — see [LICENSE](LICENSE).
