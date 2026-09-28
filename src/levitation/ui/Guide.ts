/**
 * The Guide: an overlay "page" with a left nav and short, friendly sections.
 * Opens automatically on the first visit; reopen with ? or G.
 */
import { el, svg } from "./dom";
import { ICONS } from "./icons";

interface GuideSection {
  id: string;
  title: string;
  html: string;
}

const JET_PROFILE_SVG = `
<svg viewBox="0 0 560 256" role="img" aria-label="Side view of a fan jet: it keeps its speed for a short core, then spreads and slows. A shape hovers where the push equals its weight.">
  <defs>
    <linearGradient id="g-jet" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#5ee7ff" stop-opacity=".26"/>
      <stop offset="1" stop-color="#5ee7ff" stop-opacity=".02"/>
    </linearGradient>
  </defs>
  <path d="M244 226 L316 226 L384 18 L176 18 Z" fill="url(#g-jet)"/>
  <path d="M244 226 L176 18 M316 226 L384 18" stroke="#5ee7ff" stroke-opacity=".35" stroke-dasharray="3 4"/>
  <path d="M246 214 C 249 190, 256 188, 280 188 C 304 188, 311 190, 314 214 Z" fill="#5ee7ff" fill-opacity=".5"/>
  <path d="M220 164 C 244 146, 262 142, 280 142 C 298 142, 316 146, 340 164 Z" fill="#5ee7ff" fill-opacity=".32"/>
  <path d="M190 66 C 228 54, 256 52, 280 52 C 304 52, 332 54, 370 66 Z" fill="#5ee7ff" fill-opacity=".2"/>
  <line x1="150" y1="104" x2="412" y2="104" stroke="#ffb45e" stroke-dasharray="5 4" stroke-opacity=".9"/>
  <circle cx="280" cy="104" r="21" fill="#1c252e" stroke="#e8eef2" stroke-opacity=".85" stroke-width="1.5"/>
  <rect x="240" y="226" width="80" height="11" rx="3" fill="#1a2028" stroke="#5ee7ff" stroke-opacity=".6"/>
  <path d="M120 168 L218 158" stroke="#a9b5bf" stroke-opacity=".5"/>
  <g font-family="Inter, system-ui, sans-serif" font-size="12" fill="#a9b5bf">
    <text x="332" y="204">Core: full outlet speed</text>
    <text x="352" y="150">Mixes with room air,</text>
    <text x="352" y="165">spreads and slows</text>
    <text x="420" y="100" fill="#ffb45e">Hover height:</text>
    <text x="420" y="115" fill="#ffb45e">push = weight</text>
    <text x="36" y="166">Air speed</text>
    <text x="36" y="181">across the jet</text>
    <text x="252" y="252" fill="#6f7c88">Fan outlet</text>
  </g>
</svg>`;

