import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ChoiceCard from "../components/ChoiceCard";
import StepGuide from "../components/StepGuide";
import StepProgress from "../components/StepProgress";
import { EXTRA_STEP, ONBOARDING_STEPS } from "../data/onboardingSteps";
import { formatMqInput, parseMqInput } from "../lib/parseMq";
import { savePratoProfilo } from "../lib/supabase";
import LawnMapModal from "../components/LawnMapModal";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

const EMPTY = {
  uso: null,
  esposizione: null,
  tipo_terreno: null,
  irrigazione: null,
  marca_seme: "",
  superficie_mq: "",
  localita: "",
};

export default function Onboarding({ userId, onComplete }) {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mapOpen, setMapOpen] = useState(false);

  const isExtra = step === ONBOARDING_STEPS.length;
  const stepData = isExtra ? null : ONBOARDING_STEPS[step];
  const value = stepData ? answers[stepData.field] : null;

  function setField(f, v) {
    setAnswers((a) => ({ ...a, [f]: v }));
  }

  function handleMapApply({ localita, superficie_mq }) {
    setAnswers((a) => ({
      ...a,
      ...(localita ? { localita } : {}),
      ...(superficie_mq != null ? { superficie_mq: formatMqInput(superficie_mq) } : {}),
    }));
  }

  async function finish() {
    if (answers.superficie_mq?.trim() && parseMqInput(answers.superficie_mq) == null) {
      setError("Superficie non valida. Usa numeri e la virgola per i decimali (es. 125,5).");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await savePratoProfilo(userId, answers);
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
    if (!value) return;
    setStep(step + 1);
  }

  function back() {
    if (step > 0) setStep(step - 1);
  }

  const totalSteps = ONBOARDING_STEPS.length + 1;
  const displayStep = isExtra ? totalSteps : step + 1;
  const selectedOption =
    stepData && value ? stepData.options.find((o) => o.value === value) : null;
  const bgImage = selectedOption?.image ?? null;

  return (
    <div className="onboarding-shell">
      {bgImage ? (
        <div
          key={bgImage}
          className="onboarding-bg"
          style={{ backgroundImage: `url(${bgImage})` }}
          aria-hidden
        />
      ) : null}
      {bgImage ? <div className="onboarding-bg-overlay" aria-hidden /> : null}

      <div
        className={`page onboarding${bgImage ? " onboarding--has-bg" : ""}`}
      >
        <div className="onboarding-content">
          <StepProgress current={step} total={totalSteps} />

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
                  <h2 className="field-group__title">Luogo e metri quadri</h2>
                  <p className="field-group__lead">{EXTRA_STEP.mqMapHint}</p>
                  <button type="button" className="btn btn-outline field-map-open" onClick={() => setMapOpen(true)}>
                    Apri mappa (luogo + m²)
                  </button>
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
                    Superficie (m²)
                    <p className="field-block-hint">{EXTRA_STEP.mqHint}</p>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="es. 120 oppure 125,5"
                      value={answers.superficie_mq}
                      onChange={(e) => setField("superficie_mq", e.target.value)}
                    />
                  </label>
                </section>
                <label className="field-block">
                  Marca o tipo di seme (se lo ricordi)
                  <input
                    placeholder="es. miscuglio prato, Leroy Merlin…"
                    value={answers.marca_seme}
                    onChange={(e) => setField("marca_seme", e.target.value)}
                  />
                </label>
              </>
            )}
          </div>

          {error && <p className="form-msg form-msg--error">{error}</p>}

          <div className="onboarding-nav">
            {step > 0 ? (
              <button type="button" className="btn btn-ghost" onClick={back}>
                Indietro
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              className={`btn btn-primary${!isExtra && value ? " btn-primary--ready" : ""}`}
              disabled={(!isExtra && !value) || saving}
              onClick={next}
            >
              {saving ? "…" : isExtra ? "Vai all'agronomo" : "Avanti"}
            </button>
          </div>
        </div>
      </div>

      <LawnMapModal
        open={mapOpen}
        apiKey={GOOGLE_MAPS_API_KEY}
        initialLocalita={answers.localita}
        onClose={() => setMapOpen(false)}
        onApply={handleMapApply}
      />
    </div>
  );
}
