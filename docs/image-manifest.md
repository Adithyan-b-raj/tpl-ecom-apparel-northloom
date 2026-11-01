# NORTHLOOM image manifest
Brand: NORTHLOOM - everyday linen & organic-cotton basics for men and women, made in India. Calm, editorial, warm-neutral.
Palette: sand #E9E1D3, clay #B8876B, sage #9AA58B, ink #1B1A17, off-white #F7F4EE.

## Global style brief (apply to EVERY image)
- Natural soft daylight, warm neutral studio or simple real-life setting (Kerala/Kochi light, whitewashed walls, wood, plants). Shallow depth of field, editorial fashion-catalogue look (COS / Everlane / Uniqlo U feel).
- Indian models, natural poses, relaxed expressions. Mix of men and women as stated.
- NO visible text, logos, watermarks, brand names or labels anywhere in the image. Plain clothing without prints.
- Realistic fabric texture (linen creases, cotton weave). No distorted hands/faces: re-generate if anatomy is off.
- Product images: 4:5 portrait. Hero: 16:9 landscape. Collection tiles: 4:5. Lookbook: mixed (stated). Output JPG, 1200px on the long edge min, then compress to <=300KB each (use Python PIL or Pillow if available).
- Save to the exact path given. Do not rename.

## Group A (editorial + hero products) -> public/img/editorial/ and public/img/products/
| file | ratio | prompt |
|---|---|---|
| editorial/hero-1.jpg | 16:9 | Wide editorial shot, Indian woman and man walking on a sunlit whitewashed lane wearing sand linen shirt and sage linen trousers, morning light, airy negative space on the left |
| editorial/hero-2.jpg | 16:9 | Close editorial, two friends laughing on a terrace with plants, wearing off-white organic cotton tees and relaxed chinos, warm light, space on the right |
| editorial/hero-3.jpg | 16:9 | Flat-lay top view on a raw linen backdrop: folded sand linen shirt, clay tee, sage trousers, wooden hanger, dried grass, soft shadows |
| editorial/collection-women.jpg | 4:5 | Indian woman in a cotton wrap midi dress by a window, soft daylight, portrait |
| editorial/collection-men.jpg | 4:5 | Indian man in a linen shirt, rolled sleeves, leaning on a wooden table, portrait |
| editorial/collection-basics.jpg | 4:5 | Neatly stacked folded tees in clay, off-white and black on a pale wooden shelf, minimal |
| editorial/collection-new.jpg | 4:5 | Model from behind adjusting a brushed cotton overshirt, textured wall, golden hour |
| editorial/lookbook-1.jpg | 3:2 | Lookbook: man and woman sharing chai on a veranda, linen layers, candid |
| editorial/lookbook-2.jpg | 4:5 | Lookbook: woman in drawstring linen trousers and ribbed tank on steps, plants |
| editorial/lookbook-3.jpg | 4:5 | Lookbook: man in french terry hoodie and linen shorts at a quiet beach edge |
| editorial/lookbook-4.jpg | 3:2 | Lookbook: detail of hands buttoning a linen shirt cuff, shallow focus |
| editorial/story-1.jpg | 3:2 | Weaving loom / handloom textile close-up in warm light, no people faces |
| editorial/story-2.jpg | 3:2 | Tailor's table with pattern paper, chalk, scissors and linen fabric, overhead, warm light |
| editorial/fabric-linen.jpg | 1:1 | Macro texture of sand-coloured European flax linen weave |
| editorial/fabric-cotton.jpg | 1:1 | Macro texture of off-white organic cotton jersey knit |
| editorial/fabric-terry.jpg | 1:1 | Macro texture of grey-sage french terry loopback |
| products/linen-shirt-1.jpg | 4:5 | Man in sand linen shirt, front, white seamless studio, full body to mid-thigh |
| products/linen-shirt-2.jpg | 4:5 | Detail: linen shirt collar and button placket close-up, sand colour |
| products/linen-shirt-sage.jpg | 4:5 | Same style man in SAGE linen shirt, front, same studio |
| products/linen-shirt-white.jpg | 4:5 | Same style man in WHITE linen shirt, front, same studio |
| products/organic-tee-1.jpg | 4:5 | Woman in heavyweight off-white organic cotton tee, front, studio |
| products/organic-tee-2.jpg | 4:5 | Detail: tee neckline ribbing and fabric weight, off-white |
| products/organic-tee-black.jpg | 4:5 | Woman in BLACK heavyweight tee, front, same studio |
| products/organic-tee-clay.jpg | 4:5 | Woman in CLAY (terracotta) heavyweight tee, front, same studio |

## Group B (remaining products) -> public/img/products/   (each: -1 = on model front, -2 = detail or flat-lay)
| slug | description |
|---|---|
| pique-polo | Man, forest-green piqué knit polo (-2: collar and placket texture) |
| pleated-chino | Man, relaxed pleated stone-coloured chino trousers, full length (-2: pleat and waistband detail) |
| linen-trouser | Woman, drawstring linen trousers in sage, full length (-2: drawstring waist detail) |
| wrap-midi-dress | Woman, cotton wrap midi dress in clay/terracotta, three-quarter length (-2: tie waist detail) |
| kurta-shirt | Man, short kurta-style shirt in off-white cotton with mandarin collar, no embroidery (-2: collar close-up) |
| overshirt | Man, brushed cotton overshirt in dark olive worn open over tee (-2: chest pocket and stitching) |
| oversized-hoodie | Woman, french terry hoodie in warm grey, oversized fit (-2: hood and cuff detail) |
| linen-shorts | Man, linen blend shorts in navy, mid-thigh (-2: pocket and hem detail) |
| ribbed-tank | Woman, ribbed cotton tank top in off-white (-2: ribbed texture) |
| canvas-tote | Flat or hanging canvas tote bag in natural cotton on a wall hook, no print (-2: handle stitching close-up) |
File names: products/<slug>-1.jpg and products/<slug>-2.jpg (20 images). Same white seamless studio and lighting as Group A product shots.
