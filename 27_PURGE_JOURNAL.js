/**
 * ============================================================
 * 27_PURGE_JOURNAL.gs
 * Version: 1.0 (21/10/2026)
 *
 * But : l'onglet JOURNAL grossit sans limite (142 000+ lignes au
 * 20/10/2026, ~2 900 lignes par jour) et alourdit tout le classeur.
 * Cette purge supprime les lignes plus vieilles que N jours
 * (14 par défaut, réglable via la clé CONFIG "JournalConservationJours").
 *
 * SÉCURITÉS :
 *  - L'en-tête (ligne 1) n'est jamais touché.
 *  - On ne supprime que le bloc CONTIGU de lignes anciennes en haut de
 *    l'onglet (le journal est chronologique) : dès qu'une ligne récente
 *    ou illisible est rencontrée, on s'arrête.
 *  - Au moins 500 lignes sont toujours conservées.
 *  - Suppression par morceaux de 20 000 lignes avec garde de temps
 *    (limite Apps Script) : un gros retard se rattrape sur plusieurs nuits.
 *  - ERREURS et les autres onglets ne sont pas concernés.
 *
 * MISE EN PLACE (une seule fois, manuellement), comme le résumé
 * quotidien (15_DIGEST_EMAIL) : ce déclencheur n'est PAS intégré au
 * système géré de 08_DECLENCHEURS (qui exige exactement 8 tâches).
 *  1. simulerPurgeJournalV1()            -> compte, ne supprime RIEN
 *  2. installerDeclencheurPurgeJournalV1() -> purge chaque nuit à 3h
 *  (purgerJournalV1() peut aussi être lancée à la main.)
 * ============================================================
 */

const PURGE_JOURNAL_JOURS_DEFAUT_V1 = 14;
const PURGE_JOURNAL_MIN_LIGNES_V1 = 500;
const PURGE_JOURNAL_MORCEAU_V1 = 20000;
const PURGE_JOURNAL_BUDGET_MS_V1 = 4 * 60 * 1000; // 4 min sur les 6 permises
const PURGE_JOURNAL_HEURE_V1 = 3;


/** Date d'une cellule du JOURNAL : objet Date, ou texte "jj/MM/aaaa HH:mm:ss". */
function purgeJournalLireDateV1_(valeur) {
  if (valeur instanceof Date) {
    return isNaN(valeur.getTime()) ? null : valeur.getTime();
  }
  const m = String(valeur || "").trim().match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!m) return null;
  const d = new Date(
    Number(m[3]), Number(m[2]) - 1, Number(m[1]),
    Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0)
  );
  return isNaN(d.getTime()) ? null : d.getTime();
}


/**
 * Nombre de lignes de données à supprimer en haut de l'onglet
 * (bloc contigu de lignes plus anciennes que le seuil).
 * "valeurs" = contenu de la colonne A SANS l'en-tête.
 */
function purgeJournalCompterAnciennesV1_(valeurs, seuilMs, minLignesAGarder) {
  let n = 0;
  for (let i = 0; i < valeurs.length; i++) {
    const t = purgeJournalLireDateV1_(valeurs[i]);
    if (t === null || t >= seuilMs) break;
    n++;
  }
  const maxSupprimable = Math.max(0, valeurs.length - minLignesAGarder);
  return Math.min(n, maxSupprimable);
}


function purgeJournalJoursV1_() {
  const brut = Number(String(lireConfig_("JournalConservationJours", PURGE_JOURNAL_JOURS_DEFAUT_V1)).trim());
  return (isFinite(brut) && brut >= 1) ? Math.floor(brut) : PURGE_JOURNAL_JOURS_DEFAUT_V1;
}


function purgeJournalPreparerV1_() {
  const feuille = getSheet_(SHEETS.JOURNAL);
  if (!feuille) return null;
  const derniere = feuille.getLastRow();
  const jours = purgeJournalJoursV1_();
  const seuilMs = Date.now() - jours * 24 * 3600 * 1000;
  const valeurs = derniere >= 2
    ? feuille.getRange(2, 1, derniere - 1, 1).getValues().map(function(l) { return l[0]; })
    : [];
  return {
    feuille: feuille,
    jours: jours,
    total: valeurs.length,
    aSupprimer: purgeJournalCompterAnciennesV1_(valeurs, seuilMs, PURGE_JOURNAL_MIN_LIGNES_V1)
  };
}


/** Compte seulement : ne supprime RIEN. */
function simulerPurgeJournalV1() {
  const p = purgeJournalPreparerV1_();
  if (!p) { Logger.log("Onglet JOURNAL introuvable."); return; }
  Logger.log(
    "SIMULATION purge JOURNAL : " + p.total + " ligne(s) de données, conservation " +
    p.jours + " jour(s) -> " + p.aSupprimer + " ligne(s) seraient supprimées, " +
    (p.total - p.aSupprimer) + " conservée(s). Rien n'a été modifié."
  );
}


/** Purge réelle. Appelée chaque nuit par le déclencheur. */
function purgerJournalV1() {
  const debut = Date.now();
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(10000)) {
    Logger.log("Purge JOURNAL : une autre exécution est en cours -- abandon.");
    return;
  }
  try {
    const p = purgeJournalPreparerV1_();
    if (!p) { Logger.log("Onglet JOURNAL introuvable."); return; }

    let restant = p.aSupprimer;
    let supprimees = 0;
    while (restant > 0 && (Date.now() - debut) < PURGE_JOURNAL_BUDGET_MS_V1) {
      const lot = Math.min(restant, PURGE_JOURNAL_MORCEAU_V1);
      p.feuille.deleteRows(2, lot); // toujours juste sous l'en-tête
      restant -= lot;
      supprimees += lot;
    }

    const message =
      "Purge JOURNAL : " + supprimees + " ligne(s) supprimée(s) (conservation " + p.jours +
      " jours), reste à purger : " + restant + ", lignes de données avant : " + p.total + ".";
    Logger.log(message);
    try { journal_("JOURNAL", "PURGE", restant > 0 ? "PARTIEL" : "OK", message); } catch (e) { /* sans gravité */ }
  } finally {
    verrou.releaseLock();
  }
}


function installerDeclencheurPurgeJournalV1() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "purgerJournalV1") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("purgerJournalV1")
    .timeBased()
    .everyDays(1)
    .atHour(PURGE_JOURNAL_HEURE_V1)
    .create();
  Logger.log("Déclencheur de purge du JOURNAL installé (chaque nuit vers " + PURGE_JOURNAL_HEURE_V1 + "h).");
}


function supprimerDeclencheurPurgeJournalV1() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "purgerJournalV1") { ScriptApp.deleteTrigger(t); n++; }
  });
  Logger.log("Déclencheurs de purge du JOURNAL supprimés : " + n);
}
