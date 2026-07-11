# seatransit

An interactive map showing approximate train reachability from stations across Malaysia, Singapore, and Thailand.

Inspired by [Chronotrains](https://www.chronotrains.com). The isochrone algorithm is adapted from [benjamintd/chronotrains](https://github.com/benjamintd/chronotrains) (MIT license).

## Features

- **Isochrone map** — see approximate rail-corridor and station-access coverage within 1h to 48h from any station
- **Multi-network** — KTM intercity, Rapid KL urban rail, Singapore MRT, and Thailand rail
- **Station search** — find and jump to any station
- **Time slider** — adjust the time window and watch the reachable area expand
- **Static deploy** — everything is pre-computed; no server required

## Data Sources

| Network | Coverage | Source |
|---------|----------|--------|
| KTM | Peninsular Malaysia | [data.gov.my](https://api.data.gov.my/gtfs-static/ktmb) |
| Rapid KL | Klang Valley | [data.gov.my](https://api.data.gov.my/gtfs-static/prasarana) |
| Singapore MRT | Singapore | Community GTFS |
| Thailand Rail | Thailand | Namtang GTFS |

Reachability uses static GTFS snapshots and modeling approximations. It is not live journey-planning data.

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
