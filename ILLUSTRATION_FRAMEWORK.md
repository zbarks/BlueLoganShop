# Blue's Shop: illustration framework

The shopfront is one drawing by Blue, made to fit the plan below. Until it arrives, the site shows this plan as a wireframe, so the clickable areas already work.

## Two drawings

| | Size (pixels) | Shape |
|---|---|---|
| Computers | 2400 x 1350 | Landscape, 16:9 |
| Phones | 1080 x 1440 | Portrait, 3:4 |

The phone version is a second composition, not a shrunk copy: the same shop, rearranged to be tall. If there is only one drawing at first, phones keep the wireframe until the second one is ready.

Supply as PNG or high quality JPG, sRGB, under 2 MB each if possible. Draw at the size above or larger in the same shape.

## Clickable areas: computers (2400 x 1350)

Measured in pixels from the top left corner.

| Area | What it does | Left | Top | Width | Height |
|---|---|---|---|---|---|
| Shop sign | Shop name (not clickable) | 672 | 54 | 1056 | 176 |
| Things to Wear | Opens the Things to Wear category | 192 | 284 | 576 | 230 |
| Special Editions | Opens the Special Editions category | 1632 | 284 | 576 | 230 |
| In the window | Shop window: shows the products ticked "In the shop window" | 144 | 594 | 768 | 594 |
| Come in: shop all | Door: opens Shop all, swings open a little on hover | 984 | 513 | 432 | 756 |
| Objects & Oddities | Opens the Objects & Oddities category | 1488 | 594 | 768 | 189 |
| Little Treasures | Opens the Little Treasures category | 1488 | 796 | 768 | 189 |
| Paper Things | Opens the Paper Things category | 1488 | 999 | 768 | 189 |

## Clickable areas: phones (1080 x 1440)

| Area | What it does | Left | Top | Width | Height |
|---|---|---|---|---|---|
| Shop sign | Shop name (not clickable) | 108 | 43 | 864 | 130 |
| Things to Wear | Opens the Things to Wear category | 65 | 216 | 454 | 173 |
| Special Editions | Opens the Special Editions category | 562 | 216 | 454 | 173 |
| In the window | Shop window: shows the products ticked "In the shop window" | 65 | 446 | 540 | 432 |
| Come in: shop all | Door: opens Shop all, swings open a little on hover | 659 | 446 | 356 | 432 |
| Objects & Oddities | Opens the Objects & Oddities category | 65 | 936 | 950 | 130 |
| Little Treasures | Opens the Little Treasures category | 65 | 1094 | 950 | 130 |
| Paper Things | Opens the Paper Things category | 65 | 1253 | 950 | 130 |

## Things to draw with the site in mind

- **The window.** The products Blue ticks "In the shop window" in the portal are shown inside the window area and change every few seconds. Keep the glass simple so the products read clearly.
- **The door.** On a computer it swings open a little when you point at it. For the best effect, also supply the door on its own as a separate PNG with a transparent background, the same size as the door area.
- **Shelves and upper windows.** Each one opens a category. If a category is renamed in the portal, its label updates on its own. If Blue wants different objects in different places, the areas can move: the positions live in `assets/shopfront/zones.json`.
- **Small surprises.** Separate layers (a cat in a window, a swinging sign, a flickering light) can be animated later. Supply them as separate transparent PNGs when ready.
- **Leave the shop name space clear** if Blue wants his lettering added separately, or letter it straight into the drawing.

## The rule that stays fixed

Every clickable area is also reachable from the ordinary menu and the category links, and "Shop all" is always visible at the top of every page. Nobody has to work out the drawing to buy something.

## Uploading

Portal, then Settings, then Shopfront illustration: one upload for computers, one for phones. "Use the wireframe" switches back.
