/**
 * 27_MAINTENANCE_JOURNAL.js
 * Version: 1.0 (21/10/2026)
 *
 * Purge automatique de l'onglet JOURNAL.
 *
 * POURQUOI : journal_() ajoute une ligne à chaque action et rien ne les
 * efface jamais. Constat du 21/10/2026 : 142 709 lignes en 7 semaines
 * (environ 3 000 par jour), ce qui alourdit tout le classeur.
 *
 * CE QUE ÇA FAIT : supprime les lignes les plus anciennes du JOURNAL et ne
 * garde que les N derniers jours (14 par défaut, réglable avec la clé
 * JournalJoursConserves dans l'onglet CONFIG). Ne touche à AUCUN autre onglet.
 *
 * SÉCURITÉS :
 *  - ne supprime que des lignes CONSÉCUTIVES depuis le haut (le journal est
 *    écrit dans l'ordre chronologique), et s'arrête à la première date
 *    illisible ou récente ;
 *  - garde toujours au moins 1 000 lignes ;
 *  - vérifie que la cellule A1 s'appelle bien "Date" ;
 *  - supprime par lots de 20 000 lignes avec une limite de temps ; si tout
 *    n'est pas fini, la suite est faite au passage suivant ;
 *  - un verrou empêche deux purges en même temps.
 *
 * LANCEMENT : automatique une fois par jour (appelée par la synthèse des
 * erreurs de 8 h), ou à la main : purgerJournalMaintenanceV1().
 */

const JOURNAL_PURGE_JOURS_DEFAUT_V1 = 14;
const JOURNAL_PURGE_LIGNES_MIN_V1 = 1000;
const JOURNAL_PURGE_LOT_V1 = 20000;
const JOURNAL_PURGE_BUDGET_MS_V1 = 4 * 60 * 1000;
const JOURNAL_PURGE_PROPRIETE_V1 = "JOURNAL_PURGE_DERNIERE_EXECUTION_V1";
const JOURNAL_PURGE_INTERVALLE_MS_V1 = 20 * 60 * 60 * 1000;

/** Date (objet Date ou texte jj/mm/aaaa hh:mm:ss) -> millisecondes, ou null. */
function journalDateEnMsV1_(valeur) {
  if (valeur instanceof Date) {
    const t = valeur.getTime();
    return isNaN(t) ? null : t;
  }
  const m = String(valeur === null || valeur === undefined ? "" : valeur)
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const t = d.getTime();
  return isNaN(t) ? null : t;
}

/**
 * Fonction PURE. valeurs = colonne A sans l'en-tête (tableau de tableaux).
 * Renvoie le nombre de lignes à supprimer depuis le haut : les lignes
 * consécutives plus vieilles que limiteMs, sans jamais descendre sous
 * minGarde lignes restantes. S'arrête à la première date illisible.
 */
function journalNombreLignesAPurgerV1_(valeurs, limiteMs, minGarde) {
  const total = valeurs.length;
  const maxSuppression = Math.max(0, total - minGarde);
  let n = 0;
  while (n < maxSuppression) {
    const ms = journalDateEnMsV1_(valeurs[n][0]);
    if (ms === null || ms >= limiteMs) break;
    n++;
  }
  return n;
}

function purgerJournalV1_(maintenantMs) {
  const stats = { supprimees: 0, restantes: null, aSupprimerEncore: 0, ignoree: "" };
  const sheet = getSheet_(SHEETS.JOURNAL);
  if (!sheet) { stats.ignoree = "onglet JOURNAL introuvable"; return stats; }

  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(20000)) { stats.ignoree = "verrou occupé"; return stats; }

  try {
    if (String(sheet.getRange(1, 1).getValue()).trim() !== "Date") {
      stats.ignoree = "A1 n'est pas \"Date\" -- structure inattendue, rien supprimé";
      return stats;
    }
    const derniere = sheet.getLastRow();
    if (derniere - 1 <= JOURNAL_PURGE_LIGNES_MIN_V1) {
      stats.restantes = Math.max(0, derniere - 1);
      stats.ignoree = "journal déjà petit";
      return stats;
    }

    let jours = Number(lireConfig_("JournalJoursConserves", JOURNAL_PURGE_JOURS_DEFAUT_V1));
    if (!isFinite(jours) || jours < 1) jours = JOURNAL_PURGE_JOURS_DEFAUT_V1;
    const limiteMs = (maintenantMs || Date.now()) - jours * 24 * 60 * 60 * 1000;

    const valeurs = sheet.getRange(2, 1, derniere - 1, 1).getValues();
    let aSupprimer = journalNombreLignesAPurgerV1_(valeurs, limiteMs, JOURNAL_PURGE_LIGNES_MIN_V1);
    const debut = Date.now();

    while (aSupprimer > 0 && Date.now() - debut < JOURNAL_PURGE_BUDGET_MS_V1) {
      const lot = Math.min(JOURNAL_PURGE_LOT_V1, aSupprimer);
      sheet.deleteRows(2, lot);
      stats.supprimees += lot;
      aSupprimer -= lot;
    }
    stats.aSupprimerEncore = aSupprimer;
    stats.restantes = (derniere - 1) - stats.supprimees;
    return stats;
  } finally {
    verrou.releaseLock();
  }
}

/** Lancement manuel (menu Exécuter de l'éditeur Apps Script). */
function purgerJournalMaintenanceV1() {
  const stats = purgerJournalV1_();
  Logger.log("PURGE JOURNAL V1 | supprimées=" + stats.supprimees + " | restantes=" + stats.restantes +
    " | encore à supprimer=" + stats.aSupprimerEncore + (stats.ignoree ? " | " + stats.ignoree : ""));
  return stats;
}

/** Appelée automatiquement : au plus une fois toutes les 20 h, sans jamais faire échouer l'appelant. */
function purgerJournalSiNecessaireV1_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const derniere = Number(props.getProperty(JOURNAL_PURGE_PROPRIETE_V1) || 0);
    if (Date.now() - derniere < JOURNAL_PURGE_INTERVALLE_MS_V1) return;
    const stats = purgerJournalV1_();
    // Si tout n'est pas fini (journal énorme), on retentera au prochain passage.
    if (stats.aSupprimerEncore === 0 && !(stats.ignoree && stats.ignoree.indexOf("verrou") === 0)) {
      props.setProperty(JOURNAL_PURGE_PROPRIETE_V1, String(Date.now()));
    }
    Logger.log("PURGE JOURNAL V1 | supprimées=" + stats.supprimees + " | restantes=" + stats.restantes +
      " | encore à supprimer=" + stats.aSupprimerEncore + (stats.ignoree ? " | " + stats.ignoree : ""));
  } catch (e) {
    Logger.log("PURGE JOURNAL V1 | échec ignoré : " + e.message);
  }
}
