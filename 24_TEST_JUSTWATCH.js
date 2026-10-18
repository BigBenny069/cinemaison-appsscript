/**
 * ============================================================
 * CinéMaison V4
 * Script  : 24_TEST_JUSTWATCH.gs
 * Rôle    : ESSAI (lecture seule) -- vérifie que JustWatch répond
 *           depuis Apps Script (et pas seulement depuis le PC de Ben),
 *           et regarde de plus près les nouveautés de Canal+.
 * Version : 1.0 (18/10/2026)
 *
 * Aucune écriture dans le Sheet, aucun mail. Tout est dans le
 * Journal d'exécution.
 *
 * UTILISATION : choisir testJustWatchDepuisAppsScriptV1 dans
 * l'éditeur Apps Script, cliquer sur Exécuter, puis copier le
 * Journal d'exécution complet.
 * ============================================================
 */

const JUSTWATCH_URL_API_TEST_V1 = "https://apis.justwatch.com/graphql";

function justwatchRequeteTestV1_(corps) {
  const reponse = UrlFetchApp.fetch(JUSTWATCH_URL_API_TEST_V1, {
    method: "post",
    contentType: "application/json",
    headers: { "Accept": "application/json" },
    payload: JSON.stringify(corps),
    muteHttpExceptions: true,
  });
  const code = reponse.getResponseCode();
  const texte = reponse.getContentText();
  let json = null;
  try { json = JSON.parse(texte); } catch (e) { /* pas du JSON */ }
  return { code: code, json: json, extrait: json ? "" : texte.slice(0, 200) };
}

function justwatchNouveautesTestV1_(codePlateforme, jourIso) {
  return justwatchRequeteTestV1_({
    operationName: "GetNewTitles",
    variables: { country: "FR", language: "fr", date: jourIso, first: 40, packages: [codePlateforme], priceDrops: false },
    query: "query GetNewTitles($country: Country!, $language: Language!, $date: Date!, $first: Int!, $packages: [String!]!, $priceDrops: Boolean!) { newTitles(country: $country, date: $date, first: $first, priceDrops: $priceDrops, filter: { packages: $packages }) { totalCount edges { node { id objectType content(country: $country, language: $language) { title originalReleaseYear externalIds { tmdbId } } } } } }",
  });
}

function justwatchJourTestV1_(decalage) {
  const d = new Date();
  d.setDate(d.getDate() - decalage);
  return Utilities.formatDate(d, "Europe/Paris", "yyyy-MM-dd");
}

function testJustWatchDepuisAppsScriptV1() {
  Logger.log("===== TEST JUSTWATCH DEPUIS APPS SCRIPT V1.0 =====");

  // 1. Est-ce que JustWatch répond depuis les serveurs de Google ?
  const r1 = justwatchNouveautesTestV1_("nfx", justwatchJourTestV1_(1));
  if (r1.code !== 200 || !r1.json || r1.json.errors) {
    Logger.log("✗ ÉCHEC : HTTP " + r1.code + " " + (r1.json && r1.json.errors ? JSON.stringify(r1.json.errors).slice(0, 300) : r1.extrait));
    Logger.log("=> JustWatch ne répond pas (ou bloque) depuis Apps Script. Le calcul quotidien devra tourner ailleurs (Vercel ou ton PC).");
    Logger.log("===== FIN TEST =====");
    return;
  }
  const edges = r1.json.data.newTitles.edges;
  Logger.log("✓ JustWatch répond depuis Apps Script : Netflix veille = " + edges.length + " nouveauté(s) (totalCount=" + r1.json.data.newTitles.totalCount + ")");
  edges.slice(0, 3).forEach(function (e) {
    const c = e.node.content || {};
    Logger.log("   - [" + e.node.objectType + "] " + c.title + " (" + c.originalReleaseYear + ") tmdb=" + ((c.externalIds || {}).tmdbId || "?"));
  });

  // 2. Canal+ : 14 derniers jours, pour Canal+ (cpd), Canal+ Séries (cns) et Canal+ Sport (cas)
  Logger.log("--- Canal+ : nouveautés par jour sur 14 jours ---");
  const codes = [["cpd", "Canal+"], ["cns", "Canal+ Séries"]];
  codes.forEach(function (paire) {
    const comptes = [];
    let exemple = null;
    for (let i = 1; i <= 14; i++) {
      const r = justwatchNouveautesTestV1_(paire[0], justwatchJourTestV1_(i));
      if (r.code !== 200 || !r.json || r.json.errors) { comptes.push("ERR"); continue; }
      const liste = r.json.data.newTitles.edges;
      comptes.push(liste.length);
      if (liste.length > 0 && !exemple) exemple = liste[0].node;
      Utilities.sleep(300);
    }
    Logger.log(paire[1] + " (" + paire[0] + ") : " + comptes.join(" "));
    if (exemple) {
      const c = exemple.content || {};
      Logger.log("   exemple : [" + exemple.objectType + "] " + c.title + " (" + c.originalReleaseYear + ")");
    }
  });

  // 3. Canal+ : le catalogue existe-t-il côté JustWatch ? (titres populaires de la plateforme)
  const r3 = justwatchRequeteTestV1_({
    operationName: "GetPopularTitles",
    variables: { country: "FR", language: "fr", first: 5, popularTitlesFilter: { packages: ["cpd"], objectTypes: ["MOVIE", "SHOW"] } },
    query: "query GetPopularTitles($country: Country!, $language: Language!, $first: Int!, $popularTitlesFilter: TitleFilter) { popularTitles(country: $country, filter: $popularTitlesFilter, first: $first, sortBy: POPULAR, sortRandomSeed: 0) { edges { node { id objectType content(country: $country, language: $language) { title originalReleaseYear } } } } }",
  });
  if (r3.code === 200 && r3.json && !r3.json.errors) {
    Logger.log("--- Canal+ : titres populaires (le catalogue existe) ---");
    r3.json.data.popularTitles.edges.forEach(function (e) {
      Logger.log("   - " + e.node.content.title + " (" + e.node.content.originalReleaseYear + ")");
    });
  } else {
    Logger.log("Canal+ titres populaires : ✗ HTTP " + r3.code + " " + (r3.json && r3.json.errors ? JSON.stringify(r3.json.errors).slice(0, 200) : ""));
  }

  Logger.log("===== FIN TEST =====");
}
