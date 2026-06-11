# Cover Catalog & Choose-Cover Overlay — Design Spec

Date: 2026-06-12
Status: Approved direction (hosting, default-cover, and old-cover decisions confirmed by Antash)

## Goal

Replace the small backend-served cover list (26 images) with a large categorized catalog
(~130 images) sourced from the team Google Drive, and rebuild the Create/Edit Event
"Choose cover" overlay to the new Figma design: search bar, horizontal category chips,
and a 3-column image grid.

- Drive source: https://drive.google.com/drive/folders/1deHHqGMy1DlKpyGoFIHGfRbOQWQuSYO0
- Figma: https://www.figma.com/design/YzZToSdEenQCNTIV9OSRj2/WEIF-Cover?node-id=101-929
  (reference screenshot: `report/cover-picker-figma-design.png`)

## Source data model (Drive)

- Top-level folders = **categories** (Creative, Entertainment, Fitness & Wellness,
  Food & Drinks, Generic, Outdoor & Nature, Social, Sports, Travel & Adventure).
- Inside a category, folders = **tag groups**; the folder name is a slash-separated list
  of synonym tags (e.g. `Hiking / Walk / Mountains / Forest / Camping`). Single-word
  folder names (e.g. `Badminton`) are a single tag. Split on `/`, trim whitespace,
  HTML-entity-decode (`&amp;` → `&`).
- Images inside a tag folder carry all of that folder's tags.
- **Generic** holds images directly (no tag folders, no tags).
- Current inventory: 130 PNGs (~600×600, ~250 KB each).

## Decisions (confirmed)

1. **Hosting**: images are downloaded by a re-runnable sync script into
   `server/assets/covers/` and served statically, same as today. No Drive hotlinking.
2. **Default cover**: the **first category's first tag's first image**
   (category order below → Sports → Badminton → its first image).
3. **Old covers**: the 26 legacy images are deleted and their keys become invalid.
   The existing startup migration (`ensureValidEventCoverKeys`) remaps any invalid
   stored `cover_key` to the new default, so old events render the default cover.
4. **Generic covers appear in every result set**: any search (and any category filter)
   appends all Generic covers after the matching covers. A query with no tag/category
   match still shows the Generic covers — the grid is never empty.

## Category order (from the Figma canvas taxonomy)

1. Sports, 2. Fitness & Wellness, 3. Outdoor & Nature, 4. Social, 5. Entertainment,
6. Food & Drinks, 7. Travel & Adventure, 8. Creative, 9. Generic (always last,
not shown as a chip). Categories found in Drive but not in this list are appended
alphabetically before Generic. Tag groups within a category are ordered with
Badminton-first parity to the taxonomy by sorting Drive folder names alphabetically
(Sports → Badminton is first); files within a tag group sort by natural file title.

## Catalog generation (sync script)

`server/cmd/covers-sync/main.go` — standalone Go tool, no Drive API key required:

- Enumerates the public Drive folder tree via the
  `https://drive.google.com/embeddedfolderview?id=<folder>#list` endpoint and
  downloads files via `https://drive.google.com/uc?export=download&id=<file>`.
- Writes images to `server/assets/covers/<key>.png`.
- Generates `server/covers_catalog.json` (committed, embedded via `go:embed`):

```json
{
  "categories": [
    { "key": "sports", "label": "Sports" }
  ],
  "covers": [
    {
      "key": "sports-badminton-1",
      "label": "Badminton",
      "file_name": "sports-badminton-1.png",
      "category": "sports",
      "tags": ["Badminton"]
    }
  ]
}
```

- Keys are deterministic slugs: `<category>-<first-tag>-<index>` (`generic-<index>`
  for Generic), index 1-based within the tag group ordered by source file title.
  Re-running the script with unchanged Drive contents is a no-op.
- The script deletes catalog-managed files that no longer exist in Drive; legacy
  pre-catalog PNGs are removed in this change.

## Backend changes (Go)

- `cover_catalog.go`: load the embedded JSON instead of the hardcoded array.
  `CoverOption` gains `Category` and `Tags []string` (JSON `category`, `tags`).
  `defaultCoverKey` becomes a function: first cover of the first category.
- `GET /api/covers` returns the ordered catalog plus categories:
  `{ "data": [CoverOption...], "categories": [{key,label}...] }` — a
  backward-compatible superset of the current `{ "data": [...] }`.
- `isValidCoverKey`/`normalizeCoverKey` validate against the new catalog; the
  existing `ensureValidEventCoverKeys` startup migration remaps stale keys to the
  new default. DB schema default (`'badminton'`) is updated to the new default key.
- No new endpoints; search is client-side (130 items).

## Frontend changes (React Native)

Data layer:

- `src/constants/covers.ts`: `CoverOption` gains `category` and `tags`;
  `ApiCoverOption` mirrors the API; add `CoverCategory {key,label}`.
  `DEFAULT_COVER_KEY` mirrors the backend default (`sports-badminton-1`) with a
  runtime fallback to the first catalog cover if the key is missing.
- `CoversContext`: also parse/expose `categories` (ordered). Existing
  `resolveCover`/`getCoverSource` behavior unchanged.
- New pure helper `searchCovers(covers, {query, categoryKey})` (in
  `src/utils/coverSearch.ts`): case-insensitive substring match of the query against
  tag segments and category labels; returns matches followed by all Generic covers
  (deduped). With only a category selected: that category's covers + Generic.
  With neither: all covers in catalog order.

UI (matches Figma frame 101-929):

- Rebuild `CoverPickerContent` (used by `CreateEventSheetContent` case `'cover'`,
  staying on the shared `CreateEventBottomSheet`/`BottomSheetModal` system):
  - Title "Choose cover" with the sheet's close affordance.
  - Pill search input (magnifier icon, "Search" placeholder, theme tokens).
  - Horizontally scrollable category chips (no Generic chip); tapping toggles the
    chip; typing a query clears the chip selection and chips clear the query.
  - 3-column grid (FlatList, windowed) of rounded-corner images (~3:2 aspect),
    keeping the existing selected ring + check badge and selection haptics.
- Keyboard: verify the search input stays visible while typing inside the sheet on
  the emulator; adjust sheet keyboard avoidance for the cover sheet if needed.

## Error handling

- Sync script: fails loudly per file (no partial catalog write); catalog JSON is
  written only after all downloads succeed.
- App: covers fetch failure falls back to the bundled default option (existing
  CoversContext behavior); cover images that 404 fall back to gradients
  (`resolveCoverGradient`, existing behavior).

## Testing

- Go: catalog load/parse, default-key derivation, `normalizeCoverKey` with old keys,
  `listCovers` handler shape, migration remap.
- Jest: API mapper (`mapApiCoverOption` with category/tags), `searchCovers`
  (tag match, category match, generic-append, no-match → generic, dedupe),
  `createEventForm` default key.
- Manual: mobile smoke test of Discover/Create Event/cover overlay/search/chips/
  select/submit/My Events rendering, per CLAUDE.md validation list.

## Out of scope

- Image optimization/CDN, server-side search, cover upload by users, and any
  Drive-API-key-based sync. Old-cover visual parity for existing events
  (they intentionally remap to the new default).
