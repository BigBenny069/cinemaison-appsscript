/**
 * ============================================================
 * CinéMaison V4
 * Script  : 35_NETTOYAGE_LETTERBOXD_SERIES_2.gs
 * Rôle    : 2e nettoyage UNIQUE des séries dont l'URL Letterboxd pointe vers
 *           un FILM homonyme (ex. Silo -> film "Silo", Snowpiercer -> le
 *           film de 2013). Constat du 06/11/2026 sur les séries restantes.
 * Version : 1.0 (06/11/2026)
 * ============================================================
 *
 * COMMENT FAIRE (depuis l'éditeur Apps Script) :
 *   1. Lancer  nettoyerLetterboxdSeries2SimulationV1  -> n'écrit RIEN, liste
 *      dans le journal d'exécution ce qui serait fait.
 *   2. Si la liste convient, lancer  nettoyerLetterboxdSeries2V1  ->
 *      - 14 fiches : URL, note et votes remplacés par PAS DE LETTERBOXD /
 *        PAS DE NOTE / PAS DE VOTE ;
 *      - Faux-semblants (FILM0699) : URL remplacée par la bonne
 *        (dead-ringers-2023), note et votes relus sur la page.
 *
 * Sécurités : une fiche n'est touchée que si son Type est toujours "Série"
 * ET si son URL est toujours EXACTEMENT celle relevée le 06/11/2026.
 *
 * Dépend de 03_LETTERBOXD.gs et 05_ENRICHISSEMENT.gs.
 */

const SERIES_LETTERBOXD_A_NETTOYER_V2 = [
  { id: "FILM0030", titre: "DARK", url: "https://letterboxd.com/film/dark/" },
  { id: "FILM0143", titre: "Succession", url: "https://letterboxd.com/film/succession/" },
  { id: "FILM0168", titre: "Creepshow", url: "https://letterboxd.com/film/creepshow/" },
  { id: "FILM0236", titre: "The Rehearsal", url: "https://letterboxd.com/film/the-rehearsal/" },
  { id: "FILM0297", titre: "Silo", url: "https://letterboxd.com/film/silo/" },
  { id: "FILM0327", titre: "The Staircase", url: "https://letterboxd.com/film/the-staircase/" },
  { id: "FILM0337", titre: "Snowpiercer", url: "https://letterboxd.com/film/snowpiercer/" },
  { id: "FILM0441", titre: "The studio", url: "https://letterboxd.com/film/the-studio/" },
  { id: "FILM0445", titre: "From", url: "https://letterboxd.com/film/from/" },
  { id: "FILM0701", titre: "Upload", url: "https://letterboxd.com/film/upload/" },
  { id: "FILM0786", titre: "Snowpiercer", url: "https://letterboxd.com/film/snowpiercer/" },
  { id: "FILM0869", titre: "Hunters", url: "https://letterboxd.com/film/hunters-2020/" },
  { id: "FILM0875", titre: "Mes premières fois", url: "https://letterboxd.com/film/never-have-i-ever-2020/" },
  { id: "FILM1369", titre: "American Horror Story", url: "https://letterboxd.com/film/behind-the-fright-the-making-of-american-horror-story/" },
  { id: "FILM0699", titre: "Faux-semblants", url: "https://letterboxd.com/film/faux-semblants/", nouvelleUrl: "https://letterboxd.com/film/dead-ringers-2023/" }
];

function nettoyerLetterboxdSeries2SimulationV1() {
  nettoyerLetterboxdSeries2CommunV1_(true);
}

function nettoyerLetterboxdSeries2V1() {
  nettoyerLetterboxdSeries2CommunV1_(false);
}

function nettoyerLetterboxdSeries2CommunV1_(simulation) {
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

  let nettoyees = 0, corrigees = 0, ignorees = 0;
  SERIES_LETTERBOXD_A_NETTOYER_V2.forEach(function (s) {
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

    if (s.nouvelleUrl) {
      const page = lirePageLetterboxd_(s.nouvelleUrl);
      if (!page || !page.pageValide) {
        Logger.log("IGNORÉE (page " + s.nouvelleUrl + " illisible) : " + s.id + " " + s.titre);
        ignorees++;
        return;
      }
      Logger.log((simulation ? "[SIMULATION] corrigée : " : "CORRIGÉE : ") + s.id + " " + s.titre +
        "  " + s.url + " -> " + s.nouvelleUrl + "  (page : " + page.titrePage + " " + page.anneePage +
        ", note " + page.note + ", votes " + page.votes + ")");
      if (!simulation) {
        ecrireResultatLetterboxdV4_(feuille, i + 1, h, {
          erreur: false,
          ignore: false,
          donneesAbsentes: false,
          url: s.nouvelleUrl,
          note: page.note,
          votes: page.votes,
          source: "CORRECTION_MANUELLE",
          commentaire: "Correction séries 06/11/2026"
        });
      }
      corrigees++;
      return;
    }

    Logger.log((simulation ? "[SIMULATION] à nettoyer : " : "NETTOYÉE : ") + s.id + " " + s.titre + "  (" + s.url + ")");
    if (!simulation) {
      ecrireResultatLetterboxdV4_(feuille, i + 1, h, resultatSansLetterboxdV43_("Nettoyage séries 2 06/11/2026"));
    }
    nettoyees++;
  });

  const bilan = (simulation ? "SIMULATION -- " : "TERMINÉ -- ") + nettoyees + " nettoyée(s), " +
    corrigees + " corrigée(s), " + ignorees + " ignorée(s).";
  Logger.log(bilan);
  if (!simulation) journal_("NETTOYAGE_LETTERBOXD_SERIES_2", "UNIQUE", "TERMINE", bilan);
}
