# The Human Spider

A 3D web-slinging game set in a procedurally built midtown Manhattan. You have webs, gravity, a lot of skyscrapers, and pairs of street thugs who show up on rooftops near the landmarks.

You start on the 86th-floor observation deck of the **Empire State Building**. The **Chrysler Building** is northeast on Lexington Avenue, and the **Flatiron Building** is down Broadway at 23rd Street, facing Madison Square Park.

## Run it

**Easiest:** download [`dist/the-human-spider.html`](dist/the-human-spider.html) and double-click it. It's one self-contained file with the game and three.js bundled in, so it runs offline straight from your hard drive.

**From source:** serve the folder and open it (opening `index.html` directly from disk won't work, because browsers block module scripts on `file://`):

```bash
npx serve .            # or: python3 -m http.server 8000
```

**Rebuild the single file** after changing the code:

```bash
npm install
npm run build          # writes dist/the-human-spider.html
```

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look (click the view to capture the mouse) |
| W A S D | Run, steer, pump the swing, crawl on walls |
| Left mouse or Shift (hold) | Shoot a web and swing; release to let go |
| Space | Jump (hold on the ground to charge a super jump). Mid-swing: jump off the web with a flip |
| Right mouse or E | Web-zip to the point under the crosshair. Zipping to a ledge launches you over it |
| F | Punch, punch, kick combo; lunges at a thug within a few meters |
| Q or middle mouse | Web-shoot the enemy under the crosshair (right mouse does the same when aimed at one). Thugs take 1 web, bosses 5 |
| C or Ctrl | Dive |
| B | Summon a boss right away (they also show up on their own) |
| T | Cycle time of day: morning, noon, golden hour, night |
| R | Return to the Empire State deck |
| G | Toggle graphics quality |
| M | Mute |
| P or Esc | Pause menu: resume, or go back to the main menu |
| H | Show or hide the controls panel |

Touch devices get a thumbstick plus Swing, Jump, Zip and Hit buttons, and a pause button.

## Suits

Pick a suit on the start screen or in the pause menu: black with red webbing, red and blue, or white with a hood and pink and teal accents. The choice is remembered in your browser.

## Thugs

Two thugs at a time turn up on a rooftop near the Empire State Building, the Chrysler Building, the Flatiron or Times Square. A red tracker marks the nearest one: a diamond over their head when they are on screen, an arrow at the screen edge when they are not.

- **Web them.** A web shot glues a thug in place. More webs wrap them fully and buy more time, but they tear free after a few seconds.
- **Fight them.** F chains punch, punch, kick. Three hits or a kick finisher knock a thug out, and any hit on a webbed thug knocks them out immediately. A long fall off a roof knocks them out too.
- **They hit back.** Punches do 12 damage and knock you back. Health regenerates after a few seconds out of combat. At zero you wake up back on the Empire State deck.

When both thugs are down, a new pair appears at another landmark.

## Bosses

A boss turns up on its own every minute or two, at a random landmark, and thug waves pause until it is down (press B to summon one right away). Bosses have a health bar at the bottom of the screen, hit harder, and only stagger once you break their guard.

- **Webbing a boss takes 5 quick hits.** The pips under the health bar fill as webs land and drain if you stop. A trapped boss breaks free after 1.5 to 2.5 seconds, takes double damage while trapped, and can't be re-trapped for 4 seconds (the pips turn red).
- **Pin them to buildings.** If the web that traps someone (thug or boss) carries on into a wall within a few meters, they get stuck to the wall and stay trapped longer.
- **Street fights get heavy.** Ground bosses that end up at street level tear cars out of traffic and throw them at you. Hit them hard enough to stagger them and they drop the car.

| Boss | Moves | How to beat them |
| --- | --- | --- |
| Green Goblin | Circles on his glider throwing pumpkin bombs, then swoops through you | Trap him to knock him off the glider, then hit him on the ground |
| Scorpion | Long-reach tail stabs (the stinger glows first), punches, leaps between roofs | Dodge the stab, then punish |
| Vulture | Feather-blade volleys and high-speed dives | Trap him to drop him out of the sky |
| Doctor Octopus | Steel arms rise, then slam where you are standing; throws cars on the street | Stay mobile and punish after a slam |
| Rhino | Paws the ground and charges; heavy punches; throws cars | Make him charge into a wall, or land 3 webs on him mid-charge to trip him, then hit him while he is dazed |
| Sandman | Fists that grow to giant size, sand blasts, throws cars | Webs pass straight through sand, so use your fists |

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
| `src/hero.js` | Character model and procedural animation (shared by the hero and the thugs) |
| `src/skins.js` | Suits and thug outfits |
| `src/enemies.js` | Thug AI, web traps, melee combat, projectiles and spawning |
| `src/bosses.js` | The six bosses: gear, attacks and AI |
| `src/web.js` | Web strand rendering (shoot, sag, release) |
| `src/camera.js` | Third-person camera with collision and speed FOV |
| `src/environment.js` | Sky, sun and moon, fog, clouds, stars, time-of-day presets |
| `src/textures.js` | Procedural canvas textures |
| `src/materials.js` | Shared materials and night lighting |
| `src/audio.js` | Synthesized wind, web and landing sounds |
