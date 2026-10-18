/**
 * ============================================================
 * CinéMaison V2
 * Script : 25_SUGGESTIONS_JUSTWATCH.js
 * Rôle   : Suggestions quotidiennes = nouveautés de TES plateformes
 *          (source JustWatch) qui ressemblent à ce qui est déjà dans
 *          CinéMaison. Écrit l'onglet SUGGESTIONS (lu par l'app) et
 *          envoie un mail récapitulatif.
 * Version: 1.0 (18/10/2026)
 * Dépendances : 00_CONFIG, 01_UTILS, 07_MAILS, 10_GENRES
 *
 * Onglets utilisés (créés automatiquement) :
 *   SUGGESTIONS          -> la liste du jour (réécrite à chaque passage)
 *   SUGGESTIONS_RETOURS  -> tes clics "Pas intéressé" / "N'aime pas" / "Ajouté"
 *                           (écrits par l'app, lus ici pour apprendre)
 *
 * Réglages (onglet CONFIG, créés avec une valeur par défaut) :
 *   SuggestionsActif                 OUI / NON
 *   SuggestionsParPlateforme         10
 *   SuggestionsJoursFenetre          5   (jours regardés en arrière)
 *   SuggestionsJoursFenetreCanal     14  (Canal+ arrive en retard chez JustWatch)
 *   SuggestionsMailActif             OUI / NON
 *   SuggestionsHeure                 7
 *
 * Fonctions à lancer à la main :
 *   suggestionsTesterV1()            essai complet, SANS mail
 *   suggestionsExecuterV1()          passage complet (avec mail)
 *   installerDeclencheurSuggestionsV1()   active le passage quotidien
 *   supprimerDeclencheurSuggestionsV1()   le désactive
 * ============================================================
 */

const SUGGESTIONS_JW_URL_V1 = "https://apis.justwatch.com/graphql";
const SUGGESTIONS_ONGLET_V1 = "SUGGESTIONS";
const SUGGESTIONS_RETOURS_V1 = "SUGGESTIONS_RETOURS";

const SUGGESTIONS_PLATEFORMES_V1 = Object.freeze([
  { nom: "Netflix", code: "nfx", canal: false },
  { nom: "Prime Video", code: "prv", canal: false },
  { nom: "Disney+", code: "dnp", canal: false },
  { nom: "Canal+", code: "cpd", canal: true },
  { nom: "Paramount+", code: "pmp", canal: false },
  { nom: "Shadowz", code: "sdz", canal: false }
]);

const SUGGESTIONS_ENTETES_V1 = Object.freeze([
  "Cle", "Plateforme", "Type", "Titre", "Annee", "Genres", "TMDbID", "IMDbID",
  "Score", "Raison", "Synopsis", "Affiche", "URL", "DisponibleJusqua",
  "NoteTMDb", "PremiereVue", "MisAJour"
]);

const SUGGESTIONS_RETOURS_ENTETES_V1 = Object.freeze([
  "Cle", "Verdict", "Date", "Titre", "Type", "Genres"
]);

// Codes genre JustWatch -> noms français utilisés dans CinéMaison.
const SUGGESTIONS_GENRES_JW_V1 = Object.freeze({
  act: "Action", ani: "Animation", cmy: "Comédie", crm: "Crime",
  doc: "Documentaire", drm: "Drame", fml: "Familial", fnt: "Fantastique",
  hrr: "Horreur", rma: "Romance", scf: "Science-Fiction", trl: "Thriller",
  war: "Guerre", wsn: "Western", hst: "Histoire", msc: "Musique",
  spt: "Sport", rly: "Télé-réalité"
});


/* ------------------------------------------------------------
 * Réglages
 * ------------------------------------------------------------ */

function suggestionsNombreConfigV1_(cle, defaut) {
  const brut = lireConfig_(cle, defaut);
  const n = parseInt(String(brut).replace(/[^\d]/g, ""), 10);
  return isNaN(n) || n <= 0 ? defaut : n;
}

function suggestionsOuiV1_(cle, defaut) {
  const v = String(lireConfig_(cle, defaut)).trim().toUpperCase();
  return v === "OUI" || v === "TRUE" || v === "1";
}

