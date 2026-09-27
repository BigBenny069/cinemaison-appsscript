/**
 * ============================================================
 * CinéMaison V4
 * Script  : 19_RAFRAICHISSEMENT_LETTERBOXD.gs
 * Rôle    : Recontrôle périodique de la note/votes Letterboxd de tout
 *           le catalogue -- le reste du projet ne les recontrôle
 *           JAMAIS une fois une fiche "réglée" (voir 03_LETTERBOXD.gs,
 *           doitRecontrolerLetterboxdV43_) alors qu'une note évolue
 *           avec le temps (plus de votes). Demandé par Ben (26/09/2026),
 *           après avoir remarqué deux fiches du même film avec des
 *           notes différentes, gelées chacune au jour de son premier
 *           enrichissement.
 * Version : 1.0 (26/09/2026)
 * ============================================================
 *
 * Rattrapage enchaîné, comme demandé : le lundi à 2h, traite le
 * catalogue par lots (budget de TEMPS, pas de nombre de lignes -- une
 * page Letterboxd peut être lente à charger), en se reprogrammant
 * lui-même toutes les ~30s tant qu'il reste des fiches, jusqu'à avoir
 * fait tout le catalogue ce jour-là. Le curseur de progression est
 * gardé dans PropertiesService (survit entre les exécutions,
 * contrairement à une variable normale qui repartirait de zéro).
 *
 * Ne recontrôle que les fiches qui ont déjà une VRAIE page Letterboxd
 * connue -- pas la peine de re-chercher chaque semaine une fiche pour
 * laquelle aucune page n'a jamais été trouvée, le cycle normal
 * d'enrichissement s'en charge déjà (A_VERIFIER_LETTERBOXD).
 *
 * Mise en place (à faire une seule fois, manuellement) :
 *   installerDeclencheurLetterboxdHebdoV1() depuis l'éditeur Apps Script.
 *
 * Dépend de 03_LETTERBOXD.gs (chercherLetterboxd_, estMarqueurLetterboxdV43_,
 * estUrlLetterboxdReelleV43_) et 05_ENRICHISSEMENT.gs (ecrireResultatLetterboxdV4_).
 */

const CLE_CURSEUR_LETTERBOXD_V1 = "curseurRafraichissementLetterboxdV1";
const BUDGET_TEMPS_LETTERBOXD_MS = 5 * 60 * 1000; // 5 min -- marge sous la limite de 6 min d'Apps Script
const DELAI_RELANCE_LETTERBOXD_MS = 30 * 1000; // reprise ~30s après la fin du lot précédent

/** Lance une seule fois depuis l'éditeur pour activer le rafraîchissement hebdomadaire. */
function installerDeclencheurLetterboxdHebdoV1() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "demarrerRafraichissementLetterboxdHebdoV1"; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger("demarrerRafraichissementLetterboxdHebdoV1")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(2)
    .create();

  Logger.log("Déclencheur hebdomadaire (lundi 2h) installé pour demarrerRafraichissementLetterboxdHebdoV1.");
}

function supprimerDeclencheursContinuationLetterboxdV1_() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "traiterLotLetterboxdV1_"; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

/** Point d'entrée hebdomadaire -- remet le curseur à zéro puis lance le premier lot. */
function demarrerRafraichissementLetterboxdHebdoV1() {
  PropertiesService.getScriptProperties().setProperty(CLE_CURSEUR_LETTERBOXD_V1, "0");
  supprimerDeclencheursContinuationLetterboxdV1_();
  journal_("RAFRAICHISSEMENT_LETTERBOXD", "HEBDOMADAIRE", "DEMARRE", "Curseur remis à 0.");
  traiterLotLetterboxdV1_();
}

/**
 * Traite un lot à partir du curseur, jusqu'à épuiser le budget de
 * temps -- se reprogramme tout seul (~30s) s'il reste des fiches,
 * sinon journalise la fin.
 */
