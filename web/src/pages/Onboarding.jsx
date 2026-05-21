import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ChoiceCard from "../components/ChoiceCard";
import ProblemiNotiPicker from "../components/ProblemiNotiPicker";
import StepGuide from "../components/StepGuide";
import StepProgress from "../components/StepProgress";
import {
  ADVANCED_FIELDS,
  EXTRA_STEP,
  ONBOARDING_STEPS,
  DEFAULT_ONBOARDING_BG,
} from "../data/onboardingSteps";
import { preloadOnboardingImage } from "../lib/onboardingImages";
import { formatMqInput, parseMqInput } from "../lib/parseMq";
import { DISCLAIMER_LEGALE } from "../lib/sicurezzaClient";
import { savePratoProfilo } from "../lib/supabase";
import LawnMapModal from "../components/LawnMapModal";
import LawnMapProfileCard from "../components/LawnMapProfileCard";
import ProfileResetButton from "../components/ProfileResetButton";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

const EMPTY = {
  uso: null,
  esposizione: null,
  tipo_terreno: null,
  irrigazione: null,
  eta_prato: null,
  obiettivo: null,
  livello_impegno: "base",
  frequenza_taglio: null,
  altezza_taglio_cm: null,
  animali: null,
  problemi_noti: [],
  pendenza: null,
  ristagno_acqua: null,
  ombra_zone_pct: null,
  ph_terreno: null,
  ph_valore: "",
  analisi_terreno_fatta: false,
  note_terreno: "",
  marca_seme: "",
  superficie_mq: "",
  localita: "",
  disclaimer_accettato: false,
  prato_zone: null,
};

function profileToAnswers(p) {
  if (!p) return { ...EMPTY };
  return {
    uso: p.uso ?? null,
    esposizione: p.esposizione ?? null,
    tipo_terreno: p.tipo_terreno ?? null,
    irrigazione: p.irrigazione ?? null,
    eta_prato: p.eta_prato ?? null,
    obiettivo: p.obiettivo ?? null,
    livello_impegno: p.livello_impegno ?? "base",
    frequenza_taglio: p.frequenza_taglio ?? null,
    altezza_taglio_cm: p.altezza_taglio_cm ?? null,
    animali: p.animali ?? null,
    problemi_noti: Array.isArray(p.problemi_noti) ? p.problemi_noti : [],
    pendenza: p.pendenza ?? null,
    ristagno_acqua: p.ristagno_acqua ?? null,
    ombra_zone_pct: p.ombra_zone_pct ?? null,
    ph_terreno: p.ph_terreno ?? null,
    ph_valore: p.ph_valore != null ? String(p.ph_valore).replace(".", ",") : "",
    analisi_terreno_fatta: !!p.analisi_terreno_fatta,
    note_terreno: p.note_terreno || "",
    marca_seme: p.marca_seme || "",
    superficie_mq: p.superficie_mq != null ? formatMqInput(p.superficie_mq) : "",
    localita: p.localita || "",
    disclaimer_accettato: !!p.disclaimer_accettato_at,
    prato_zone: p.prato_zone ?? null,
  };
}

function parsePhInput(raw) {
  if (!raw?.trim()) return null;
  const n = Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 4 || n > 9) return null;
  return Math.round(n * 10) / 10;
}

function stepSkipped(stepData, answers) {
  return stepData?.skipIf?.(answers);
}

function findNextStep(from, answers, dir = 1) {
  let i = from;
  while (i >= 0 && i < ONBOARDING_STEPS.length) {
    if (!stepSkipped(ONBOARDING_STEPS[i], answers)) return i;
    i += dir;
  }
  return dir > 0 ? ONBOARDING_STEPS.length : -1;
}

function resolveStepBg(stepIndex, answers) {
  if (stepIndex >= ONBOARDING_STEPS.length) return EXTRA_STEP.backgroundImage;
  const sd = ONBOARDING_STEPS[stepIndex];
  if (!sd) return DEFAULT_ONBOARDING_BG;
  const v = sd.type !== "multi" && sd.field ? answers[sd.field] : null;
  const opt = v && sd.options ? sd.options.find((o) => o.value === v) : null;
  return opt?.image ?? sd.backgroundImage ?? DEFAULT_ONBOARDING_BG;
}