function suggestionsInitialiserConfigV1_() {
  const defauts = {
    SuggestionsActif: "OUI",
    SuggestionsParPlateforme: 10,
    SuggestionsJoursFenetre: 5,
    SuggestionsJoursFenetreCanal: 14,
    SuggestionsMailActif: "OUI",
    SuggestionsHeure: 7
  };
  Object.keys(defauts).forEach(function(cle) {
    if (lireConfig_(cle, "") === "") ecrireConfig_(cle, defauts[cle]);
  });
}


/* ------------------------------------------------------------
 * Appel JustWatch
 * ------------------------------------------------------------ */

function suggestionsRequeteJwV1_(plateformeCode, jour, apres) {
  const contenu =
    "content(country: $country, language: $language) { title originalReleaseYear " +
    "fullPath shortDescription genres { shortName } externalIds { tmdbId imdbId } " +
    "posterUrl(profile: S718, format: JPG) scoring { tmdbScore } }";
  const offres =
    "offers(country: $country, platform: WEB, filter: { bestOnly: true }) " +
    "{ monetizationType package { shortName } standardWebURL availableTo }";
  const saison =
    " ... on Season { show { id objectType content(country: $country, language: $language) " +
    "{ title originalReleaseYear fullPath shortDescription genres { shortName } " +
    "externalIds { tmdbId imdbId } posterUrl(profile: S718, format: JPG) scoring { tmdbScore } } } }";

  const query =
    "query GetNewTitles($country: Country!, $language: Language!, $date: Date!, " +
    "$first: Int!, $packages: [String!]!, $priceDrops: Boolean!, $after: String) " +
    "{ newTitles(country: $country, date: $date, first: $first, priceDrops: $priceDrops, " +
    "after: $after, filter: { packages: $packages }) " +
    "{ pageInfo { hasNextPage endCursor } edges { node { id objectType " +
    contenu + " " + offres + saison + " } } } }";

  const reponse = UrlFetchApp.fetch(SUGGESTIONS_JW_URL_V1, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({
      operationName: "GetNewTitles",
      query: query,
      variables: {
        country: "FR", language: "fr", date: jour, first: 40,
        packages: [plateformeCode], priceDrops: false, after: apres || null
      }
    })
  });

  const code = reponse.getResponseCode();
  if (code !== 200) throw new Error("JustWatch HTTP " + code);
  const json = JSON.parse(reponse.getContentText());
  if (json.errors && json.errors.length) {
    throw new Error("JustWatch : " + json.errors[0].message);
  }
  return json.data.newTitles;
}

function suggestionsJoursV1_(nb) {
  const jours = [];
  const tz = Session.getScriptTimeZone();
  for (let i = 0; i < nb; i++) {
    const d = new Date(Date.now() - i * 86400000);
    jours.push(Utilities.formatDate(d, tz, "yyyy-MM-dd"));
  }
  return jours;
}

/** Transforme un "noeud" JustWatch en proposition simple (ou null). */
function suggestionsNoeudVersTitreV1_(noeud, plateforme) {
  let contenu = noeud.content;
  let type = noeud.objectType === "MOVIE" ? "Film" : "Série";

  if (noeud.objectType === "SHOW_SEASON") {
    if (!noeud.show || !noeud.show.content) return null;
    contenu = noeud.show.content;
    type = "Série";
  } else if (noeud.objectType !== "MOVIE" && noeud.objectType !== "SHOW") {
    return null;
  }
  if (!contenu || !contenu.title) return null;

  const tmdbBrut = contenu.externalIds && contenu.externalIds.tmdbId
    ? String(contenu.externalIds.tmdbId) : "";
  const tmdbId = tmdbBrut.split(":")[0];

  const offre = (noeud.offers || []).filter(function(o) {
    return o.package && o.package.shortName === plateforme.code;
  })[0] || (noeud.offers || [])[0] || null;
  if (offre && ["FLATRATE", "FREE", "ADS", "FLATRATE_AND_BUY"].indexOf(offre.monetizationType) === -1) {
    return null; // achat/location : pas une vraie dispo abonnement
  }

  const genres = (contenu.genres || []).map(function(g) {
    return SUGGESTIONS_GENRES_JW_V1[g.shortName] || "";
  }).filter(Boolean);

  const affiche = contenu.posterUrl
    ? (String(contenu.posterUrl).indexOf("http") === 0
        ? contenu.posterUrl
        : "https://images.justwatch.com" + contenu.posterUrl)
    : "";

  return {
    cle: tmdbId ? (type === "Film" ? "movie:" : "tv:") + tmdbId
                : "t:" + suggestionsNormaliserTitreV1_(contenu.title) + ":" + (contenu.originalReleaseYear || ""),
    plateforme: plateforme.nom,
    type: type,
    titre: contenu.title,
    annee: contenu.originalReleaseYear || "",
    genres: genres,
    tmdbId: tmdbId,
    imdbId: contenu.externalIds && contenu.externalIds.imdbId || "",
    synopsis: contenu.shortDescription || "",
    affiche: affiche,
    url: offre && offre.standardWebURL ? offre.standardWebURL : "",
    jusqua: offre && offre.availableTo ? String(offre.availableTo).slice(0, 10) : "",
    noteTmdb: contenu.scoring && contenu.scoring.tmdbScore ? contenu.scoring.tmdbScore : ""
  };
}

