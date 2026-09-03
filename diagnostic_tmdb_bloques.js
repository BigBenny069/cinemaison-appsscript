/**
 * DIAGNOSTIC PONCTUEL — à coller à la fin de 03_LETTERBOXD.gs (ou dans
 * un fichier séparé du même projet Apps Script, peu importe, tant que
 * fetchLetterboxdResponse_, getHeaderLetterboxd_ et
 * extraireDonneesStructureesFilmLetterboxd_ sont accessibles).
 *
 * Objectif : voir exactement ce que Letterboxd renvoie pour les deux
 * fiches bloquées (FILM1129 "Your Name." et FILM1130 "Le Mage du
 * Kremlin"), en suivant la redirection /tmdb/, pour savoir si le
 * problème est un mur anti-robot, une page sans JSON-LD, ou autre chose.
 * N'écrit rien dans le Sheet — lecture seule.
 *
 * Après exécution : Apps Script > Exécutions (ou Afficher > Journal
 * d'exécution) > copie tout le texte du journal et envoie-le.
 */
function diagnosticFilmsBloquesV2609() {
  const idsATester = [
    { id: "372058", titre: "Your Name." },
    { id: "1291659", titre: "Le Mage du Kremlin" }
  ];

  idsATester.forEach(function (item) {
    Logger.log("===== DIAGNOSTIC " + item.titre + " (TMDbID " + item.id + ") =====");
    const url = "https://letterboxd.com/tmdb/" + item.id + "/";

    // Étape 1 : sans suivre la redirection, pour voir le code brut et
    // l'en-tête Location renvoyés par Letterboxd.
    const sansSuivi = fetchLetterboxdResponse_(url, false);
    if (sansSuivi) {
      const code = sansSuivi.getResponseCode();
      Logger.log("Sans suivi — code HTTP : " + code);
      const headers = sansSuivi.getHeaders();
      Logger.log("Location : " + (getHeaderLetterboxd_(headers, "Location") || "(absent)"));
      Logger.log("Set-Cookie présent : " + (getHeaderLetterboxd_(headers, "Set-Cookie") ? "OUI" : "NON"));
    } else {
      Logger.log("Sans suivi — échec réseau (aucune réponse).");
    }

    Logger.log("---");

    // Étape 2 : avec suivi de la redirection — c'est le chemin réel
    // emprunté par lirePageLetterboxd_ en production.
    const avecSuivi = fetchLetterboxdResponse_(url, true);
    if (avecSuivi) {
      const code2 = avecSuivi.getResponseCode();
      const html = avecSuivi.getContentText();
      Logger.log("Avec suivi — code HTTP final : " + code2);
      Logger.log("Longueur du corps : " + (html ? html.length : 0) + " caractères");
      Logger.log("Contient '/film/' quelque part dans le HTML : " + (/\/film\//i.test(html) ? "OUI" : "NON"));
      Logger.log(
        "Contient un mur anti-robot probable (captcha/cloudflare/robot) : " +
          (/captcha|are you human|cloudflare|checking your browser|access denied/i.test(html) ? "OUI" : "NON")
      );

      const structure = extraireDonneesStructureesFilmLetterboxd_(html);
      Logger.log("Bloc JSON-LD Movie/TVSeries avec aggregateRating trouvé : " + (structure ? "OUI" : "NON"));
      if (structure) {
        Logger.log("aggregateRating trouvé : " + JSON.stringify(structure.aggregateRating));
      }

      Logger.log("Aperçu du corps (500 premiers caractères) :");
      Logger.log(String(html || "").slice(0, 500));
    } else {
      Logger.log("Avec suivi — échec réseau (aucune réponse).");
    }

    Logger.log("");
  });

  Logger.log("===== FIN DIAGNOSTIC =====");
}
