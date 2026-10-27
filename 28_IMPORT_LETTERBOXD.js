/**
 * ============================================================
 * 28_IMPORT_LETTERBOXD.gs
 * Version: 1.3 (27/10/2026)
 *
 * Correctif V1.3 (27/10/2026) : nouvelle répartition des notes voulue par Ben
 * (voir CONVERSION). Nouveau : simulerReconversionAvisLetterboxdV1() (ne
 * modifie rien : liste les avis qui changeraient) puis
 * reconvertirAvisLetterboxdV1() qui met à jour, dans AVIS, UNIQUEMENT les
 * avis venant de l'import (colonne Origine = "letterboxd"). Un avis donné à la
 * main dans l'app (Origine "suppression" ou "fiche") n'est jamais modifié.
 *
 * Correctif V1.2 (25/10/2026) : 113 films étaient refusés ("douteux") car
 * Letterboxd donne les titres ANGLAIS ("The Godfather") alors que la
 * recherche TMDb répond en français ("Le Parrain"). Si le résultat français
 * n'est pas fiable, on refait une recherche en anglais et on accepte un film
 * dont le titre est identique (sans accents ni ponctuation) et dont l'année
 * est la même (+/- 1). Les détails (genres, casting...) restent en français.
 * Nouveau : reessayerNonTrouvesLetterboxdV1() relance les lignes marquées
 * NON_TROUVE. Le titre "11:14" (lu comme une heure par Sheets) est aussi géré.
 *
 * Correctif V1.1 (25/10/2026) : à l'import du CSV, Google Sheets (réglages
 * français) transformait les notes à demi-point ("3.5") en DATES (3 mai),
 * d'où 139 notes "illisibles" à la simulation. La lecture reconnaît
 * maintenant ces dates et retrouve la note (3 mai -> 3,5).
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
 * CONVERSION (nouvelle répartition de Ben, 27/10/2026 ; avant : 1,5-2 / 2,5-3 / 3,5-4 / 4,5 / 5) :
 *   0,5 à 1,5    -> 1  J'aime pas      (⚠ jamais reproposé en suggestion)
 *   2 à 2,5      -> 2  Neutre
 *   3 à 3,5      -> 3  J'aime bien
 *   4 à 4,5      -> 4  J'adore
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

/**
 * Lit la note d'une cellule. Piège : Google Sheets (réglages français) transforme
 * une note comme "3.5" en DATE (3 mai) à l'import du CSV. On la retrouve :
 * jour + 0,5 si le mois est mai (réglage français : jour.mois), ou
 * mois + 0,5 si le jour est le 5 (réglage américain : mois.jour).
 */
function lireNoteLetterboxdV1_(valeur) {
  if (valeur instanceof Date && !isNaN(valeur.getTime())) {
    const jour = valeur.getDate();
    const mois = valeur.getMonth() + 1;
    if (mois === 5) return jour + 0.5;
    if (jour === 5) return mois + 0.5;
    return NaN;
  }
  return Number(String(valeur).replace(",", "."));
}

/** Note Letterboxd (0,5 à 5) -> avis CinéMaison (1 à 5), ou null si illisible. */
function conversionNoteLetterboxdV1_(note) {
  const n = lireNoteLetterboxdV1_(note);
  if (!isFinite(n) || n <= 0 || n > 5) return null;
  if (n <= 1.5) return 1;
  if (n <= 2.5) return 2;
  if (n <= 3.5) return 3;
  if (n <= 4.5) return 4;
  return 5;
}

/**
 * Lignes d'AVIS à reconvertir : pour chaque ligne importée avec succès
 * (StatutImport = OK, CleImport = movie:ID), compare l'avis actuel dans AVIS
 * à celui de la nouvelle répartition. Ne retient QUE les lignes d'AVIS dont
 * Origine = "letterboxd" (un avis donné à la main n'est jamais touché).
 */