function suggestionsNormaliserTitreV1_(t) {
  return normaliserCleGenreV11_(t);
}

/** Récupère toutes les nouveautés d'une plateforme sur la fenêtre. */
function suggestionsCollecterPlateformeV1_(plateforme, nbJours) {
  const trouves = {};
  const jours = suggestionsJoursV1_(nbJours);

  jours.forEach(function(jour) {
    let apres = null;
    for (let page = 0; page < 6; page++) {
      const res = suggestionsRequeteJwV1_(plateforme.code, jour, apres);
      (res.edges || []).forEach(function(e) {
        const t = suggestionsNoeudVersTitreV1_(e.node, plateforme);
        if (t && !trouves[t.cle]) trouves[t.cle] = t;
      });
      if (!res.pageInfo || !res.pageInfo.hasNextPage) break;
      apres = res.pageInfo.endCursor;
      Utilities.sleep(200);
    }
    Utilities.sleep(200);
  });

  return Object.keys(trouves).map(function(k) { return trouves[k]; });
}


/* ------------------------------------------------------------
 * Goûts : ce qui est déjà dans CinéMaison + tes retours
 * ------------------------------------------------------------ */

function suggestionsDecouperGenresV1_(texte) {
  return String(texte || "")
    .split(/[\/&,;|\n\r]+/)
    .map(function(g) { return normaliserCleGenreV11_(g); })
    .filter(Boolean);
}

function suggestionsLireRetoursV1_() {
  const feuille = getSheet_(SUGGESTIONS_RETOURS_V1);
  const retours = { ignores: {}, aimePas: [], ajoutes: {} };
  if (!feuille || feuille.getLastRow() < 2) return retours;

  const valeurs = feuille.getDataRange().getValues();
  const h = getHeadersMapV4_(valeurs[0]);
  for (let i = 1; i < valeurs.length; i++) {
    const cle = String(get_(valeurs[i], h, "Cle") || "").trim();
    const verdict = String(get_(valeurs[i], h, "Verdict") || "").trim().toUpperCase();
    if (!cle) continue;
    const genres = suggestionsDecouperGenresV1_(get_(valeurs[i], h, "Genres"));
    if (verdict === "PAS_INTERESSE") retours.ignores[cle] = true;
    if (verdict === "N_AIME_PAS") { retours.ignores[cle] = true; retours.aimePas.push(genres); }
    if (verdict === "AJOUTE") retours.ajoutes[cle] = genres;
  }
  return retours;
}

