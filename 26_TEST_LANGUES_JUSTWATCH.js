/**
 * ============================================================
 * CinéMaison V4
 * Script  : 26_TEST_LANGUES_JUSTWATCH.gs
 * Rôle    : ESSAI (lecture seule) -- regarde ce que JustWatch dit des
 *           langues (audio / sous-titres) pour des films de TES fiches,
 *           sur Netflix, et le compare à ce que Prime et Canal+ affichent
 *           vraiment (relevés du 20/10/2026) pour mesurer sa fiabilité.
 * Version : 1.2 (20/10/2026)
 *           (1.2 : recherche du film par TITRE puis rapprochement par numéro TMDb ;
 *           en 1.0/1.1 le numéro « tm… » était un identifiant interne JustWatch,
 *           pas le numéro TMDb : les résultats ne concernaient pas les bons films)
 *
 * Aucune écriture dans le Sheet, aucun mail. Tout est dans le
 * Journal d'exécution.
 *
 * UTILISATION : choisir testLanguesJustWatchV1 dans l'éditeur Apps
 * Script, cliquer sur Exécuter, puis copier le Journal d'exécution
 * COMPLET et me l'envoyer.
 * ============================================================
 */

const JW_LANGUES_URL_V1 = "https://apis.justwatch.com/graphql";

// Titres de contrôle dont on connaît la vraie réponse (relevés sur les pages
// Prime / Canal+ le 20/10/2026) : sert à voir si JustWatch dit juste.
const JW_LANGUES_CONTROLE_V1 = [
  { titre: "Raging Bull", plateforme: "Prime Video", code: "prv", vrai: "Audio : FR, EN…  Sous-titres : FR…  => VF + VOST" },
  { titre: "Le Village des damnés", plateforme: "Prime Video", code: "prv", vrai: "Audio : FR, EN  Sous-titres : EN seulement  => VF (pas de VOST FR)" },
  { titre: "Le Criminel", plateforme: "Prime Video", code: "prv", vrai: "Audio : EN  Sous-titres : EN seulement  => VO" },
  { titre: "La main", plateforme: "Prime Video", code: "prv", vrai: "Audio : FR, EN  Sous-titres : FR  => VF + VOST" },
  { titre: "Caveat", plateforme: "Prime Video", code: "prv", vrai: "Audio : EN  Sous-titres : FR  => VOST" },
  { titre: "Wrong", plateforme: "Prime Video", code: "prv", vrai: "Audio : EN  Sous-titres : FR, EN  => VOST" },
  { titre: "Hurlements", plateforme: "Canal+", code: "cpd", vrai: "Langues : EN (VO), FR  Sous-titres : FR  => VF + VOST" },
  { titre: "The Lost City of Z", plateforme: "Canal+", code: "cpd", vrai: "Langues : EN (VO), FR  Sous-titres : FR  => VF + VOST" },
  { titre: "Argo", plateforme: "Canal+", code: "cpd", vrai: "Langues : EN (VO), FR  Sous-titres : FR  => VF + VOST" },
  { titre: "The Town", plateforme: "Canal+", code: "cpd", vrai: "Langues : EN (VO), FR  Sous-titres : FR, EN  => VF + VOST" },
];

function jwLanguesRequeteV1_(corps) {
  const r = UrlFetchApp.fetch(JW_LANGUES_URL_V1, {
    method: "post",
    contentType: "application/json",
    headers: { "Accept": "application/json" },
    payload: JSON.stringify(corps),
    muteHttpExceptions: true,
  });
  let json = null;
  try { json = JSON.parse(r.getContentText()); } catch (e) { /* pas du JSON */ }
  return { code: r.getResponseCode(), json: json, extrait: json ? "" : r.getContentText().slice(0, 200) };
}

const JW_LANGUES_FRAGMENT_V1 =
  "offers(country: FR, platform: WEB) { monetizationType presentationType audioLanguages subtitleLanguages package { shortName clearName } }";

/** Cherche le film par son titre chez JustWatch, puis garde celui dont le numéro TMDb correspond. */
function jwLanguesOffresV1_(titre, tmdbId, estSerie) {
  const corpsNoeud = "id content(country: FR, language: fr) { title originalReleaseYear externalIds { tmdbId } } " + JW_LANGUES_FRAGMENT_V1;
  const r = jwLanguesRequeteV1_({
    query: "query($q: String!) { popularTitles(country: FR, first: 8, filter: { searchQuery: $q }) { edges { node { " +
      "... on Movie { " + corpsNoeud + " } ... on Show { " + corpsNoeud + " } } } } }",
    variables: { q: titre },
  });
  r.noeud = null;
  const edges = r.json && r.json.data && r.json.data.popularTitles ? r.json.data.popularTitles.edges : [];
  (edges || []).forEach(function(e) {
    const n = e.node;
    if (n && n.content && n.content.externalIds && String(n.content.externalIds.tmdbId) === String(tmdbId)) r.noeud = n;
  });
  r.nbResultats = (edges || []).length;
  return r;
}

