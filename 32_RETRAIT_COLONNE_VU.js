/**
 * ============================================================
 * CinéMaison V2
 * Script : 32_RETRAIT_COLONNE_VU.js
 * Version: 1.0 (29/10/2026)
 * Rôle   : retire la colonne « Vu » de l'onglet Films (fonction jamais
 *          utilisée, demandée par Ben le 29/10/2026) et sa ligne dans
 *          l'onglet COLONNES. À lancer UNE SEULE FOIS, en deux temps.
 *
 * ORDRE À SUIVRE :
 *   1. Fusionner / déployer d'abord l'app (Vercel) : elle ne lit plus « Vu ».
 *   2. retraitColonneVuSimulationV1()  -> ne modifie RIEN, dit ce qui serait fait.
 *   3. retraitColonneVuReelV1()        -> fait le retrait.
 *
 * SÉCURITÉS (le réel s'arrête avant toute modification si l'une échoue) :
 *   - la colonne « Vu » doit exister UNE seule fois ;
 *   - elle doit être entièrement VIDE (sinon rien n'est supprimé, le nombre
 *     de cellules remplies est indiqué) ;
 *   - une copie de l'onglet Films et de l'onglet COLONNES est faite AVANT,
 *     dans le même classeur, sous le nom A_SUPPRIMER_... (à supprimer toi-même
 *     dans ~1 semaine si tout va bien) ;
 *   - verrou du classeur : si un contrôle écrit en ce moment, le script
 *     refuse de démarrer (relancer quand plus rien ne tourne) ;
 *   - après suppression, relecture des en-têtes : -1 colonne exactement,
 *     « Vu » absente, « ID » toujours en 1re colonne.
 * Aucun nouveau droit Google demandé (copie dans le classeur seulement).
 * ============================================================
 */

function retraitColonneVuSimulationV1() {
  return retraitColonneVuV1_(false);
}

function retraitColonneVuReelV1() {
  return retraitColonneVuV1_(true);
}

function retraitColonneVuV1_(reel) {
  const ss = getSpreadsheet_();
  const films = ss.getSheetByName(SHEETS.FILMS);
  if (!films) throw new Error("Onglet Films introuvable.");

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    const m = "ARRÊT : le classeur est occupé (un contrôle écrit peut-être). Relance dans quelques minutes.";
    Logger.log(m);
    return m;
  }

  try {
    const nbCols = films.getLastColumn();
    const entetes = films.getRange(1, 1, 1, nbCols).getValues()[0].map(function (x) { return String(x || "").trim(); });
    const positions = [];
    entetes.forEach(function (e, i) { if (e === "Vu") positions.push(i + 1); });

    if (positions.length === 0) {
      const m = "RIEN À FAIRE : aucune colonne « Vu » dans Films (déjà retirée ?).";
      Logger.log(m);
      return m;
    }
    if (positions.length > 1) {
      const m = "ARRÊT : « Vu » apparaît " + positions.length + " fois dans les en-têtes (positions " + positions.join(", ") + "). Rien modifié.";
      Logger.log(m);
      return m;
    }
    const pos = positions[0];

    const nbLignes = films.getLastRow() - 1;
    let remplies = 0;
    if (nbLignes > 0) {
      const valeurs = films.getRange(2, pos, nbLignes, 1).getValues();
      valeurs.forEach(function (r) { if (String(r[0] === null || r[0] === undefined ? "" : r[0]).trim() !== "") remplies++; });
    }

    // Ligne « Vu » dans l'onglet COLONNES (registre des colonnes)
    const colonnes = ss.getSheetByName(SHEETS.COLONNES);
    let ligneRegistre = 0;
    if (colonnes) {
      const data = colonnes.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0] || "").trim() === "Vu" && String(data[i][1] || "").trim() === SHEETS.FILMS) { ligneRegistre = i + 1; break; }
      }
    }

    const resume =
      "Colonne « Vu » : position " + pos + " sur " + nbCols + " | lignes de fiches : " + nbLignes +
      " | cellules remplies : " + remplies +
      " | ligne dans COLONNES : " + (ligneRegistre ? "n° " + ligneRegistre : "aucune");

    if (remplies > 0) {
      const m = "ARRÊT : la colonne « Vu » contient " + remplies + " valeur(s). Rien supprimé. " + resume;
      Logger.log(m);
      return m;
    }

    if (!reel) {
      const m = "SIMULATION OK (rien modifié). " + resume +
        " | Le réel va : copier Films et COLONNES en A_SUPPRIMER_..., supprimer la colonne, retirer la ligne du registre.";
      Logger.log(m);
      return m;
    }

    // --- RÉEL : sauvegardes d'abord ---
    const tampon = Utilities.formatDate(new Date(), "Europe/Paris", "yyyyMMdd_HHmm");
    const sauvFilms = films.copyTo(ss).setName("A_SUPPRIMER_Films_avant_retrait_Vu_" + tampon);
    let sauvColonnes = null;
    if (colonnes) sauvColonnes = colonnes.copyTo(ss).setName("A_SUPPRIMER_COLONNES_avant_retrait_Vu_" + tampon);
    SpreadsheetApp.flush();

    // Vérifie que la sauvegarde est bien complète avant de toucher à quoi que ce soit.
    if (sauvFilms.getLastRow() !== films.getLastRow() || sauvFilms.getLastColumn() !== films.getLastColumn()) {
      const m = "ARRÊT : la copie de sauvegarde de Films est incomplète. Rien supprimé (supprime les onglets A_SUPPRIMER_* créés).";
      Logger.log(m);
      return m;
    }

    films.deleteColumn(pos);
    SpreadsheetApp.flush();

    const apres = films.getRange(1, 1, 1, films.getLastColumn()).getValues()[0].map(function (x) { return String(x || "").trim(); });
    if (apres.indexOf("Vu") !== -1 || films.getLastColumn() !== nbCols - 1 || apres[0] !== "ID") {
      const m = "ALERTE : vérification après suppression échouée (colonnes avant " + nbCols + ", après " + films.getLastColumn() + "). " +
        "Restaure depuis l'onglet A_SUPPRIMER_Films_avant_retrait_Vu_" + tampon + ".";
      journal_("RETRAIT_VU", "VERIFICATION", "ERREUR", m);
      return m;
    }

    if (colonnes && ligneRegistre) colonnes.deleteRow(ligneRegistre);

    const fin = "OK : colonne « Vu » retirée de Films (de " + nbCols + " à " + films.getLastColumn() + " colonnes)" +
      (ligneRegistre ? ", ligne retirée de COLONNES" : "") +
      ". Sauvegardes : A_SUPPRIMER_Films_avant_retrait_Vu_" + tampon + (sauvColonnes ? " et A_SUPPRIMER_COLONNES_avant_retrait_Vu_" + tampon : "") + ".";
    journal_("RETRAIT_VU", "SUPPRESSION", "OK", fin);
    return fin;
  } finally {
    lock.releaseLock();
  }
}
