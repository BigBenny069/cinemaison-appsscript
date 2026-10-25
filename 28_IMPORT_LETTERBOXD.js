/**
 * ============================================================
 * 28_IMPORT_LETTERBOXD.gs
 * Version: 1.0 (25/10/2026)
 *
 * But : importer UNE FOIS les notes Letterboxd de Ben (export
 * ratings.csv) dans l'onglet AVIS, pour que les suggestions
 * (25_SUGGESTIONS_JUSTWATCH) connaissent ses goûts dès le départ.
 *
 * PRÉPARATION (à la main) :
 *  1. Faire une copie de sauvegarde du Sheet.
 *  2. Fichier > Importer > Importer > Envoyer ratings.csv >
 *     "Insérer une nouvelle feuille" > nommer l'onglet IMPORT_LETTERBOXD
 *     (colonnes attendues : Date, Name, Year, Letterboxd URI, Rating).
 *
 * UTILISATION :
 *  1. simulerImportNotesLetterboxdV1()  -> ne modifie RIEN : répartition
 *     des notes + essai sur 5 films.
 *  2. importerNotesLetterboxdV1()       -> écrit dans AVIS. Peut être
 *     relancée jusqu'à "TERMINÉ" (garde de temps Apps Script ; elle
 *     reprend là où elle s'est arrêtée).
 *
 * CONVERSION (choix de Ben, 25/10/2026) :
 *   1,5 et 2     -> 1  J'aime pas      (⚠ jamais reproposé en suggestion)
 *   2,5 et 3     -> 2  Neutre
 *   3,5 et 4     -> 3  J'aime bien
 *   4,5          -> 4  J'adore
 *   5            -> 5  J'adore++
 *
 * SÉCURITÉS :
 *  - Un film qui a DÉJÀ un avis dans AVIS n'est jamais écrasé.
 *  - Les films sont retrouvés sur TMDb (titre + année, seuil de
 *    confiance habituel) ; les non-trouvés sont listés et ignorés.
 *  - Résultat de chaque ligne noté dans les colonnes F-G de
 *    IMPORT_LETTERBOXD (Statut, Cle) : la relance saute les lignes
 *    déjà traitées. Aucune autre feuille n'est modifiée.
 *  - N'écrit pas dans ERREURS.
 * ============================================================
 */

const IMPORT_LB_ONGLET_V1 = "IMPORT_LETTERBOXD";
const IMPORT_LB_AVIS_ONGLET_V1 = "AVIS";
const IMPORT_LB_ENTETES_AVIS_V1 = [
  "Cle", "Titre", "Annee", "Type", "Genres", "Realisateur", "Casting", "Avis", "Date", "Origine", "TMDbID"
];
const IMPORT_LB_DUREE_MAX_MS_V1 = 4.5 * 60 * 1000;

/** Note Letterboxd (0,5 à 5) -> avis CinéMaison (1 à 5), ou null si illisible. */
function conversionNoteLetterboxdV1_(note) {
  const n = Number(String(note).replace(",", "."));
  if (!isFinite(n) || n <= 0 || n > 5) return null;
  if (n <= 2) return 1;
  if (n <= 3) return 2;
  if (n <= 4) return 3;
  if (n <= 4.5) return 4;
  return 5;
}

