# Blue's Shop: shopfront drawing guide

The top of the home page is one drawing by Blue of his shop. It is a picture, not a game: nothing in it moves and nothing in it is clickable, except one blank spot. Until the drawing arrives, the site shows a dashed placeholder in its place.

## The blank spot

Leave one area of the drawing empty, like a shop window with nothing in it yet. The website fills that spot with the products Blue ticks "In the shop window" in the portal. They take turns every few seconds, and clicking the spot opens the product showing. Blue changes what is in the window from the portal at any time, without touching the drawing.

## Two drawings

| | Size (pixels) | Shape | Blank spot: left, top, width, height |
|---|---|---|---|
| Computers | 2400 x 1350 | Landscape, 16:9 | 816, 459, 768, 648 |
| Phones | 1080 x 1440 | Portrait, 3:4 | 194, 518, 691, 576 |

Measured in pixels from the top left corner. The phone version is a second composition (the same shop, arranged tall), not a shrunk copy. If there is only one drawing at first, phones show the placeholder until the second is ready.

If Blue would rather put the blank spot somewhere else, draw it where he likes and send the drawing: the spot's position is one line in `assets/shopfront/zones.json`.

Supply as PNG or high quality JPG, under 2 MB each if possible, at the size above or larger in the same shape.

## Uploading

Portal, then Settings, then Shopfront drawing: one upload for computers, one for phones.