/** Profil : poids par genre, fiches déjà connues (pour ne pas les re-proposer). */
function suggestionsConstruireProfilV1_() {
  const feuille = getSheet_(SHEETS.FILMS);
  const valeurs = feuille.getDataRange().getValues();
  const h = getHeadersMapV4_(valeurs[0]);

  const poids = {};
  const connus = { tmdb: {}, titres: {} };
  let nbFilms = 0, nbSeries = 0;

  for (let i = 1; i < valeurs.length; i++) {
    const ligne = valeurs[i];
    const titre = String(get_(ligne, h, "Titre") || "").trim();
    if (!titre) continue;

    const type = String(get_(ligne, h, "Type") || "").trim();
    const tmdb = String(get_(ligne, h, "TMDbID") || "").trim();
    const annee = String(get_(ligne, h, "Annee") || "").trim();
    const original = String(get_(ligne, h, "TitreOriginal") || "").trim();

    if (tmdb) connus.tmdb[(type === "Série" ? "tv:" : "movie:") + tmdb] = true;
    connus.titres[suggestionsNormaliserTitreV1_(titre) + ":" + annee] = true;
    if (original) connus.titres[suggestionsNormaliserTitreV1_(original) + ":" + annee] = true;

    if (type === "Série") nbSeries++; else nbFilms++;

    // Une fiche déjà vue compte double : tu as vraiment regardé.
    const vu = String(get_(ligne, h, "Vu") || "").trim();
    const p = vu && vu.toUpperCase() !== "NON" && vu.toUpperCase() !== "FALSE" ? 2 : 1;

    const genres = suggestionsDecouperGenresV1_(get_(ligne, h, "Genre"));
    genres.forEach(function(g) { poids[g] = (poids[g] || 0) + p; });
  }

  // Apprentissage des retours
  const retours = suggestionsLireRetoursV1_();
  retours.aimePas.forEach(function(genres) {
    genres.forEach(function(g) { poids[g] = (poids[g] || 0) - 1.5; });
  });
  Object.keys(retours.ajoutes).forEach(function(cle) {
    retours.ajoutes[cle].forEach(function(g) { poids[g] = (poids[g] || 0) + 1; });
  });

  let max = 0;
  Object.keys(poids).forEach(function(g) { if (poids[g] > max) max = poids[g]; });

  return { poids: poids, max: max || 1, connus: connus, retours: retours,
           nbFilms: nbFilms, nbSeries: nbSeries };
}

function suggestionsNoter_(titre, profil) {
  const genres = titre.genres.map(function(g) { return normaliserCleGenreV11_(g); });
  let score = 0;
  const raisons = [];

  if (genres.length) {
    let somme = 0;
    genres.forEach(function(g) {
      const afin = Math.max(-1, (profil.poids[g] || 0) / profil.max);
      somme += afin;
      if (afin > 0.25) raisons.push({ g: titre.genres[genres.indexOf(g)], a: afin });
    });
    score = somme / genres.length;
  }

  // Petit bonus pour une bonne note publique
  const note = parseFloat(titre.noteTmdb);
  if (!isNaN(note)) score += Math.max(-0.1, Math.min(0.15, (note - 6.5) * 0.05));

  raisons.sort(function(a, b) { return b.a - a.a; });
  const phrase = raisons.length
    ? "Parce que tu aimes : " + raisons.slice(0, 3).map(function(r) { return r.g; }).join(", ")
    : "Nouveauté de la semaine";

  return { score: Math.round(score * 1000) / 1000, raison: phrase };
}


/* ------------------------------------------------------------
 * Passage principal
 * ------------------------------------------------------------ */

function suggestionsExecuterV1() {
  return suggestionsPasserV1_(true);
}

function suggestionsTesterV1() {
  return suggestionsPasserV1_(false);
}