function dateImportLetterboxdV1_(valeur) {
  if (valeur instanceof Date && !isNaN(valeur.getTime())) {
    return Utilities.formatDate(valeur, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(valeur || "").trim().slice(0, 10);
}

/** Lit IMPORT_LETTERBOXD -> { feuille, h, valeurs } ou lève une erreur claire. */
function lireOngletImportLetterboxdV1_() {
  const feuille = getSheet_(IMPORT_LB_ONGLET_V1);
  if (!feuille) throw new Error("Onglet " + IMPORT_LB_ONGLET_V1 + " introuvable (voir les étapes de préparation en haut du fichier 28).");
  const valeurs = feuille.getDataRange().getValues();
  const h = getHeadersMapV4_(valeurs[0]);
  ["Name", "Year", "Rating"].forEach(function(c) {
    if (h[c] === undefined) throw new Error("Colonne manquante dans " + IMPORT_LB_ONGLET_V1 + " : " + c);
  });
  return { feuille: feuille, h: h, valeurs: valeurs };
}

/** Cherche un film sur TMDb. Retourne le détail (valide:true) ou { valide:false, commentaire }. */
function trouverFilmTmdbPourImportV1_(titre, annee, apiKey) {
  const resultats = rechercherTMDb_(titre, annee, "Film", apiKey);
  if (!resultats || resultats.length === 0) return { valide: false, commentaire: "aucun résultat TMDb" };
  const meilleur = choisirMeilleurResultatTMDb_(titre, annee, resultats);
  if (!meilleur || meilleur.score < 60) {
    return { valide: false, commentaire: meilleur ? "douteux : " + (meilleur.title || meilleur.name || "") : "aucun résultat fiable" };
  }
  return chargerDetailTMDbAvecRepli_(meilleur.id, "Film", apiKey, "Import Letterboxd", meilleur.score);
}

/** SIMULATION : ne modifie rien. */
function simulerImportNotesLetterboxdV1() {
  const ctx = lireOngletImportLetterboxdV1_();
  const compte = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let illisibles = 0;
  for (let i = 1; i < ctx.valeurs.length; i++) {
    if (!safeTrim_(ctx.valeurs[i][ctx.h.Name])) continue;
    const avis = conversionNoteLetterboxdV1_(ctx.valeurs[i][ctx.h.Rating]);
    if (avis) compte[avis]++; else illisibles++;
  }
  Logger.log("=== SIMULATION import Letterboxd (rien n'est modifié) ===");
  Logger.log("Films à importer : " + (compte[1] + compte[2] + compte[3] + compte[4] + compte[5]) + " | notes illisibles : " + illisibles);
  Logger.log("1 J'aime pas : " + compte[1] + " | 2 Neutre : " + compte[2] + " | 3 J'aime bien : " + compte[3] + " | 4 J'adore : " + compte[4] + " | 5 J'adore++ : " + compte[5]);

  const apiKey = lireConfig_("TMDbApiKey", "");
  if (!apiKey) { Logger.log("TMDbApiKey manquante dans CONFIG."); return; }
  const dejaAvis = clesAvisExistantesImportV1_();
  Logger.log("Avis déjà présents dans AVIS : " + Object.keys(dejaAvis).length + " (ne seront jamais écrasés)");
  Logger.log("--- Essai sur les 5 premiers films ---");
  let n = 0;
  for (let i = 1; i < ctx.valeurs.length && n < 5; i++) {
    const titre = safeTrim_(ctx.valeurs[i][ctx.h.Name]);
    if (!titre) continue;
    n++;
    const annee = String(ctx.valeurs[i][ctx.h.Year] || "").trim();
    try {
      const d = trouverFilmTmdbPourImportV1_(titre, annee, apiKey);
      if (d && d.valide) {
        const cle = "movie:" + d.tmdbId;
        Logger.log(titre + " (" + annee + ") -> TMDb " + d.tmdbId + " | " + (d.realisateur || "?") + " | " + (d.genre || "?") + (dejaAvis[cle] ? " | AVIS DÉJÀ PRÉSENT (ignoré)" : ""));
      } else {
        Logger.log(titre + " (" + annee + ") -> NON TROUVÉ : " + ((d && d.commentaire) || ""));
      }
    } catch (e) {
      Logger.log(titre + " (" + annee + ") -> ERREUR : " + e.message);
    }
  }
}

function clesAvisExistantesImportV1_() {
  const cles = {};
  const feuille = getSheet_(IMPORT_LB_AVIS_ONGLET_V1);
  if (!feuille || feuille.getLastRow() < 2) return cles;
  const col = feuille.getRange(2, 1, feuille.getLastRow() - 1, 1).getValues();
  col.forEach(function(r) { const c = String(r[0] || "").trim(); if (c) cles[c] = true; });
  return cles;
}

function assurerOngletAvisImportV1_() {
  let feuille = getSheet_(IMPORT_LB_AVIS_ONGLET_V1);
  if (!feuille) {
    feuille = getSpreadsheet_().insertSheet(IMPORT_LB_AVIS_ONGLET_V1);
    feuille.getRange(1, 1, 1, IMPORT_LB_ENTETES_AVIS_V1.length).setValues([IMPORT_LB_ENTETES_AVIS_V1]);
  }
  return feuille;
}

/** IMPORT RÉEL (reprenable). Statut par ligne dans les colonnes F (Statut) et G (Cle). */
function importerNotesLetterboxdV1() {
  const debut = Date.now();
  const apiKey = lireConfig_("TMDbApiKey", "");
  if (!apiKey) throw new Error("TMDbApiKey manquante dans CONFIG.");

  const ctx = lireOngletImportLetterboxdV1_();
  const feuille = ctx.feuille;
  // Colonnes de suivi : on les place juste après la dernière colonne de données.
  let colStatut = ctx.h.StatutImport !== undefined ? ctx.h.StatutImport + 1 : 0;
  if (!colStatut) {
    colStatut = ctx.valeurs[0].length + 1;
    feuille.getRange(1, colStatut, 1, 2).setValues([["StatutImport", "CleImport"]]);
  }

  const feuilleAvis = assurerOngletAvisImportV1_();
  const enteteAvis = feuilleAvis.getRange(1, 1, 1, feuilleAvis.getLastColumn()).getValues()[0];
  const hAvis = getHeadersMapV4_(enteteAvis);
  const dejaAvis = clesAvisExistantesImportV1_();

  const statuts = ctx.valeurs.map(function(l) {
    return String(l[colStatut - 1] || "").trim();
  });
  const resume = { OK: 0, DEJA_AVIS: 0, NON_TROUVE: 0, ERREUR: 0, NOTE_ILLISIBLE: 0 };
  const nonTrouves = [];
  const nouvellesLignes = [];
  let restant = 0;
  let coupeParLeTemps = false;

  for (let i = 1; i < ctx.valeurs.length; i++) {
    const ligne = ctx.valeurs[i];
    const titre = safeTrim_(ligne[ctx.h.Name]);
    if (!titre || statuts[i]) continue;

    if (Date.now() - debut > IMPORT_LB_DUREE_MAX_MS_V1) { coupeParLeTemps = true; restant++; continue; }

    const annee = String(ligne[ctx.h.Year] || "").trim();
    const avis = conversionNoteLetterboxdV1_(ligne[ctx.h.Rating]);
    let statut = "";
    let cle = "";

    if (!avis) {
      statut = "NOTE_ILLISIBLE";
    } else {
      try {
        const d = trouverFilmTmdbPourImportV1_(titre, annee, apiKey);
        if (!d || d.valide !== true) {
          statut = "NON_TROUVE";
          nonTrouves.push(titre + " (" + annee + ") : " + ((d && d.commentaire) || ""));
        } else {
          cle = "movie:" + d.tmdbId;
          if (dejaAvis[cle]) {
            statut = "DEJA_AVIS";
          } else {
            const nouvelle = new Array(enteteAvis.length).fill("");
            const poser = function(nom, v) { if (hAvis[nom] !== undefined) nouvelle[hAvis[nom]] = v; };
            poser("Cle", cle);
            poser("Titre", titre);
            poser("Annee", annee);
            poser("Type", "Film");
            poser("Genres", d.genre || "");
            poser("Realisateur", d.realisateur || "");
            poser("Casting", d.casting || "");
            poser("Avis", avis);
            poser("Date", dateImportLetterboxdV1_(ligne[ctx.h.Date]));
            poser("Origine", "letterboxd");
            poser("TMDbID", d.tmdbId);
            nouvellesLignes.push(nouvelle);
            dejaAvis[cle] = true; // évite un doublon si le CSV contient deux fois le film
            statut = "OK";
          }
        }
      } catch (e) {
        statut = "ERREUR";
        nonTrouves.push(titre + " (" + annee + ") : ERREUR " + e.message);
      }
    }
    statuts[i] = statut;
    resume[statut] = (resume[statut] || 0) + 1;
    feuille.getRange(i + 1, colStatut, 1, 2).setValues([[statut, cle]]);

    // Écriture par petits paquets : si le script s'arrête, rien n'est perdu.
    if (nouvellesLignes.length >= 20) viderPaquetAvisImportV1_(feuilleAvis, nouvellesLignes);
  }
  viderPaquetAvisImportV1_(feuilleAvis, nouvellesLignes);

  journal_("IMPORT_LETTERBOXD", "IMPORT", "OK",
    "OK " + resume.OK + " | déjà avis " + resume.DEJA_AVIS + " | non trouvés " + resume.NON_TROUVE +
    " | erreurs " + resume.ERREUR + " | notes illisibles " + resume.NOTE_ILLISIBLE);
  Logger.log("=== Import Letterboxd (cette passe) ===");
  Logger.log("Ajoutés dans AVIS : " + resume.OK + " | déjà un avis (ignorés) : " + resume.DEJA_AVIS +
    " | non trouvés : " + resume.NON_TROUVE + " | erreurs : " + resume.ERREUR + " | notes illisibles : " + resume.NOTE_ILLISIBLE);
  nonTrouves.forEach(function(t) { Logger.log("  À voir : " + t); });
  Logger.log(coupeParLeTemps
    ? "PAS FINI : " + restant + " film(s) restant. Relance importerNotesLetterboxdV1."
    : "TERMINÉ.");
}

function viderPaquetAvisImportV1_(feuilleAvis, lignes) {
  if (!lignes.length) return;
  const debut = feuilleAvis.getLastRow() + 1;
  feuilleAvis.getRange(debut, 1, lignes.length, lignes[0].length).setValues(lignes);
  lignes.length = 0;
}
