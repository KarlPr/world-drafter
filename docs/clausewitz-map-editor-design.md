# Clausewitz Map Editor — Design Outline

Personal map-authoring tool for custom-map mods on Paradox's Clausewitz/Jomini engines. Game-agnostic core plus per-game **profiles** (plugins). First profile: Hearts of Iron IV. Second: Europa Universalis V. Single user, plain-text and bitmap outputs under version control.

The tool is meant to be the **one window on the mod**: geography, hierarchy, politics, and networks over the same canvas, switchable as map modes. What it does not edit it can still show.

## 1. Goals

- Own the entire map pipeline in one tool: from a coastline to a loadable map folder for the target game.
- Work **top-down**: draw the largest regions with intent, then cut smaller ones into them, down to the game's atomic map unit. Existing tools are bottom-up; this inverts it.
- Every layer either **derives from the layers beneath it or constrains them**, unless the user explicitly overrides. Inference proposes, the user disposes.
- Export files the game accepts on the first try. A validator that encodes each game's map rules *before* export is the core productivity win.
- Keep the game-specific knowledge in profiles, so the core never learns what a "state" is.
- Show as much of the mod as possible in one place: every layer the tool knows is a map mode; files it does not own can be read and overlaid.
- Everything exported is diffable and lives in git. No `_final_v2` anywhere.

### Non-goals

- Focus trees, events, decisions, missions (well served by existing tools; mostly text).
- Country content beyond what a tag needs to load: ideology detail, technologies, national spirits, OOBs, characters. Those stay text in the mod folder (Section 8.2 draws the line).
- Real-world map import from GIS.
- Multi-user collaboration.
- Supporting every Paradox game on day one. Profiles are added when a real mod needs them.

## 2. Stack

- **UI:** React + Vite. React owns panels, toolbars, layer list, inspector. It does **not** own pixels.
- **Canvas:** imperative. Layers are typed arrays (`Uint8Array` / `Uint16Array` / `Uint32Array`) at full map resolution; rendering draws a viewport of them via `ImageData`. Zoom/pan is a transform, never a resample of the data.
- **File access:** Chromium File System Access API (directory handle to the mod folder) for v1. Promote to **Electron** only if a real wall appears (native dialogs, Firefox, "feels like an app").
- **3D preview:** three.js `PlaneGeometry` with a vertex shader displacing by the heightmap texture. Coarse mesh, full-res textures.
- **Undo:** ring buffer of layer snapshots (per layer, bounded).
- **Persistence:** a project file (JSON) alongside the mod folder holding the active profile id, layer metadata, overrides, and tool settings; the bitmaps themselves are the exported files.
- **Profiles:** separate packages loaded at project creation through one interface (Section 3.3). The core has no game-specific imports.

## 3. Data Model

Core principle: **IDs, not colors.** Second principle: **the hierarchy is data, not code.**

Vocabulary used in the rest of this document: the core calls every level of the hierarchy a **region**. Level 0 is the **base region** — the thing that gets a unique color in the province bitmap. Profiles supply the game's names (province, barony, location, state, duchy…); the UI shows those names, the code never does.

### 3.1 Region hierarchy (N levels)

The core stores an ordered list of region levels, declared by the active profile. Each higher level groups the one below it. Every level is a mapping `id(level n) → id(level n+1)` plus a per-level metadata schema.

| Game | Level 0 | Level 1 | Level 2 | Level 3 | Level 4 |
|---|---|---|---|---|---|
| HOI4 | province | state | strategic region | — | — |
| EU4 | province | area | region | superregion | continent |
| CK3 | barony | county | duchy | kingdom | empire |
| EU5 | location | province | area | region | superregion |
| Vic3 | province | state region | strategic region | — | — |

The tools are written once against "level n contains level n−1": draw the top level with intent, then cut each level into the one below it. Sea regions are the same hierarchy over the water mask (HOI4 sea provinces → strategic regions; EU4 sea provinces → sea areas → sea regions).

### 3.2 Raster layers

