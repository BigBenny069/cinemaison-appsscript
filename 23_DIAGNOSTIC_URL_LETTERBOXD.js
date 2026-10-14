/**
 * ============================================================
 * CinéMaison V4
 * Script  : 23_DIAGNOSTIC_URL_LETTERBOXD.gs
 * Rôle    : Repérer les fiches Films qui partagent la MÊME URL Letterboxd
 *           alors qu'elles ont des ID TMDb différents (une des deux a
 *           forcément une mauvaise URL). Lecture seule : ne modifie
 *           JAMAIS l'onglet Films.
 * Version : 1.1 (14/10/2026)
 * ============================================================
 *
 * Création (14/10/2026) : demandé par Ben après avoir constaté que
 * FILM0974 (Échos, TMDb 129612) et FILM0975 (Bill Burr: Live at Red
 * Rocks, TMDb 991115) portaient la même URL Letterboxd
 * (/film/echoes-2023-3/), toutes deux enrichies le 06/09/2026.
 *
 * V1.1 : envoie un mail quand des groupes suspects sont trouvés (rien si RAS)
 * et propose installerDeclencheurDiagnosticUrlLetterboxdV1() (lundi 7h).
 *
 * Usage : lance diagnosticUrlLetterboxdDoublonsV1() depuis l'éditeur.
 * Résultat dans l'onglet DIAGNOSTIC_URL_LETTERBOXD (créé une fois,
 * puis vidé et réécrit). Un même film suivi sur deux plateformes
 * (même TMDb, même URL) est NORMAL et n'est pas listé.
 *
 * Pour corriger une fiche : efface sa cellule URLLetterboxd dans Films,
 * l'enrichissement automatique la recalcule ensuite.
 */

function diagnosticUrlLetterboxdDoublonsV1() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const films = classeur.getSheetByName("Films");
  if (!films) throw new Error("La feuille Films est introuvable.");

  const donnees = films.getDataRange().getValues();
  if (donnees.length < 2) throw new Error("La feuille Films est vide.");

  const entetes = donnees[0].map(function (e) { return String(e || "").trim(); });
  const col = function (nom) {
    const i = entetes.indexOf(nom);
    if (i === -1) throw new Error("Colonne introuvable dans Films : " + nom);
    return i;
  };
  const cID = col("ID"), cTitre = col("Titre"), cAnnee = col("Annee"),
    cPlat = col("Plateforme"), cTmdb = col("TMDbID"), cImdb = col("IMDbID"),
    cUrl = col("URLLetterboxd"), cType = col("Type");

  // Regroupe par URL Letterboxd réelle (/film/...), normalisée.
  const groupes = {};
  for (let i = 1; i < donnees.length; i++) {
    const url = String(donnees[i][cUrl] || "").trim();
    if (!/letterboxd\.com\/film\//i.test(url)) continue;
    const cle = nettoyerUrlLetterboxd_(url).toLowerCase();
    if (!groupes[cle]) groupes[cle] = [];
    groupes[cle].push({
      id: String(donnees[i][cID] || "").trim(),
      titre: String(donnees[i][cTitre] || "").trim(),
      annee: String(donnees[i][cAnnee] || "").trim(),
      plateforme: String(donnees[i][cPlat] || "").trim(),
      tmdb: String(donnees[i][cTmdb] || "").trim(),
      imdb: String(donnees[i][cImdb] || "").trim(),
      type: String(donnees[i][cType] || "").trim(),
      url: url,
    });
  }

  const lignes = [[
    "URL Letterboxd", "ID", "Titre", "Année", "Plateforme", "Type",
    "TMDbID", "IMDbID", "Cas", "Vérification TMDb → Letterboxd",
  ]];
  let nbGroupes = 0;

  Object.keys(groupes).forEach(function (cle) {
    const membres = groupes[cle];
    if (membres.length < 2) return;

    const tmdbDistincts = {};
    membres.forEach(function (m) { if (m.tmdb) tmdbDistincts[m.tmdb] = true; });
    if (Object.keys(tmdbDistincts).length < 2) return; // même film : normal

    nbGroupes++;
    const imdbDistincts = {};
    membres.forEach(function (m) { if (m.imdb) imdbDistincts[m.imdb] = true; });
    const cas = Object.keys(imdbDistincts).length < 2
      ? "TMDb différents mais MÊME IMDb : un des deux IDs est à corriger"
      : "TMDb et IMDb différents : URL fausse sur au moins une fiche";

    membres.forEach(function (m) {
      let verif = "non vérifiable (série ou ID absent)";
      try {
        const attendue = rechercherLetterboxdViaTmdb_(m.tmdb, m.type);
        if (attendue) {
          verif = nettoyerUrlLetterboxd_(attendue).toLowerCase() === cle
            ? "OK : l'URL correspond à son TMDb"
            : "FAUX : son TMDb mène à " + attendue;
        }
        Utilities.sleep(300);
      } catch (e) {
        verif = "erreur de vérification";
      }
      lignes.push([cle, m.id, m.titre, m.annee, m.plateforme, m.type,
        m.tmdb, m.imdb, cas, verif]);
    });
  });

  let feuille = classeur.getSheetByName("DIAGNOSTIC_URL_LETTERBOXD");
  if (!feuille) feuille = classeur.insertSheet("DIAGNOSTIC_URL_LETTERBOXD");
  feuille.clear();
  if (lignes.length === 1) {
    feuille.getRange(1, 1).setValue("RAS : aucune URL Letterboxd partagée par des TMDb différents (" +
      new Date().toLocaleString("fr-FR") + ")");
  } else {
    feuille.getRange(1, 1, lignes.length, lignes[0].length).setValues(lignes);
    feuille.getRange(1, 1, 1, lignes[0].length).setFontWeight("bold");
    feuille.setFrozenRows(1);
  }
  Logger.log("Diagnostic URL Letterboxd : " + nbGroupes + " groupe(s) suspect(s).");
  if (nbGroupes > 0) {
    const ids = lignes.slice(1).map(function (l) { return l[1] + " " + l[2]; });
    envoyerMailRapport_(
      "CinéMaison - V2 - URL Letterboxd partagées (" + nbGroupes + " groupe(s))",
      nbGroupes + " URL Letterboxd sont partagées par des films différents. Détail dans l'onglet " +
      "DIAGNOSTIC_URL_LETTERBOXD. Fiches concernées :\n\n" + ids.join("\n") +
      "\n\nPour corriger : efface la cellule URLLetterboxd des fiches fausses.",
      "AlerteTechnique"
    );
  }
  return nbGroupes;
}


/** À lancer une fois : diagnostic automatique chaque lundi à 7h (mail seulement s'il y a un problème). */
function installerDeclencheurDiagnosticUrlLetterboxdV1() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "diagnosticUrlLetterboxdDoublonsV1"; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("diagnosticUrlLetterboxdDoublonsV1")
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  Logger.log("Déclencheur hebdomadaire (lundi 7h) installé.");
}
