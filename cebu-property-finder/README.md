# Cebu Property Finder — GitHub Pages Demo

A no-build, static property discovery MVP designed for GitHub Pages.

## Included

- Cebu location, price, type, bedroom and keyword filters
- List and OpenStreetMap views
- Search summary, median price and price-per-square-meter indicators
- Shareable filter URLs
- CSV export
- Compare up to three properties
- Source name, source link and last-seen date on every card
- Configurable public JSON feeds
- Responsive mobile layout

## Important

The included listings are fictional demo records. Replace them before presenting the website as a real property discovery service.

GitHub Pages is a static host. Do not place private API keys, passwords or database credentials in this repository.

## Deploy to GitHub Pages

1. Create a new public GitHub repository.
2. Upload all files from this folder to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)` folder.
6. Save. GitHub will show the public `github.io` address after deployment.

## Run locally

Browsers often block local `fetch()` calls when opening `index.html` directly. Use a simple local server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Replace the demo data

Edit `data/listings.json`. Each record should follow this format:

```json
{
  "id": "unique-id",
  "title": "Property title",
  "location": "Barangay, City",
  "city": "Cebu City",
  "barangay": "Lahug",
  "type": "Condominium",
  "price": 6200000,
  "bedrooms": 2,
  "bathrooms": 1,
  "floorArea": 48,
  "lotArea": null,
  "latitude": 10.3306,
  "longitude": 123.9068,
  "tags": ["Near IT Park", "Amenities"],
  "sourceName": "Original provider",
  "sourceUrl": "https://provider.example/listing/123",
  "lastSeen": "2026-07-22",
  "image": "https://provider.example/image.jpg",
  "demo": false
}
```

Required fields are `title`, `location`, `city`, `type`, `price`, `latitude`, `longitude` and `lastSeen`.

## Add public JSON feeds

Open `config.js` and add one or more public feed URLs:

```js
window.CEBU_PROPERTY_CONFIG = {
  feeds: [
    "https://your-domain.example/listings.json"
  ]
};
```

The external server must permit cross-origin browser requests from your GitHub Pages site. The feed must return an array using the same listing format.

Never put a secret API key in `config.js`. For authenticated APIs, use a separate backend or scheduled process that converts approved source data into a public JSON file.

## Recommended next data workflow

1. Collect authorized feeds or manually reviewed public records.
2. Normalize them into the listing JSON format.
3. Publish the generated JSON file to this repository or a CORS-enabled storage service.
4. Keep source links and `lastSeen` dates visible.
5. Mark unverified or stale data clearly.

## Third-party services

The map uses Leaflet and OpenStreetMap tiles from public CDNs. The demo images are externally hosted sample images. Replace them with images you are allowed to use in production.
