# Designs

**Status: first draft for the product owner's review.** Nothing here is approved.
The artwork, the English and Arabic text, the inspiration labels and the sources
all need a decision. The **Arabic text has not been reviewed by a native speaker**
and must be before anyone sees it. The four designs are in
`apps/api/src/designs/data/designs.v1.ts`; how they are served is in
[architecture.md](architecture.md) (sections 3 and 5).

To look at them:

```bash
pnpm --filter @athar/api designs:svg
```

opens as `apps/api/design-previews/*.svg` (one per design, and `contact-sheet.svg`
with all four). The pictures show the table's rim, the line the table would draw,
and a green dot at the centre, where every design starts and ends.

## The four designs at a glance

| Slug               | English title    | Arabic title    | Inspiration label            | Sources opened | Length | Estimated time |
| ------------------ | ---------------- | --------------- | ---------------------------- | -------------- | ------ | -------------- |
| `desert-dunes`     | Desert Dunes     | كثبان الصحراء   | `original-modern`            | 1 (context)    | 50.7   | 14 min         |
| `al-sadu-diamonds` | Al Sadu Diamonds | معيّنات السدو   | **`documented-traditional`** | 2              | 41.0   | 11.5 min       |
| `eight-point-star` | Eight-Point Star | النجمة الثمانية | `original-modern`            | none           | 18.0   | 5 min          |
| `palm-fronds`      | Palm Fronds      | سعف النخيل      | `original-modern`            | 2 (context)    | 41.5   | 11.5 min       |

Length is in table radii (a drawing that went once round the rim is about 6.3).
**Estimated time is a placeholder**: it is the length divided by one nominal speed
(0.06 radii per second) and rounded to 30 seconds, so that the four estimates
follow one rule. The real speed depends on mechanics that are not chosen.

The four are deliberately different in character: a rippling spiral, concentric
woven bands, straight-edged stars, and radiating feathered fronds.

## How the designs are made

No design is a typed-in list of points. Each is produced by a small pure function
in `apps/api/src/designs/generators/`, in the `polar-theta-rho/v1` convention
(theta unwrapped, rho from 0 at the centre to 1 at the rim):

| Design       | Generator  | In one sentence                                                                                  |
| ------------ | ---------- | ------------------------------------------------------------------------------------------------ |
| Desert Dunes | `dunes.ts` | Two interleaved spiral arms, out and back, carrying asymmetric ripples, drifting off-centre      |
| Al Sadu      | `sadu.ts`  | Plain rings alternating with rows of diamonds, each row two zigzags exactly out of step          |
| Star         | `star.ts`  | Four nested eight-point star outlines, each star's points landing in the notches of the next     |
| Palm Fronds  | `khoos.ts` | Eight fronds: a rib out, then swept leaflets alternating sides back down, narrowing at both ends |

Every design is checked **at startup**, and the process refuses to start if any
check fails (see `design-collection.ts`): exactly four designs; unique ids and
slugs; English and Arabic present and in the right script; the inspiration rule
below; rho inside the table; no two consecutive points further apart than 0.05
(no jumps); each segment sampled finely enough that the table's own interpolation
draws what was intended; and each design starting and ending at the home radius.

### One decision that is not made: where designs start and end

Designs must start and end at the same radius, so that any design can follow any
other, and the same one can repeat, without a jump. **That radius depends on the
mechanics and is undecided.** It is the single constant `HOME_RHO` in
`apps/api/src/designs/home.ts`, set to the **centre** for now, because at the centre
the angle means nothing, so chaining is continuous whatever angle the previous
drawing stopped at (at the rim the end angle of one drawing would have to equal the
start angle of the next).

If you choose the rim, the constant changes but **the designs must be redrawn**:
all four are drawn as out-and-back paths that return to the centre.

### The preview