function jwLanguesLireFichesV1_() {
  const feuille = getSheet_(SHEETS.FILMS);
  const valeurs = feuille.getDataRange().getValues();
  const h = getHeadersMapV4_(valeurs[0]);
  const fiches = [];
  for (let i = 1; i < valeurs.length; i++) {
    fiches.push({
      titre: String(get_(valeurs[i], h, "Titre") || "").trim(),
      annee: String(get_(valeurs[i], h, "Annee") || "").trim(),
      type: String(get_(valeurs[i], h, "Type") || "").trim(),
      plateforme: String(get_(valeurs[i], h, "Plateforme") || "").trim(),
      tmdb: String(get_(valeurs[i], h, "TMDbID") || "").trim(),
    });
  }
  return fiches;
}

function jwLanguesAfficherV1_(fiche, code, vrai) {
  const estSerie = fiche.type === "Série";
  const r = jwLanguesOffresV1_(fiche.titre, fiche.tmdb, estSerie);
  const entete = "• " + fiche.titre + " (" + fiche.annee + ") [" + fiche.plateforme + ", TMDb " + fiche.tmdb + "]";
  if (r.code !== 200 || !r.json || r.json.errors) {
    Logger.log(entete + "\n    ✗ HTTP " + r.code + " " + (r.json && r.json.errors ? JSON.stringify(r.json.errors).slice(0, 400) : r.extrait));
    return false;
  }
  const noeud = r.noeud;
  if (!noeud) { Logger.log(entete + "\n    ✗ pas trouvé chez JustWatch par ce titre (" + r.nbResultats + " résultat(s), aucun avec ce numéro TMDb)"); return true; }
  const offres = (noeud.offers || []).filter(function(o) { return o.package && o.package.shortName === code; });
  Logger.log(entete + (vrai ? "\n    VRAI (page de la plateforme) : " + vrai : ""));
  if (!offres.length) {
    // V1.1 : on montre tout ce que JustWatch renvoie, pour comprendre pourquoi rien ne correspond
    const vues = (noeud.offers || []).map(function(o) {
      return (o.package ? o.package.shortName : "?") + "/" + o.monetizationType +
        " audio=[" + (o.audioLanguages || []).join(",") + "] st=[" + (o.subtitleLanguages || []).join(",") + "]";
    });
    Logger.log("    JustWatch : aucune offre " + code + " -- offres vues (" + vues.length + ") : " + (vues.slice(0, 8).join(" ; ") || "aucune") +
      (noeud.content ? "  [fiche JW : " + noeud.content.title + " " + noeud.content.originalReleaseYear + "]" : ""));
    return true;
  }
  offres.forEach(function(o) {
    Logger.log("    JustWatch (" + o.monetizationType + ", " + o.presentationType + ") : audio=[" + (o.audioLanguages || []).join(", ") +
      "]  sous-titres=[" + (o.subtitleLanguages || []).join(", ") + "]");
  });
  return true;
}

function testLanguesJustWatchV1() {
  Logger.log("===== TEST LANGUES JUSTWATCH V1.2 =====");

  // 0. Le champ existe-t-il ? (si non, on liste ce que JustWatch propose sur une offre)
  const sonde = jwLanguesOffresV1_("Heat", "949", false);
  if (sonde.json && sonde.json.errors) {
    Logger.log("✗ La demande a été refusée : " + JSON.stringify(sonde.json.errors).slice(0, 500));
    const intro = jwLanguesRequeteV1_({ query: "{ __type(name: \"Offer\") { fields { name } } }" });
    Logger.log("Champs connus d'une offre : " + (intro.json && intro.json.data && intro.json.data.__type
      ? intro.json.data.__type.fields.map(function(f) { return f.name; }).join(", ") : "(introuvable : " + (intro.extrait || JSON.stringify(intro.json).slice(0, 200)) + ")"));
    Logger.log("===== FIN TEST =====");
    return;
  }
  Logger.log("✓ JustWatch répond avec les champs de langues.\n");

  const fiches = jwLanguesLireFichesV1_();
  const norm = function(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); };

  // 1. Contrôle : titres dont on connaît la vraie réponse
  Logger.log("--- 1. CONTRÔLE (Prime et Canal+ : on connaît la vraie réponse) ---");
  JW_LANGUES_CONTROLE_V1.forEach(function(c) {
    const f = fiches.filter(function(x) { return norm(x.titre) === norm(c.titre) && x.tmdb; })[0];
    if (!f) { Logger.log("• " + c.titre + " : pas trouvé dans ton Sheet avec un TMDbID, ignoré"); return; }
    jwLanguesAfficherV1_(f, c.code, c.vrai);
  });

  // 2. Netflix : 16 films de ton Sheet (variés), à comparer avec Netflix
  Logger.log("\n--- 2. NETFLIX (16 de tes fiches, à vérifier toi-même dans l'appli Netflix) ---");
  const netflix = fiches.filter(function(x) { return /netflix/i.test(x.plateforme) && x.tmdb && x.type !== "Série"; });
  const pas = Math.max(1, Math.floor(netflix.length / 16));
  let n = 0;
  for (let i = 0; i < netflix.length && n < 16; i += pas, n++) {
    jwLanguesAfficherV1_(netflix[i], "nfx", "");
  }
  Logger.log("===== FIN TEST =====");
}
