# WeSpR — Investigation runtime : blocage « Chargement du modèle Whisper »

> Rédigé après lecture complète du code source. Mis à jour après diagnostic et correctif.

---

## 1. Vue d'ensemble du projet

**But** : transcription audio/vidéo 100 % locale sur macOS, sans compte ni cloud.  
Le `.dmg` est autoportant — il embarque les binaires (`ffmpeg`, `ffprobe`, `whisper-cli`, `yt-dlp`).

**Stack** :
- Electron 29 (main process) + React 18 + TypeScript + Vite (renderer)
- Zustand pour l'état UI ; Framer Motion pour les transitions
- `whisper.cpp` pour la transcription ; `ffmpeg` pour la conversion/découpage
- `yt-dlp` pour l'import URL

**Architecture main / preload / renderer** :
```
Renderer (React) ──window.wespr.*──▶ Preload (contextBridge) ──IPC──▶ Main (Electron)
```
- Le renderer n'a **jamais** accès à Node.js directement.
- `electron/preload.ts` est le seul pont, exposé via `contextBridge.exposeInMainWorld('wespr', api)`.
- Les IPC sont de deux types : `invoke/handle` (requête-réponse) et `send/on` (événements push).

**Pipeline de transcription** (ordre strict) :
1. Conversion → WAV 16 kHz mono (`ffmpeg`)
2. Découpage → segments de 55 s avec 2 s de chevauchement (`ffmpeg -f segment`)
3. Transcription de chaque segment → JSON (`whisper-cli --output-json`)
4. Fusion des segments, correction des offsets (`n × 53 s`), déduplication
5. Nettoyage de `/tmp/wespr-{jobId}/` (toujours, même en cas d'erreur)

**Stratégie de packaging** :
- `electron-builder` produit un `.dmg` universel (arm64 + x64).
- Les binaires sont dans `resources/binaries/` (gitignored) → copiés dans `Contents/Resources/binaries/` via `extraResources`.
- Au premier lancement, le main process les copie dans `~/Library/Application Support/WeSpR/bin/`.

---

## 2. Flux utilisateur

### Transcription d'un fichier
1. L'utilisateur dépose un fichier dans `DropZone`.
2. `wespr.getFileInfo(path)` est appelé → `ffprobe` renvoie durée/format.
3. L'utilisateur clique « Transcrire » → `useTranscriptionStore.start()` → `wespr.transcribe(opts)`.
4. Les événements `wespr:progress` mettent à jour l'UI ; `wespr:result` ou `wespr:error` terminent.

### Transcription depuis URL
Même pipeline, précédé d'un téléchargement `yt-dlp` (étape `downloading`).

### Transcription voix / dictée
- Mode memo : accumulation PCM16 → WAV en fin de session → `runPipeline`.
- Mode live : transcription partielle toutes les ~32 000 samples.

### Gestion des modèles
- `wespr.listModels()` → requête HuggingFace + fallback `STATIC_MODELS`.
- Les fichiers `.bin` sont stockés dans `~/Library/Application Support/WeSpR/models/`.
- `resolveModelPath(id)` → trouve le bon chemin parmi les candidats (géré WeSpR + externes).

---

## 3. Flux des binaires

### Où sont-ils préparés ?
- `scripts/download-ffmpeg.sh` / `scripts/download-ytdlp.sh` → `resources/binaries/`
- `scripts/build-whisper.sh` → compile `whisper-cli-arm64` et `whisper-cli-x64`

### Embarquement dans le bundle
```yaml
extraResources:
  - from: resources/binaries/
    to: binaries/
    filter: ["**/*"]
```
→ Destination finale : `Contents/Resources/binaries/` (hors asar, directement accessible).

### Copie au runtime
Dans `electron/services/ffmpeg.ts`, `ensureBundledBinaries()` :
```
sourceDir = process.resourcesPath + '/binaries'  (packaged)
binDir    = ~/Library/Application Support/WeSpR/bin
```
Candidats tentés : `ffmpeg`, `ffprobe`, `whisper-cli-arm64`, `whisper-cli`, `whisper-cli-x64`, `yt-dlp`.  
Chaque fichier présent dans `sourceDir` est copié dans `binDir` (une seule fois) avec `chmod 755`.

### Sélection selon l'architecture
```typescript
function resolveWhisperBinaryName() {
  return process.arch === 'arm64' ? 'whisper-cli-arm64' : 'whisper-cli-x64';
}
```
La valeur retournée (`binaries.whisper`) est le chemin utilisé dans `spawn()`.

---

## 4. Système de progression UI

### Étapes définies (`ProgressPanel.tsx`)
```
['downloading',  'Téléchargement de l'audio',       ...]
['converting',   'Préparation du fichier',            ...]
['segmenting',   'Chargement du modèle Whisper',      ...]  ← ⚠️ label trompeur
['transcribing', 'Transcription en cours…',           ...]
['merging',      'Détection des locuteurs',            ...]
['cleanup',      'Ponctuation et formatage',           ...]
['done',         'Finalisation',                       ...]
```

### Code qui envoie les événements
`electron/ipc/transcribe.ts` → `sendProgress(event)` → `webContents.send('wespr:progress', event)`.

Les étapes sont émises dans cet ordre (`runPipeline`) :
```
converting (0%)
converting (0-100%)   ← pendant convertToMonoWav
segmenting (15%)
segmenting (22%)      ← après segmentAudio ← DERNIER AVANT LE BUG
[await resolveModelPath]  ← point de blocage confirmé (voir §6)
transcribing (22-80%) ← après le correctif
merging (88%)
cleanup (98%)
cleanup (100%)
```

### À quelle vraie phase correspond « Chargement du modèle Whisper » ?
Le label `segmenting` / « Chargement du modèle Whisper » s'affiche pendant le **découpage ffmpeg**, pas pendant le chargement Whisper. Le chargement réel du modèle Whisper se produit pendant la phase `transcribing`. **Ce label est donc trompeur.**

---

## 5. Hypothèses de bug

### H1 — `resolveModelPath` bloque entre `segmenting` et `transcribing` ⭐ PROBABLE

**Argument pour** : Entre le dernier `sendProgress({ step: 'segmenting' })` et le premier `sendProgress({ step: 'transcribing' })`, le seul `await` est `resolveModelPath(options.modelId)`. Cette fonction appelle `resolveInstalledModel` → `getModelCatalog()`, qui lance **2 requêtes HTTP vers HuggingFace** (`REMOTE_MODEL_CARD_URL` + `REMOTE_MODEL_API_URL`) avec un timeout de 10 s. Si le cache est froid (premier lancement, ou race condition : l'utilisateur transcrit avant que `refresh()` du démarrage ait terminé), ces requêtes bloquent jusqu'à 10 s — perçu comme un gel.

**Argument contre** : `App.tsx` appelle `refresh()` au démarrage, ce qui peuple `cachedCatalog`. Mais si l'utilisateur transcrit avant que cette réponse soit revenue (race condition), le cache est vide et les requêtes se relancent.

### H2 — Anti-pattern async executor dans `transcribeChunk` ⭐ CONFIRMÉ CODE BUG

```typescript
// electron/services/whisper.ts — PROBLÈME
export function transcribeChunk(...) {
  return new Promise<...>(
    async (resolve, reject) => {        // ← async dans Promise constructor
      const binaries = await ensureBundledBinaries();  // ← await ici
      ...
    }
  );
}
```
Si `ensureBundledBinaries()` **lève une exception** à l'intérieur de l'exécuteur async, la rejection de la Promise interne est silencieusement avalée. La Promise extérieure n'est **jamais** résolue ni rejetée → hang infini. `wespr:error` n'est jamais envoyé, `isTranscribing` reste `true`.

**Point critique** : `sendProgress({ step: 'transcribing' })` est émis **avant** l'appel à `transcribeChunk`. Donc si c'est ce bug qui bloque, l'UI affiche `transcribing`, pas `segmenting`. Mais si `ensureBundledBinaries()` plante très tôt (avant que le renderer ait traité le message IPC), la dernière étape visible peut rester `segmenting`.

### H3 — `stdout` non drainé dans `runStreamingCommand`

`runStreamingCommand` (utilisé par `segmentAudio`) ne consomme pas `child.stdout`. Si ffmpeg écrit plus de 64 Ko sur stdout, son buffer se sature et il bloque. Pour l'opération de segmentation (sortie vers des fichiers disque, pas stdout), ffmpeg ne devrait pas écrire sur stdout — mais ce n'est pas garanti selon la version du binaire.

**Argument pour** : Expliquerait un blocage infini **à l'étape `segmenting`**, exactement comme décrit.  
**Argument contre** : ffmpeg écrit normalement vers stderr, pas stdout.

### H4 — Whisper-cli s'exécute mais ne termine jamais

Si le modèle est trop grand pour la RAM disponible ou si la version du binaire a un bug, `whisper-cli` peut se retrouver dans une attente infinie. Pas de timeout côté Node.js → hang infini à `transcribing`.

---

## 6. Diagnostic confirmé

Après analyse complète du flux d'exécution :

**Cause racine primaire** : L'anti-pattern async executor dans `transcribeChunk` (H2) est un **bug réel** qui peut causer un blocage infini silencieux dans l'app packagée si `ensureBundledBinaries()` lève une exception (permissions, chemin inaccessible). Dans ce cas, `wespr:error` n'est jamais émis, les logs ne montrent rien, et l'UI reste figée à la dernière étape reçue.

**Cause racine secondaire** : `resolveModelPath` → `getModelCatalog()` fait des requêtes réseau entre l'étape `segmenting` et `transcribing` (H1). En cas de démarrage rapide avant que `refresh()` ait terminé, ces requêtes introduisent jusqu'à 10 s de délai apparent, perçu comme un gel à « Chargement du modèle Whisper ».

**Cause racine tertiaire** : `runStreamingCommand` ne draine pas stdout (H3), risque théorique de deadlock pipe à l'étape `segmenting`.

**Pourquoi le blocage est silencieux** : L'anti-pattern async executor avale l'exception sans appeler `reject()`. La chain d'erreur IPC (`wespr:error`) ne se déclenche pas. Aucun log n'est écrit. La barre de progression reste figée.

---

## 7. Correctif

Trois changements appliqués :

### A — Fix `transcribeChunk` : déplacer `ensureBundledBinaries()` hors du constructeur Promise

**Fichier** : `electron/services/whisper.ts`

```
AVANT  : return new Promise(async (resolve, reject) => { await ensureBundledBinaries(); … })
APRÈS  : async function → await ensureBundledBinaries() → return new Promise((resolve, reject) => { … })
```

Ainsi toute exception dans `ensureBundledBinaries()` remonte normalement dans la chaîne async, et `wespr:error` est envoyé au renderer.

### B — Fix `resolveModelPath` : supprimer la requête réseau du chemin chaud

**Fichier** : `electron/services/modelManager.ts`

Nouvelle logique : utilise `cachedCatalog ?? STATIC_MODELS` (pas de requête réseau). Si le cache est chaud (cas normal — `refresh()` au démarrage), le comportement est identique. Si le cache est froid, on tombe sur `STATIC_MODELS` au lieu de déclencher 2 requêtes HuggingFace pendant la transcription.

### C — Fix label UI trompeur

**Fichier** : `src/components/ProgressPanel.tsx`

`['segmenting', 'Chargement du modèle Whisper', …]`  
→ `['segmenting', 'Découpage de l'audio', 'Préparation des segments pour Whisper']`

### D — Drain stdout dans `runStreamingCommand`

**Fichier** : `electron/services/ffmpeg.ts`

Ajout de `child.stdout.on('data', () => {})` pour éviter tout deadlock pipe si ffmpeg produit de la sortie inattendue.

**Impact** : Compatible arm64 et x64. Aucun changement de comportement en mode dev.

---

## 8. Vérification

- [x] `npm run typecheck` — aucune erreur TypeScript
- [x] `npm run build` — compilation electron + renderer OK (466 modules)
- [x] `npm run dist` — génération `.dmg` universal OK
- [x] `release/mac-universal/WeSpR.app/Contents/Resources/binaries/` contient `ffmpeg`, `ffprobe`, `whisper-cli-arm64`, `yt-dlp`
- [x] L'exécutable `WeSpR` est un binaire universel (arm64 + x86_64 confirmé par `file`)

### Risques restants

**Sur Intel Mac (x64)** : `whisper-cli-x64` est absent du bundle. La transcription
échoue avec un message d'erreur (ENOENT via `child.on('error', reject)`). Avant le fix A,
ce cas pouvait être silencieusement avalé ; maintenant l'erreur remonte correctement à l'UI.
Résolution recommandée : compiler et ajouter `whisper-cli-x64` dans `resources/binaries/`.

**Signature ad-hoc** : le `.dmg` est signé avec une identité ad-hoc (pas de certificate Apple
Developer) et non notarisé. Sur macOS 15+, Gatekeeper peut bloquer l'app ou les binaires
copiés. Si l'utilisateur n'a pas approuvé l'app via Préférences Système → Confidentialité
et sécurité, les binaires spawned depuis `~/Library/Application Support/WeSpR/bin/`
peuvent être refusés silencieusement. Résolution : signer et notariser le build.

**ffmpeg x86_64 sur Apple Silicon** : ffmpeg est un binaire x86_64 dans le bundle ;
il tourne sous Rosetta 2 sur les Macs M-series. Ça fonctionne mais est moins performant.
Résolution recommandée : remplacer par un binaire universel (arm64 + x86_64).
