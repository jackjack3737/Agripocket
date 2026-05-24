# AgriPocket — lavorare con Cursor da telefono (GitHub Issue)

Questa guida collega **GitHub** (app sul cellulare) e **Cursor Cloud Agent** (`@cursor`), così puoi chiedere modifiche al codice senza aprire il PC.

Repository: **https://github.com/jackjack3737/Agripocket**

---

## Parte A — Setup una tantum (PC, ~10 minuti)

Fai questi passi **una sola volta** dal computer (non dal telefono).

### 1. Collega GitHub a Cursor

1. Vai su [cursor.com/dashboard](https://cursor.com/dashboard) e accedi.
2. **Integrations** → **GitHub** → **Connect**.
3. Autorizza l’organizzazione/account e concedi accesso al repo **`jackjack3737/Agripocket`** (tutti i repo o solo questo).

### 2. Abilita Cloud Agents

1. Stesso dashboard: verifica di avere **Cloud Agents** (piano Pro o equivalente con agent cloud).
2. Apri [cursor.com/agents](https://cursor.com/agents) e controlla che compaia il repo Agripocket.

### 3. Installa l’app GitHub sul telefono

- [iOS App Store](https://apps.apple.com/app/github/id1477376905)
- [Google Play](https://play.google.com/store/apps/details?id=com.github.android)

Accedi con lo **stesso account GitHub** collegato a Cursor.

### 4. (Opzionale) Etichetta `cursor-agent`

Su GitHub → repo → **Issues** → **Labels** → crea etichetta `cursor-agent` (colore a piacere).  
Il template issue la propone già; se non esiste, GitHub la crea al primo utilizzo del template.

---

## Parte B — Dal cellulare (ogni richiesta)

### Passo 1 — Apri il repo

App **GitHub** → cerca **Agripocket** (utente `jackjack3737`) → apri il repository.

### Passo 2 — Nuova issue

1. Tab **Issues** → pulsante verde **New issue**.
2. Scegli il template **「Richiesta Cursor (da telefono o web)」**.
3. Compila:
   - **Titolo:** breve (es. `Griglia irrigazione: minuti per linea`)
   - **Area** e **Cosa deve fare Cursor** (testo chiaro, anche a punti)
4. Tocca **Submit new issue**.

### Passo 3 — Attiva Cursor

Subito **dopo** aver creato l’issue, apri i **Commenti** e scrivi un messaggio così:

```text
@cursor implementa questa richiesta. Branch main. Apri una PR con riepilogo in italiano. Se serve deploy Vercel dalla cartella web/, indicamelo nel commento della PR.
```

Puoi adattare il testo (es. «solo analisi, non fare merge»).

> **Nota:** su mobile a volte `@cursor` va scritto in un **secondo commento**, non nel corpo dell’issue. Se l’agent non parte, commenta di nuovo solo con `@cursor` + ripeti l’istruzione.

### Passo 4 — Cosa succede

1. Cursor Cloud Agent legge issue + commento.
2. Lavora sul codice e apre una **Pull Request**.
3. Ricevi notifiche GitHub (push sul telefono se attive).
4. Dalla app: **Pull requests** → apri la PR → leggi descrizione e file cambiati.

### Passo 5 — Tu cosa fai dopo

| Obiettivo | Azione sul telefono |
|----------|---------------------|
| Va bene così | PR → **Merge** (se sei sicuro) oppure aspetta il PC |
| Serve correzione | Nuovo commento: `@cursor nella PR #N correggi: …` |
| Solo provare in produzione | Sul PC: merge + deploy, oppure chiedi nel commento `@cursor` di deployare |

**Consiglio:** per AgriPocket il deploy produzione è `npx vercel --prod` dalla cartella `web/` — spesso è più semplice farlo dal PC dopo il merge.

---

## Esempio completo (copia-incolla)

**Titolo issue:** `[Cursor] Dashboard: scroll in alto all’apertura`

**Corpo (template):** area Dashboard, testo che descrivi il problema.

**Commento:**

```text
@cursor implementa questa richiesta su main. Apri PR. In riepilogo indica file toccati e come verificare su https://agripocket-azure.vercel.app
```

---

## Problemi frequenti

| Problema | Soluzione |
|----------|-----------|
| `@cursor` non risponde | GitHub non collegato in Cursor dashboard; o piano senza Cloud Agents |
| Agent su repo sbagliato | Ricollega GitHub e seleziona `Agripocket` |
| Nessuna PR dopo 30 min | Commenta di nuovo `@cursor status?` o apri [cursor.com/agents](https://cursor.com/agents) |
| Vuoi solo parlare, senza codice | Usa [cursor.com/agents](https://cursor.com/agents) dal browser del telefono |

---

## Alternativa senza issue

Browser telefono → [cursor.com/agents](https://cursor.com/agents) → nuovo agent → repo **Agripocket** → scrivi il prompt. Stesso risultato (PR), senza passare da GitHub Issues.

---

*File generato per il flusso issue → @cursor → PR. Aggiorna questo doc se cambi account o nome repo.*