| Layer | Storage | Notes |
|---|---|---|
| Land mask | `Uint8Array` (0 sea / 1 land) | **Drawn in-tool** with coastline tools. Source of truth for coastlines. Optional import from an external render (threshold on water color) as a starting point. |
| Reference overlays | list of images | External renders (Wonderdraft, Azgaar, sketches, scans) shown as tracing layers: opacity, scale, offset, rotation, lock. Never written to any export. |
| Heightmap | `Uint8Array` or `Uint16Array` | Bit depth and sea-level convention set by the profile (8-bit BMP for HOI4/EU4; 16-bit PNG for Jomini games). Land pixels locked ≥ threshold, sea pixels locked < threshold, from the mask. |
| Rivers | polylines + rasterized layer | Palette semantics (source / flow / merge / width codes) set by the profile. |
| Biome / climate | `Uint8Array` | Painted low-effort layer used by terrain inference. Profile supplies the terrain vocabulary. |
| Base regions (level 0) | `Uint32Array` (ID per pixel) | Created by **cutting** inside a selected parent region. Colors derived deterministically from ID at export. Base regions cannot cross parent boundaries by construction. |
| Higher levels | `id → parent id` maps | One per level above 0. |
| Special sites | list | Profile-defined tags on regions: VP cities, forts, supply hubs, ports, portal sites, holy sites, trade nodes, etc. |

Metadata for every level is attached to its ID, so the same object that draws a region also writes its definition/history file. Metadata schemas come from the profile (e.g. HOI4 state: category, resources, buildings, owner, `local_supplies`; EU4 province: owner, culture, religion, trade goods; CK3 barony: holding type).

Non-raster layers — attribute layers (owner, culture, …), registries (countries, cultures, …), and network layers (railways, trade routes) — are defined in Section 8. They are `id → value` maps over a hierarchy level, not pixels.

### 3.3 Profiles (per-game plugins)

A profile is a plain module the core loads at project creation. It declares everything game-specific; the core provides everything else. A profile must not contain UI — only declarations, schemas, rules, and I/O. The inspector, validator panel, map-mode list, and export dialog are generated from the profile's declarations.

```
profile = {
  id, name, engineFamily ("clausewitz" | "jomini"),
  map: { defaultSize, sizeConstraints, seaLevel, heightmapFormat, provinceBitmapFormat },
  hierarchy: [ { level, name, plural, metadataSchema, fileWriter, fileReader }, ... ],
  terrain: { vocabulary, inferenceDefaults, textureFormat, palette },
  rivers: { format, palette, codes },
  specialSites: [ { tag, appliesToLevel, schema } ],
  adjacency: { specialAdjacencyFormat, throughProvinceRequired },
  registries: [ { id, schema, files } ],            // countries, cultures, religions... (Section 8)
  attributes: [ { id, level, registry, multi } ],   // owner, cores, culture...     (Section 8)
  networks: [ { id, level, schema, file } ],        // railways, supply nodes...    (Section 8.4)
  startDates: [ date ],                              // v1: exactly one
  validation: [ rule, rule, ... ],   // rules read the core model, return findings
  export: { writers by file },        // one writer per output file
  import: { readers by file },        // includes read-only readers for map modes (Section 9)
  paths: { mapFolder, historyFolder, commonFolder, localisationFolder, gfxFolder }
}
```

Profiles ship as separate packages (`profile-hoi4`, `profile-eu5`, ...). Third-party profiles are the plugin story: the interface is the contract, the core never imports a profile directly. A project is bound to one profile at creation; there is no profile switching, because the hierarchies are not translatable.

The core ships shared I/O helpers so profiles stay thin: indexed/24-bit BMP writer, 8/16-bit PNG writer, TGA writer (flags), CSV, YAML localisation, and a Paradox-script serializer/parser (`key = { ... }` blocks). A profile's writer is mostly "which fields, in which file, in which order."

### Known profile deltas (why this can't be hard-coded)