const FORCES_SVG = `
<svg viewBox="0 0 560 260" role="img" aria-label="Two diagrams. Left: a ball centred on a jet, its weight balanced by the jet's push. Right: the ball has drifted, and faster air on the jet side pulls it back.">
  <g>
    <path d="M108 236 C 104 190, 70 170, 70 122 C 70 80, 100 54, 104 12" stroke="#5ee7ff" stroke-opacity=".75" fill="none" stroke-width="1.6"/>
    <path d="M152 236 C 156 190, 190 170, 190 122 C 190 80, 160 54, 156 12" stroke="#5ee7ff" stroke-opacity=".75" fill="none" stroke-width="1.6"/>
    <path d="M122 236 C 120 200, 94 176, 92 150" stroke="#5ee7ff" stroke-opacity=".45" fill="none"/>
    <path d="M138 236 C 140 200, 166 176, 168 150" stroke="#5ee7ff" stroke-opacity=".45" fill="none"/>
    <rect x="96" y="236" width="68" height="10" rx="3" fill="#1a2028" stroke="#5ee7ff" stroke-opacity=".6"/>
    <circle cx="130" cy="112" r="48" fill="#1c252e" stroke="#e8eef2" stroke-opacity=".85" stroke-width="1.5"/>
    <line x1="130" y1="112" x2="130" y2="196" stroke="#ff6b6b" stroke-width="2.5"/>
    <path d="M123 188 L130 200 L137 188 Z" fill="#ff6b6b"/>
    <line x1="130" y1="178" x2="130" y2="168" stroke="none"/>
    <line x1="112" y1="222" x2="112" y2="168" stroke="#5ee7ff" stroke-width="2.5"/>
    <path d="M105 174 L112 162 L119 174 Z" fill="#5ee7ff"/>
    <g font-family="Inter, system-ui, sans-serif" font-size="12">
      <text x="142" y="190" fill="#ff8a8a">Weight</text>
      <text x="30" y="214" fill="#5ee7ff">Jet push</text>
      <text x="16" y="120" fill="#a9b5bf">Fast air,</text>
      <text x="16" y="135" fill="#a9b5bf">low pressure</text>
    </g>
  </g>
  <g transform="translate(290 0)">
    <path d="M108 236 C 104 190, 104 170, 118 122 C 128 84, 130 54, 132 12" stroke="#5ee7ff" stroke-opacity=".85" fill="none" stroke-width="1.8"/>
    <path d="M118 236 C 118 200, 122 176, 126 152" stroke="#5ee7ff" stroke-opacity=".6" fill="none" stroke-width="1.4"/>
    <path d="M152 236 C 156 200, 196 170, 220 122" stroke="#5ee7ff" stroke-opacity=".35" fill="none"/>
    <rect x="96" y="236" width="68" height="10" rx="3" fill="#1a2028" stroke="#5ee7ff" stroke-opacity=".6"/>
    <line x1="130" y1="236" x2="130" y2="12" stroke="#5ee7ff" stroke-opacity=".25" stroke-dasharray="3 4"/>
    <circle cx="176" cy="112" r="48" fill="#1c252e" stroke="#e8eef2" stroke-opacity=".85" stroke-width="1.5"/>
    <line x1="176" y1="112" x2="136" y2="112" stroke="#7cf3c6" stroke-width="2.5"/>
    <path d="M142 105 L130 112 L142 119 Z" fill="#7cf3c6"/>
    <g font-family="Inter, system-ui, sans-serif" font-size="12">
      <text x="160" y="190" fill="#7cf3c6">Pulled back</text>
      <text x="160" y="205" fill="#7cf3c6">to the middle</text>
      <text x="0" y="60" fill="#a9b5bf">Faster air on</text>
      <text x="0" y="75" fill="#a9b5bf">the jet side</text>
    </g>
  </g>
</svg>`;

const SHUTTLE_SVG = `
<svg viewBox="0 0 560 220" role="img" aria-label="A shuttlecock shape, upright and tilted. The centre of pressure sits above the centre of mass, so a tilt is twisted back upright.">
  <g>
    <path d="M150 180 L110 60 L190 60 Z" fill="#1c252e" stroke="#e8eef2" stroke-opacity=".8" stroke-width="1.5"/>
    <circle cx="150" cy="182" r="16" fill="#2a333d" stroke="#e8eef2" stroke-opacity=".8" stroke-width="1.5"/>
    <circle cx="150" cy="96" r="7" fill="none" stroke="#ffb45e" stroke-width="3"/>
    <circle cx="150" cy="168" r="6" fill="#e8eef2"/>
    <g font-family="Inter, system-ui, sans-serif" font-size="12">
      <text x="202" y="100" fill="#ffb45e">CP: where the air pushes</text>
      <text x="202" y="172" fill="#e8eef2">CM: where the weight acts</text>
    </g>
  </g>
  <g transform="translate(420 120) rotate(24)">
    <path d="M0 60 L-40 -60 L40 -60 Z" fill="#1c252e" stroke="#e8eef2" stroke-opacity=".8" stroke-width="1.5"/>
    <circle cx="0" cy="62" r="16" fill="#2a333d" stroke="#e8eef2" stroke-opacity=".8" stroke-width="1.5"/>
    <circle cx="0" cy="-24" r="7" fill="none" stroke="#ffb45e" stroke-width="3"/>
    <circle cx="0" cy="48" r="6" fill="#e8eef2"/>
  </g>
  <path d="M470 50 C 500 70, 506 100, 496 128" stroke="#7cf3c6" stroke-width="2" fill="none"/>
  <path d="M488 122 L496 134 L502 120 Z" fill="#7cf3c6"/>
  <text x="438" y="206" font-family="Inter, system-ui, sans-serif" font-size="12" fill="#7cf3c6">Tips back upright</text>
</svg>`;

