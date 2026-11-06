/**
 * ============================================================
 * CinéMaison V4
 * Script  : 34_NETTOYAGE_LETTERBOXD_SERIES.gs
 * Rôle    : Nettoyage UNIQUE des séries dont l'URL Letterboxd pointe vers
 *           un film sans rapport (constat du 06/11/2026 : Les Soprano ->
 *           Stalker, The Walking Dead -> The Pursuit of Happyness...).
 *           Letterboxd ne gère que les films ; l'ancienne recherche
 *           automatique tombait sur un film homonyme ou voisin.
 * Version : 1.0 (06/11/2026)
 * ============================================================
 *
 * COMMENT FAIRE (depuis l'éditeur Apps Script, après le déploiement de
 * 03_LETTERBOXD.gs V4.5.7 qui empêche toute nouvelle erreur) :
 *   1. Lancer  nettoyerLetterboxdSeriesSimulationV1  -> n'écrit RIEN, liste
 *      dans le journal d'exécution ce qui serait nettoyé.
 *   2. Si la liste convient, lancer  nettoyerLetterboxdSeriesV1  -> remplace
 *      URL, note et votes par PAS DE LETTERBOXD / PAS DE NOTE / PAS DE VOTE.
 *
 * Sécurités : une fiche n'est nettoyée que si son Type est toujours
 * "Série" ET si son URL Letterboxd est toujours EXACTEMENT celle relevée
 * le 06/11/2026 (une adresse corrigée depuis à la main n'est pas touchée).
 * Gardées volontairement (adresses justes) : D.P., Après toi le chaos,
 * El silencio. Les autres séries avec une URL ne sont pas concernées.
 *
 * Dépend de 03_LETTERBOXD.gs (resultatSansLetterboxdV43_) et de
 * 05_ENRICHISSEMENT.gs (ecrireResultatLetterboxdV4_).
 */