| Concern | HOI4 / EU4 (Clausewitz) | CK3 / Vic3 / EU5 (Jomini) |
|---|---|---|
| Province bitmap | `provinces.bmp` (24-bit BMP) + `definition.csv` | `provinces.png` + `definition.csv` (CK3) / game-specific |
| Heightmap | 8-bit `heightmap.bmp` | 16-bit `heightmap.png` + packed height tiles |
| Rivers | indexed `rivers.bmp` with code palette | `rivers.png`, different palette |
| Hierarchy files | states / areas / regions txt | `landed_titles` (CK3), `state_regions` (Vic3), locations→provinces (EU5) |
| Special adjacency | `adjacencies.csv` with through-province | game-specific |
| Terrain | `terrain.bmp` + per-province terrain field | mask-based terrain layers (Jomini) |
| Ownership | state-level (HOI4) / province-level dated (EU4) | province lists per state per country (Vic3) / title holders (CK3) |
| Size rules | e.g. HOI4 wants dimensions divisible by 256 | game-specific |

The core stays identical across all of these; only the profile's writers, readers, palettes, and rules differ. A new game = a new profile, not a new tool.

## 4. Layer Pipeline

```
mask → heightmap → rivers → biome → top-level regions → … → base regions → politics → networks → export
```

Each stage produces something the game can load. The tool is "done" when the mod has a map, not when the editor is complete. The stages below use HOI4 vocabulary (state, province, strategic region) as the worked example; the profile supplies the real names and file formats.

### 4.1 Mask (drawn)
- **Coastline tools:** land/sea brush with size and falloff, polygon fill, lasso, a "coast smoother" that rounds pixel-stair edges, island stamp, lake fill (enclosed sea inside land, flagged separately for the base-region/sea-region pass).
- **Noise-edge option:** apply controlled noise along a drawn coastline for natural-looking fractal edges, with a seed so it is reproducible.
- **Reference overlays:** load any image as a tracing layer — Wonderdraft renders, Azgaar exports, hand sketches, old scans. Per-overlay opacity, scale, offset, rotation, and lock. Multiple overlays allowed (e.g. a Wonderdraft world plus a sketched mountain plan). Overlays are project metadata only; nothing from them is exported.
- **Import as starting point:** threshold an overlay's water color to seed the mask, then edit. Import is a convenience, not a dependency.
- **Georeference the canvas:** the map's pixel size and aspect are set here, checked against the profile's size constraints; overlays are fitted to it, not the other way round.
- Exports nothing directly; constrains everything above it.

### 4.2 Heightmap
- **Generators:** distance-from-coast base (interior = higher), noise layer, per-region "mountain influence" painted at low res.
- **Brushes:** raise/lower with falloff radius, ridge (draw a range along a stroke), smooth, flatten-to-sea, terrace.
- **Erosion pass:** thermal (realistic slopes) + hydraulic (carves valleys). Hydraulic erosion output also yields **suggested river channels**.
- **Coastline lock:** land ≥ sea threshold, sea < threshold, always. Threshold and bit depth from the profile.
- Live 3D preview with exaggeration slider (2–3× to catch spikes, sub-sea coastlines, accidental plateaus).
- Derived: normal map from the same data, in whatever form the profile asks for (`world_normal.bmp` for HOI4).

### 4.3 Rivers
- Polyline tool; rasterized to the profile's palette with correct source/flow/merge/width codes.
- "Suggest from terrain" using erosion drainage paths; user edits or accepts.
- Validator (core): rivers must flow downhill, no orphan segments. Validator (profile): code semantics.

### 4.4 Biome / Terrain
- Painted climate/moisture layer (five-minute job).
- **Terrain inference** per base region from: mean height, slope (gradient magnitude), **relative height vs. neighbors**, distance to coast, river density, climate band.
  - mountain: high absolute + high slope + large neighbor delta
  - hills: moderate delta / slope
  - plains: low slope at any height
  - marsh: low, flat, near water or river-dense
  - forest / jungle / desert / tundra: climate band
