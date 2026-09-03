# CinéMaison — Apps Script

Ce repo contient les fichiers `.gs` du projet Apps Script CinéMaison (le
backend qui enrichit automatiquement les fiches films/séries : TMDb,
Letterboxd, disponibilité sur les plateformes, résumé quotidien par email...).

Il est lié au projet Apps Script existant via [clasp](https://github.com/google/clasp),
l'outil en ligne de commande officiel de Google pour gérer un projet Apps
Script comme du code classique.

## Comment ça fonctionne

**Chaque `push` sur la branche `main` déclenche automatiquement** (via
`.github/workflows/deploy-appsscript.yml`) :

1. `clasp push --force` — envoie tout le contenu du repo vers le projet
   Apps Script (remplace intégralement l'état du projet par celui du repo :
   un fichier supprimé ici est aussi supprimé côté Apps Script).
2. `clasp deploy -i <ID>` — crée une nouvelle version du déploiement Web
   App **existant** (celui utilisé par le bouton "Redemander une
   vérification" de l'app, dont l'URL `/exec` est configurée sur Vercel).
   Le `-i <ID>` est essentiel : sans lui, `clasp deploy` créerait un
   **nouveau** déploiement à chaque fois, avec une nouvelle URL — cassant
   le lien avec Vercel.

**Résultat concret :** modifier un fichier directement sur GitHub (même
depuis un téléphone) suffit à mettre à jour le vrai projet Apps Script,
sans jamais ouvrir `script.google.com`.

## Contraintes à connaître

- **Tous les fichiers `.gs`/`.js` doivent rester à la racine du repo**,
  jamais dans un sous-dossier — `.clasp.json` est configuré avec
  `"rootDir": ""`. Un fichier déplacé dans un sous-dossier ne sera plus
  poussé vers Apps Script.
- **Renommer un fichier = suppression + recréation** côté Apps Script au
  prochain push (puisque `clasp push --force` remplace tout). Après un
  renommage, vérifier dans l'éditeur Apps Script qu'il n'y a pas de
  doublon (ancien nom + nouveau nom).
- `appsscript.json` est le fichier de manifeste du projet (permissions,
  fuseau horaire...) — à modifier avec précaution, comme n'importe quel
  autre fichier Apps Script sensible.

## Secrets GitHub nécessaires (Settings > Secrets and variables > Actions)

| Secret | Contenu |
|---|---|
| `CLASP_CREDENTIALS` | Contenu intégral du fichier `~/.clasprc.json` généré par `clasp login` sur un poste autorisé. |
| `CLASP_DEPLOYMENT_ID` | L'ID du déploiement Web App existant (visible via `clasp deployments`), **pas** celui marqué `@HEAD`. |

Si `CLASP_CREDENTIALS` expire un jour (erreur d'authentification dans les
logs GitHub Actions), il faut refaire `clasp login` depuis un poste, puis
remplacer le contenu de ce secret.

## Autres projets liés

- **`cinemaison-v2`** — le frontend React/Vite (PWA) et les fonctions
  Vercel (`api/`), dont certaines (`api/add-film.js`, `api/update-film.js`)
  appellent désormais directement Letterboxd depuis Vercel plutôt que de
  passer par ce projet Apps Script, pour contourner un blocage réseau
  observé sur les requêtes Letterboxd émises depuis les déclencheurs
  Apps Script (voir `api/_letterboxd.js` dans ce repo-là pour le détail).
- **`cineradar`** — projet compagnon, alertes de disponibilité par email.