const SERIES_LETTERBOXD_A_NETTOYER_V1 = [
  { id: "FILM0103", titre: "50 nuances de terreur", url: "https://letterboxd.com/film/tall-dark-and-handsome/" },
  { id: "FILM0264", titre: "FAKE YOU! : Une vraie histoire de faux", url: "https://letterboxd.com/film/volta/" },
  { id: "FILM0288", titre: "Larry et son nombril", url: "https://letterboxd.com/film/the-count-of-monte-cristo-1975/" },
  { id: "FILM0338", titre: "Catch Me a Killer (La profileuse)", url: "https://letterboxd.com/film/wuthering-heights-1967-1/" },
  { id: "FILM0433", titre: "Oz", url: "https://letterboxd.com/film/oz/" },
  { id: "FILM0440", titre: "Sur écoute", url: "https://letterboxd.com/film/regoch/" },
  { id: "FILM0443", titre: "The White Lotus", url: "https://letterboxd.com/film/ibo-and-gullusah/" },
  { id: "FILM0444", titre: "Les Soprano", url: "https://letterboxd.com/film/stalker/" },
  { id: "FILM0509", titre: "LOL : Qui rit, sort !", url: "https://letterboxd.com/film/a-severa/" },
  { id: "FILM0598", titre: "TATSUKI FUJIMOTO ANTHOLOGIE 17-26", url: "https://letterboxd.com/film/placowka/" },
  { id: "FILM0609", titre: "Culte - 2Be3", url: "https://letterboxd.com/film/destination-meat-ball/" },
  { id: "FILM0674", titre: "EUX : Le Pacte", url: "https://letterboxd.com/film/noddy-politimann-for-en-dag/" },
  { id: "FILM0686", titre: "Crimes du siècle", url: "https://letterboxd.com/film/hillsong-worship-saviour-king/" },
  { id: "FILM0692", titre: "Miskina, la pauvre", url: "https://letterboxd.com/film/puthisen-and-lady-kong-rey/" },
  { id: "FILM0693", titre: "Killer Coaster", url: "https://letterboxd.com/film/distant-2013/" },
  { id: "FILM0700", titre: "Périphériques : Les Mondes de Flynne", url: "https://letterboxd.com/film/the-tall-women/" },
  { id: "FILM0704", titre: "Class of '07", url: "https://letterboxd.com/film/cowboys-in-india/" },
  { id: "FILM0705", titre: "Signe astrologique : Vierge", url: "https://letterboxd.com/film/cripple-creek-bar-room-scene/" },
  { id: "FILM0709", titre: "Fringe", url: "https://letterboxd.com/film/battle-for-the-planet-of-the-apes/" },
  { id: "FILM0715", titre: "Moi, Christiane F.", url: "https://letterboxd.com/film/woman-haters/" },
  { id: "FILM0717", titre: "Altered Carbon", url: "https://letterboxd.com/film/noir-desir-en-images/" },
  { id: "FILM0719", titre: "Le Palais de l'est", url: "https://letterboxd.com/film/the-planets/" },
  { id: "FILM0721", titre: "The Handmaid's Tale : La Servante écarlate", url: "https://letterboxd.com/film/a-taste-for-killing/" },
  { id: "FILM0738", titre: "Alice in Borderland", url: "https://letterboxd.com/film/the-darkest-light/" },
  { id: "FILM0739", titre: "The Walking Dead", url: "https://letterboxd.com/film/the-pursuit-of-happyness/" },
  { id: "FILM0741", titre: "Le Garçon du dernier rang", url: "https://letterboxd.com/film/die-traumfrau/" },
  { id: "FILM0746", titre: "Acharnés", url: "https://letterboxd.com/film/100-jahre-unter-dem-meer-versunkene-schiffe-in-der-karibik/" },
  { id: "FILM0751", titre: "Le Problème à 3 corps", url: "https://letterboxd.com/film/evil-of-dracula/" },
  { id: "FILM0764", titre: "Umbrella Academy", url: "https://letterboxd.com/film/moby-dick-2011/" },
  { id: "FILM0765", titre: "Ozark", url: "https://letterboxd.com/film/smoorverliefd/" },
  { id: "FILM0768", titre: "La Chute de la maison Usher", url: "https://letterboxd.com/film/rush-hour-1974/" },
  { id: "FILM0800", titre: "Monstre : L'histoire d'Ed Gein", url: "https://letterboxd.com/film/galawgaw-1954/" },
  { id: "FILM0803", titre: "After Life", url: "https://letterboxd.com/film/rojapoolu/" },
  { id: "FILM0820", titre: "La femme qui habitait en face de la fille à la fenêtre", url: "https://letterboxd.com/film/the-reject/" },
  { id: "FILM0823", titre: "Ratched", url: "https://letterboxd.com/film/love-and-other-four-letter-words/" },
  { id: "FILM0825", titre: "Dans leur regard", url: "https://letterboxd.com/film/roger-waters-live-earth/" },
  { id: "FILM0832", titre: "Meurtre mode d'emploi", url: "https://letterboxd.com/film/portia-on-trial/" },
  { id: "FILM0858", titre: "Resident Evil", url: "https://letterboxd.com/film/the-mystery-of-natalie-wood/" },
  { id: "FILM0865", titre: "Poupée russe", url: "https://letterboxd.com/film/tails-you-win-heads-you-lose/" },
  { id: "FILM0867", titre: "Master of None", url: "https://letterboxd.com/film/fakin-da-funk/" },
  { id: "FILM0880", titre: "Ne t'enfuis plus", url: "https://letterboxd.com/film/sex-o-no-sex/" },
  { id: "FILM0882", titre: "Les papillons noirs", url: "https://letterboxd.com/film/the-exile-1931/" },
  { id: "FILM0889", titre: "The Midnight Club", url: "https://letterboxd.com/film/around-the-bay/" },
  { id: "FILM0896", titre: "Titans", url: "https://letterboxd.com/film/enemies-of-the-people/" },
  { id: "FILM0908", titre: "Double piège", url: "https://letterboxd.com/film/manhattan-medley/" },
  { id: "FILM0926", titre: "Marcella", url: "https://letterboxd.com/film/tri-chlapi-v-chalupe/" },
  { id: "FILM0940", titre: "Aquarius", url: "https://letterboxd.com/film/isle-of-the-damned/" },
  { id: "FILM0945", titre: "The Madness", url: "https://letterboxd.com/film/the-realist/" },
  { id: "FILM0950", titre: "The I-Land", url: "https://letterboxd.com/film/breaking-the-code/" },
  { id: "FILM0958", titre: "Nous, la Vague", url: "https://letterboxd.com/film/the-moon-over-the-alley/" },
  { id: "FILM0959", titre: "Une famille presque normale", url: "https://letterboxd.com/film/let-er-go-gallegher/" },
  { id: "FILM0964", titre: "Sans un mot", url: "https://letterboxd.com/film/mashenka/" },
  { id: "FILM0969", titre: "Son vrai visage", url: "https://letterboxd.com/film/nenette-and-boni/" },
  { id: "FILM1023", titre: "Les enfants sont rois", url: "https://letterboxd.com/film/the-disappearance-of-kimmy-diore/" }
];