- The inference engine is core; the **vocabulary and thresholds** come from the profile (`terrain.vocabulary`, `terrain.inferenceDefaults`). HOI4 and EU4 have similar but not identical terrain lists; CK3 has more; EU5 splits terrain into topography + vegetation + climate, which maps to three inference outputs instead of one.
- One inference pass feeds every output the profile wants — HOI4: the `terrain` field in `definition.csv` **and** the indexed `terrain.bmp`; Jomini: per-terrain mask layers — so they never disagree.
- Overrides persist through re-inference. Overlay shows auto vs. overridden.

### 4.5 Top-level regions (drawn first)
- Polygon tool and fill brush over the land mask.
- Inspector generated from the level's `metadataSchema` (HOI4 state: name, category, resources, buildings, `local_supplies`, VP provinces; EU4 region: just a name and colour).
- Unallocated pixels inside a region shown hatched; a region is valid only when nothing is hatched.

### 4.6 Cutting down the hierarchy
Every level below the top is made by cutting inside a selected parent. For a two-level game (HOI4) this happens once; for CK3 it happens four times, with the same tools each time.
- Selecting a parent **locks everything outside it** (dimmed); only its pixels are editable.
- **Boundary pen:** draw a line across the parent (or an existing child) → the crossed area splits into two children with new IDs.
- **Fill:** click an unallocated area → new child.
- **Merge:** click two neighbors.
- **Nudge brush:** reassign pixels between adjacent children (never across the parent's border).
- **Fill remaining with N:** optional Voronoi/watershed assist for boring interiors, constrained to the parent.
- **Skip-and-group:** for deep hierarchies the user may cut base regions directly inside a high-level parent and then **group** them upward (lasso base regions → new county; lasso counties → new duchy). Cutting down and grouping up produce the same data; the tool does not care which order the user works in, as long as every level is fully assigned before export.
- Sea: base regions are generated over the water mask, then grouped into the sea hierarchy the same way.

### 4.7 Adjacency
- Ordinary adjacency is derived by the game from pixel neighbors; the tool computes the same graph for the cut tool, validation, and visualization (overlay the graph to spot bad borders at a glance).
- **Strait tool:** click two coastal base regions + the sea region between them → writes the special adjacency in the profile's format (HOI4/EU4: an `adjacencies.csv` line with the through-province). Impassable borders likewise.

## 5. Validation (pre-export)

Two rule sets, run together, reported in one panel.

**Core rules** (geometry and referential integrity; true for every Paradox map):
- No diagonal-only pixel crossings (X-crossings).
- Minimum pixel count per base region; no region pixels "spread around the world."
- Base-region contiguity.
- Every land pixel assigned at every level; every level covers the one below exactly once.
- Sea/land type consistency between mask, heightmap, and region types.
- Rivers flow downhill; no orphan segments.
- Special adjacencies reference real, coastal base regions and a valid through-region.
- Every attribute value references an existing registry entry (an `owner` that is not a defined country is an error, not a typo the game finds later).
- Network edges follow real adjacencies.

**Profile rules** (per game, from `profile.validation`), HOI4 examples:
- Coastal flag in `definition.csv` consistent with actual sea neighbors.
- Province count under the engine cap.
- State provinces contiguous (warn, don't block).
- River palette codes valid for the HOI4 palette.
- Every state has a category and at least one VP province.
- Map dimensions divisible by 256.
- Every state has an owner (warn); each country's capital is a state it owns; every tag has a country file, colour, flag, and localisation; subject overlords exist; `controller ≠ owner` only between two existing tags.
- Supply nodes sit on a province with a railway; railway chains are unbroken.

Rules are functions over the core model returning `{ severity, message, regionIds, pixel }` findings, so the panel can click-to-locate. Read the open-source HOI4PE (Rust) for the HOI4 format rules before writing that profile; the format knowledge is the expensive part and it is already paid for.

## 6. Export

All outputs generated from the ID arrays and registries by the profile's writers. Write the exporter **first** for each profile.

The core supplies: deterministic ID→RGB assignment, BMP/PNG/TGA/CSV/YAML/Paradox-script serializers, and an export transaction (write to a temp folder, validate file set, swap in, keep the previous folder as backup). The profile supplies the file list and field mapping.

**Worked example — `profile-hoi4` writers:**

| File | Format |
|---|---|
| `map/provinces.bmp` | 24-bit BMP, one unique RGB per province (derived from ID) |
| `map/definition.csv` | ID; R; G; B; type; coastal; terrain; continent |
| `map/heightmap.bmp` | 8-bit greyscale BMP |
| `map/world_normal.bmp` | derived normal map |
| `map/rivers.bmp` | 8-bit indexed BMP, HOI4 palette |
| `map/terrain.bmp` | 8-bit indexed BMP, terrain palette |
| `map/adjacencies.csv` | special adjacencies only |
| `map/railways.txt`, `map/supply_nodes.txt` | network layers (Section 8.4) |
| `map/strategicregions/*.txt` | one per level-2 region |
| `history/states/*.txt` | one per level-1 region, full metadata **including owner / cores / claims / controller** |
| `map/default.map` | sizes and references |
| country files (Section 8.2) | tag list, country definition, colours, country history, flags, localisation |

`profile-eu5` will have a different table (16-bit PNG heightmap, locations/provinces/areas hierarchy files, terrain as layered masks, ownership and pops in location history); the core code path is identical.

Hand-written BMP writer required (most JS image libraries do not produce 8-bit indexed BMPs). ~50 lines, in core.

### Import
- Load an existing mod's map folder into the ID model through the profile's readers (HOI4: parse `provinces.bmp` + `definition.csv`, states, strategic regions, country files) so the tool can also edit a map it did not create.
- The same readers serve the **read-only map modes** in Section 9: files the tool does not write can still be parsed and drawn.

## 7. 3D Preview (three.js)

- `PlaneGeometry` at reduced resolution (e.g. 512×256 for a 2048×1024 map); vertex shader samples the heightmap texture.
- Drape any map mode (political / terrain / biome) as the texture; blend rivers on top.
- Exaggeration slider. Same normals as the export.
- Doubles as a validator: spikes, sub-sea coastlines, and plateau-mountains are invisible in greyscale and obvious in relief.

## 8. Political and Attribute Layers

A country is a value painted onto regions. So is a culture, a religion, a trade good. The core has **one mechanism — categorical attribute layers —** and the profile declares which ones exist and which files they land in. The political layer is the first and most important instance.

### 8.1 Attribute layers and registries

- A **registry** is a named list of values with a schema and a colour: countries, cultures, religions, trade goods. Registries are edited in a list panel with a schema-driven inspector.
- An **attribute layer** is a map from region ID at one hierarchy level to a registry value. Single-valued (`owner`, `culture`) or multi-valued (`cores`, `claims`).
- **Paint tool** (one for all attribute layers): pick a registry value, click a region to assign it; flood-fill across contiguous regions sharing the old value; lasso; **paint by parent** (select a state, all its provinces take the value — for games with base-level ownership, so a country can be painted at state scale and then adjusted).
- Attribute values are written by the **existing per-level history writers**; the writer for that level gains fields. No new file family for ownership — the history folder is where Paradox already keeps it.

| Game | Ownership level | Expressed as | Other attribute layers |
|---|---|---|---|
| HOI4 | state | `owner`, `controller`, `add_core_of`, `add_claim_by` in `history/states` | — |
| EU4 | province | `owner`, `controller`, `add_core`, `culture`, `religion`, `trade_goods` in dated `history/provinces` | culture, religion, trade goods |
| Vic3 | province | `create_state = { country = c:TAG owned_provinces = { … } }` in `common/history/states` | (culture/religion via pops) |
| EU5 | location | owner + pops in location history (verify exact layout before building the profile) | culture, religion |
| CK3 | county | title holder = **character** in `history/titles` | culture, religion in county history |

CK3 is the outlier: "owner" is a character holding a title, which drags in characters and dynasties. The CK3 profile's political layer is out of scope until a CK3 mod exists.

### 8.2 Countries: the registry that needs files

Unlike a culture, a country must exist as several files before the game will load the tag at all. The profile declares the **minimum viable country** — which files, with which defaults — and creating a tag generates all of them. The inspector edits the fields the tool owns; everything else stays hand-edited text.

**HOI4 worked example:**

| File | Content | Default on creation |
|---|---|---|
| `common/country_tags/<mod>_countries.txt` | `TAG = "countries/Name.txt"` | — |
| `common/countries/Name.txt` | `graphical_culture`, `color` | profile default gfx culture; registry colour |
| `common/countries/colors.txt` | `TAG = { color = rgb { … } }` | registry colour |
| `history/countries/TAG - Name.txt` | `capital`, `set_politics`, `set_popularities`, `oob`, subject relations (`set_autonomy`, written into the **overlord's** file) | capital = first owned state with a VP; 100% neutrality; no OOB |
| `gfx/flags/TAG.tga` + `medium/` + `small/` | 82×52, 41×26, 10×7 | placeholder from registry colour; optional mini flag-maker (solid / bicolour / tricolour + emblem). Per-ideology flags fall back to the base flag, so only one is required. |
| `localisation/english/<mod>_countries_l_english.yml` | `TAG:0`, `TAG_ADJ:0`, `TAG_DEF:0`, per-ideology names | from registry name |

Country schema fields the tool owns: **tag, name, adjective, colour, flag, capital, graphical culture, overlord + autonomy level.** Attribute layers it owns: **owner, controller, cores, claims.**

**The line.** Ideologies and popularities, technologies, national spirits, OOBs, characters, focus trees are "just more keys in the same history file" — and that is exactly why they must not enter the inspector. The tool owns *what the map needs to load*. If a field is not needed for the tag to appear on the map with the right colour and borders, it stays in a text editor. The inspector grows only when the validator has a rule that needs the field.

### 8.3 Start dates

v1: exactly one start date per project, declared by the profile. HOI4 bookmarks and EU4/EU5 dated history blocks are v2. To keep that door open, the attribute store is `id → value` today and becomes `id → [(date, value)]` later; the paint tools always write "at the current date" and never see the difference. Writers for dated formats emit one block per date.

### 8.4 Network layers

Some map data is a graph over regions rather than a value on them. Profile-declared, drawn as polylines snapped to the adjacency graph:

- **HOI4 railways** (`map/railways.txt`: level + province chain) and **supply nodes** (`map/supply_nodes.txt`). For a logistics-driven mod these are first-class map content, not an afterthought.
- **EU4 trade nodes**: province → node membership (an attribute layer) plus outgoing routes (a network).

Tools: click-through-provinces polyline with per-segment level; node stamp on a province; validator checks edges are real adjacencies and nodes sit on the network.

### 8.5 Political validation

Core: every attribute value references a registry entry; multi-valued sets are subsets of valid IDs; network edges are adjacencies.
HOI4 profile rules are listed in Section 5: owner present, capital owned, tag files complete, overlords exist, supply nodes on rail.

## 9. Map Modes (the whole mod in one window)

Everything the tool knows is a **map mode** over the same canvas: one click switches, any mode can also be stacked as an overlay with opacity. Region labels at every level, with zoom-dependent visibility. Clicking anything opens its inspector.

| Mode | Shows |
|---|---|
| Political | owner colour per region; borders at ownership level |
| Control | controller vs owner; occupied regions hatched in the controller's colour |
| Cores / claims | for the selected country: owned, cored-but-unowned, claimed — three tints |
| Subjects | overlord colour with subject hatching; autonomy level as label |
| Hierarchy | any level, coloured and labelled; unassigned pixels hatched |
| Terrain / biome / relief | inference output, painted climate, shaded heightmap (2D); the 3D view drapes the same |
| Rivers, special sites | as drawn; site tags as icons |
| Networks | railway level as line weight; supply nodes as markers; unreachable regions tinted |
| Culture / religion / trade goods | where the profile declares them |
| Validation | findings as pins, filterable by severity and rule |
| Reference overlays | tracing images, as in 4.1 |
| Changed since export | regions whose data differs from the last exported files — cheap because export is deterministic; review before committing |

**Read-only modes.** Files the tool does not edit can still be parsed by the profile's readers and drawn: HOI4 buildings per state (as numbers), resources, division count per province from `history/units`, VP values. The rule: a read-only mode never grows into an editor unless the map needs that data to load. Showing is cheap; owning is not.

## 10. Milestones

0. **Core + profile interface.** Typed-array layer store, viewport canvas, project file, profile loader, shared serializers, map-mode switcher. `profile-hoi4` stub declaring hierarchy, map formats, registries, and attributes only. Nothing drawable yet; the point is that everything after this is written against the interface.
1. **Mask + heightmap + export.** Canvas sizing against profile constraints, coastline brush and polygon fill, one reference overlay (opacity/scale/offset), distance-base generator, one height brush, BMP writer, heightmap export. HOI4 loads a flat-province placeholder map with real coastlines and terrain.
2. **Rivers + validator v1.** River polylines, palette export via profile, downhill check (core), code check (profile).
3. **Top-level regions.** Polygon/fill tools, schema-driven inspector, `history/states` writer.
4. **Cutting.** Cut / fill / merge / nudge inside a parent; `provinces.bmp` + `definition.csv` writers; adjacency graph; validator v2.
5. **Political layer (HOI4).** Country registry, minimum-viable-country generator (tag, country file, colours, history, placeholder flags, localisation), attribute paint tool for owner/controller/cores/claims, subject field, political / control / cores map modes, political validation. The mod now has countries on the map.
6. **Networks.** Railways and supply nodes, network map mode, validator rules.
7. **Terrain inference + biome layer.** Vocabulary from profile; `terrain.bmp` and definition terrain from one pass.
8. **Second profile: `profile-eu5`.** Deliberately early. A 5-level hierarchy, 16-bit heightmap, layered terrain, location-level ownership, and culture/religion attribute layers will expose every place the core secretly assumed HOI4. Fix the core, not the profile.
9. **3D preview.** Displacement view, exaggeration slider, any map mode as texture.
10. **Erosion + river suggestion, strait tool, skip-and-group, special sites, read-only map modes, changed-since-export.**
11. **Import existing mods** (HOI4 first).

Each milestone ends with a file the game can load.

## 11. Risks

- **Yak-shave.** Tool-building can quietly replace mod-building. Mitigation: milestones end in loadable maps; build features against pain actually felt, not imagined.
- **Abstraction leak.** A "generic" core designed from one game will have HOI4 shaped into it. Mitigation: milestone 8 — build the second profile before the core hardens, and treat every `if (profile.id === ...)` in core as a bug.
- **Over-generalising.** The opposite failure: a plugin system so abstract that the first profile ships late. Mitigation: the profile interface only grows when a second real profile needs it; nothing is added for a hypothetical game.
- **Inspector creep.** The country inspector is where the tool turns into a second, worse text editor. Mitigation: the line in 8.2 — a field enters the inspector only when a validator rule needs it.
- **Format rules.** Paradox map formats are the least forgiving part of modding. Mitigation: validator first, HOI4PE's source as reference, backups on every export.
- **Performance.** Full-res typed arrays with imperative canvas are fine; putting pixels in React state is not. EU5-scale maps are large; the viewport-only render path must hold.
- **Scope of cutting.** Manual cutting scales to a few hundred base regions comfortably; the generator assist and skip-and-group cover larger maps.

## 12. Design Principles (summary)

- IDs, not colors.
- The hierarchy is data, not code. Game knowledge lives in profiles; the core never imports one.
- The tool owns every layer, coastline included; external tools are reference overlays, never data sources.
- Top level first, cut downward (or group upward — same data).
- A country is a painted value. Ownership lives in the history files the game already has.
- The tool owns what the map needs to load; everything else stays text.
- One model, many map modes: show everything, edit only what the map needs.
- Every layer derives from or constrains the ones below; overrides win and persist.
- Exporter and validator before features, per profile.
- Every milestone produces a loadable map.
- Git for the mod folder; the tool's outputs are its only artifacts.
