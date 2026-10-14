# Warehouse Cockpit

A freestyle SAPUI5 cockpit for the floor of warehouse **HM01 – Zürich Distribution Centre** (Helvetia Motion AG). It shows a live floor map, the open work, and a pick-wave workflow: choose outbound deliveries, check the preview, release the wave and watch the pickers run it.

The data is fictional and lives in the browser. A message strip says so. Reloading the page restores the seeded morning, including anything you released or resolved.

SAPUI5 **1.136**, Horizon theme, UI5 CLI. The same shape as the other MindTek showcase apps.

## Run locally

```bash
npm install
npm start
```

Opens [http://localhost:8086/index.html](http://localhost:8086/index.html).

```bash
npm test
npm run screenshots
```

`npm test` serves the app on port 8096 and runs the QUnit engine tests and the OPA wave-release journey. `npm run screenshots` needs the app already running on port 8086 and writes PNGs to `screenshots/`.

Useful query parameters, for a reproducible page:

| Parameter | Effect |
| --- | --- |
| `wc-paused=true` | Start with the simulation paused |
| `wc-speed=1` \| `5` \| `10` | Initial clock speed |
| `wc-exceptions=0` … `1` | Chance that a pick is short or the bin is blocked |
| `wc-seed=20261013` | Seed for the sample day |

## What you can do

- Switch the warehouse (only HM01 is open), pause the morning, and run the clock at 1×, 5× or 10×.
- Read the tiles: open picks, picks per hour, dock occupancy, late deliveries and bin utilisation. Each tile opens the related list, map or dialog.
- Pan the floor. Bins are coloured by fill level, docks show a truck while they are occupied, and pickers and forklifts walk their routes. Zoom, fit, and turn layers or the heat map on and off. Hover for a tooltip, click for the side panel, or use the arrow keys. **Open as list** shows the same objects in a table.
- Open a wave, a bin (with the last fortnight of stock), a dock or a worker.
- **Create wave.** Select open deliveries and a strategy (due time, zone or customer). The preview counts the tasks, the duration and the pickers, and a message list rejects an empty wave and warns about short stock. Release asks you to confirm, assigns idle pickers, and the floor, the tiles and the activity log follow the work through to completion.
- About one pick in ten is short or the bin is blocked. Resolve it from the wave or the bin: pick another bin that has the product, or skip the quantity.

On a phone the header snaps, the map shows aisles rather than every bin, and the wave list sits under the map. The detail pages take the screen. Between 600px and 1024px the side panel floats over the map.

## Publishing on the MindTek site

The Work page lives in [mindtek](https://github.com/igormuntoreanu/mindtek), not in this repository. Its GitHub Pages workflow checks out each showcase app and copies `webapp/` into the site. To show this app at `https://mindtek-ltd.com/warehouse-cockpit/`:

1. In `.github/workflows/pages.yml`, check out this repository next to the others:

```yaml
      - uses: actions/checkout@v4
        with:
          repository: igormuntoreanu/mindtek-warehouse-cockpit
          path: vendor/warehouse-cockpit
```

2. Copy it into the site output, with the other showcase folders:

```yaml
          mkdir -p dist/warehouse-cockpit
          cp -a vendor/warehouse-cockpit/webapp/. dist/warehouse-cockpit/
```

3. In `webapp/controller/Portfolio.controller.js`, point the Warehouse Cockpit tile at this app:

```javascript
					url: this._showcaseUrl(
						"http://localhost:8086/index.html",
						"https://mindtek-ltd.com/warehouse-cockpit/"
					)
```

4. In `webapp/i18n/i18n.properties` and `webapp/i18n/i18n_en.properties`, set the tile description:

```properties
portfolioFreestyleDescription=A freestyle SAPUI5 cockpit with a live warehouse floor map: plan and release pick waves and watch them run.
```

The status becomes **Live demo** once the tile has a URL. The workflow checks out the default branch, so this repository needs the app on `main` before that MindTek build will pick it up. Locally, run this app on port 8086 and the MindTek site on port 8080.

`docs/mindtek-work-page.patch` is that change, ready to apply in the mindtek repository.
