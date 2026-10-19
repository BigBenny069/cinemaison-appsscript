/**
 * ============================================================
 * CinéMaison V2
 * Script : 25_SUGGESTIONS_JUSTWATCH.js
 * Rôle   : Suggestions quotidiennes = nouveautés de TES plateformes
 *          (source JustWatch) qui ressemblent à ce qui est déjà dans
 *          CinéMaison. Écrit l'onglet SUGGESTIONS (lu par l'app) et
 *          envoie un mail récapitulatif.
 * Version: 2.0 (19/10/2026)
 *   V2.0 : mail en 2 parties (Nouveautés du jour / Liste hebdo, 10 par plateforme
 *          et par partie), liens signés Ajouter / Pas intéressé / N'aime pas,
 *          notes Letterboxd récupérées via l'app avant l'envoi, critères
 *          réalisateur + acteurs + époque (TMDb), liste complète dans l'app.
 *   V1.2 : nouvelle colonne NoteLetterboxd (remplie par l'app via Vercel, car
 *          Apps Script est bloqué par Letterboxd) ; ce script ne fait que
 *          CONSERVER les notes déjà trouvées d'un jour à l'autre.
 *   V1.1 : l'écriture dans le Sheet est relancée jusqu'à 4 fois en cas de
 *          « délai de connexion dépassé » (incident passager de Google).
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
  "NoteTMDb", "PremiereVue", "MisAJour", "NoteLetterboxd",
  "Realisateur", "Acteurs", "DansMail"
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
    SuggestionsStockParPlateforme: 40,
    SuggestionsJoursFenetre: 7,
    SuggestionsJoursFenetreCanal: 14,
    SuggestionsMailActif: "OUI",
    SuggestionsHeure: 7,
    SuggestionsUrlApp: "https://cinemaison-v2.vercel.app"
  };
  Object.keys(defauts).forEach(function(cle) {
    if (lireConfig_(cle, "") === "") ecrireConfig_(cle, defauts[cle]);
  });
  // Clé secrète des liens du mail : à remplir à la main (même valeur que la
  // variable SUGGESTIONS_LINK_SECRET de Vercel). Ligne créée vide pour la retrouver.
  if (lireConfig_("SuggestionsSecretLiens", "§absent§") === "§absent§") {
    ecrireConfig_("SuggestionsSecretLiens", "");
  }
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
        if (t && !trouves[t.cle]) { t.jourArrivee = jour; trouves[t.cle] = t; }
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
 * Petits outils (dates, noms, séparateurs)
 * ------------------------------------------------------------ */

const SUGGESTIONS_SEP_V2 = " | ";

function suggestionsIsoV2_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const s = String(v || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  return "";
}