function calculerReconversionAvisLetterboxdV1_() {
  const ctx = lireOngletImportLetterboxdV1_();
  if (ctx.h.StatutImport === undefined || ctx.h.CleImport === undefined) {
    throw new Error("Aucun import précédent dans " + IMPORT_LB_ONGLET_V1 + " (colonnes StatutImport/CleImport absentes).");
  }
  const feuilleAvis = getSheet_(IMPORT_LB_AVIS_ONGLET_V1);
  if (!feuilleAvis || feuilleAvis.getLastRow() < 2) throw new Error("Onglet AVIS vide ou introuvable.");
  const valAvis = feuilleAvis.getDataRange().getValues();
  const hAvis = getHeadersMapV4_(valAvis[0]);
  ["Cle", "Avis", "Origine"].forEach(function(c) {
    if (hAvis[c] === undefined) throw new Error("Colonne manquante dans AVIS : " + c);
  });
  const ligneParCle = {};
  for (let i = 1; i < valAvis.length; i++) {
    const c = String(valAvis[i][hAvis.Cle] || "").trim();
    if (c) ligneParCle[c] = i;
  }
  const changements = []; // { ligneFeuille, titre, de, vers, note }
  const compte = { identiques: 0, mainOuAutre: 0, absentsAvis: 0, illisibles: 0 };
  for (let i = 1; i < ctx.valeurs.length; i++) {
    const l = ctx.valeurs[i];
    if (String(l[ctx.h.StatutImport] || "").trim() !== "OK") continue;
    const cle = String(l[ctx.h.CleImport] || "").trim();
    const nouveau = conversionNoteLetterboxdV1_(l[ctx.h.Rating]);
    if (!cle || !nouveau) { compte.illisibles++; continue; }
    const ia = ligneParCle[cle];
    if (ia === undefined) { compte.absentsAvis++; continue; }
    if (String(valAvis[ia][hAvis.Origine] || "").trim().toLowerCase() !== "letterboxd") { compte.mainOuAutre++; continue; }
    const ancien = Number(valAvis[ia][hAvis.Avis]);
    if (ancien === nouveau) { compte.identiques++; continue; }
    changements.push({
      ligneFeuille: ia + 1, titre: nomFilmImportV1_(l[ctx.h.Name]),
      note: lireNoteLetterboxdV1_(l[ctx.h.Rating]), de: ancien, vers: nouveau,
    });
  }
  return { feuilleAvis: feuilleAvis, colAvis: hAvis.Avis + 1, changements: changements, compte: compte };
}

function resumerReconversionAvisLetterboxdV1_(r) {
  const parTransition = {};
  r.changements.forEach(function(c) { const k = c.de + " -> " + c.vers; parTransition[k] = (parTransition[k] || 0) + 1; });
  Logger.log("Avis à changer : " + r.changements.length + " | déjà bons : " + r.compte.identiques +
    " | donnés à la main (jamais touchés) : " + r.compte.mainOuAutre + " | absents d'AVIS : " + r.compte.absentsAvis +
    " | lignes illisibles : " + r.compte.illisibles);
  Object.keys(parTransition).sort().forEach(function(k) { Logger.log("  " + k + " : " + parTransition[k]); });
}

/** SIMULATION : ne modifie rien. Montre ce que la reconversion changerait. */
function simulerReconversionAvisLetterboxdV1() {
  const r = calculerReconversionAvisLetterboxdV1_();
  Logger.log("=== SIMULATION reconversion des avis Letterboxd (rien n'est modifié) ===");
  resumerReconversionAvisLetterboxdV1_(r);
  r.changements.slice(0, 15).forEach(function(c) {
    Logger.log("  " + c.titre + " (note " + c.note + ") : avis " + c.de + " -> " + c.vers);
  });
  if (r.changements.length > 15) Logger.log("  ... et " + (r.changements.length - 15) + " autre(s).");
}

/**
 * RECONVERSION RÉELLE : écrit seulement la colonne Avis, ligne par ligne
 * concernée. Relançable sans risque (une 2e fois : 0 changement).
 * Avant : faire une copie de sauvegarde du Sheet.
 */
