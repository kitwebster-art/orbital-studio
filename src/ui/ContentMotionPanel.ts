import { DEFAULT_CONTENT_MOTION_SETTINGS, normaliseContentMotionSettings, type ContentMotionSettings } from '../core/contentMotion';
import { BALLOON_COMPOSITION_RECIPES, CREATIVE_RECIPES, IRIDESCENT_LINE_RECIPES, type CreativeRecipe } from '../core/creativeRecipes';

const KEY = 'orbital.content-motion/1.0';
export class ContentMotionPanel {
  readonly element = document.createElement('section');
  private settings: ContentMotionSettings = { ...DEFAULT_CONTENT_MOTION_SETTINGS };
  constructor(host: HTMLElement, private readonly callbacks: {
    change(settings: ContentMotionSettings): void;
    recenter(): void;
    focusBall(): void;
    focusLayout(): void;
    selectLook(id: string): void;
    selectRecipe(recipe: CreativeRecipe): void;
  }) {
    try { this.settings = normaliseContentMotionSettings(JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* default */ }
    this.element.className = 'control-section content-motion-panel';
    this.element.dataset.workspacePanel = 'looks';
    this.element.innerHTML = `<div class="section-heading"><span>IRIDESCENT LINE STUDIES</span><small>three flowing variants</small></div>
      <div class="creative-recipe-buttons iridescent-line-buttons" role="group" aria-label="Iridescent line studies">${IRIDESCENT_LINE_RECIPES.map(recipe => `<button type="button" data-creative-recipe="${recipe.id}" title="${recipe.description}"><strong>${recipe.name}</strong><small>${recipe.id === 'rainbow-filaments' ? 'Fine rainbow lines · black' : recipe.id === 'chromatic-contours' ? 'Bold colour contours · black' : 'Fingerprint contours · monochrome'}</small></button>`).join('')}</div>
      <div class="section-heading"><span>BALLOON COMPOSITIONS</span><small>six ready-to-play looks</small></div>
      <div class="creative-recipe-buttons" aria-label="Creative balloon compositions">${BALLOON_COMPOSITION_RECIPES.map(recipe => `<button type="button" data-creative-recipe="${recipe.id}" title="${recipe.description}"><strong>${recipe.name}</strong><small>${recipe.motion.mode === 'world-locked' ? 'Frozen · world locked' : recipe.motion.mode === 'opposite' ? `${recipe.motion.gain}× opposite motion` : recipe.preset.shaderId.startsWith('interior-') ? 'Virtual interior + outer grid' : 'Colour impacts · black background'}</small></button>`).join('')}</div>
      <details class="content-motion-details"><summary>Movement effect <span id="content-motion-summary"></span></summary>
      <label class="editor-field"><span>Content follows</span><select id="content-motion-mode">
        <option value="surface">Ball surface · normal</option><option value="opposite">Opposite motion · amplified</option><option value="world-locked">World locked · floating window</option></select></label>
      <label class="editor-field"><span>Opposite speed <output id="content-motion-gain-value"></output></span><input id="content-motion-gain" type="range" min="0" max="4" step="0.1" aria-label="Opposite motion multiplier"></label>
      <button type="button" id="content-motion-recenter" class="wide-button">Recenter content here</button>
      <p id="content-motion-description" class="control-note"></p><output id="content-motion-state" class="control-note"></output></details>
      <div class="tonight-view-buttons"><button type="button" id="tonight-focus-ball">Preview balloon close-up</button><button type="button" id="tonight-focus-layout">View equipment layout</button></div>
      <details class="tonight-look-details"><summary>Individual test looks</summary><div class="tonight-look-buttons">
        <button type="button" data-tonight-look="paint-splatter">Colour splatters</button>
        <button type="button" data-tonight-look="interior-orbits">Inside · orbits</button>
        <button type="button" data-tonight-look="interior-crystal">Inside · crystal</button>
        <button type="button" data-tonight-look="interior-tidal">Inside · tidal</button>
        <button type="button" data-tonight-look="back-hemisphere-mesh">Back hemisphere · mesh</button>
      </div></details><small class="control-note">Each composition sets its artwork, speed and movement effect. Interior and rear views are virtual illusions. The projection boundary keeps tracking the ball.</small>`;
    host.insertBefore(this.element, host.querySelector('.shader-section'));
    this.element.querySelector<HTMLSelectElement>('#content-motion-mode')!.addEventListener('change', e => {
      this.settings = normaliseContentMotionSettings({ ...this.settings, mode: (e.target as HTMLSelectElement).value as ContentMotionSettings['mode'] }); this.apply();
    });
    this.element.querySelector<HTMLInputElement>('#content-motion-gain')!.addEventListener('input', e => {
      this.settings = normaliseContentMotionSettings({ ...this.settings, gain: Number((e.target as HTMLInputElement).value) }); this.apply();
    });
    this.element.querySelector('#tonight-focus-ball')!.addEventListener('click', () => callbacks.focusBall());
    this.element.querySelector('#tonight-focus-layout')!.addEventListener('click', () => callbacks.focusLayout());
    this.element.querySelector('#content-motion-recenter')!.addEventListener('click', () => callbacks.recenter());
    this.element.querySelectorAll<HTMLButtonElement>('[data-tonight-look]').forEach(button => button.addEventListener('click', () => callbacks.selectLook(button.dataset.tonightLook!)));
    this.element.querySelectorAll<HTMLButtonElement>('[data-creative-recipe]').forEach(button => button.addEventListener('click', () => {
      const recipe = CREATIVE_RECIPES.find(candidate => candidate.id === button.dataset.creativeRecipe);
      if (recipe) callbacks.selectRecipe(recipe);
    }));
    this.apply();
  }
  setMotionSettings(settings: ContentMotionSettings): void {
    this.settings = normaliseContentMotionSettings(settings);
    this.apply();
  }
  update(state: { mode: string; anchored: boolean; coordinateSpace: string; offset: {x:number;y:number;z:number} }): void {
    const readout = this.element.querySelector('#content-motion-state')!;
    const text = state.mode === 'surface' ? 'Normal surface mapping' : `${state.anchored ? 'Motion reference set' : 'Waiting for tracking reference'} · ${state.coordinateSpace === 'projector-pixels' ? 'camera-mapped output' : '3D preview / calibrated world'}`;
    if (readout.textContent !== text) readout.textContent = text;
    this.element.dataset.motionOffset = JSON.stringify(state.offset);
  }
  private apply(): void {
    const opposite = this.settings.mode === 'opposite';
    this.element.querySelector<HTMLSelectElement>('#content-motion-mode')!.value = this.settings.mode;
    const gain = this.element.querySelector<HTMLInputElement>('#content-motion-gain')!;
    gain.value = String(this.settings.gain); gain.disabled = !opposite;
    this.element.querySelector('#content-motion-gain-value')!.textContent = `${this.settings.gain.toFixed(1)}×`;
    this.element.querySelector('#content-motion-summary')!.textContent = opposite ? `Opposite · ${this.settings.gain.toFixed(1)}×` : this.settings.mode === 'world-locked' ? 'World locked' : 'Surface';
    this.element.querySelector('#content-motion-description')!.textContent = this.settings.mode === 'surface'
      ? 'Artwork travels with the balloon. Choose an effect, then move the tracked ball.'
      : opposite ? 'Ball moves right, artwork travels left. The multiplier controls the opposite travel. Start at 1×, then increase.'
      : 'Translation is cancelled so the balloon acts like a moving window onto stationary artwork. Set animation speed to zero for the clearest illusion. This does not measure balloon rotation.';
    try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch { /* usable without storage */ }
    this.callbacks.change(this.settings);
  }
}