The app does not get the trajectory, only `previewPath`: the trajectory
simplified to at most 500 points (Douglas-Peucker; every point is one of the
design's own points). Measured on these designs:

| Design | Trajectory points | Preview points | Furthest a dropped point strays | Preview length vs design |
| ------ | ----------------- | -------------- | ------------------------------- | ------------------------ |
| dunes  | 4291              | 500            | 0.7% of the table radius        | 99.5%                    |
| sadu   | 1821              | 499            | 0.3%                            | 99.9%                    |
| star   | 1811              | 69             | 0 (exact)                       | 100%                     |
| khoos  | 4414              | 265            | 0 (exact)                       | 98%                      |

(Spacing the points evenly was tried first, as the architecture document originally
said, and made the fronds' preview 21% shorter than the design; see "Preview path"
in `architecture.md`.)

## Inspiration labels, and what they promise

Each design carries one of two labels, per the architecture document:

- **`documented-traditional`** means "we can point to documentation". It is allowed
  only with at least one source that has a URL that can be checked.
- **`original-modern`** means the pattern is an original interpretation. Its English
  note must say "modern interpretation". It may list sources as background; those do
  not turn it into a traditional design.

**No source was invented, and none was cited without being opened.** A test
(`design-collection.spec.ts`) fails if the data cites a URL that is not on the list
of pages below, so an unread source cannot slip in.

## Sources: what I opened, and what each page actually says

Opened and read on 2026-10-11. What follows is what the page said, not what a search
summary said about it. Two of the pages do **not** support things I had expected
them to, which is recorded here so that nothing is claimed beyond what was read.

| Page                                                                                                                                                                                                | Title and publisher                                                                                    | What it says that matters here                                                                                                                                                                                                                                                        | What it does **not** say                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [abudhabiculture.ae/en/Heritage-Carousel/Al-Sadu](https://abudhabiculture.ae/en/Heritage-Carousel/Al-Sadu)                                                                                          | "Al-Sadu", Abu Dhabi Culture                                                                           | Describes "geometric patterns evocative of the region's undulating grasslands, sand dunes and the waves of the Arabian Gulf"; motifs include palm trees, camels, falcons and the "chain with overlapping rings" for tribal unity; traditional colours "black, white, brown and beige" | Does not mention stripes or bands                         |
| [ich.unesco.org/…/al-sadu-traditional-weaving-skills-in-the-united-arab-emirates-02223](https://ich.unesco.org/en/RL/al-sadu-traditional-weaving-skills-in-the-united-arab-emirates-02223?RL=02223) | "Al Sadu, traditional weaving skills in the United Arab Emirates", UNESCO Intangible Cultural Heritage | Records the craft and its listing (first inscribed on the Urgent Safeguarding List in 2011; now shown as inscribed in 2025 on the Representative List); weavers gather in small groups to spin and weave, and girls learn by watching                                                 | **Describes no patterns or motifs at all**                |
| [qasralhosn.ae/house-of-artisans](https://qasralhosn.ae/house-of-artisans/)                                                                                                                         | "House of Artisans: The heritage of craft", Qasr Al Hosn                                               | Khoos is "the weaving or braiding together of date palm fronds to form an object", practised by men and women; products include `surood` (circular mats), `mahafah` (a fan), `makabah` (a food cover), `jefeer` (a basket for dates)                                                  | **Describes no patterns or decorative designs for khoos** |
| [ich.unesco.org/en/decisions/17.COM/7.B.33](https://ich.unesco.org/en/decisions/17.COM/7.B.33)                                                                                                      | Decision 17.COM 7.B.33, "Date palm, knowledge, skills, traditions and practices", UNESCO               | The element is inscribed on the Representative List (17th session, 2022); the United Arab Emirates is one of the nominating states; communities use the tree's "leaves, fronds and fibres" for crafts and rituals                                                                     | Does not mention weaving or plaiting                      |

### Pages I could not use, and sources for you to check

These came up in searching but I could **not** open and read them, so none is cited
in the data. Please check them yourself if you want a heritage source for the star:

- The Louvre Abu Dhabi's own page on its architecture
  (`https://louvreabudhabi.ae/en/about-us/architecture`): refused my request (HTTP
  403). A search summary says the dome is built of 7,850 stars in eight layers and
  draws on palm-leaf canopies; **I have not verified that**.
- Dezeen's article on the Louvre Abu Dhabi
  (`https://www.dezeen.com/2017/11/07/jean-nouvel-louvre-abu-dhabi-art-museum-united-arab-emirates/`):
  refused (HTTP 403).
- The Sheikh Zayed Grand Mosque Centre's official website: searching returned no
  official page on its geometry, only secondary sites I did not trust.
- UNESCO's 2011 decision inscribing Al Sadu
  (`https://ich.unesco.org/en/Decisions/6.COM/8.21`): found, not opened.
- Also worth looking for: a catalogue or book on Emirati weaving patterns, and a
  scholarly source on eight-fold geometric ornament in Gulf architecture. I am not
  naming particular books, because I could not confirm one exists that says what you
  would need.

A search summary also claimed that the UNESCO Al Sadu page lists a palette of
"black, white, brown, beige and red" and "narrow bands of geometric patterns". **The
page does not say that** when opened, so I did not use it. The colours I use come
from the Abu Dhabi Culture page ("black, white, brown and beige"), and I make no
claim about bands.

## The designs

### 1. Desert Dunes (`dunes`, `desert-dunes`)

|           |                                                                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| English   | **Desert Dunes.** Two interleaved lines wind out across the sand and back, carrying wind ripples that crowd to one side like the crest of a great dune.                                   |
| Arabic    | **كثبان الصحراء.** خطّان متداخلان يلتفّان نحو الحافة ويعودان، تتخلّلهما تموّجات الرياح وتتزاحم نحو جهة واحدة كقمة كثيب كبير.                                                              |
| Label     | `original-modern`                                                                                                                                                                         |
| Note (en) | A modern interpretation of the dunes of the Abu Dhabi desert and their wind-carved ripples. It is original artwork, not taken from any traditional pattern.                               |
| Note (ar) | تفسير حديث لكثبان صحراء أبوظبي وتموّجاتها التي تنحتها الرياح. هذا عمل أصلي وليس مأخوذًا من نمط تقليدي.                                                                                    |
| Source    | Context only: Abu Dhabi Culture's "Al-Sadu" page says Al Sadu patterns are evocative of the region's sand dunes. It supports the link between dunes and local heritage, not this drawing. |

**What it is.** A double spiral: the first arm winds out from the centre, a half turn
along the rim joins it to the second, and the second winds back to the centre
between the lines of the first, so the two arms interleave and never cross (a test
checks this). Eight turns each. The ripples are asymmetric (a gentle slope and a
steeper one, as real wind ripples are), grow with distance from the centre, and the
whole spiral drifts 4% off-centre so lines crowd on one side and open out on the
other. Nine ripples per turn.

**Honest caveat.** Of the four, this is the one a person would most easily mistake
for "just a spiral". Its character comes from the ripples and the drift, which are
subtle at small sizes. It is also the longest (14 minutes at the placeholder speed).

### 2. Al Sadu Diamonds (`sadu`, `al-sadu-diamonds`)

|           |                                                                                                                                                                                                                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| English   | **Al Sadu Diamonds.** Rows of diamonds in concentric bands, where two zigzag lines cross, in the spirit of Al Sadu weaving.                                                                                                                                                                                                                  |
| Arabic    | **معيّنات السدو.** صفوف من المعيّنات في أحزمة متحدة المركز، يتقاطع فيها خطّان متعرّجان، على روح نسج السدو.                                                                                                                                                                                                                                   |
| Label     | **`documented-traditional`**                                                                                                                                                                                                                                                                                                                 |
| Note (en) | Al Sadu is a traditional weaving craft of the United Arab Emirates. Abu Dhabi Culture describes its geometric patterns as "evocative of the region's undulating grasslands, sand dunes and the waves of the Arabian Gulf". This design draws bands and diamonds in that spirit; it is a simplified drawing, not a copy of any named pattern. |
| Note (ar) | السدو حرفة نسج تقليدية في دولة الإمارات العربية المتحدة. وتصف «ثقافة أبوظبي» أنماطه الهندسية بأنها توحي بسهول المنطقة المتموّجة وكثبانها الرملية وأمواج الخليج العربي. يرسم هذا التصميم أحزمة ومعيّنات على هذه الروح؛ وهو رسم مبسّط وليس نسخة عن نمط تقليدي بعينه.                                                                           |
| Sources   | Abu Dhabi Culture, "Al-Sadu"; UNESCO, "Al Sadu, traditional weaving skills in the United Arab Emirates" (see the table above).                                                                                                                                                                                                               |

**What it is.** Plain rings alternate with three diamond rows (6, 12 and 18 teeth, so
diamonds stay about the same width at every radius). A row is two full turns, each a
zigzag around the same radius and exactly half a tooth out of step with the other, so
the two lines cross every half tooth and the space between them is a chain of
diamonds. The rings are joined by short radial steps that all lie on one line, like
the selvedge of a woven strip, and the path returns to the centre along that same
line.

**The label needs your decision.** `documented-traditional` is justified by one
thing: a page I opened documents that Al Sadu has **geometric patterns** and ties
them to dunes and waves. The page does **not** describe diamonds, bands or any
specific pattern, and **this drawing is not a copy of any traditional pattern**;
the note says so. If you read the label as "this exact motif is traditional", this
design should be `original-modern`. If you read it as "this is inspired by a
documented tradition", it is correctly labelled. **Please choose.**

### 3. Eight-Point Star (`star`, `eight-point-star`)

|           |                                                                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| English   | **Eight-Point Star.** Four nested eight-point stars, each turned half a point from the last, drawn in unbroken straight lines.                                                               |
| Arabic    | **النجمة الثمانية.** أربع نجمات ثمانية متداخلة، تدور كلٌّ منها نصف رأس عن سابقتها، تُرسم بخطوط مستقيمة متصلة.                                                                                |
| Label     | `original-modern`                                                                                                                                                                            |
| Note (en) | A modern interpretation of the eight-point star, a motif familiar from Islamic geometric ornament. It is an original arrangement, not a reproduction of any monument or traditional pattern. |
| Note (ar) | تفسير حديث للنجمة الثمانية، وهي زخرفة مألوفة في الفنون الهندسية الإسلامية. هذا ترتيب أصلي وليس نسخًا لأي معلم أو نمط تقليدي.                                                                 |
| Sources   | **None.** No page I could open supports a claim about this motif in regional architecture.                                                                                                   |

**What it is.** Four eight-point star outlines (sixteen straight edges each: a point,
a notch, a point...). The proportions are chosen so that every star's points land
exactly in the notches of the star outside it, the way the layers of a rosette
interlock; that fit is what lets one unbroken line draw the whole figure. It runs
out to the innermost star along an axis of symmetry, traces it, steps along one edge
into the next, and so on outward, then returns along another axis of symmetry. It is
the shortest design (5 minutes at the placeholder speed), and the preview is exact.

**Why there is no source.** The obvious source is the Louvre Abu Dhabi's dome, whose
official page refused my request. Nothing else I found and opened supports a claim
about eight-point stars in Emirati architecture, so I made none. The note says only
that the star is "familiar from Islamic geometric ornament", a general statement
rather than one about the region. If you want a stronger claim, a source has to be
found first.

### 4. Palm Fronds (`khoos`, `palm-fronds`)

|           |                                                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| English   | **Palm Fronds.** Eight palm fronds radiate from the centre, each a rib crossed by leaflets in a herringbone.                                                                                                                                                                    |
| Arabic    | **سعف النخيل.** ثماني سعفات تمتدّ من المركز، لكلٍّ منها عرق وسطي تعبره وريقات بنمط عظمة السمكة.                                                                                                                                                                                 |
| Label     | `original-modern`                                                                                                                                                                                                                                                               |
| Note (en) | A modern interpretation of date-palm fronds and plaiting. The Qasr Al Hosn House of Artisans describes khoos as "the weaving or braiding together of date palm fronds to form an object". This design is original artwork; it does not reproduce any traditional khoos pattern. |
| Note (ar) | تفسير حديث لسعف النخيل وضفره. يصف «بيت الحرفيين» في قصر الحصن الخوص بأنه «نسج سعف النخيل أو ضفره معًا لتشكيل قطعة». هذا التصميم عمل أصلي ولا يعيد إنتاج أي نمط تقليدي للخوص.                                                                                                    |
| Sources   | Context: Qasr Al Hosn, "House of Artisans: The heritage of craft"; UNESCO decision 17.COM 7.B.33 (date palm). Neither describes khoos patterns.                                                                                                                                 |

**What it is.** Eight fronds, each a rib out to the tip and then back down with a
swept leaflet on one side, then the other, alternating; the leaflets are longest in
the middle of the frond and shrink to nothing at both ends, and are capped near the
centre so neighbouring fronds never touch (a test checks the clearance). The
herringbone this makes is meant to echo the plaiting that khoos is built on.

**Why it is not `documented-traditional`.** The pages document the **craft** (what
it is made from, what is made) but describe **no pattern**. This is a drawing of
fronds in the spirit of the craft. It is the most literal reading of the theme and
the least like weaving; whether it evokes khoos enough, or whether a coiled circular
mat (the `surood` the page mentions) would be better, is an artistic call for you.

## Arabic text: needs review by a native speaker

**All Arabic in this draft was written by me and has not been reviewed.** Please have
a native speaker, ideally someone familiar with Emirati usage and with heritage
vocabulary, check at least the following:

- **Terminology.** `السدو` (Al Sadu) and `الخوص` (the craft of khoos) are the names I
  believe are standard; please confirm the spelling and which is preferred in the
  UAE. `سعف النخيل` for palm fronds, `معيّنات` for diamonds (rhombi), `النجمة الثمانية`
  for the eight-point star, `كثبان` for dunes.
- **Idiom.** `عظمة السمكة` for "herringbone" is a calque I am not sure is used; there
  may be a better word for the pattern. `رأس` for a point of a star ("نصف رأس" for
  "half a point") is a guess.
- **Quotations.** The Arabic notes for Al Sadu and Palm Fronds **translate** quotations
  from English pages ("evocative of the region's undulating grasslands...", "the
  weaving or braiding together of date palm fronds..."). These are my translations,
  not the publishers' wording, and are shown in guillemets as if quoted. If either
  publisher has an official Arabic page, the **official wording** should replace mine.
  `ثقافة أبوظبي` ("Abu Dhabi Culture") and `بيت الحرفيين` ("House of Artisans") are
  my renderings of the English names, not confirmed official Arabic names.
- **Tone and register.** Whether the descriptions suit the audience, and whether
  vowel marks (tashkeel) should be added anywhere (I used a few, such as in
  `معيّنات`, for clarity).
- **Right-to-left.** Several strings mix Arabic with Latin or punctuation (the
  quotations). The app needs to be checked for correct bidirectional display.

## Needs your review

1. **The home radius** (centre or rim; section above). It decides how the designs are
   drawn.
2. **The label for Al Sadu**: `documented-traditional` or `original-modern`
   (section 2).
3. **Whether the star needs a source**, and who finds one. (While writing this I
   found the star's first description said "three" nested stars when the drawing has
   four; that is corrected, in English and Arabic.)
4. **Whether the artwork pleases you**: the dunes are the least distinctive; the
   fronds the most literal; the others read clearly. Names, counts (8 fronds, 6/12/18
   diamond teeth, 4 stars) and proportions are all parameters of the generators.
5. **The durations**, which are placeholders until the mechanics are chosen.
6. **The Arabic**, all of it, by a native speaker.
7. **Whether you want more than the four sources cited**, and for which designs.
8. **Colour and presentation of the previews** in the app, which are not designed yet.
9. **Table-wide questions** that this draft leaves as they were: the collection is
   exactly four designs for every table; whether it is the same for every table
   is [open decision 8](architecture.md#9-open-decisions).

## Changing a design

Edit the generator or its parameters, or the text in `designs.v1.ts`, and run
`pnpm check`. A design that breaks a rule (a jump, a rho outside the table, a missing
language, an unsourced traditional label) stops the API from starting, with the full
list of problems. Changing the collection is a reviewed code change with a
`collectionVersion` bump, per the architecture document.