function sections(): GuideSection[] {
  return [
    {
      id: "start",
      title: "Start here",
      html: `
        <div class="guide-kicker">Start here</div>
        <h2 id="guide-title">Make something float</h2>
        <p class="guide-lead">Levitation Lab lets you try a shape on a column of fan air before you build it. Pick a form and a skin, give it air, and see whether it lifts, hovers and holds still enough to be projection mapped and camera tracked.</p>
        <ol class="guide-steps">
          <li><span class="guide-step-num">1</span><b>Pick a shape</b>Start from a preset or choose a shape in the Design panel, then set its size and skin.</li>
          <li><span class="guide-step-num">2</span><b>Give it air</b>In the Air &amp; light panel, set how fast the air leaves the fan and how wide the fan is. The shape responds live as you drag.</li>
          <li><span class="guide-step-num">3</span><b>Read the verdict</b>The results bar says whether it hovers, how high, and how well it will take a projection. Click the envelope map to jump to a better design.</li>
        </ol>
        <div class="guide-cta">
          <button type="button" class="btn btn--primary" data-guide-start>Start exploring</button>
          <span>Reopen this guide any time with <span class="guide-kbd">?</span> or <span class="guide-kbd">G</span>.</span>
        </div>
        <h3>Shortcuts</h3>
        <dl class="guide-defs">
          <dt><span class="guide-kbd">Space</span></dt><dd>Pause or resume the flight.</dd>
          <dt><span class="guide-kbd">R</span></dt><dd>Reset the flight: the shape drops back onto the fan and lifts off again.</dd>
          <dt><span class="guide-kbd">N</span></dt><dd>Nudge it sideways, to see whether the jet pulls it back or loses it.</dd>
          <dt><span class="guide-kbd">1</span> <span class="guide-kbd">2</span> <span class="guide-kbd">3</span></dt><dd>Projection, Pressure and Material views.</dd>
          <dt>Mouse</dt><dd>Drag to orbit, scroll to zoom, right-drag to pan, double-click to reframe.</dd>
        </dl>`,
    },
    {
      id: "controls",
      title: "The controls",
      html: `
        <div class="guide-kicker">The controls</div>
        <h2>Everything on screen, one by one</h2>
        <p>Hover over (or tab to) almost anything for a one-line explanation.</p>
        <dl class="guide-defs">
          <dt>Views</dt><dd><strong>Projection</strong> throws an Orbital Studio look onto the shape from virtual projectors. <strong>Pressure</strong> paints where the air pushes and pulls on the skin. <strong>Material</strong> previews the real surface under soft light.</dd>
          <dt>Air, Forces, Tracking</dt><dd>Show or hide the air particles, the force arrows, and the tracking camera picture in the corner.</dd>
          <dt>Snapshot</dt><dd>Saves the current view as a PNG image.</dd>
          <dt>Flight bar</dt><dd>The live status under the view switch. Pause freezes the physics, the arrow button gives it a sideways nudge, and <strong>Reset flight</strong> drops the shape onto the fan so you can watch it lift off again.</dd>
          <dt>Presets</dt><dd>Complete designs to start from, including one that fails on purpose so you can see why.</dd>
          <dt>Shape and size</dt><dd>Ten forms, from the Orbital sphere to a Mobius ribbon. Size is the widest point. The slider is logarithmic, so small shapes get fine control.</dd>
          <dt>Material</dt><dd>Real skins, with their weight in grams per square metre. The two small meters rate each skin for projection (the sun) and for infrared tracking (the target). Greyed out skins can't be made into the chosen shape; hover to see why.</dd>
          <dt>Helium fill</dt><dd>Only shown for sealed envelopes. Helium carries part of the weight, so the jet has less to do.</dd>
          <dt>The fan</dt><dd><strong>Outlet air speed</strong>, <strong>Fan diameter</strong>, <strong>Fan type</strong> and <strong>Turbulence</strong> shape the column of air. The little diagram compares the jet (cyan) with your shape (white), to scale. Flow, power and rotor speed are worked out for you.</dd>
          <dt>Projection look</dt><dd>Eight of Orbital Studio's looks, rendered by the same shader the Studio uses. <strong>Projectors</strong> sets how many surround the shape: with one, the far side stays dark and hollows fall into shadow.</dd>
          <dt>Latency and prediction</dt><dd>How late the projected image is compared with the real shape, and whether the system extrapolates the motion to catch up. See <em>Tracking and latency</em> below.</dd>
        </dl>`,
    },
    {
      id: "results",
      title: "Reading the results",
      html: `
        <div class="guide-kicker">Reading the results</div>
        <h2>What the verdict and scores mean</h2>
        <dl class="guide-defs">
          <dt><span class="guide-chip" style="--tone: var(--stable)">Hovers steadily</span></dt><dd>Finds a height and stays there with only a gentle sway. Ready for a real test.</dd>
          <dt><span class="guide-chip" style="--tone: var(--wobbly)">Wobbles</span></dt><dd>It floats, but rocks or wanders enough to smear a projected image. Try a calmer fan type, less turbulence, or a rounder shape.</dd>
          <dt><span class="guide-chip" style="--tone: var(--fail)">Fails</span></dt><dd>Too heavy to lift, blown to the ceiling, tumbling over, or escaping the jet sideways. The summary line says which.</dd>
          <dt><span class="guide-chip" style="--tone: var(--buoyant)">Floats on its own</span></dt><dd>So much helium that it is lighter than air. It needs a tether, not a fan.</dd>
        </dl>
        <h3>The six numbers</h3>
        <dl class="guide-defs">
          <dt>Hover height</dt><dd>Where it settles, measured from the fan outlet.</dd>
          <dt>Mass</dt><dd>Skin, seams and ballast. Underneath is the net weight the air must hold up, after any helium.</dd>
          <dt>Lift margin</dt><dd>How much more the jet can push, right above the fan, than the shape weighs. Below 1 it never lifts; around 1.5 or more is comfortable.</dd>
          <dt>Sway</dt><dd>How far it typically wanders sideways while hovering, and how fast it rocks.</dd>
          <dt>Projection</dt><dd>0 to 100. A bright, matte, opaque, smoothly curved and steady surface scores high.</dd>
          <dt>Tracking</dt><dd>0 to 100. A skin that reflects infrared, with a clean convex outline that holds still, scores high.</dd>
        </dl>
        <h3>The envelope map</h3>
        <p>The small map at the bottom right tries your shape, skin and fan at every combination of outlet air speed (left to right) and size (bottom to top). Green is a steady hover, yellow wobbles, red fails and purple floats away. The white ring is your design. Hover to read any spot, click to jump there. A design in the middle of a big green patch is robust: a draught or a slightly heavier seam won't break it.</p>`,
    },
    {
      id: "physics",
      title: "How it floats",
      html: `
        <div class="guide-kicker">How it floats</div>
        <h2>How a fan holds a shape in the air</h2>
        <p>A jet of air rising from a fan pushes up on anything in its way. When that push matches the weight, the shape hovers. Several effects make that balance stable instead of lucky.</p>
        <h3>1. The push sets the height</h3>
        <p>Air slows when it hits the underside of the shape, and that slowing pushes up. Near the fan the jet is fast and pushes hard. Higher up it has mixed with the room air, spread out and slowed. A shape that is too low is pushed up; one that is too high sinks. It settles where the push equals its weight: the hover height.</p>
        <figure class="guide-figure">${JET_PROFILE_SVG}<figcaption>The jet keeps its outlet speed for a short core, then spreads and slows. The shape settles where its push equals the weight.</figcaption></figure>
        <h3>2. Fast air on the sides pulls it back</h3>
        <p>Air speeds up as it squeezes around the sides, and faster air has lower pressure (that is Bernoulli's principle). If the shape drifts sideways, the air on the jet side is faster than the air on the outside, so the shape is pulled back into the stream. The air also bends around the curved skin and clings to it (the Coanda effect), flinging air outward and nudging the shape back the other way. Together they self-centre a round shape. It is why a beach ball can sit on a hair dryer.</p>
        <figure class="guide-figure">${FORCES_SVG}<figcaption>Left: weight balanced by the jet's push. Right: after a drift, faster, lower-pressure air on the jet side pulls it back.</figcaption></figure>
        <h3>3. A big ball on a narrow jet turns the air</h3>
        <p>Orbital's 3 m sphere is far wider than its 800 mm jet. It still hovers because the whole jet hits it and is turned sideways, like water from a hose hitting a wall. The force comes from redirecting the jet's momentum, so a narrow, fast jet can carry a very large, very light shape, as long as the underside is smooth enough to turn all of the air. The Pressure view shows it: a bright push spot underneath and fast suction bands around the sides.</p>
        <h3>4. Upright like a shuttlecock</h3>
        <p>Two points decide whether a shape stays upright: where the air pushes (the centre of pressure, CP) and where the weight acts (the centre of mass, CM). With CP above CM, any tilt is twisted back upright, the way a shuttlecock always flies nose first. With CP below CM, it flips. Turn on <strong>Forces</strong> to see both.</p>
        <figure class="guide-figure">${SHUTTLE_SVG}<figcaption>The weighted nose puts the centre of mass low. The skirt catches the air high up. A tilt is twisted back.</figcaption></figure>
        <h3>5. Wobble comes from shed swirls</h3>
        <p>Air leaving the edges of a shape rolls into swirls (vortices) that peel off one side, then the other. Each gives a small sideways kick, so the shape rocks with a steady rhythm. Smooth, round shapes and calm, straightened jets shed weaker swirls. The rhythm shows up as the Sway frequency.</p>
        <h3>6. Spin keeps the halo level</h3>
        <p>An axial fan without guide vanes swirls its air. A ring catches that swirl and spins, and a spinning ring resists tipping, like a gyroscope or a rolling coin. That is why the Halo preset uses a plain axial fan on purpose.</p>`,
    },
    {
      id: "materials",
      title: "Shapes and materials",
      html: `
        <div class="guide-kicker">Shapes and materials</div>
        <h2>Choosing a skin for projection mapping</h2>
        <p>A projected image only looks as good as the surface it lands on. What works best:</p>
        <ul>
          <li><strong>Matte white.</strong> High diffuse reflectance sends the projector's light back to the audience evenly. Matte PVC, Tyvek and EPS are the brightest, cleanest screens in the lab.</li>
          <li><strong>Low gloss.</strong> A glossy skin mirrors the projector as a hot spot and throws light away from most viewers. Mylar is the extreme case: gorgeous as a mirror, nearly useless as a screen.</li>
          <li><strong>Low translucency.</strong> Light that passes through the skin glows on the far side and washes out contrast. Latex and washi glow from within; that can be a look, but it costs sharpness.</li>
          <li><strong>Smooth, convex curves.</strong> Continuous curvature maps cleanly from several projectors. Flat facets (the geode) give crisp planes but visible seams where projectors overlap. Hollows, like the inside of the halo or under the medusa, fall into shadow: try one or two projectors to see them go dark.</li>
          <li><strong>Infrared reflectance.</strong> The Orbital Tracker watches in near infrared (850 nm) so it is not confused by the projected image. The skin must reflect that light too; the target meter on each material rates it.</li>
        </ul>
        <div class="guide-callout">Even a perfect skin only helps if the light lands where the shape is. The next section explains why that is harder than it sounds.</div>`,
    },
    {
      id: "tracking",
      title: "Tracking and latency",
      html: `
        <div class="guide-kicker">Tracking and latency</div>
        <h2>Why milliseconds matter</h2>
        <p>To map a moving shape, a camera finds it, software works out where it is, and a projector draws the image there. Every step takes time, and by the time the light arrives the shape has moved on. At 24 ms, a shape swaying at 0.3 m/s has moved about 7 mm: hard to see. At 120 ms it has moved 36 mm, and the image slides visibly off the edge.</p>
        <p>Turn up <strong>Tracking latency</strong> to see it happen. The image slips across the surface, part of the shape goes dark, and a faint amber ghost marks light that misses the shape and lands on the room behind. The <strong>Misregistration</strong> meter reads the gap live.</p>
        <h3>What prediction does</h3>
        <p>Prediction uses the recent motion to guess where the shape will be when the light arrives, and draws it there instead. For smooth, slow sways it hides most of the delay. For sudden kicks it overshoots a little, which is why a calm hover still matters more than clever software.</p>
        <h3>The camera picture</h3>
        <p>The small picture in the corner is what a tracking camera sees: a bright silhouette on black, like the infrared feed from Orbital's HuaTeng camera (1024 by 768 pixels, monochrome, 91 frames a second). The real Orbital Tracker fits an ellipse to that silhouette and publishes its centre, size and angle in the <code>orbital.tracking-state/1.0</code> format; the readout uses the same field names. The solid green ellipse is the measurement. The dashed amber one is where the projector is drawing.</p>`,
    },
    {
      id: "limits",
      title: "What this model is",
      html: `
        <div class="guide-kicker">What this model is and isn't</div>
        <h2>A sketchbook, not a wind tunnel</h2>
        <p>Levitation Lab is a reduced-order model: a handful of well-known equations for jets, drag and stability, with textbook coefficients, tuned so the numbers tell a plausible and consistent story. It runs in real time so you can feel your way around the design space.</p>
        <ul>
          <li>It is <strong>not</strong> computational fluid dynamics. It doesn't solve the airflow around your exact shape, and it simplifies how shapes turn the jet, shed swirls and wobble.</li>
          <li>Every number is an <strong>estimate</strong>. Read a hover height as "about this high" and a score as a way to compare options, not a promise to the millimetre.</li>
          <li>Rooms matter. Draughts, heating vents, people walking past and nearby walls all change what really happens.</li>
        </ul>
        <p><strong>Always confirm with a physical test</strong> before committing to a build: a balloon over a pedestal fan at home first, then a sample of the real skin over the real fan, filmed from where the tracking camera will be.</p>
        <p>The technical notes live in <code>docs/levitation-lab.md</code> in Orbital Studio.</p>`,
    },
  ];
}