function traiterLotLetterboxdV1_() {
  const debut = Date.now();
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = classeur.getSheetByName("Films");
  if (!feuille) {
    journal_("RAFRAICHISSEMENT_LETTERBOXD", "HEBDOMADAIRE", "ERREUR", "Feuille Films introuvable.");
    return;
  }

  const donnees = feuille.getDataRange().getValues();
  const entetes = donnees[0].map(function (e) { return String(e || "").trim(); });
  const h = {};
  entetes.forEach(function (nom, i) { h[nom] = i; });

  const colonnesRequises = ["Titre", "Annee", "Type", "IMDbID", "TMDbID", "URLLetterboxd", "TitreOriginal"];
  for (const col of colonnesRequises) {
    if (h[col] === undefined) {
      journal_("RAFRAICHISSEMENT_LETTERBOXD", "HEBDOMADAIRE", "ERREUR", "Colonne manquante dans Films : " + col);
      return;
    }
  }

  let curseur = Number(PropertiesService.getScriptProperties().getProperty(CLE_CURSEUR_LETTERBOXD_V1) || "0");
  let traitees = 0;
  let reussies = 0;
  let ignorees = 0;
  let erreurs = 0;

  for (; curseur < donnees.length - 1; curseur++) {
    if (Date.now() - debut > BUDGET_TEMPS_LETTERBOXD_MS) break;

    const rowNumber = curseur + 2; // +1 pour l'entête, +1 car curseur est un index dans donnees[1..]
    const row = donnees[curseur + 1];

    const titre = safeTrim_(row[h.Titre]);
    if (!titre) continue;

    const urlLetterboxdActuelle = safeTrim_(row[h.URLLetterboxd]);

    // Rien à recontrôler si cette fiche n'a jamais eu de page Letterboxd
    // trouvée -- le cycle normal d'enrichissement (A_VERIFIER_LETTERBOXD)
    // s'en charge déjà, pas la peine de dupliquer l'effort ici.
    if (!estUrlLetterboxdReelleV43_(urlLetterboxdActuelle) || estMarqueurLetterboxdV43_(urlLetterboxdActuelle)) {
      ignorees++;
      continue;
    }

    try {
      const lb = chercherLetterboxd_(
        titre,
        safeTrim_(row[h.Annee]),
        safeTrim_(row[h.IMDbID]),
        urlLetterboxdActuelle,
        safeTrim_(row[h.TMDbID]),
        safeTrim_(row[h.TitreOriginal]),
        safeTrim_(row[h.Type])
      );

      if (lb && !lb.erreur && !lb.ignore) {
        ecrireResultatLetterboxdV4_(feuille, rowNumber, h, lb);
        reussies++;
      } else {
        erreurs++;
      }
    } catch (e) {
      erreurs++;
      Logger.log("RAFRAICHISSEMENT_LETTERBOXD ligne " + rowNumber + " (" + titre + ") : " + e.message);
    }

    traitees++;
  }

  PropertiesService.getScriptProperties().setProperty(CLE_CURSEUR_LETTERBOXD_V1, String(curseur));

  const termine = curseur >= donnees.length - 1;
  Logger.log(
    "RAFRAICHISSEMENT_LETTERBOXD : lot terminé -- " + traitees + " tentée(s), " +
    reussies + " réussie(s), " + ignorees + " ignorée(s) (pas de fiche Letterboxd), " +
    erreurs + " erreur(s). Curseur=" + curseur +
    (termine ? " (catalogue complet)" : " (reprise dans " + (DELAI_RELANCE_LETTERBOXD_MS / 1000) + "s)")
  );

  if (termine) {
    supprimerDeclencheursContinuationLetterboxdV1_();
    journal_(
      "RAFRAICHISSEMENT_LETTERBOXD", "HEBDOMADAIRE", "TERMINE",
      traitees + " tentée(s), " + reussies + " réussie(s), " + erreurs + " erreur(s) sur l'ensemble du catalogue."
    );
  } else {
    ScriptApp.newTrigger("traiterLotLetterboxdV1_")
      .timeBased()
      .after(DELAI_RELANCE_LETTERBOXD_MS)
      .create();
  }
}
