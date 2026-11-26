# Interactive plot maps — paid add-on

**Status:** recommendation for the founder to confirm. Prices are pre-filled in the console
(`lib/plots/addons.ts → ADDON_LIST_PRICE`) and can be changed per deal; nothing is charged automatically.

## What the customer gets

- Each project layout (phase) as a live, clickable map inside RE. Every plot is coloured by its real inventory
  status, with search, filters and a details card.
- A public link that buyers can open on their phones. It shows plots as available, reserved or sold. Prices appear only if the developer chooses, and buyers can Enquire on WhatsApp or by phone.
- **Done-for-you set-up:** RE’s team converts the builder's approved layout (PDF, DWG or image) into the map
  file and checks that every plot matches the inventory.

## What it costs us to deliver

| Work | When | Effort (estimate) |
|---|---|---|
| Convert blueprint → named-plot SVG, match to inventory, QA | Once per layout | 2–6 h for 100–400 plots |
| Status changes (booked, sold, hold) | Continuous | **None** — the map reads inventory live |
| Re-plotting, merged/split plots, new phase, revised approval | Occasional | 1–3 h per revision |
| Hosting, public link, support | Monthly | Low |

Unit and plot status updates are automatic: the map reads statuses straight from inventory. The monthly fee
therefore covers the occasional **drawing revision**, support and hosting, not routine status changes.

## Market reference points (public pages, November 2026; vendor claims, not verified)

- An Indian plot-booking platform lists ₹4,999/month plus a one-time ₹500 per plot.
  ([source](https://realeztate-marketing.pages.dev/))
- Two international interactive site-map products, SightMap and 3DPlans, each charge a one-time setup fee plus a
  recurring subscription per property. ([SightMap](https://engrain.com/sightmap/pricing),
  [3DPlans](https://help.3dplans.com/m/client_help_articles/l/1221330-interactive-site-map))
- Full Indian real-estate CRMs with inventory list ₹24,000–64,000/month.
  ([Capterra](https://www.capterra.com/p/10044352/Estate-Plus-CRM/))

## Recommended price (₹, before 18% GST)

**One-time setup, per layout (phase), by plots on the drawing:**

| Plots | Setup |
|---|---|
| up to 150 | ₹14,999 |
| 151–400 | ₹24,999 |
| 401–1,000 | ₹39,999 |
| more, or multi-phase townships | quoted |

That is about ₹40–100 per plot, well below the ₹500/plot reference, because RE already holds the inventory.

**Monthly, per published layout:** ₹2,999. It includes:
- live status sync and the public buyer link;
- **one drawing revision per month** (unused revisions do not carry over);
- support.

**Extras and discounts:**
- An extra drawing revision in the same month costs ₹2,499.
- With three or more live layouts, each one is ₹2,499/month.
- Paying annually in advance gives 12 months for the price of 10.

**Why this shape:** the setup fee pays for the conversion work up front, and the monthly fee pays for revisions and
keeps the feature recurring. Revisions are capped so heavy re-plotting is billed fairly.

## In the product

- Platform Admin → workspace → **Paid add-ons**: switch the add-on on or off and record the setup fee, the monthly fee and how many layouts are included. Platform Owner only; audited.
- Recording fees does not bill the customer. Invoice them as a line item until add-ons are added to self-serve billing.
- RE staff never open the customer's inventory to build the map. The prepared SVG is uploaded in the customer's
  workspace, either by the customer or by RE staff under an audited, time-limited support access grant.

## Preparing a layout file (for RE’s team)

1. Trace the approved layout in Illustrator, Inkscape or CAD. Draw each plot as a closed shape: a rectangle,
   polygon or closed path.
2. Name each plot shape (its layer or object name) with the plot number exactly as it is in inventory, e.g. `N46`.
   Spaces and dashes are ignored when matching (`N-46` = `N46`).
3. Roads, parks and boundaries can stay unnamed. They are drawn as background in their own colours. Plot labels
   can be text.
4. Export as SVG, with no embedded images and no fonts outlined as images. Keep the file under 3 MB and under 8,000 elements.
5. Upload it under Project → Plot map. Then fix anything the match report lists, and publish.
