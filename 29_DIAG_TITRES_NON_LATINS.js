/**
 * ============================================================
 * 29_DIAG_TITRES_NON_LATINS.gs
 * Version: 1.0 (25/10/2026)
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
 * Utilisation : lancer listerTitresNonLatinsV1().
 * ============================================================
 */

const TITRE_NON_LATIN_REGEX_V1 = /[Ͱ-᷿⺀-꓏가-퟿豈-﫿]/;

function listerTitresNonLatinsV1() {
  const feuille = getSheet_(SHEETS.FILMS);
  const valeurs = feuille.getDataRange().getValues();
  const h = getHeadersMapV4_(valeurs[0]);
  const apiKey = lireConfig_("TMDbApiKey", "");
  let trouvees = 0;

  Logger.log("=== Fiches dont le Titre est en caractères non latins (lecture seule) ===");
  for (let i = 1; i < valeurs.length; i++) {
    const titre = String(get_(valeurs[i], h, "Titre") || "").trim();
    if (!titre || !TITRE_NON_LATIN_REGEX_V1.test(titre)) continue;
    trouvees++;

    const id = get_(valeurs[i], h, "ID");
    const tmdbId = String(get_(valeurs[i], h, "TMDbID") || "").trim();
    const serie = String(get_(valeurs[i], h, "Type") || "").trim() === "Série";
    let propose = "(TMDbID absent)";

    if (tmdbId && apiKey) {
      try {
        const url = "https://api.themoviedb.org/3/" + (serie ? "tv" : "movie") + "/" +
          encodeURIComponent(tmdbId) + "?api_key=" + encodeURIComponent(apiKey) + "&language=en-US";
        const res = fetchTMDbAvecRetry_(url, "titre anglais " + tmdbId);
        if (res.getResponseCode() === 200) {
          const d = JSON.parse(res.getContentText());
          const anglais = String((serie ? d.name : d.title) || "").trim();
          propose = !anglais ? "(aucun)" : (TITRE_NON_LATIN_REGEX_V1.test(anglais) ? "(TMDb n'a pas de titre latin)" : anglais);
        } else {
          propose = "(TMDb HTTP " + res.getResponseCode() + ")";
        }
      } catch (e) {
        propose = "(erreur : " + e.message + ")";
      }
    }
    Logger.log(id + " | ligne " + (i + 1) + " | actuel : " + titre + " | proposé : " + propose);
  }
  Logger.log(trouvees ? trouvees + " fiche(s) concernée(s)." : "Aucune fiche avec un titre non latin.");
}
