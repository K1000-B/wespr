⏺ ---                                                        
  Rapport — Bug "Chargement de WeSpR…" / blocage indéfini           
                                                                                                                                                                                                
  Symptôme rapporté                                                                                                                                                                             
                                                                                                                                                                                                
  L'app WeSpR restait bloquée sur l'écran noir avec le texte "Chargement de WeSpR…". Elle ne chargeait jamais l'interface principale, quelle que soit l'attente.                                
                                                                                                                                                                                                
  ---                                                                                                                                                                                           
  Investigation                                                                                                                                                                               
               
  L'analyse a couvert l'ensemble du projet : architecture main/preload/renderer, pipeline de transcription, gestion des binaires, et le système de progression UI. Quatre hypothèses de blocage
  ont été identifiées et examinées.                                                                                                                                                             
  
  ---                                                                                                                                                                                           
  Bugs trouvés et corrigés (5 au total)                                                                                                                                                       
                                       
  Bug 1 — Cause principale du blocage au démarrage (commit 52cd6ad)
                                                                                                                                                                                                
  Fichier : index.html
                                                                                                                                                                                                
  index.html contenait un <link rel="stylesheet"> vers Google Fonts. Dans Chromium/Electron, un <script type="module"> attend que tous les <link rel="stylesheet"> précédents soient téléchargés
   avant de s'exécuter. Si Google Fonts est lent ou inaccessible (réseau instable, Wi-Fi qui change, coupure), React ne monte jamais — le placeholder HTML "Chargement de WeSpR…" reste affiché
  indéfiniment.                                                                                                                                                                                 
                                                                                                                                                                                              
  Fix : suppression des trois lignes Google Fonts. Les variables CSS --font-sans et --font-mono dans tokens.css ont des fallbacks système suffisants (-apple-system, SF Pro Text, SF Mono,      
  ui-monospace).
                                                                                                                                                                                                
  ---                                                                                                                                                                                           
  Bug 2 — Anti-pattern async executor dans transcribeChunk (commit d36f111)
                                                                                                                                                                                                
  Fichier : electron/services/whisper.ts                                                                                                                                                      
                                                                                                                                                                                                
  // AVANT — si ensureBundledBinaries() lève une exception,
  // la Promise ne se résout jamais ni ne se rejette → hang infini                                                                                                                              
  return new Promise(async (resolve, reject) => {                                                                                                                                               
    const binaries = await ensureBundledBinaries();                                                                                                                                             
    ...                                                                                                                                                                                         
  });                                                                                                                                                                                           
                                                                                                                                                                                              
  // APRÈS — l'erreur remonte normalement                                                                                                                                                       
  export async function transcribeChunk(...) {
    const binaries = await ensureBundledBinaries();                                                                                                                                             
    return new Promise((resolve, reject) => { ... });                                                                                                                                         
  }                                                                                                                                                                                             
  
  ---                                                                                                                                                                                           
  Bug 3 — Requêtes réseau HuggingFace dans le chemin chaud de transcription (commit fdded1d)                                                                                                  
                                                                                                                                                                                                
  Fichier : electron/services/modelManager.ts
                                                                                                                                                                                                
  resolveModelPath() appelait getModelCatalog() qui lançait deux requêtes HTTP (timeout 10 s chacune) vers HuggingFace entre les étapes segmenting et transcribing. En cas de cache froid, l'UI 
  se figeait 10–20 s, perçu comme un blocage.
                                                                                                                                                                                                
  Fix : nouvelle fonction resolveInstalledModelOffline() utilisant cachedCatalog ?? STATIC_MODELS — aucune requête réseau pendant la transcription.                                             
  
  ---                                                                                                                                                                                           
  Bug 4 — Label UI trompeur (commit b6c9780)                                                                                                                                                  
                                                                                                                                                                                                
  Fichier : src/components/ProgressPanel.tsx
                                                                                                                                                                                                
  L'étape segmenting (découpage ffmpeg) était étiquetée "Chargement du modèle Whisper", ce qui induisait en erreur sur l'origine du blocage.                                                    
   
  Fix : renommé en "Découpage de l'audio".                                                                                                                                                      
                                                                                                                                                                                              
  ---                                                                                                                                                                                           
  Bug 5 — stdout non drainé dans runStreamingCommand (commit b6c9780)                                                                                                                         
                                                                                                                                                                                                
  Fichier : electron/services/ffmpeg.ts
                                                                                                                                                                                                
  Si ffmpeg produisait des données sur stdout, le pipe de 64 Ko pouvait saturer et bloquer le processus.                                                                                        
  
  Fix : ajout de child.stdout.on('data', () => {}) pour drainer proprement.                                                                                                                     
                                                                                                                                                                                              
  ---                                                                                                                                                                                           
  Mesures préventives ajoutées (commit 52cd6ad)                                                                                                                                               
                                               
  - Watchdog 10 min sur whisper-cli : si le processus whisper ne répond pas, il est tué (SIGKILL) et une erreur claire est affichée plutôt qu'un hang silencieux.
  - Logging détaillé dans le pipeline : chaque étape (start, converting, segmenting, model resolved, chunk N, done) écrit une ligne horodatée dans ~/Library/Logs/WeSpR/wespr.log pour faciliter
   les diagnostics futurs.                                                                                                                                                                      
                                                                                                                                                                                                
  ---                                                                                                                                                                                           
  État actuel                                                                                                                                                                                 
             
  La version corrigée est installée dans /Applications/WeSpR.app. Le build 1.0.2 universel (arm64 + x64) est disponible dans release/.