/**
 * DIAGNOSTIC V6 - isole chaque etape pour FILM1131 et FILM1132, qui
 * echouent encore malgre le correctif V4.5.4 (resolution manuelle de
 * redirection). Teste : requete sans suivi (le blocage arrive-t-il
 * des la premiere requete ?), resolution manuelle + requete directe
 * (le correctif marche-t-il en pratique quand on le lance a la
 * main ?), et methode d'origine avec followRedirects:true pour
 * comparaison.
 * Lecture seule - n'ecrit rien dans le Sheet.
 */
function diagnosticFilmsBloquesV6() {
  var idsATester = [
    { id: "760329", titre: "Smashing Machine" },
    { id: "950396", titre: "The Gorge" }
  ];

  for (var i = 0; i < idsATester.length; i++) {
    var item = idsATester[i];
    Logger.log("===== DIAGNOSTIC V6 " + item.titre + " (TMDbID " + item.id + ") =====");
    var url = "https://letterboxd.com/tmdb/" + item.id + "/";

    Logger.log("--- Etape 1 : requete SANS suivi ---");
    var sansSuivi = fetchLetterboxdResponse_(url, false);
    if (!sansSuivi) {
      Logger.log("Echec reseau des la premiere requete.");
    } else {
      var code1 = sansSuivi.getResponseCode();
      Logger.log("Code HTTP : " + code1);
      var location = getHeaderLetterboxd_(sansSuivi.getHeaders(), "Location");
      Logger.log("Location : " + (location || "(absente)"));

      if (code1 === 200) {
        Logger.log("Pas de redirection - reponse directe deja recue en etape 1.");
        var html1 = sansSuivi.getContentText();
        var analyse1 = analyserPageLetterboxd_(html1, url);
        Logger.log("Analyse etape 1 : " + JSON.stringify(analyse1));
      }

      if (location) {
        Logger.log("--- Etape 2 : requete DIRECTE vers l'URL resolue ---");
        var urlResolue = /^https?:\/\//i.test(location)
          ? location
          : "https://letterboxd.com" + (location.indexOf("/") === 0 ? location : "/" + location);
        Logger.log("URL resolue : " + urlResolue);
        var direct = fetchLetterboxdResponse_(urlResolue, true);
        if (!direct) {
          Logger.log("Echec reseau sur la requete directe.");
        } else {
          var code2 = direct.getResponseCode();
          var html2 = direct.getContentText();
          Logger.log("Code HTTP direct : " + code2 + " | Longueur : " + html2.length);
          var analyse2 = analyserPageLetterboxd_(html2, urlResolue);
          Logger.log("Analyse etape 2 (requete directe post-resolution) : " + JSON.stringify(analyse2));
        }
      }
    }

    Logger.log("--- Etape 3 : methode via lirePageLetterboxd_ (le vrai chemin utilise en production) ---");
    var infosProd = lirePageLetterboxd_(url);
    Logger.log("Resultat lirePageLetterboxd_ : " + JSON.stringify(infosProd));

    Logger.log("");
  }

  Logger.log("===== FIN DIAGNOSTIC V6 =====");
}