function suggestionsPasserV1_(avecMail) {
  suggestionsInitialiserConfigV1_();

  if (!suggestionsOuiV1_("SuggestionsActif", "OUI")) {
    Logger.log("Suggestions désactivées (CONFIG SuggestionsActif).");
    return;
  }

  const parPlateforme = suggestionsNombreConfigV1_("SuggestionsParPlateforme", 10);
  const joursNormal = suggestionsNombreConfigV1_("SuggestionsJoursFenetre", 5);
  const joursCanal = suggestionsNombreConfigV1_("SuggestionsJoursFenetreCanal", 14);

  const profil = suggestionsConstruireProfilV1_();
  const maintenant = new Date();
  const tz = Session.getScriptTimeZone();
  const aujourdhui = Utilities.formatDate(maintenant, tz, "yyyy-MM-dd");

  // Anciennes lignes : pour garder la date de première apparition
  const anciennes = suggestionsLireAnciennesV1_();

  const retenues = [];
  const erreurs = [];
  const bilan = [];

  SUGGESTIONS_PLATEFORMES_V1.forEach(function(plateforme) {
    try {
      const candidats = suggestionsCollecterPlateformeV1_(
        plateforme, plateforme.canal ? joursCanal : joursNormal
      );

      const eligibles = candidats.filter(function(t) {
        if (profil.connus.tmdb[t.cle]) return false;
        if (profil.connus.titres[suggestionsNormaliserTitreV1_(t.titre) + ":" + t.annee]) return false;
        if (profil.retours.ignores[t.cle]) return false;
        if (profil.retours.ajoutes[t.cle]) return false;
        return true;
      });

      eligibles.forEach(function(t) {
        const n = suggestionsNoter_(t, profil);
        t.score = n.score;
        t.raison = n.raison;
      });
      eligibles.sort(function(a, b) { return b.score - a.score; });

      const gardees = eligibles.slice(0, parPlateforme);
      gardees.forEach(function(t) {
        t.premiereVue = anciennes[t.cle + "|" + t.plateforme] || aujourdhui;
        retenues.push(t);
      });

      bilan.push(plateforme.nom + " : " + candidats.length + " trouvés, " +
                 eligibles.length + " éligibles, " + gardees.length + " gardés");
    } catch (e) {
      erreurs.push(plateforme.nom + " : " + e.message);
      bilan.push(plateforme.nom + " : ERREUR " + e.message);
    }
  });

  bilan.forEach(function(l) { Logger.log(l); });

  // Si tout a échoué on ne touche pas à l'onglet (on garde la liste d'hier)
  if (retenues.length === 0 && erreurs.length === SUGGESTIONS_PLATEFORMES_V1.length) {
    erreur_("SUGGESTIONS", "COLLECTE", "Toutes les plateformes ont échoué", erreurs.join(" | "));
    envoyerMailRapport_(
      "CinéMaison - Suggestions : échec de la collecte JustWatch",
      "Aucune plateforme n'a pu être lue.\n\n" + erreurs.join("\n"),
      "AlerteTechnique"
    );
    return;
  }

  suggestionsEcrireOngletV1_(retenues, maintenant);
  journal_("SUGGESTIONS", "PASSAGE", "OK", bilan.join(" ; "));

  if (erreurs.length) {
    envoyerMailRapport_(
      "CinéMaison - Suggestions : certaines plateformes en erreur",
      erreurs.join("\n"),
      "AlerteTechnique"
    );
  }

  if (avecMail && suggestionsOuiV1_("SuggestionsMailActif", "OUI")) {
    const nouvelles = retenues.filter(function(t) { return t.premiereVue === aujourdhui; });
    if (nouvelles.length) suggestionsEnvoyerMailV1_(nouvelles);
  }
}

function suggestionsLireAnciennesV1_() {
  const res = {};
  const feuille = getSheet_(SUGGESTIONS_ONGLET_V1);
  if (!feuille || feuille.getLastRow() < 2) return res;
  const valeurs = feuille.getDataRange().getValues();
  const h = getHeadersMapV4_(valeurs[0]);
  for (let i = 1; i < valeurs.length; i++) {
    const cle = String(get_(valeurs[i], h, "Cle") || "");
    const pf = String(get_(valeurs[i], h, "Plateforme") || "");
    let pv = get_(valeurs[i], h, "PremiereVue");
    if (pv instanceof Date) pv = Utilities.formatDate(pv, Session.getScriptTimeZone(), "yyyy-MM-dd");
    if (cle && pv) res[cle + "|" + pf] = String(pv);
  }
  return res;
}

function suggestionsAssurerOngletV1_(nom, entetes) {
  let feuille = getSheet_(nom);
  if (!feuille) {
    feuille = getSpreadsheet_().insertSheet(nom);
    feuille.getRange(1, 1, 1, entetes.length).setValues([entetes.slice()]);
    feuille.setFrozenRows(1);
  }
  return feuille;
}

