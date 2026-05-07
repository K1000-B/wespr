<div align="center">

<br/>

<img src="resources/icon.png" alt="WeSpR icon" width="96" height="96" />

<h1>WeSpR</h1>

<p><strong>Transcription audio et vidéo — 100% locale, 100% privée.</strong><br/>
Propulsé par <a href="https://github.com/ggml-org/whisper.cpp">whisper.cpp</a> · macOS · Aucun compte requis</p>

<p>
  <img src="https://img.shields.io/badge/macOS-12%2B-black?style=flat-square&logo=apple&logoColor=white" alt="macOS 12+" />
  <img src="https://img.shields.io/badge/Apple%20Silicon-M1%20→%20M4-8B5CF6?style=flat-square&logo=apple&logoColor=white" alt="Apple Silicon M1→M4" />
  <img src="https://img.shields.io/badge/Intel-x86__64-8B5CF6?style=flat-square" alt="Intel x86_64" />
  <img src="https://img.shields.io/github/license/K1000-B/wespr?style=flat-square&color=8B5CF6" alt="MIT License" />
  <img src="https://img.shields.io/github/stars/K1000-B/wespr?style=flat-square&color=8B5CF6" alt="Stars" />
</p>

<br/>

</div>

---

## Ce que fait WeSpR

WeSpR transcrit vos fichiers audio et vidéo **directement sur votre Mac**, sans connexion internet. Rien ne quitte votre machine — pas de serveur, pas de clé API, pas de compte.

**Glissez un fichier. Choisissez un modèle. Récupérez le texte.**

WeSpR prend aussi en charge l'import depuis une URL YouTube/web et l'enregistrement vocal, avec un historique consultable et des exports dans six formats.

<br/>

<table>
<tr>
<td width="50%">

**Formats d'entrée**

MP3, WAV, M4A, FLAC, OGG, MP4, MOV, MKV, AVI, WEBM — et tout ce que ffmpeg supporte.

</td>
<td width="50%">

**Formats de sortie**

TXT brut · TXT horodaté · SRT · VTT · Markdown · JSON structuré

</td>
</tr>
<tr>
<td>

**Modèles disponibles**

Tiny (75 Mo) → Large-v3 (3,1 Go). Variantes anglais optimisées. Diarisation (identification des locuteurs) avec les modèles `-tdrz`.

</td>
<td>

**Vie privée totale**

Zéro telemetry · Zéro analytics · Zéro réseau à l'usage. Les logs restent dans `~/Library/Logs/WeSpR/`.

</td>
</tr>
</table>

---

## Compatibilité

| | Supporté |
|---|---|
| **Processeur** | Apple Silicon M1, M2, M3, M4 — et Intel x86_64 |
| **macOS** | Monterey 12 · Ventura 13 · Sonoma 14 · Sequoia 15 |
| **Architecture** | Universal binary (un seul .dmg pour tous les Mac) |

> WeSpR utilise Metal pour l'accélération GPU sur Apple Silicon. Sur Intel, le traitement s'effectue en CPU avec Accelerate/BLAS.

---

## Installation

### Téléchargement direct

Téléchargez le dernier `.dmg` depuis la [page Releases](https://github.com/K1000-B/wespr/releases).

```
WeSpR-{version}-universal.dmg   →   Double-cliquez, glissez dans Applications.
```

### Note macOS Gatekeeper

L'app n'est pas encore notarisée Apple. Au premier lancement, macOS peut la bloquer. Deux options :

**Option 1 — clic droit** : dans le Finder, faites clic droit sur `WeSpR.app` → **Ouvrir** → confirmer.

**Option 2 — terminal** :
```bash
xattr -dr com.apple.quarantine /Applications/WeSpR.app
```

### Premier lancement

WeSpR télécharge automatiquement le modèle **Whisper Small** (466 Mo) au démarrage. La progression est visible dans l'app. Vous pouvez ignorer cette étape et choisir un autre modèle dans Réglages.

---

## Modèles Whisper

| Modèle | Taille | Langues | Vitesse | Précision |
|--------|--------|---------|---------|-----------|
| Tiny | 75 Mo | 99 | ●●●●● | ●● |
| Base | 142 Mo | 99 | ●●●● | ●●● |
| **Small** ★ | 466 Mo | 99 | ●●● | ●●●● |
| Small EN | 466 Mo | 🇬🇧 | ●●● | ●●●● |
| Small EN-tdrz | 466 Mo | 🇬🇧 | ●●● | ●●●● |
| Medium | 1,5 Go | 99 | ●● | ●●●● |
| Large-v3 | 3,1 Go | 99 | ●● | ●●●●● |
| Large-v3-Q5 | 1,1 Go | 99 | ●●● | ●●●●● |
| Large-v3-Turbo | 1,6 Go | 99 | ●●●●● | ●●●●● |

★ Modèle par défaut. Les modèles sont téléchargés depuis [HuggingFace — ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp) et stockés dans `~/Library/Application Support/WeSpR/models/`.

---

## Build depuis les sources

### Prérequis

- macOS 12+
- Node.js 20+
- Xcode Command Line Tools : `xcode-select --install`
- CMake : `brew install cmake`

### Setup

```bash
git clone https://github.com/K1000-B/wespr.git
cd wespr
npm install
npm run postinstall      # compile whisper.cpp + télécharge ffmpeg (plusieurs minutes)
```

### Développement

```bash
npm run dev              # Electron + Vite en mode watch
```

### Build distribution

```bash
npm run dist             # → release/WeSpR-{version}-universal.dmg
```

---

## Architecture

```
Electron Main Process          Renderer Process (React)
─────────────────────          ────────────────────────
ffmpeg.ts                      Home.tsx        (drop zone + options)
whisper.ts          ←─ IPC ─→  Result.tsx      (viewer + export)
segmenter.ts        preload    Settings.tsx    (modèles + préfs)
merger.ts
modelManager.ts
```

Le renderer n'a aucun accès Node.js direct. Tout passe par `window.wespr.*` exposé via preload avec `contextIsolation: true`.

Le pipeline de transcription découpe les fichiers en segments (55 s avec 2 s d'overlap) avant de les envoyer à `whisper-cli`, ce qui élimine les hallucinations sur les longs fichiers.

---

## Contribuer

Les contributions sont bienvenues. Lisez [`AGENTS.md`](AGENTS.md) avant d'ouvrir une PR — il documente les conventions de commit, les règles d'architecture et les contraintes de design.

```bash
gh repo fork K1000-B/wespr --clone
cd wespr
git checkout -b feat/ma-fonctionnalite
# ... développer ...
gh pr create --web
```

---

## Licence

MIT — voir [`LICENSE`](LICENSE).

Les modèles Whisper sont distribués sous licence MIT par OpenAI. ffmpeg est distribué sous LGPL 2.1+. whisper.cpp est distribué sous MIT par Georgi Gerganov.

---

<div align="center">
<sub>Fait avec ♥ · Aucune donnée ne quitte votre Mac</sub>
</div>
