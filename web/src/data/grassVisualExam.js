const IMG = (name) => `/onboarding/${name}`;

/** Flusso esame visivo fili d'erba → scelta tipo prato */
export const GRASS_VISUAL_EXAM = {
  prepare: {
    title: "1 · Preleva alcuni fili",
    text: "Scegli un punto del prato poco calpestato (bordo o angolo). In ginocchio, afferra delicatamente 5–10 fili e tirali verso l'alto. Non serve strappare la zolla intera.",
    image: IMG("grass-exam-preleva.png"),
    caption: "Preleva più fili da un unico punto",
  },
  tests: [
    {
      id: "origine",
      title: "2 · Da dove escono i fili?",
      question: "Guarda la base: tutti i fili partono da un solo punto stretto, oppure vedi rami sottili che corrono sul terreno?",
      imageA: IMG("grass-exam-ciuffo.png"),
      captionA: "Un solo punto → ciuffi (es. Festuca rubra)",
      picksA: "cespitoso",
      imageB: IMG("grass-exam-stoloni.png"),
      captionB: "Rami sul suolo → tappeto (es. Lolium, Poa)",
      picksB: "tappeto",
    },
    {
      id: "foglia",
      title: "3 · Che foglia hai tra le dita?",
      question: "Arrotola una foglia: è sottilissima come un capello, o più larga e un po' rigida?",
      image: IMG("grass-exam-foglia.png"),
      caption: "Sottile = prato fine · Larga = spesso più rustico",
      picksFine: "tappeto",
      picksWide: "rustico",
      note: "Questo passo è un indizio, non una regola assoluta.",
    },
  ],
  resultIntro: "In base a quello che hai visto, quale descrizione corrisponde?",
};
