# The Human Spider

A 3D web-slinging game set in a procedurally built midtown Manhattan. There are no enemies. You have webs, gravity and a lot of skyscrapers.

You start on the 86th-floor observation deck of the **Empire State Building**. The **Chrysler Building** is northeast on Lexington Avenue, and the **Flatiron Building** is down Broadway at 23rd Street, facing Madison Square Park.

## Run it

It is a static site with no build step. Serve the folder and open it:

```bash
npx serve .            # or: python3 -m http.server 8000
```

Then open the printed URL (for example http://localhost:8000). Three.js loads from jsDelivr through an import map, so the first load needs an internet connection. The page also works as-is on GitHub Pages.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look (click the view to capture the mouse) |
| W A S D | Run, steer, pump the swing, crawl on walls |
| Left mouse or Shift (hold) | Shoot a web and swing; release to let go |
| Space | Jump (hold on the ground to charge a super jump). Mid-swing: jump off the web with a flip |
| Right mouse or E | Web-zip to the point under the crosshair. Zipping to a ledge launches you over it |
| C or Ctrl | Dive |
| T | Cycle time of day: morning, noon, golden hour, night |
| R | Return to the Empire State deck |
| G | Toggle graphics quality |
| M | Mute |
| P or Esc | Pause menu: resume, or go back to the main menu |
| H | Show or hide the controls panel |

Touch devices get a thumbstick plus Swing, Jump, Zip and Dive buttons.

## Physics

- **Fixed 120 Hz integration** of a point mass, with gravity and quadratic air drag (`F = −k·|v|·v`). Terminal velocity is about 55 m/s in a normal fall and about 85 m/s in a dive.
- **The web is an inextensible rope.** After each step, if the body is farther from the anchor than the rope length, its position is projected back onto that sphere and the outward radial velocity is removed. That is the exact pendulum constraint, so the swing period, energy exchange and centripetal tension all come from the math rather than from canned animation. The rope goes slack if you rise above the anchor, and it snaps if a building gets between you and the anchor point.
- **Anchor selection** tries three things in order. First it casts a fan of rays above and ahead of your motion and scores the building surfaces it hits by distance, height and how well they line up with your travel, which gives the smoothest swings. If that finds nothing, it uses whatever building is under the crosshair. Failing that, it takes any building in any direction within a few hundred meters, even one below you. That web catches you as you fall past it, so you can attach to any building from anywhere.
- **Pumping.** Holding a direction while the web is taut adds a small tangential force, like driving a playground swing with your legs.
- **Collision.** The body is two spheres tested against convex prisms, one per building tier, spire section and rooftop box, in a spatial hash. Curbs and low ledges are stepped over. Hitting a wall while airborne starts a wall crawl, and climbing over the top edge vaults you onto the roof.

## City and landmarks

The city is generated deterministically from a seed at load time: 11 avenues (10th Ave to 2nd Ave) and 30 cross streets (17th to 46th), with Broadway cutting diagonally through the grid. Blocks are split into lots. Buildings get setback tiers, cornices, parapets, water towers, rooftop mechanicals, storefronts with signs, and Times Square screens where Broadway meets 7th Avenue. Traffic stops at the signals.

The three landmarks are modeled by hand at 0.75 scale:

- **Empire State Building**: the five-storey base, the setbacks at the 6th, 21st, 25th and 30th floors, the main shaft with its side wings and aluminium ribs, the 86th-floor deck, the mooring mast with its lantern and fins, and the antenna with a blinking aircraft beacon.
- **Chrysler Building**: the setback shaft, winged radiator caps on the 31st floor, eagle gargoyles on the 61st, and the stainless-steel crown of seven nested arches with triangular sunburst windows that light up at night, topped by the needle spire.
- **Flatiron Building**: a triangular wedge cut exactly by Broadway and 5th Avenue, with a rounded prow, stone cornices and an attic storey.

Every texture (facades, lit windows, asphalt, the suit's web pattern, the mask, the spider emblem) is painted procedurally on canvases, so the repo contains no image assets.

## The hero

The hero is a jointed body built from lathe-turned limbs in a form-fitting black suit with raised red webbing, red gloves and boots, and a red spider emblem projected onto the chest and back as decals. The full-head mask is painted per pixel with a radial web pattern and large white eye lenses in heavy black frames. Poses (run, swing, flip, dive, skydive, wall crawl, superhero landing) are blended per joint, and the web arm aims at the anchor using the real geometry.

## Code map

| File | What it does |
| --- | --- |
| `src/main.js` | Renderer, post-processing (bloom, speed blur, vignette), game loop, HUD |
| `src/player.js` | Movement states and all physics |
| `src/colliders.js` | Convex prism collision world, sphere resolution and raycasts |
| `src/city.js` | Street grid, Broadway, lots, generic buildings, park, traffic, street furniture, rivers |
| `src/landmarks.js` | Empire State, Chrysler and Flatiron |
| `src/hero.js` | Character model and procedural animation |
| `src/web.js` | Web strand rendering (shoot, sag, release) |
| `src/camera.js` | Third-person camera with collision and speed FOV |
| `src/environment.js` | Sky, sun and moon, fog, clouds, stars, time-of-day presets |
| `src/textures.js` | Procedural canvas textures |
| `src/materials.js` | Shared materials and night lighting |
| `src/audio.js` | Synthesized wind, web and landing sounds |
