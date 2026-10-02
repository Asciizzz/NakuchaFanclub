# He was whipping up shit in a kettle

Ts stand for Thinking Space 2

## Yalc w @asciiz/ WeebGfx and Atoolkit

@asciiz/atoolkit is a thing on npmjs, but @asciiz/weebgfx currently isn't, so I will just allow yalc to exist in the github for u to see and... use ig?

WeebGfx for 3d models or like cutboard effects, like Danganronpa and shit, as well as a bunch of like shapes and stuff you see in an anime mv, like that one song Snooze by Wotaku (the lyrics genuinely gave me brain aneurysm but I legit love the song so much lmao)

Atoolkit for other shader effect since I didn't make shit in @asciiz for motion graphics, this aint fuckin Adobe Something-For-Effects (idk the name, I don't use Adobe products, those mf are practically stealing)

RTT a thing btw, so we defo can do some pretty crazy 2d 3d 2.5d 1-dih-in-yo-mouth effects, like those dotted background in a 3d model or 3d "ambient shape" (tf is that name lmao?) that act like a static 2d screen coord thingy. I swear I'm not going crazy, you'll see

## Coolor schzem (subject to change on a whim)

Direct ref from one of the Cosmic Princess Kaguya Yachiyo cover of a song that I can't spell because I don't know Japanish, and seeing Japan in a md file will give me physical brain hemorrage

- #1A2838 - midnight slate navy (main dark bg)
- #4B6B8A - steel aquatic blue (primary accent, midtone)
- #B0C8DC - soft dusty pale cyan (secondary accent, borders, muted text)
- #E8F2FA - crisp chalk white (highlights, main headings)
- #FFFFFF - pure white (He was boiling white in a color wheel. Like actual white?)

Hi future me here, it's the cover of Torinoko City

## Layout idea

Basically, site driven entirely by fullscreen webgpu canvas, with 3d models and shit, scroll repurpose to drive timeline and transition rather than div2div. Ts hurt SEO (search engines crawl plain HTML) or corporate stuff yada yada desu, but tiz a fanclub site, we don't fucking care lmao.

Update: div2div IS supported, but in a weirder way. 3 main layers: Front (WebGPU canvas), Middle (DOM for content) and Back (also WebGPU canvas), you can sorta think of it as foreground, content and background. Foreground and background however, do provide certain additive effects for the middle layer, something like a, idk, custom text effect in the middle of a paragraph section, that require some stupid amount of math for position offset and resizing (TS WILL KILL ME)

## Animation engine (this asciiz - me, mf is genuinely obsessed with engines holy shit)

### Via progression (% or 0-1) and transition timing (ms)

- `onEnterStart/End()` and `onLeaveStart/End()` to trigger instant shit at `t = 0` and `t = 1` for when entering (going from another section to this section) and leaving (going from this section to another section)

- Frameloop (in order):
  - `ontick()` for logical stuff like physic and math and complex gpu buffer magical girl bs (NOT rendering, just like, copying or updating buffer and stuff)
  - `renderFront()` and `renderBack()` for rendering the front and back WebGPU canvas, respectively
  - `updateDom()` for updating the middle DOM layer (the pseudo-scrollable lameo no webgpu content layer)

### Some cool example (taken from that Yachiyo cover):

There's like this effect where she move from point A to point B (no shit SHerlok), but it insta snap, yet uses some kind of bezier curve effect, by transitioning at the middle of the ramp up point (if that make sense)

You can do that by using those methods listed above, just read the code it's super easy! (NO :pray:)