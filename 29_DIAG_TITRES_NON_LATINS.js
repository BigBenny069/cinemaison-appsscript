/**
 * ============================================================
 * 29_DIAG_TITRES_NON_LATINS.gs
 * Version: 1.2 (25/10/2026)
 *
 * Correctif V1.2 (25/10/2026) : appliquerTitresNonLatinsV1 ne remplace plus
 * que les titres ENTIÈREMENT non latins. Un titre déjà en partie latin
 * (cas réel FILM0821 : "Nausicaä de la vallée du vent (… 風の谷のナウシカ)")
 * est laissé tel quel, car le titre anglais de TMDb ("Warriors of the Wind")
 * aurait été moins bon. Ces fiches restent visibles dans la liste.
 *
 * Correctif V1.1 (25/10/2026) : ajout de appliquerTitresNonLatinsV1(), qui
 * remplace le Titre de ces fiches par le titre anglais proposé (à la demande
 * de Ben, pour éviter la correction à la main). La liste reste en lecture seule.
 *
 * But : repérer les fiches de l'onglet Films dont le Titre est écrit en
 * caractères non latins (japonais, coréen, russe...), par exemple
 * FILM1388 "House of Sayuri" ajouté sous son titre japonais. La cause
 * (recherche TMDb en français qui renvoie le titre original quand il n'y a
 * pas de titre français) est corrigée côté app (api/search-tmdb.js), mais
 * les fiches déjà ajoutées gardent leur ancien titre.
 *
 * LECTURE SEULE : ne modifie RIEN. Affiche pour chaque fiche concernée
 * l'ID, le titre actuel, la ligne et le titre ANGLAIS proposé par TMDb
 * (d'après le TMDbID de la fiche). Les corrections se font ensuite à la
 * main dans l'app (bouton d'édition).
 *
 * Utilisation :
 *  1. listerTitresNonLatinsV1()    -> lecture seule, montre ce qui serait changé.
 *  2. appliquerTitresNonLatinsV1() -> remplace le Titre (UNIQUEMENT cette
 *     cellule) par le titre anglais, seulement si TMDb en donne un en
 *     caractères latins. Chaque changement est loggué "ancien -> nouveau".
 *     Faire une copie de sauvegarde du Sheet avant.
 * ============================================================
 */

const TITRE_A_DES_LETTRES_LATINES_REGEX_V1 = /[A-Za-z\u00C0-\u024F]/;
const TITRE_NON_LATIN_REGEX_V1 = /[Ͱ-᷿⺀-꓏가-퟿豈-﫿]/;

/** Cherche les fiches au titre non latin -> [{ ligne, id, actuel, propose }]. propose = "" si aucun titre latin. */
function collecterTitresNonLatinsV1_() {
  const feuille = getSheet_(SHEETS.FILMS);
  const valeurs = feuille.getDataRange().getValues();
  const h = getHeadersMapV4_(valeurs[0]);
  const apiKey = lireConfig_("TMDbApiKey", "");
  const liste = [];

  for (let i = 1; i < valeurs.length; i++) {
    const titre = String(get_(valeurs[i], h, "Titre") || "").trim();
    if (!titre || !TITRE_NON_LATIN_REGEX_V1.test(titre)) continue;

    const tmdbId = String(get_(valeurs[i], h, "TMDbID") || "").trim();
    const serie = String(get_(valeurs[i], h, "Type") || "").trim() === "Série";
    let propose = "";
    let note = "(TMDbID absent)";

    if (tmdbId && apiKey) {
      try {
        const url = "https://api.themoviedb.org/3/" + (serie ? "tv" : "movie") + "/" +
          encodeURIComponent(tmdbId) + "?api_key=" + encodeURIComponent(apiKey) + "&language=en-US";
        const res = fetchTMDbAvecRetry_(url, "titre anglais " + tmdbId);
        if (res.getResponseCode() === 200) {
          const d = JSON.parse(res.getContentText());
          const anglais = String((serie ? d.name : d.title) || "").trim();
          if (!anglais) note = "(aucun titre anglais)";
          else if (TITRE_NON_LATIN_REGEX_V1.test(anglais)) note = "(TMDb n'a pas de titre latin)";
          else { propose = anglais; note = anglais; }
        } else {
          note = "(TMDb HTTP " + res.getResponseCode() + ")";
        }
      } catch (e) {
        note = "(erreur : " + e.message + ")";
      }
    }
    liste.push({ ligne: i + 1, id: get_(valeurs[i], h, "ID"), actuel: titre, propose: propose, note: note, colTitre: h.Titre + 1 });
  }
  return liste;
}

function listerTitresNonLatinsV1() {
  const liste = collecterTitresNonLatinsV1_();
  Logger.log("=== Fiches dont le Titre est en caractères non latins (lecture seule) ===");
  liste.forEach(function(f) {
    Logger.log(f.id + " | ligne " + f.ligne + " | actuel : " + f.actuel + " | proposé : " + f.note);
  });
  Logger.log(liste.length ? liste.length + " fiche(s) concernée(s)." : "Aucune fiche avec un titre non latin.");
}

/** Remplace le Titre par le titre anglais (cellule Titre uniquement). */
function appliquerTitresNonLatinsV1() {
  const liste = collecterTitresNonLatinsV1_();
  const feuille = getSheet_(SHEETS.FILMS);
  let changes = 0;
  let ignores = 0;
  liste.forEach(function(f) {
    if (TITRE_A_DES_LETTRES_LATINES_REGEX_V1.test(f.actuel)) {
      ignores++;
      Logger.log("IGNORÉ (titre déjà en partie latin) " + f.id + " | " + f.actuel);
      return;
    }
    if (!f.propose) {
      ignores++;
      Logger.log("IGNORÉ " + f.id + " | " + f.actuel + " | " + f.note);
      return;
    }
    feuille.getRange(f.ligne, f.colTitre).setValue(f.propose);
    changes++;
    Logger.log("CHANGÉ " + f.id + " | ligne " + f.ligne + " | " + f.actuel + " -> " + f.propose);
    journal_("TITRES", "TITRE_NON_LATIN_REMPLACE", "OK", f.id + " | " + f.actuel + " -> " + f.propose);
  });
  Logger.log("Terminé : " + changes + " titre(s) remplacé(s), " + ignores + " ignoré(s) (pas de titre latin proposé).");
}
