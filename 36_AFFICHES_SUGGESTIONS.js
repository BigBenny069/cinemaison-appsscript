/**
 * ============================================================
 * CinéMaison V4
 * Script  : 36_AFFICHES_SUGGESTIONS.gs
 * Rôle    : vraie affiche (TMDb) dans le mail "suggestion(s) d'ajout" de
 *           DISNEY. Version : 1.0 (07/11/2026)
 * ============================================================
 *
 * Constat du 07/11/2026 (« Rental Family ») : disney.js prend la plus grande
 * image de la page Disney+, qui est souvent le LOGO-TITRE du film (texte sur
 * fond transparent), pas l'affiche. Dans le mail, la vignette 50x75 n'en
 * montrait qu'un bout de lettre. Ici, pour DISNEY seulement, l'affiche est
 * remplacée par celle de TMDb (recherche par titre + année + type, résultat
 * accepté seulement s'il est assez sûr). Sans affiche TMDb sûre : vignette
 * grise vide, jamais une image trompeuse.
 *
 * Dépend de 02_TMDB.gs (rechercherTMDb_, choisirMeilleurResultatTMDb_).
 * Un échec ici ne bloque JAMAIS le mail.
 */

function affichesTmdbPourSuggestionsV1_(fiches) {
  const apiKey = lireConfig_("TMDbApiKey", "");
  fiches.forEach(function (f) {
    // L'affiche venue de la plateforme n'est pas fiable : on la retire d'abord.
    f.affiche = "";
    if (!apiKey) return;
    try {
      const type = f.type === "Série" ? "Série" : "Film";
      const resultats = rechercherTMDb_(f.titre, f.annee, type, apiKey);
      const meilleur = resultats && resultats.length
        ? choisirMeilleurResultatTMDb_(f.titre, f.annee, resultats)
        : null;
      if (meilleur && meilleur.score >= 60 && meilleur.poster_path) {
        f.affiche = "https://image.tmdb.org/t/p/w185" + meilleur.poster_path;
      }
    } catch (e) {
      journal_("AFFICHES_SUGGESTIONS", "TMDB", "ERREUR", String(f.titre) + " : " + String(e));
    }
  });
  return fiches;
}
