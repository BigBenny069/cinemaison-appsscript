/**
 * ============================================================
 * CinéMaison V4
 * Script  : 20_RETRADUCTION_CASTING.gs
 * Rôle    : Retraduit Casting/Réalisateur pour les fiches DÉJÀ
 *           enrichies dont un nom est resté en écriture non latine
 *           (kanji, cyrillique, hébreu, arabe, hindi...). L'enrichis-
 *           sement ne tourne qu'une fois par fiche (voir 02_TMDB.gs
 *           V4.6.4, nomLisibleTMDb_) -- un correctif d'enrichissement
 *           ne bénéficie jamais automatiquement aux fiches déjà
 *           enrichies avant lui. Constaté par Ben : 118 fiches sur
 *           997 concernées à cette date (29/09/2026), surtout des
 *           films japonais/coréens/chinois.
 * Version : 1.0 (29/09/2026)
 * ============================================================
 *
 * Job PONCTUEL, pas récurrent : une fois le retard rattrapé, plus
 * besoin de le relancer, sauf nouveau cas repéré à la main plus tard
 * (le repérage lui-même -- contientEcritureNonLatine_ sur Casting/
 * Réalisateur -- peut toujours resservir en le relançant).
 *
 * Rattrapage enchaîné, même principe que 19_RAFRAICHISSEMENT_LETTERBOXD.gs :
 * traite par lots de TEMPS (pas de nombre de fiches fixe -- une
 * requête TMDb, parfois plusieurs si des alias doivent être
 * recherchés, peut être lente), se reprogramme lui-même toutes les
 * ~30s tant qu'il reste des fiches, jusqu'à avoir tout traité.
 * Position gardée dans PropertiesService (survit entre les
 * exécutions).
 *
 * Ne réécrit QUE Casting et Réalisateur -- pas le reste de la fiche
 * (synopsis, affiche, note...), pour rester rapide et ne toucher à
 * rien d'autre.
 *
 * Usage : lance demarrerRetraductionCastingV1() une seule fois depuis
 * l'éditeur Apps Script. Dépend de 02_TMDB.gs (chargerDetailTMDbAvecRepli_,
 * contientEcritureNonLatine_) et 01_UTILS.gs (setProtected_, safeTrim_).
 */

const CLE_CURSEUR_RETRADUCTION_V1 = "curseurRetraductionCastingV1";
const CLE_LIGNES_RETRADUCTION_V1 = "listeLignesRetraductionCastingV1";
const BUDGET_LOT_RETRADUCTION_MS = 4.5 * 60 * 1000; // marge sous la limite de 6 min d'Apps Script
const DELAI_RELANCE_RETRADUCTION_MS = 30 * 1000;

function supprimerDeclencheursContinuationRetraductionV1_() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "traiterLotRetraductionCastingV1_"; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

/**
 * Point d'entrée -- repère toutes les fiches dont Casting ou
 * Réalisateur contient de l'écriture non latine, mémorise leurs
 * numéros de ligne, remet le curseur à zéro et lance le premier lot.
 */
function demarrerRetraductionCastingV1() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = classeur.getSheetByName("Films");
  if (!feuille) {
    journal_("RETRADUCTION_CASTING", "DEMARRAGE", "ERREUR", "Feuille Films introuvable.");
    return;
  }

  const donnees = feuille.getDataRange().getValues();
  const entetes = donnees[0].map(function (e) { return String(e || "").trim(); });
  const h = {};
  entetes.forEach(function (nom, i) { h[nom] = i; });

  const colonnesRequises = ["ID", "Titre", "Type", "TMDbID", "Casting", "Réalisateur"];
  for (const col of colonnesRequises) {
    if (h[col] === undefined) {
      journal_("RETRADUCTION_CASTING", "DEMARRAGE", "ERREUR", "Colonne manquante dans Films : " + col);
      return;
    }
  }

  const lignesAVoir = [];
  for (let i = 1; i < donnees.length; i++) {
    const casting = String(donnees[i][h.Casting] || "");
    const realisateur = String(donnees[i][h["Réalisateur"]] || "");
    if (contientEcritureNonLatine_(casting) || contientEcritureNonLatine_(realisateur)) {
      lignesAVoir.push(i + 1); // numéro de ligne réel dans le Sheet (1-indexé, +1 pour l'entête)
    }
  }

  const proprietes = PropertiesService.getScriptProperties();
  proprietes.setProperty(CLE_LIGNES_RETRADUCTION_V1, JSON.stringify(lignesAVoir));
  proprietes.setProperty(CLE_CURSEUR_RETRADUCTION_V1, "0");
  supprimerDeclencheursContinuationRetraductionV1_();

  Logger.log(lignesAVoir.length + " fiche(s) repérée(s) avec un nom en écriture non latine dans Casting/Réalisateur.");
  journal_("RETRADUCTION_CASTING", "DEMARRAGE", "OK", lignesAVoir.length + " fiche(s) à retraduire.");

  if (lignesAVoir.length === 0) return;
  traiterLotRetraductionCastingV1_();
}

