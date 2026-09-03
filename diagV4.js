/**
 * DIAGNOSTIC V3 - a coller dans le meme projet Apps Script que
 * 03_LETTERBOXD.gs (peu importe le fichier, tant que les fonctions
 * extraireUrlCanoniqueLetterboxd_, extraireTitreLetterboxd_,
 * extraireNoteLetterboxd_, extraireVotesLetterboxd_,
 * analyserPageLetterboxd_ et fetchLetterboxdResponse_ sont accessibles).
 *
 * Reproduit exactement la chaine reelle utilisee en production par
 * chercherLetterboxd_ : on veut savoir precisement pourquoi les fiches
 * ressortent avec Note/Votes VIDES (pas les marqueurs "PAS DE NOTE" /
 * "PAS DE VOTE") - ce qui signifie que pageValide echoue avant meme
 * d'arriver a l'extraction de la note.
 * Lecture seule - n'ecrit rien dans le Sheet.
 */
function diagnosticFilmsBloquesV3_() {
  var idsATester = [
    { id: "372058", titre: "Your Name." },
    { id: "1291659", titre: "Le Mage du Kremlin" }
  ];

  for (var i = 0; i < idsATester.length; i++) {
    var item = idsATester[i];
    Logger.log("===== DIAGNOSTIC V3 " + item.titre + " (TMDbID " + item.id + ") =====");
    var url = "https://letterboxd.com/tmdb/" + item.id + "/";

    var reponse = fetchLetterboxdResponse_(url, true);
    if (!reponse) {
      Logger.log("Echec reseau - aucune reponse.");
      continue;
    }
    var html = reponse.getContentText();
    Logger.log("Code HTTP : " + reponse.getResponseCode() + " | Longueur : " + html.length);

    var urlCanonique = extraireUrlCanoniqueLetterboxd_(html);
    Logger.log("urlCanonique extraite : '" + urlCanonique + "'");

    var titrePage = extraireTitreLetterboxd_(html);
    Logger.log("titrePage extrait : '" + titrePage + "'");

    var note = extraireNoteLetterboxd_(html);
    Logger.log("note extraite : '" + note + "'");

    var votes = extraireVotesLetterboxd_(html);
    Logger.log("votes extraits : '" + votes + "'");

    var analyse = analyserPageLetterboxd_(html, url);
    Logger.log("analyserPageLetterboxd_ complet : " + JSON.stringify(analyse));

    var ogUrlBrut = html.match(/<meta[^>]+property=["']og:url["'][^>]*>/i);
    Logger.log("Balise og:url brute trouvee : " + (ogUrlBrut ? ogUrlBrut[0] : "(absente)"));

    var canonicalBrut = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i);
    Logger.log("Balise canonical brute trouvee : " + (canonicalBrut ? canonicalBrut[0] : "(absente)"));

    var twitterData2Brut = html.match(/<meta[^>]+name=["']twitter:data2["'][^>]*>/i);
    Logger.log("Balise twitter:data2 brute trouvee : " + (twitterData2Brut ? twitterData2Brut[0] : "(absente)"));

    Logger.log("");
  }

  Logger.log("===== FIN DIAGNOSTIC V3 =====");
}
