# Rapport — Session de corrections WeSpR

**Date :** 6 mai 2026  
**Version de départ :** 1.0.2  
**Version finale :** 1.0.4+

---

## Problèmes résolus

### 1. App bloquée sur "Chargement de WeSpR…" en production

**Symptôme :** L'app restait indéfiniment sur l'écran de chargement en prod (`npm run dist`), mais fonctionnait parfaitement en dev (`npm run dev`).

**Cause racine :** Vite génère par défaut des chemins absolus (`/assets/index.js`). En HTTP (dev), ces chemins fonctionnent. En production, Electron charge les fichiers via le protocole `file://` — le navigateur résout `/assets/…` vers la racine du système de fichiers (`file:///assets/…`), qui n'existe pas. React ne monte jamais.

**Fix :** Ajout de `base: './'` dans `vite.config.ts`. Vite génère désormais des chemins relatifs (`./assets/…`) qui se résolvent correctement depuis `dist/index.html`.

```diff
// vite.config.ts
export default defineConfig({
  plugins: [react()],
+ base: './',
  ...
})
```

**Commit :** `d612bd4`

---

### 2. Double traffic lights (boutons de fenêtre en double)

**Symptôme :** Deux rangées de boutons rouge/jaune/vert visibles en haut de l'app.

**Cause racine :** `TitleBar.tsx` rendait de faux ronds CSS (`.traffic-lights`), alors qu'Electron affichait déjà les natifs via `titleBarStyle: 'hidden'` + `trafficLightPosition`.

**Fix :** Suppression du `<div className="traffic-lights">` et de ses trois `<span>` dans `TitleBar.tsx`.

**Commit :** `6201d34`

---

### 3. Microphone inaccessible en production — pas de dialog, pas d'entrée dans les Réglages

**Symptôme :** La page "Ma voix" affichait "Accès au micro refusé". Aucune dialog de permission n'apparaissait. WeSpR n'apparaissait pas dans Réglages système → Confidentialité → Microphone. `tccutil reset` n'aidait pas.

**Diagnostic progressif :**

| Étape | Ce qu'on a appris |
|-------|-------------------|
| `codesign -d --entitlements` | L'app a le Hardened Runtime (`cs.allow-jit`, etc.) mais **pas** `com.apple.security.device.audio-input` |
| Log `getMediaAccessStatus` | Statut = `not-determined` avant l'appel, `denied` après — **sans dialog** |
| Info.plist du helper renderer | `com.wespr.app.helper.Renderer` n'avait pas `NSMicrophoneUsageDescription` |

**Cause racine (double) :**

1. **Hardened Runtime sans entitlement audio** : Avec le Hardened Runtime actif, macOS bloque `AVCaptureDevice.requestAccess` au niveau kernel si `com.apple.security.device.audio-input` est absent. Résultat : auto-refus silencieux, pas de dialog, statut passe à `denied` instantanément.

2. **Helper renderer sans `NSMicrophoneUsageDescription`** : `getUserMedia` s'exécute dans `WeSpR Helper (Renderer).app` (bundle ID `com.wespr.app.helper.Renderer`), un process séparé. macOS vérifie la clé de privacy sur le process appelant, pas sur l'app principale. Sans elle, demande impossible.

**Fixes :**

**a) Entitlement audio-input** (`resources/entitlements.mac.plist`)
```xml
<key>com.apple.security.device.audio-input</key>
<true/>
```
Référencé via `entitlements` + `entitlementsInherit` dans `electron-builder.yml` pour couvrir le main app et tous les helpers.

**b) NSMicrophoneUsageDescription dans le helper** (`scripts/afterPack.js`)  
Hook electron-builder exécuté avant la signature. Injecte la clé via `plutil` dans le plist du renderer helper.

**c) `session.setPermissionRequestHandler`** (`electron/main.ts`)  
Quand le renderer appelle `getUserMedia`, Electron consulte ce handler. Il appelle `systemPreferences.askForMediaAccess('microphone')` depuis le process principal, qui a l'entitlement et le `NSMicrophoneUsageDescription`.

**Commits :** `2404335`, `d360ef3`, `7708354`

---

## Bugs auxiliaires corrigés en cours de route

### Import `writeLog` manquant dans `models.ts`
Le handler IPC `wespr:request-mic-access` utilisait `writeLog` sans l'importer. L'IPC rejetait silencieusement avant d'atteindre `askForMediaAccess`, masquant le vrai diagnostic.  
**Fix :** Ajout de `writeLog` à l'import depuis `../services/ffmpeg`.  
**Commit :** `7708354`

---

## Résumé des fichiers modifiés

| Fichier | Modification |
|---------|-------------|
| `vite.config.ts` | `base: './'` |
| `src/components/TitleBar.tsx` | Suppression des faux traffic lights |
| `electron-builder.yml` | `entitlements`, `entitlementsInherit`, `extendInfo` français, `afterPack` hook |
| `resources/entitlements.mac.plist` | Nouveau — déclare `audio-input` |
| `scripts/afterPack.js` | Nouveau — injecte `NSMicrophoneUsageDescription` dans le helper renderer |
| `electron/main.ts` | `session.setPermissionRequestHandler` pour router les demandes media |
| `electron/ipc/models.ts` | Handler `wespr:request-mic-access` + fix import `writeLog` |
| `electron/preload.ts` | Exposition de `requestMicAccess` dans l'API `wespr` |
| `src/components/VoicePanel.tsx` | Appel de `requestMicAccess` au montage |

---

## Leçons à retenir pour les builds Electron macOS

- **Toujours mettre `base: './'` dans Vite** pour les apps Electron — sans ça, prod est cassé.
- **Hardened Runtime = entitlements obligatoires** pour tout accès hardware (micro, caméra, localisation). Vérifier avec `codesign -d --entitlements :- MonApp.app`.
- **Chaque helper Electron est un process distinct aux yeux de TCC**. Le renderer helper a besoin de ses propres `NSUsageDescription` keys, distinctes de l'app principale.
- **`askForMediaAccess` retourne `false` sans dialog** si l'entitlement hardware est absent sous Hardened Runtime — ce n'est pas un refus utilisateur, c'est un blocage kernel.
- **`tccutil reset Microphone <bundleId>`** ne résout rien si le vrai problème est un entitlement manquant.