function reconvertirAvisLetterboxdV1() {
  const r = calculerReconversionAvisLetterboxdV1_();
  r.changements.forEach(function(c) {
    r.feuilleAvis.getRange(c.ligneFeuille, r.colAvis).setValue(c.vers);
  });
  journal_("IMPORT_LETTERBOXD", "RECONVERSION", "OK",
    r.changements.length + " avis mis à jour | déjà bons " + r.compte.identiques + " | à la main (intouchés) " + r.compte.mainOuAutre);
  Logger.log("=== Reconversion des avis Letterboxd faite ===");
  resumerReconversionAvisLetterboxdV1_(r);
  Logger.log("TERMINÉ. Relancer ne changera plus rien.");
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

function normaliserTitreImportV1_(t) {
  return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Titre d'une cellule. Piège : "11:14" est lu comme une heure par Sheets. */
function nomFilmImportV1_(valeur) {
  if (valeur instanceof Date && !isNaN(valeur.getTime())) {
    return Utilities.formatDate(valeur, Session.getScriptTimeZone(), "HH:mm");
  }
  return safeTrim_(valeur);
}

/** Recherche en anglais : accepte seulement un titre identique + année à +/- 1. */
function chercherEnAnglaisImportV1_(titre, annee, apiKey) {
  const url = "https://api.themoviedb.org/3/search/movie?api_key=" + encodeURIComponent(apiKey) +
    "&language=en-US&query=" + encodeURIComponent(titre) +
    (annee ? "&year=" + encodeURIComponent(annee) : "");
  const res = fetchTMDbAvecRetry_(url, "recherche EN " + titre);
  if (res.getResponseCode() !== 200) return null;
  const resultats = parserJsonTMDb_(res.getContentText(), "recherche EN " + titre).results || [];
  const cible = normaliserTitreImportV1_(titre);
  const a = Number(annee);
  const bons = resultats.filter(function(r) {
    const anneeR = Number(String(r.release_date || "").slice(0, 4));
    const memeTitre = normaliserTitreImportV1_(r.title) === cible || normaliserTitreImportV1_(r.original_title) === cible;
    return memeTitre && (!a || !anneeR || Math.abs(anneeR - a) <= 1);
  });
  if (!bons.length) return null;
  bons.sort(function(x, y) { return (y.popularity || 0) - (x.popularity || 0); });
  return bons[0];
}

/** Cherche un film sur TMDb. Retourne le détail (valide:true) ou { valide:false, commentaire }. */
function trouverFilmTmdbPourImportV1_(titre, annee, apiKey) {
  const resultats = rechercherTMDb_(titre, annee, "Film", apiKey);
  const meilleur = resultats && resultats.length ? choisirMeilleurResultatTMDb_(titre, annee, resultats) : null;
  if (meilleur && meilleur.score >= 60) {
    return chargerDetailTMDbAvecRepli_(meilleur.id, "Film", apiKey, "Import Letterboxd", meilleur.score);
  }
  const enAnglais = chercherEnAnglaisImportV1_(titre, annee, apiKey);
  if (enAnglais) {
    return chargerDetailTMDbAvecRepli_(enAnglais.id, "Film", apiKey, "Import Letterboxd (titre anglais)", 100);
  }
  if (!resultats || resultats.length === 0) return { valide: false, commentaire: "aucun résultat TMDb" };
  return { valide: false, commentaire: meilleur ? "douteux : " + (meilleur.title || meilleur.name || "") : "aucun résultat fiable" };
}

/** SIMULATION : ne modifie rien. */
function simulerImportNotesLetterboxdV1() {
  const ctx = lireOngletImportLetterboxdV1_();
  const compte = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let illisibles = 0;
  for (let i = 1; i < ctx.valeurs.length; i++) {
    if (!nomFilmImportV1_(ctx.valeurs[i][ctx.h.Name])) continue;
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
    const titre = nomFilmImportV1_(ctx.valeurs[i][ctx.h.Name]);
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
    const titre = nomFilmImportV1_(ligne[ctx.h.Name]);
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


/**
 * Relance les lignes marquées NON_TROUVE (par exemple après un correctif de
 * la recherche) : efface leur statut puis relance l'import. Ne touche pas
 * aux lignes déjà importées (OK) ni aux avis existants.
 */
function reessayerNonTrouvesLetterboxdV1() {
  const ctx = lireOngletImportLetterboxdV1_();
  const col = ctx.h.StatutImport;
  if (col === undefined) { Logger.log("Aucun import précédent : lance d'abord importerNotesLetterboxdV1."); return; }
  let remis = 0;
  for (let i = 1; i < ctx.valeurs.length; i++) {
    const st = String(ctx.valeurs[i][col] || "").trim();
    if (st === "NON_TROUVE" || st === "ERREUR") {
      ctx.feuille.getRange(i + 1, col + 1, 1, 2).clearContent();
      remis++;
    }
  }
  Logger.log(remis + " ligne(s) remise(s) à traiter.");
  importerNotesLetterboxdV1();
}