function nettoyerLetterboxdSeriesSimulationV1() {
  return nettoyerLetterboxdSeriesCommunV1_(true);
}

function nettoyerLetterboxdSeriesV1() {
  return nettoyerLetterboxdSeriesCommunV1_(false);
}

function nettoyerLetterboxdSeriesCommunV1_(simulation) {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Films");
  if (!feuille) {
    Logger.log("ERREUR : feuille Films introuvable.");
    return;
  }
  const donnees = feuille.getDataRange().getValues();
  const entetes = donnees[0].map(function (e) { return String(e || "").trim(); });
  const h = {};
  entetes.forEach(function (nom, i) { h[nom] = i; });
  ["ID", "Type", "URLLetterboxd", "NoteLetterboxd", "VotesLetterboxd"].forEach(function (col) {
    if (h[col] === undefined) throw new Error("Colonne manquante dans Films : " + col);
  });

  const parId = {};
  for (let i = 1; i < donnees.length; i++) parId[String(donnees[i][h.ID]).trim()] = i;

  let nettoyees = 0, ignorees = 0;
  SERIES_LETTERBOXD_A_NETTOYER_V1.forEach(function (s) {
    const i = parId[s.id];
    if (i === undefined) {
      Logger.log("IGNORÉE (ID introuvable) : " + s.id + " " + s.titre);
      ignorees++;
      return;
    }
    const ligne = donnees[i];
    const type = normalizeText_(String(ligne[h.Type] || ""));
    const urlActuelle = String(ligne[h.URLLetterboxd] || "").trim();
    if (type.indexOf("serie") === -1) {
      Logger.log("IGNORÉE (n'est plus une série) : " + s.id + " " + s.titre);
      ignorees++;
      return;
    }
    if (urlActuelle !== s.url) {
      Logger.log("IGNORÉE (URL changée depuis) : " + s.id + " " + s.titre + " -> " + urlActuelle);
      ignorees++;
      return;
    }
    Logger.log((simulation ? "[SIMULATION] à nettoyer : " : "NETTOYÉE : ") + s.id + " " + s.titre + "  (" + s.url + ")");
    if (!simulation) {
      ecrireResultatLetterboxdV4_(feuille, i + 1, h, resultatSansLetterboxdV43_("Nettoyage séries 06/11/2026"));
    }
    nettoyees++;
  });

  const bilan = (simulation ? "SIMULATION -- " : "TERMINÉ -- ") + nettoyees + " fiche(s) " +
    (simulation ? "à nettoyer" : "nettoyée(s)") + ", " + ignorees + " ignorée(s).";
  Logger.log(bilan);
  if (!simulation) journal_("NETTOYAGE_LETTERBOXD_SERIES", "UNIQUE", "TERMINE", bilan);
}