export default function Onboarding({ userId, initialProfile, onComplete }) {
  const nav = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() => profileToAnswers(initialProfile));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mapOpen, setMapOpen] = useState(() => Boolean(location.state?.openMap));
  const [advancedOpen, setAdvancedOpen] = useState(() =>
    Boolean(
      initialProfile?.pendenza ||
        initialProfile?.ristagno_acqua ||
        initialProfile?.ombra_zone_pct ||
        initialProfile?.ph_terreno ||
        initialProfile?.ph_valore != null ||
        initialProfile?.analisi_terreno_fatta ||
        initialProfile?.note_terreno,
    ),
  );

  useEffect(() => {
    if (location.state?.openMap) {
      setMapOpen(true);
      nav(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.openMap, location.pathname, nav]);

  const isExtra = step >= ONBOARDING_STEPS.length;
  const stepData = isExtra ? null : ONBOARDING_STEPS[step];
  const isMulti = stepData?.type === "multi";
  const value = stepData && !isMulti ? answers[stepData.field] : null;

  function setField(f, v) {
    setAnswers((a) => ({ ...a, [f]: v }));
  }

  function handleMapApply({ localita, superficie_mq, prato_zone, ombra_zone_pct }) {
    setAnswers((a) => ({
      ...a,
      ...(localita ? { localita } : {}),
      ...(superficie_mq != null ? { superficie_mq: formatMqInput(superficie_mq) } : {}),
      ...(prato_zone ? { prato_zone } : {}),
      ...(ombra_zone_pct ? { ombra_zone_pct } : {}),
    }));
  }

  async function finish() {
    const mq = parseMqInput(answers.superficie_mq);
    if (mq == null || mq <= 0) {
      setError("Indica la superficie del prato in m² (obbligatorio per dosi e calendario).");
      return;
    }
    if (!answers.localita?.trim()) {
      setError("Indica la località del prato (città o CAP).");
      return;
    }
    if (!answers.disclaimer_accettato) {
      setError("Devi accettare il disclaimer legale per usare AgriPocket.");
      return;
    }
    const ph = parsePhInput(answers.ph_valore);
    if (answers.ph_valore?.trim() && ph == null) {
      setError("pH non valido: usa un numero tra 4 e 9 (es. 6,5).");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await savePratoProfilo(userId, { ...answers, ph_valore: ph });
      onComplete(saved);
      nav("/dashboard", { replace: true });
    } catch (e) {
      setError(e.message || "Errore di salvataggio");
    } finally {
      setSaving(false);
    }
  }

  function next() {
    if (isExtra) {
      finish();
      return;
    }
    if (!isMulti && !value) return;
    const n = findNextStep(step + 1, answers, 1);
    setStep(n);
  }

  function back() {
    if (step <= 0) return;
    const p = findNextStep(step - 1, answers, -1);
    if (p >= 0) setStep(p);
  }

  const totalSteps = ONBOARDING_STEPS.length + 1;
  const displayStep = isExtra ? totalSteps : step + 1;
  const selectedOption =
    stepData && !isMulti && value ? stepData.options.find((o) => o.value === value) : null;
  const stepBg = isExtra ? EXTRA_STEP.backgroundImage : stepData?.backgroundImage;
  const bgImage = selectedOption?.image ?? stepBg ?? DEFAULT_ONBOARDING_BG;

  useEffect(() => {
    preloadOnboardingImage(bgImage);
    const nextIdx = findNextStep(step + 1, answers, 1);
    if (nextIdx >= 0) preloadOnboardingImage(resolveStepBg(nextIdx, answers));
    const next2 = findNextStep(nextIdx + 1, answers, 1);
    if (next2 >= 0 && next2 !== nextIdx) preloadOnboardingImage(resolveStepBg(next2, answers));
    for (const opt of stepData?.options ?? []) {
      if (opt.image) preloadOnboardingImage(opt.image);
    }
  }, [step, bgImage, answers, stepData]);

  const extraReady =
    isExtra &&
    answers.disclaimer_accettato &&
    answers.localita?.trim() &&
    parseMqInput(answers.superficie_mq) != null;

  const canAdvance = isExtra ? extraReady : isMulti || !!value;

  const canLeaveProfile =
    Boolean(initialProfile?.onboarding_completato && initialProfile?.disclaimer_accettato_at);

  function exitToDashboard() {
    nav("/dashboard", { replace: true });
  }

  return (
    <div className="onboarding-shell">
      <div
        key={bgImage}
        className="onboarding-bg"
        style={{ backgroundImage: `url(${bgImage})` }}
        aria-hidden
      />
      <div className="onboarding-bg-overlay" aria-hidden />

      <div className="page onboarding onboarding--has-bg">
        <div className="onboarding-content">
          {canLeaveProfile ? (
            <div className="onboarding-exit-bar">
              <button type="button" className="btn btn-ghost btn-sm onboarding-exit-bar__btn" onClick={exitToDashboard}>
                ← Torna alla dashboard
              </button>
              <p className="onboarding-exit-bar__hint">
                Modifica opzionale. Esci quando vuoi: le risposte non salvate non contano.
              </p>
            </div>
          ) : null}

          <StepProgress current={Math.min(step, ONBOARDING_STEPS.length)} total={totalSteps} />

          <div key={step} className="onboarding-step-body">
            {stepData ? (
              <>
                <h1>{stepData.title}</h1>
                <StepGuide
                  intro={stepData.intro}
                  whatToDo={stepData.whatToDo}
                  hint={stepData.hint}
                  reassurance={stepData.reassurance}
                  bullets={stepData.bullets}
                  stepNumber={displayStep}
                  totalSteps={totalSteps}
                />
                {isMulti ? (
                  <ProblemiNotiPicker
                    selected={answers.problemi_noti}
                    onChange={(v) => setField("problemi_noti", v)}
                  />
                ) : (
                  <>
                    <p className="choice-section-label">
                      {stepData.choiceSectionLabel ?? "Tocca una riga per selezionarla"}
                    </p>
                    <div className="choice-grid">
                      {stepData.options.map((opt) => (
                        <ChoiceCard
                          key={opt.value}
                          option={opt}
                          selected={value === opt.value}
                          onSelect={(v) => setField(stepData.field, v)}
                          hideThumb={value === opt.value && !!bgImage}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <h1>{EXTRA_STEP.title}</h1>
                <StepGuide
                  intro={EXTRA_STEP.intro}
                  whatToDo={EXTRA_STEP.whatToDo}
                  stepNumber={displayStep}
                  totalSteps={totalSteps}
                />
                <section className="field-group field-group--place">
                  <LawnMapProfileCard
                    onOpenMap={() => setMapOpen(true)}
                    localita={answers.localita}
                    superficie_mq={answers.superficie_mq}
                    pratoZone={answers.prato_zone}
                    apiKeyMissing={!GOOGLE_MAPS_API_KEY?.trim()}
                  />
                  <details className="field-manual-fallback">
                    <summary className="field-manual-fallback__summary">
                      Inserisci luogo e m² a mano (senza mappa)
                    </summary>
                    <div className="field-manual-fallback__body">
                      <label className="field-block">
                        Dove si trova il prato
                        <p className="field-block-hint">{EXTRA_STEP.localitaHint}</p>
                        <input
                          placeholder="es. Bologna, 20100"
                          value={answers.localita}
                          onChange={(e) => setField("localita", e.target.value)}
                          autoComplete="address-level2"
                        />
                      </label>
                      <label className="field-block">
                        Superficie (m²) <span className="field-required">*</span>
                        <p className="field-block-hint">{EXTRA_STEP.mqHint}</p>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="es. 120 oppure 125,5"
                          value={answers.superficie_mq}
                          onChange={(e) => setField("superficie_mq", e.target.value)}
                          required
                        />
                      </label>
                    </div>
                  </details>
                </section>
                <label className="field-block">
                  Marca o tipo di seme (se lo ricordi)
                  <input
                    placeholder="es. miscuglio prato, Leroy Merlin…"
                    value={answers.marca_seme}
                    onChange={(e) => setField("marca_seme", e.target.value)}
                  />
                </label>

                <details
                  className="profile-advanced"
                  open={advancedOpen}
                  onToggle={(e) => setAdvancedOpen(e.target.open)}
                >
                  <summary className="profile-advanced__summary">{EXTRA_STEP.advancedTitle}</summary>
                  <p className="profile-advanced__intro">{EXTRA_STEP.advancedIntro}</p>
                  {Object.entries(ADVANCED_FIELDS).map(([field, cfg]) => (
                    <fieldset key={field} className="profile-advanced__field">
                      <legend>{cfg.label}</legend>
                      {cfg.hint ? <p className="field-block-hint">{cfg.hint}</p> : null}
                      <div className="profile-advanced__chips">
                        {cfg.options.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            className={`profile-advanced__chip${
                              answers[field] === opt.value ? " profile-advanced__chip--on" : ""
                            }`}
                            onClick={() => setField(field, answers[field] === opt.value ? null : opt.value)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                  <label className="field-block">
                    pH misurato (numero)
                    <p className="field-block-hint">{EXTRA_STEP.phValoreHint}</p>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="es. 6,5"
                      value={answers.ph_valore}
                      onChange={(e) => setField("ph_valore", e.target.value)}
                    />
                  </label>
                  <label className="disclaimer-block__check">
                    <input
                      type="checkbox"
                      checked={answers.analisi_terreno_fatta}
                      onChange={(e) => setField("analisi_terreno_fatta", e.target.checked)}
                    />
                    <span>Ho fatto un&apos;analisi di laboratorio del terreno</span>
                  </label>
                  <label className="field-block">
                    Note analisi terreno
                    <p className="field-block-hint">{EXTRA_STEP.noteTerrenoHint}</p>
                    <textarea
                      rows={3}
                      value={answers.note_terreno}
                      onChange={(e) => setField("note_terreno", e.target.value)}
                      placeholder="Opzionale"
                    />
                  </label>
                </details>

                <section className="disclaimer-block">
                  <h2 className="field-group__title">Disclaimer legale</h2>
                  <p className="disclaimer-block__text">{DISCLAIMER_LEGALE}</p>
                  <label className="disclaimer-block__check">
                    <input
                      type="checkbox"
                      checked={answers.disclaimer_accettato}
                      onChange={(e) => setField("disclaimer_accettato", e.target.checked)}
                    />
                    <span>
                      Ho letto e accetto il disclaimer. Comprendo che AgriPocket non sostituisce un
                      professionista.
                    </span>
                  </label>
                </section>
              </>
            )}
          </div>

          {error && <p className="form-msg form-msg--error">{error}</p>}

          <div className="onboarding-nav">
            {step > 0 ? (
              <button type="button" className="btn btn-ghost" onClick={back}>
                Indietro
              </button>
            ) : canLeaveProfile ? (
              <button type="button" className="btn btn-ghost" onClick={exitToDashboard}>
                Esci senza salvare
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              className={`btn btn-primary${!isExtra && canAdvance ? " btn-primary--ready" : ""}`}
              disabled={!canAdvance || saving}
              onClick={next}
            >
              {saving ? "…" : isExtra ? "Vai all'agronomo" : "Avanti"}
            </button>
          </div>

          {(initialProfile?.onboarding_completato || initialProfile?.localita) && (
            <ProfileResetButton
              embedded
              stayOnPage
              onResetComplete={(p) => {
                onComplete(p);
                setAnswers(profileToAnswers(p));
                setStep(0);
                setError("");
              }}
            />
          )}
        </div>
      </div>

      <LawnMapModal
        open={mapOpen}
        apiKey={GOOGLE_MAPS_API_KEY}
        purpose="boundary"
        initialLocalita={answers.localita}
        initialPratoZone={answers.prato_zone}
        onClose={() => setMapOpen(false)}
        onApply={handleMapApply}
      />
    </div>
  );
}