function suggestionsEcrireOngletV1_(titres, maintenant) {
  const feuille = suggestionsAssurerOngletV1_(SUGGESTIONS_ONGLET_V1, SUGGESTIONS_ENTETES_V1);
  suggestionsAssurerOngletV1_(SUGGESTIONS_RETOURS_V1, SUGGESTIONS_RETOURS_ENTETES_V1);

  const stamp = Utilities.formatDate(maintenant, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  const lignes = titres.map(function(t) {
    return [
      t.cle, t.plateforme, t.type, t.titre, t.annee, t.genres.join(" / "),
      t.tmdbId, t.imdbId, t.score, t.raison, t.synopsis, t.affiche, t.url,
      t.jusqua, t.noteTmdb, t.premiereVue, stamp
    ];
  });

  // On efface seulement le contenu (pas la feuille) pour garder format et lien avec l'app.
  if (feuille.getLastRow() > 1) {
    feuille.getRange(2, 1, feuille.getLastRow() - 1, SUGGESTIONS_ENTETES_V1.length).clearContent();
  }
  if (lignes.length) {
    feuille.getRange(2, 1, lignes.length, SUGGESTIONS_ENTETES_V1.length).setValues(lignes);
  }
}


/* ------------------------------------------------------------
 * Mail
 * ------------------------------------------------------------ */

function suggestionsEchapperV1_(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function suggestionsEnvoyerMailV1_(nouvelles) {
  const parPf = {};
  nouvelles.forEach(function(t) { (parPf[t.plateforme] = parPf[t.plateforme] || []).push(t); });

  let html = "<div style=\"font-family:Arial,sans-serif;max-width:640px;margin:auto\">" +
    "<h2>Nouveautés pour toi</h2>" +
    "<p style=\"color:#666\">" + nouvelles.length + " nouveauté(s) sur tes plateformes qui ressemblent à ta liste.</p>";

  Object.keys(parPf).forEach(function(pf) {
    html += "<h3 style=\"border-bottom:1px solid #ddd;padding-bottom:4px\">" + suggestionsEchapperV1_(pf) + "</h3>";
    parPf[pf].forEach(function(t) {
      html += "<table style=\"margin:10px 0;width:100%\"><tr>" +
        "<td style=\"width:70px;vertical-align:top\">" +
        (t.affiche ? "<img src=\"" + suggestionsEchapperV1_(t.affiche) + "\" width=\"60\" style=\"border-radius:4px\">" : "") +
        "</td><td style=\"vertical-align:top\">" +
        "<b>" + suggestionsEchapperV1_(t.titre) + "</b> (" + suggestionsEchapperV1_(t.annee) + ") · " +
        suggestionsEchapperV1_(t.type) + "<br>" +
        "<span style=\"color:#888;font-size:12px\">" + suggestionsEchapperV1_(t.genres.join(" / ")) + "</span><br>" +
        "<span style=\"color:#2a7;font-size:12px\">" + suggestionsEchapperV1_(t.raison) + "</span><br>" +
        "<span style=\"font-size:13px\">" + suggestionsEchapperV1_(String(t.synopsis).slice(0, 220)) + "</span>" +
        (t.url ? "<br><a href=\"" + suggestionsEchapperV1_(t.url) + "\">Voir sur " + suggestionsEchapperV1_(pf) + "</a>" : "") +
        "</td></tr></table>";
    });
  });
  html += "<p style=\"color:#999;font-size:11px\">Données : JustWatch. Les boutons « Pas intéressé » / « N'aime pas » sont dans l'app.</p></div>";

  try {
    MailApp.sendEmail({
      to: destinatairesPourService_("Digest"),
      subject: "CinéMaison - " + nouvelles.length + " nouveauté(s) pour toi",
      htmlBody: html,
      body: nouvelles.length + " nouveautés : ouvre le mail en HTML."
    });
    journal_("SUGGESTIONS", "MAIL", "OK", nouvelles.length + " nouveautés");
  } catch (e) {
    erreur_("SUGGESTIONS", "MAIL", String(e), e && e.stack ? e.stack : "");
  }
}


/* ------------------------------------------------------------
 * Déclencheur quotidien
 * ------------------------------------------------------------ */

function installerDeclencheurSuggestionsV1() {
  suggestionsInitialiserConfigV1_();
  supprimerDeclencheurSuggestionsV1();
  const heure = suggestionsNombreConfigV1_("SuggestionsHeure", 7);
  ScriptApp.newTrigger("suggestionsExecuterV1").timeBased().everyDays(1).atHour(heure).create();
  Logger.log("Suggestions quotidiennes activées vers " + heure + "h.");
}

function supprimerDeclencheurSuggestionsV1() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "suggestionsExecuterV1") { ScriptApp.deleteTrigger(t); n++; }
  });
  Logger.log("Déclencheurs suggestions supprimés : " + n);
}