function suggestionsJourDecalageV2_(decalage) {
  return Utilities.formatDate(new Date(Date.now() - decalage * 86400000), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function suggestionsNomsV2_(texte) {
  return String(texte || "")
    .replace(/\([^)]*\)/g, " ")
    .split(/[,;|\n\r\/]+/)
    .map(function(n) { return n.trim(); })
    .filter(function(n) { return n && n !== "∅"; });
}

function suggestionsCleNomV2_(n) { return normaliserCleGenreV11_(n); }

function suggestionsDecennieV2_(annee) {
  const a = parseInt(annee, 10);
  return isNaN(a) ? "" : String(Math.floor(a / 10) * 10);
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

/**
 * Profil : poids par genre, réalisateurs, acteurs, époques, et fiches déjà
 * connues (pour ne pas les re-proposer).
 */
function suggestionsConstruireProfilV1_() {
  const feuille = getSheet_(SHEETS.FILMS);
  const valeurs = feuille.getDataRange().getValues();
  const h = getHeadersMapV4_(valeurs[0]);

  const poids = {};
  const realisateurs = {};   // clé nom -> { n, nom, film }
  const acteurs = {};        // clé nom -> { n, nom, film }
  const decennies = {};      // décennie -> n
  const connus = { tmdb: {}, titres: {} };

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

    // Une fiche déjà vue compte double : tu as vraiment regardé.
    const vu = String(get_(ligne, h, "Vu") || "").trim();
    const p = vu && vu.toUpperCase() !== "NON" && vu.toUpperCase() !== "FALSE" ? 2 : 1;

    suggestionsDecouperGenresV1_(get_(ligne, h, "Genre")).forEach(function(g) {
      poids[g] = (poids[g] || 0) + p;
    });

    suggestionsNomsV2_(get_(ligne, h, "Réalisateur")).forEach(function(nom) {
      const c = suggestionsCleNomV2_(nom);
      if (!c) return;
      if (!realisateurs[c]) realisateurs[c] = { n: 0, nom: nom, film: titre };
      realisateurs[c].n += 1;
    });
    suggestionsNomsV2_(get_(ligne, h, "Casting")).slice(0, 8).forEach(function(nom) {
      const c = suggestionsCleNomV2_(nom);
      if (!c) return;
      if (!acteurs[c]) acteurs[c] = { n: 0, nom: nom, film: titre };
      acteurs[c].n += 1;
    });

    const dec = suggestionsDecennieV2_(annee);
    if (dec) decennies[dec] = (decennies[dec] || 0) + 1;
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
  let maxDec = 0;
  Object.keys(decennies).forEach(function(d) { if (decennies[d] > maxDec) maxDec = decennies[d]; });

  return { poids: poids, max: max || 1, realisateurs: realisateurs, acteurs: acteurs,
           decennies: decennies, maxDec: maxDec || 1, connus: connus, retours: retours };
}

function suggestionsNoterV2_(t, profil) {
  const genresCles = t.genres.map(function(g) { return normaliserCleGenreV11_(g); });
  let score = 0;
  const raisons = [];

  // 1. Genres (de -1 à +1)
  if (genresCles.length) {
    let somme = 0;
    const aimes = [];
    genresCles.forEach(function(g, i) {
      const afin = Math.max(-1, (profil.poids[g] || 0) / profil.max);
      somme += afin;
      if (afin > 0.25) aimes.push({ g: t.genres[i], a: afin });
    });
    score = somme / genresCles.length;
    aimes.sort(function(a, b) { return b.a - a.a; });
    if (aimes.length) {
      raisons.push({ poids: 0.3, texte: "Parce que tu aimes : " + aimes.slice(0, 3).map(function(r) { return r.g; }).join(", ") });
    }
  }

  // 2. Réalisateur déjà présent dans CinéMaison
  let bonusReal = 0, raisonReal = "";
  (t.realisateur || []).forEach(function(nom) {
    const info = profil.realisateurs[suggestionsCleNomV2_(nom)];
    if (!info) return;
    const b = 0.25 * Math.min(2, info.n);
    if (b > bonusReal) { bonusReal = b; raisonReal = "Même réalisateur que « " + info.film + " » (" + nom + ")"; }
  });
  if (bonusReal) { score += bonusReal; raisons.push({ poids: 1, texte: raisonReal }); }

  // 3. Acteurs déjà présents
  let nbActeurs = 0, raisonAct = "";
  (t.acteurs || []).forEach(function(nom) {
    const info = profil.acteurs[suggestionsCleNomV2_(nom)];
    if (!info) return;
    nbActeurs++;
    if (!raisonAct) raisonAct = "Avec " + nom + " (aussi dans « " + info.film + " »)";
  });
  if (nbActeurs) { score += Math.min(0.3, 0.1 * nbActeurs); raisons.push({ poids: 0.8, texte: raisonAct }); }

  // 4. Époque
  const dec = suggestionsDecennieV2_(t.annee);
  if (dec && profil.decennies[dec]) {
    score += 0.1 * profil.decennies[dec] / profil.maxDec;
  }

  // 5. Note : Letterboxd si on l'a (sur 5), sinon TMDb (sur 10)
  const lb = parseFloat(String(t.noteLetterboxd || "").replace(",", "."));
  const tm = parseFloat(String(t.noteTmdb || "").replace(",", "."));
  if (!isNaN(lb)) score += Math.max(-0.1, Math.min(0.2, (lb - 3.2) * 0.1));
  else if (!isNaN(tm)) score += Math.max(-0.1, Math.min(0.15, (tm - 6.5) * 0.05));

  raisons.sort(function(a, b) { return b.poids - a.poids; });
  const phrase = raisons.length
    ? raisons.slice(0, 2).map(function(r) { return r.texte; }).join(" · ")
    : "Nouveauté sur ta plateforme";

  return { score: Math.round(score * 1000) / 1000, raison: phrase };
}


/* ------------------------------------------------------------
 * Réalisateur et acteurs (TMDb)
 * ------------------------------------------------------------ */

function suggestionsChargerCreditsV2_(liste) {
  const cle = lireConfig_("TMDbApiKey", "");
  if (!cle || !liste.length) return 0;
  let ok = 0;

  for (let debut = 0; debut < liste.length; debut += 25) {
    const lot = liste.slice(debut, debut + 25);
    const requetes = lot.map(function(t) {
      const chemin = t.type === "Série" ? "tv" : "movie";
      return {
        url: "https://api.themoviedb.org/3/" + chemin + "/" + encodeURIComponent(t.tmdbId) +
             "?api_key=" + encodeURIComponent(cle) + "&language=fr-FR&append_to_response=credits",
        muteHttpExceptions: true
      };
    });
    let reponses;
    try { reponses = UrlFetchApp.fetchAll(requetes); }
    catch (e) { Logger.log("TMDb crédits : lot ignoré (" + e.message + ")"); continue; }

    reponses.forEach(function(r, i) {
      const t = lot[i];
      try {
        if (r.getResponseCode() !== 200) return;
        const d = JSON.parse(r.getContentText());
        let reals = [];
        if (t.type === "Série") {
          reals = (d.created_by || []).map(function(c) { return c.name; });
        }
        const equipe = (d.credits && d.credits.crew) || [];
        if (!reals.length) {
          reals = equipe.filter(function(c) { return c.job === "Director"; }).map(function(c) { return c.name; });
        }
        t.realisateur = reals.slice(0, 3);
        t.acteurs = ((d.credits && d.credits.cast) || []).slice(0, 8).map(function(c) { return c.name; });
        t.creditsOk = true;
        ok++;
      } catch (e) { /* on réessaiera au prochain passage */ }
    });
  }
  return ok;
}


/* ------------------------------------------------------------
 * Passage principal
 * ------------------------------------------------------------ */

function suggestionsExecuterV1() {
  return suggestionsPasserV2_(true);
}

function suggestionsTesterV1() {
  return suggestionsPasserV2_(false);
}

/** Onglet SUGGESTIONS -> liste d'objets (clés = en-têtes). */
function suggestionsLireOngletV2_() {
  const feuille = getSheet_(SUGGESTIONS_ONGLET_V1);
  if (!feuille || feuille.getLastRow() < 2) return [];
  const valeurs = feuille.getDataRange().getValues();
  const h = getHeadersMapV4_(valeurs[0]);
  const lignes = [];
  for (let i = 1; i < valeurs.length; i++) {
    const o = {};
    SUGGESTIONS_ENTETES_V1.forEach(function(nom) { o[nom] = get_(valeurs[i], h, nom); });
    if (!o.Cle || !o.Titre) continue;
    o.PremiereVue = suggestionsIsoV2_(o.PremiereVue);
    lignes.push(o);
  }
  return lignes;
}

function suggestionsDepuisLigneV2_(o) {
  const nettoyer = function(txt) {
    return String(txt || "").split(SUGGESTIONS_SEP_V2).map(function(x) { return x.trim(); })
      .filter(function(x) { return x && x !== "∅"; });
  };
  return {
    cle: String(o.Cle), plateforme: String(o.Plateforme), type: String(o.Type), titre: String(o.Titre),
    annee: o.Annee, genres: String(o.Genres || "").split(" / ").map(function(g) { return g.trim(); }).filter(Boolean),
    tmdbId: String(o.TMDbID || ""), imdbId: String(o.IMDbID || ""), synopsis: String(o.Synopsis || ""),
    affiche: String(o.Affiche || ""), url: String(o.URL || ""), jusqua: String(o.DisponibleJusqua || ""),
    noteTmdb: o.NoteTMDb, premiereVue: o.PremiereVue, noteLetterboxd: String(o.NoteLetterboxd || "").trim(),
    realisateur: nettoyer(o.Realisateur), acteurs: nettoyer(o.Acteurs),
    creditsOk: String(o.Realisateur || "") !== "" || String(o.Acteurs || "") !== ""
  };
}

function suggestionsPasserV2_(avecMail) {
  suggestionsInitialiserConfigV1_();

  if (!suggestionsOuiV1_("SuggestionsActif", "OUI")) {
    Logger.log("Suggestions désactivées (CONFIG SuggestionsActif).");
    return;
  }

  const debutMs = Date.now();
  const limiteMail = suggestionsNombreConfigV1_("SuggestionsParPlateforme", 10);
  const stock = suggestionsNombreConfigV1_("SuggestionsStockParPlateforme", 40);
  const joursNormal = Math.max(7, suggestionsNombreConfigV1_("SuggestionsJoursFenetre", 7));
  const joursCanal = Math.max(joursNormal, suggestionsNombreConfigV1_("SuggestionsJoursFenetreCanal", 14));

  const profil = suggestionsConstruireProfilV1_();
  const maintenant = new Date();
  const aujourdhui = suggestionsJourDecalageV2_(0);
  const debutSemaine = suggestionsJourDecalageV2_(6);

  const anciennes = suggestionsLireOngletV2_();
  const premierPassage = anciennes.length === 0;
  const anciennesParClePf = {};
  const notesParCle = {};
  anciennes.forEach(function(o) {
    anciennesParClePf[o.Cle + "|" + o.Plateforme] = o;
    const n = String(o.NoteLetterboxd || "").trim();
    if (o.Cle && n) notesParCle[o.Cle] = n;
  });

  // ---- 1. Collecte JustWatch -------------------------------------------
  const tous = {};   // cle|plateforme -> proposition
  const erreurs = [];
  const bilan = [];

  SUGGESTIONS_PLATEFORMES_V1.forEach(function(plateforme) {
    try {
      const candidats = suggestionsCollecterPlateformeV1_(
        plateforme, plateforme.canal ? joursCanal : joursNormal
      );
      candidats.forEach(function(t) {
        const ancienne = anciennesParClePf[t.cle + "|" + t.plateforme];
        if (ancienne) {
          const vieux = suggestionsDepuisLigneV2_(ancienne);
          t.premiereVue = vieux.premiereVue || aujourdhui;
          t.noteLetterboxd = vieux.noteLetterboxd;
          t.realisateur = vieux.realisateur;
          t.acteurs = vieux.acteurs;
          t.creditsOk = vieux.creditsOk;
        } else {
          // Premier passage de la V2 : on date les titres de leur vraie arrivée
          // chez JustWatch, sinon tout serait « nouveau aujourd'hui ».
          t.premiereVue = premierPassage ? (t.jourArrivee || aujourdhui) : aujourdhui;
          t.noteLetterboxd = notesParCle[t.cle] || "";
          t.realisateur = []; t.acteurs = []; t.creditsOk = false;
        }
        tous[t.cle + "|" + t.plateforme] = t;
      });
      bilan.push(plateforme.nom + " : " + candidats.length + " trouvés");
    } catch (e) {
      erreurs.push(plateforme.nom + " : " + e.message);
      bilan.push(plateforme.nom + " : ERREUR " + e.message);
    }
  });

  // ---- 2. Titres déjà gardés les jours précédents -----------------------
  anciennes.forEach(function(o) {
    const k = o.Cle + "|" + o.Plateforme;
    if (tous[k]) return;
    if (!o.PremiereVue || o.PremiereVue < debutSemaine) return; // plus dans les 7 jours
    tous[k] = suggestionsDepuisLigneV2_(o);
  });

  // ---- 3. Exclusions (déjà dans CinéMaison, refusés, ajoutés) -----------
  let liste = Object.keys(tous).map(function(k) { return tous[k]; }).filter(function(t) {
    if (t.premiereVue && t.premiereVue < debutSemaine) return false;
    if (profil.connus.tmdb[t.cle]) return false;
    if (profil.connus.titres[suggestionsNormaliserTitreV1_(t.titre) + ":" + t.annee]) return false;
    if (profil.retours.ignores[t.cle]) return false;
    if (profil.retours.ajoutes[t.cle]) return false;
    return true;
  });

  // ---- 4. Pré-tri, puis réalisateur/acteurs pour les meilleurs ----------
  const partieDe = function(t) { return t.premiereVue === aujourdhui ? "jour" : "hebdo"; };
  const groupes = {};
  liste.forEach(function(t) {
    const g = t.plateforme + "|" + partieDe(t);
    (groupes[g] = groupes[g] || []).push(t);
    const n = suggestionsNoterV2_(t, profil);
    t.score = n.score; t.raison = n.raison;
  });

  const apreciser = [];
  Object.keys(groupes).forEach(function(g) {
    groupes[g].sort(function(a, b) { return b.score - a.score; });
    groupes[g].slice(0, stock * 2).forEach(function(t) {
      if (!t.creditsOk && t.tmdbId) apreciser.push(t);
    });
  });
  const nbCredits = suggestionsChargerCreditsV2_(apreciser);

  // ---- 5. Note finale et plafond de stock -------------------------------
  const retenues = [];
  Object.keys(groupes).forEach(function(g) {
    groupes[g].forEach(function(t) {
      const n = suggestionsNoterV2_(t, profil);
      t.score = n.score; t.raison = n.raison;
    });
    groupes[g].sort(function(a, b) { return b.score - a.score; });
    groupes[g].slice(0, stock).forEach(function(t) { retenues.push(t); });
  });

  bilan.push("Crédits TMDb chargés : " + nbCredits + " / " + apreciser.length);
  bilan.push("Gardés : " + retenues.length + " (stock " + stock + " par plateforme et par partie)");
  bilan.forEach(function(l) { Logger.log(l); });

  // Si tout a échoué on ne touche pas à l'onglet (on garde la liste d'hier)
  if (erreurs.length === SUGGESTIONS_PLATEFORMES_V1.length) {
    erreur_("SUGGESTIONS", "COLLECTE", "Toutes les plateformes ont échoué", erreurs.join(" | "));
    envoyerMailRapport_(
      "CinéMaison - Suggestions : échec de la collecte JustWatch",
      "Aucune plateforme n'a pu être lue.\n\n" + erreurs.join("\n"),
      "AlerteTechnique"
    );
    return;
  }

  // ---- 6. Écriture (avec marquage des titres du mail) -------------------
  const choixMail = suggestionsChoisirMailV2_(retenues, aujourdhui, limiteMail);
  const dansMail = {};
  choixMail.jour.concat(choixMail.hebdo).forEach(function(t) { dansMail[t.cle + "|" + t.plateforme] = true; });
  retenues.forEach(function(t) { t.dansMail = !!dansMail[t.cle + "|" + t.plateforme]; });

  suggestionsEcrireOngletV1_(retenues, maintenant);
  journal_("SUGGESTIONS", "PASSAGE", "OK", bilan.join(" ; "));

  if (erreurs.length) {
    envoyerMailRapport_(
      "CinéMaison - Suggestions : certaines plateformes en erreur",
      erreurs.join("\n"),
      "AlerteTechnique"
    );
  }

  // ---- 7. Notes Letterboxd (via l'app), puis mail ------------------------
  suggestionsEnrichirNotesV2_(debutMs);

  if (avecMail && suggestionsOuiV1_("SuggestionsMailActif", "OUI")) {
    // On relit l'onglet : il contient maintenant les notes Letterboxd trouvées.
    const lignes = suggestionsLireOngletV2_().map(function(o) {
      const t = suggestionsDepuisLigneV2_(o);
      t.score = parseFloat(o.Score) || 0;
      t.raison = String(o.Raison || "");
      return t;
    });
    const choix = suggestionsChoisirMailV2_(lignes, aujourdhui, limiteMail);
    if (choix.jour.length || choix.hebdo.length) {
      suggestionsEnvoyerMailV2_(choix, lignes, aujourdhui, limiteMail);
    }
  }
}

/**
 * Choisit pour le mail, par plateforme : les N meilleurs du jour, puis les N
 * meilleurs de la semaine (sans reprendre ceux du jour).
 */
function suggestionsChoisirMailV2_(titres, aujourdhui, limiteBrute) {
  const limites = typeof limiteBrute === "object" ? limiteBrute : { jour: limiteBrute, hebdo: limiteBrute };
  const parPf = { jour: {}, hebdo: {} };
  titres.forEach(function(t) {
    const partie = t.premiereVue === aujourdhui ? "jour" : "hebdo";
    (parPf[partie][t.plateforme] = parPf[partie][t.plateforme] || []).push(t);
  });
  const prendre = function(partie) {
    let sortie = [];
    SUGGESTIONS_PLATEFORMES_V1.forEach(function(p) {
      const l = (parPf[partie][p.nom] || []).slice().sort(function(a, b) { return b.score - a.score; });
      sortie = sortie.concat(l.slice(0, limites[partie]));
    });
    return sortie;
  };
  return { jour: prendre("jour"), hebdo: prendre("hebdo") };
}

/** Demande à l'app (Vercel) de chercher les notes Letterboxd des titres du mail. */
function suggestionsEnrichirNotesV2_(debutMs) {
  const base = String(lireConfig_("SuggestionsUrlApp", "https://cinemaison-v2.vercel.app")).replace(/\/+$/, "");
  for (let essai = 0; essai < 8; essai++) {
    if (Date.now() - debutMs > 270000) { Logger.log("Notes Letterboxd : temps presque écoulé, on envoie quand même."); return; }
    try {
      const rep = UrlFetchApp.fetch(base + "/api/get-films?suggestions=1&enrichir=mail", { muteHttpExceptions: true });
      if (rep.getResponseCode() !== 200) { Logger.log("Notes Letterboxd : HTTP " + rep.getResponseCode()); return; }
      const d = JSON.parse(rep.getContentText());
      Logger.log("Notes Letterboxd : il en reste " + d.aEnrichir + " à chercher pour le mail.");
      if (!d.aEnrichir) return;
    } catch (e) {
      Logger.log("Notes Letterboxd : " + e.message);
      return;
    }
    Utilities.sleep(1500);
  }
}

function suggestionsAssurerOngletV1_(nom, entetes) {
  SpreadsheetApp.flush();
  let feuille = getSheet_(nom);
  if (!feuille) {
    feuille = getSpreadsheet_().insertSheet(nom);
    feuille.getRange(1, 1, 1, entetes.length).setValues([entetes.slice()]);
    feuille.setFrozenRows(1);
  } else {
    // Onglet déjà là (ancienne version) : on remet à jour la ligne d'en-têtes
    // pour qu'elle contienne les colonnes ajoutées depuis.
    const actuel = feuille.getRange(1, 1, 1, Math.max(feuille.getLastColumn(), 1)).getValues()[0];
    const identique = entetes.every(function(e, i) { return String(actuel[i] || "") === e; });
    if (!identique) feuille.getRange(1, 1, 1, entetes.length).setValues([entetes.slice()]);
  }
  return feuille;
}

function suggestionsRelancerV1_(fonction) {
  let derniere = null;
  for (let essai = 1; essai <= 4; essai++) {
    try {
      return fonction();
    } catch (e) {
      derniere = e;
      Logger.log("Écriture Sheet : essai " + essai + " échoué (" + e.message + ")");
      Utilities.sleep(2000 * essai);
    }
  }
  throw derniere;
}

function suggestionsEcrireOngletV1_(titres, maintenant) {
  suggestionsRelancerV1_(function() { suggestionsEcrireOngletUneFoisV1_(titres, maintenant); });
}

function suggestionsEcrireOngletUneFoisV1_(titres, maintenant) {
  const feuille = suggestionsAssurerOngletV1_(SUGGESTIONS_ONGLET_V1, SUGGESTIONS_ENTETES_V1);
  suggestionsAssurerOngletV1_(SUGGESTIONS_RETOURS_V1, SUGGESTIONS_RETOURS_ENTETES_V1);

  const stamp = Utilities.formatDate(maintenant, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  const lignes = titres.map(function(t) {
    return [
      t.cle, t.plateforme, t.type, t.titre, t.annee, t.genres.join(" / "),
      t.tmdbId, t.imdbId, t.score, t.raison, t.synopsis, t.affiche, t.url,
      t.jusqua, t.noteTmdb, t.premiereVue, stamp, t.noteLetterboxd || "",
      t.creditsOk ? (t.realisateur.length ? t.realisateur.join(SUGGESTIONS_SEP_V2) : "∅") : "",
      t.creditsOk ? (t.acteurs.length ? t.acteurs.join(SUGGESTIONS_SEP_V2) : "∅") : "",
      t.dansMail ? "OUI" : ""
    ];
  });

  // Dates en texte brut : évite que Google les transforme en vraies dates.
  const iPremiere = SUGGESTIONS_ENTETES_V1.indexOf("PremiereVue") + 1;
  const iStamp = SUGGESTIONS_ENTETES_V1.indexOf("MisAJour") + 1;
  feuille.getRange(2, iPremiere, Math.max(feuille.getMaxRows() - 1, 1), 1).setNumberFormat("@");
  feuille.getRange(2, iStamp, Math.max(feuille.getMaxRows() - 1, 1), 1).setNumberFormat("@");

  // On efface seulement le contenu (pas la feuille) pour garder format et lien avec l'app.
  if (feuille.getLastRow() > 1) {
    feuille.getRange(2, 1, feuille.getLastRow() - 1, SUGGESTIONS_ENTETES_V1.length).clearContent();
  }
  if (lignes.length) {
    feuille.getRange(2, 1, lignes.length, SUGGESTIONS_ENTETES_V1.length).setValues(lignes);
  }
}


/* ------------------------------------------------------------
 * Mail : 2 parties + liens signés
 * ------------------------------------------------------------ */

function suggestionsEchapperV1_(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function suggestionsSignerV2_(action, cle, plateforme, secret) {
  const octets = Utilities.computeHmacSha256Signature(action + "|" + cle + "|" + plateforme, secret);
  return octets.map(function(b) { return ("0" + ((b + 256) % 256).toString(16)).slice(-2); }).join("").slice(0, 20);
}

/** Lien cliquable (ouvre une page de confirmation dans l'app). "" si pas de clé secrète. */
function suggestionsLienActionV2_(base, secret, action, t) {
  if (!secret) return "";
  return base + "/api/get-films?s=lien&a=" + action +
    "&k=" + encodeURIComponent(t.cle) + "&p=" + encodeURIComponent(t.plateforme) +
    "&t=" + suggestionsSignerV2_(action, t.cle, t.plateforme, secret);
}

function suggestionsNoteTexteV2_(t) {
  const lb = parseFloat(String(t.noteLetterboxd || "").replace(",", "."));
  if (!isNaN(lb)) return "★ " + lb.toFixed(1) + " Letterboxd";
  const tm = parseFloat(String(t.noteTmdb || "").replace(",", "."));
  if (!isNaN(tm)) return "★ " + tm.toFixed(1) + "/10 TMDb";
  return "";
}

function suggestionsLienBrutV2_(l) {
  return String(l).replace(/"/g, "%22").replace(/</g, "%3C").replace(/>/g, "%3E");
}

function suggestionsCarteHtmlV2_(t, base, secret) {
  const bouton = function(libelle, action, classe) {
    const lien = suggestionsLienActionV2_(base, secret, action, t);
    return lien ? "<a class=\"b " + classe + "\" href=\"" + suggestionsLienBrutV2_(lien) + "\">" + libelle + "</a>" : "";
  };
  const note = suggestionsNoteTexteV2_(t);
  return "<table class=\"c\"><tr><td class=\"i\">" +
    (t.affiche ? "<img src=\"" + suggestionsLienBrutV2_(t.affiche) + "\" width=\"56\">" : "") +
    "</td><td><b>" + suggestionsEchapperV1_(t.titre) + "</b> (" + suggestionsEchapperV1_(t.annee) + ") · " + suggestionsEchapperV1_(t.type) +
    (note ? " · <span class=\"n\">" + suggestionsEchapperV1_(note) + "</span>" : "") +
    "<br><span class=\"g\">" + suggestionsEchapperV1_(t.genres.join(" / ")) + "</span>" +
    "<br><span class=\"r\">" + suggestionsEchapperV1_(t.raison) + "</span>" +
    "<br>" + suggestionsEchapperV1_(String(t.synopsis).slice(0, 140)) +
    "<br>" + bouton("Ajouter", "AJ", "ok") + bouton("Pas intéressé", "PI", "pi") + bouton("N'aime pas", "NA", "na") +
    (t.url ? "<a class=\"v\" href=\"" + suggestionsLienBrutV2_(t.url) + "\">Voir sur " + suggestionsEchapperV1_(t.plateforme) + "</a>" : "") +
    "</td></tr></table>";
}

function suggestionsPartieHtmlV2_(titre, liste, base, secret) {
  if (!liste.length) return "";
  let html = "<h2 style=\"margin:26px 0 4px\">" + suggestionsEchapperV1_(titre) + "</h2>";
  SUGGESTIONS_PLATEFORMES_V1.forEach(function(p) {
    const l = liste.filter(function(t) { return t.plateforme === p.nom; });
    if (!l.length) return;
    html += "<h3 style=\"border-bottom:1px solid #ddd;padding-bottom:4px;margin:18px 0 0\">" + suggestionsEchapperV1_(p.nom) + "</h3>";
    l.forEach(function(t) { html += suggestionsCarteHtmlV2_(t, base, secret); });
  });
  return html;
}

function suggestionsConstruireHtmlV2_(choix, nbJour, nbHebdo, base, secret, coupe) {
  const style = "<style>body{font-family:Arial,sans-serif}.w{max-width:640px;margin:auto}.c{margin:10px 0;width:100%;border-collapse:collapse;font-size:13px}" +
    ".i{width:64px;vertical-align:top}.c td{vertical-align:top}.g{color:#888;font-size:12px}.r{color:#2a7;font-size:12px}.n{color:#b8860b}" +
    ".b{display:inline-block;margin:6px 6px 0 0;padding:4px 9px;border:1px solid;border-radius:14px;font-size:12px;text-decoration:none}" +
    ".ok{color:#1a7f37}.pi{color:#666}.na{color:#b3261e}.v{display:inline-block;margin-top:6px;font-size:12px;color:#0b57d0}</style>";
  return "<html><head><meta charset=\"utf-8\">" + style + "</head><body><div class=\"w\">" +
    "<h1 style=\"margin-bottom:2px\">Nouveautés pour toi</h1>" +
    "<p style=\"color:#666;margin-top:0\">" + nbJour + " nouveauté(s) aujourd'hui · " + nbHebdo + " sur les jours précédents de la semaine.</p>" +
    suggestionsPartieHtmlV2_("Nouveautés du jour", choix.jour, base, secret) +
    suggestionsPartieHtmlV2_("Liste hebdo", choix.hebdo, base, secret) +
    (coupe ? "<p style=\"color:#666\">La suite est dans la liste complète ci-dessous.</p>" : "") +
    "<p style=\"text-align:center;margin:30px 0\"><a href=\"" + suggestionsLienBrutV2_(base + "/?vue=suggestions") + "\" " +
    "style=\"background:#1a1a1a;color:#fff;padding:12px 22px;border-radius:24px;text-decoration:none;font-size:14px\">Voir toute la liste</a></p>" +
    "<p style=\"color:#999;font-size:11px\">Données : JustWatch, TMDb, Letterboxd. Chaque bouton ouvre une page où tu confirmes d'un clic.</p></div></body></html>";
}

function suggestionsEnvoyerMailV2_(choix, toutes, aujourdhui, limite) {
  const base = String(lireConfig_("SuggestionsUrlApp", "https://cinemaison-v2.vercel.app")).replace(/\/+$/, "");
  const secret = String(lireConfig_("SuggestionsSecretLiens", "")).trim();
  if (!secret) Logger.log("Mail : pas de clé SuggestionsSecretLiens dans CONFIG, les boutons d'action sont omis.");

  const nbJour = toutes.filter(function(t) { return t.premiereVue === aujourdhui; }).length;
  const nbHebdo = toutes.length - nbJour;

  // Gmail coupe les mails au-delà d'environ 102 Ko : on réduit la liste hebdo
  // (puis celle du jour) si besoin, le reste restant dans l'app.
  let html = suggestionsConstruireHtmlV2_(choix, nbJour, nbHebdo, base, secret, false);
  let coupe = false;
  let reduction = limite;
  while (html.length > 90000 && reduction > 1) {
    reduction--;
    coupe = true;
    choix = suggestionsChoisirMailV2_(toutes, aujourdhui, { jour: Math.max(reduction, 3), hebdo: reduction });
    html = suggestionsConstruireHtmlV2_(choix, nbJour, nbHebdo, base, secret, true);
  }
  if (coupe) Logger.log("Mail réduit à " + reduction + " titres par plateforme (taille " + html.length + ").");

  try {
    MailApp.sendEmail({
      to: destinatairesPourService_("Digest"),
      subject: "CinéMaison - " + nbJour + " nouveauté(s) du jour · " + nbHebdo + " cette semaine",
      htmlBody: html,
      body: "Ouvre ce mail en HTML. Liste complète : " + base + "/?vue=suggestions"
    });
    journal_("SUGGESTIONS", "MAIL", "OK", nbJour + " du jour, " + nbHebdo + " hebdo, " + html.length + " octets");
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