export class Guide {
  readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly links = new Map<string, HTMLButtonElement>();
  private readonly sheet: HTMLDivElement;
  private opener: HTMLElement | null = null;
  private open = false;

  constructor(private readonly onClose: () => void) {
    const nav = el("nav", { class: "guide__nav", attrs: { "aria-label": "Guide sections" } }, [
      el("div", { class: "guide__nav-title" }, [svg(ICONS.book), "Guide"]),
    ]);
    this.body = el("div", { class: "guide__body", attrs: { tabindex: -1 } });
    sections().forEach((section, index) => {
      const link = el("button", { class: "guide__link", attrs: { type: "button", "aria-current": "false" } }, [
        el("span", { class: "guide__link-num", text: String(index + 1) }),
        section.title,
      ]);
      link.addEventListener("click", () => this.scrollTo(section.id));
      this.links.set(section.id, link);
      nav.append(link);
      const block = el("section", { class: "guide-section", attrs: { id: `guide-${section.id}`, "data-section": section.id } });
      block.innerHTML = section.html;
      this.body.append(block);
    });
    nav.append(el("div", { class: "guide__nav-foot", text: "Orbital Levitation Lab. Estimates for exploring ideas; confirm with a physical test." }));
    const close = el("button", { class: "icon-btn guide__close", attrs: { type: "button", "aria-label": "Close guide" } }, [svg(ICONS.close)]);
    close.addEventListener("click", () => this.hide());
    this.sheet = el("div", { class: "guide__sheet glass" }, [nav, this.body, close]);
    const backdrop = el("div", { class: "guide__backdrop" });
    backdrop.addEventListener("click", () => this.hide());
    this.root = el("div", {
      class: "guide",
      attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "guide-title", "aria-hidden": "true" },
      dataset: { open: "false" },
    }, [backdrop, this.sheet]);
    this.root.inert = true;
    this.body.querySelector("[data-guide-start]")?.addEventListener("click", () => this.hide());
    this.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.hide();
      } else if (event.key === "Tab") {
        this.trapFocus(event);
      }
    });
    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
          if (visible) this.markCurrent((visible.target as HTMLElement).dataset.section ?? "start");
        },
        { root: this.body, rootMargin: "0px 0px -65% 0px", threshold: 0 },
      );
      this.body.querySelectorAll("section").forEach((section) => observer.observe(section));
    }
    this.markCurrent("start");
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(sectionId = "start"): void {
    if (this.open) {
      this.scrollTo(sectionId);
      return;
    }
    this.open = true;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.root.inert = false;
    this.root.dataset.open = "true";
    this.root.setAttribute("aria-hidden", "false");
    this.scrollTo(sectionId, true);
    requestAnimationFrame(() => {
      const start = this.body.querySelector<HTMLElement>("[data-guide-start]");
      (sectionId === "start" && start ? start : this.body).focus({ preventScroll: true });
    });
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.root.dataset.open = "false";
    this.root.setAttribute("aria-hidden", "true");
    this.root.inert = true;
    this.onClose();
    this.opener?.focus({ preventScroll: true });
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  private scrollTo(id: string, instant = false): void {
    const target = this.body.querySelector<HTMLElement>(`#guide-${id}`);
    if (!target) return;
    this.body.scrollTo({ top: target.offsetTop - 24, behavior: instant ? "auto" : "smooth" });
    this.markCurrent(id);
  }

  private markCurrent(id: string): void {
    for (const [key, link] of this.links) {
      link.setAttribute("aria-current", String(key === id));
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const focusable = Array.from(
      this.sheet.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])"),
    ).filter((node) => !node.hasAttribute("disabled"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