/**
 * Traite un lot à partir du curseur, jusqu'à épuiser le budget de
 * temps -- se reprogramme tout seul (~30s) s'il reste des fiches,
 * sinon journalise la fin.
 */
function traiterLotRetraductionCastingV1_() {
  const debut = Date.now();
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = classeur.getSheetByName("Films");
  if (!feuille) return;

  const proprietes = PropertiesService.getScriptProperties();
  const lignesJSON = proprietes.getProperty(CLE_LIGNES_RETRADUCTION_V1);
  if (!lignesJSON) {
    journal_("RETRADUCTION_CASTING", "LOT", "ERREUR", "Aucune liste de lignes en mémoire -- relance demarrerRetraductionCastingV1().");
    return;
  }
  const lignes = JSON.parse(lignesJSON);

  const donnees = feuille.getDataRange().getValues();
  const entetes = donnees[0].map(function (e) { return String(e || "").trim(); });
  const h = {};
  entetes.forEach(function (nom, i) { h[nom] = i; });

  const apiKey = lireConfig_("TMDbApiKey", "");

  let curseur = Number(proprietes.getProperty(CLE_CURSEUR_RETRADUCTION_V1) || "0");
  let traitees = 0;
  let modifiees = 0;
  let erreurs = 0;

  for (; curseur < lignes.length; curseur++) {
    if (Date.now() - debut > BUDGET_LOT_RETRADUCTION_MS) break;

    const rowNumber = lignes[curseur];
    const row = donnees[rowNumber - 1];
    if (!row) { traitees++; continue; }

    const titre = safeTrim_(row[h.Titre]);
    const tmdbId = safeTrim_(row[h.TMDbID]);
    const type = safeTrim_(row[h.Type]);

    if (!tmdbId) { traitees++; continue; }

    try {
      const detail = chargerDetailTMDbAvecRepli_(tmdbId, type, apiKey, "Retraduction casting", null);
      const casting = detail.casting || "";
      const realisateur = detail.realisateur || "";

      const changeCasting = setProtected_(feuille, rowNumber, h, "Casting", casting, { force: true });
      const changeRealisateur = setProtected_(feuille, rowNumber, h, "Réalisateur", realisateur, { force: true });
      if (changeCasting || changeRealisateur) modifiees++;
    } catch (e) {
      erreurs++;
      Logger.log("RETRADUCTION_CASTING ligne " + rowNumber + " (" + titre + ") : " + e.message);
    }

    traitees++;
  }

  proprietes.setProperty(CLE_CURSEUR_RETRADUCTION_V1, String(curseur));

  const termine = curseur >= lignes.length;
  Logger.log(
    "RETRADUCTION_CASTING : lot terminé -- " + traitees + " tentée(s), " +
    modifiees + " modifiée(s), " + erreurs + " erreur(s). Curseur=" + curseur + "/" + lignes.length +
    (termine ? " (terminé)" : " (reprise dans " + (DELAI_RELANCE_RETRADUCTION_MS / 1000) + "s)")
  );

  if (termine) {
    supprimerDeclencheursContinuationRetraductionV1_();
    proprietes.deleteProperty(CLE_LIGNES_RETRADUCTION_V1);
    journal_(
      "RETRADUCTION_CASTING", "TERMINE", "OK",
      lignes.length + " fiche(s) traitée(s) au total, " + modifiees + " modifiée(s)."
    );
  } else {
    ScriptApp.newTrigger("traiterLotRetraductionCastingV1_")
      .timeBased()
      .after(DELAI_RELANCE_RETRADUCTION_MS)
      .create();
  }
}
