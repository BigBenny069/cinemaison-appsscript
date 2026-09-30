/**
 * ============================================================
 * CinéMaison V4
 * Script : 02_TMDB.gs
 * Rôle   : Recherche et enrichissement TMDb fiabilisés
 * Version: 4.6.7
 *
 * Correctif V4.6.7 (30/09/2026) : guillemets typographiques ("..."/
 * '...') et tirets cadratins ajoutés à la ponctuation autorisée --
 * "Dr. Roseann "Chic" Canfora" (simple surnom entre guillemets)
 * n'a rien à voir avec l'écriture non latine et ne doit pas
 * déclencher de recherche d'alias/translittération. Dernier cas
 * trouvé après le rattrapage du 30/09/2026 (118 → 0 fiche restante).
 *
 * Correctif V4.6.6 (30/09/2026) : détection de l'écriture non latine
 * élargie (Latin Extended-A/B, vietnamien) -- des noms européens avec
 * diacritiques peu courants (roumain, polonais...) étaient à tort
 * signalés comme non latins. Corrige des faux positifs constatés par
 * Ben après le rattrapage DeepL du 30/09/2026 (17 fiches restantes,
 * dont plusieurs n'avaient en fait rien à corriger).
 *
 * Correctif V4.6.5 (30/09/2026) : second recours pour les noms non
 * latins sans alias TMDb (70 fiches sur 118 lors du rattrapage du
 * 29/09/2026) -- DeepL API translittère le nom en alphabet latin
 * (gratuit sans carte bancaire, préféré à Google Cloud Translation sur
 * remarque de Ben). Nouvelle config DeepLApiKey (feuille CONFIG).
 * Bénéficie automatiquement à la fois aux nouvelles fiches ET au
 * rattrapage en lot (20_RETRADUCTION_CASTING.gs appelle la même
 * fonction chargerDetailTMDbAvecRepli_) -- aucun autre fichier à
 * modifier pour couvrir les deux cas.
 *
 * Correctif V4.6.4 (29/09/2026) : les noms d'acteurs/réalisateurs
 * enregistrés sur TMDb en écriture non latine (kanji, cyrillique...)
 * remontaient tels quels dans Casting/Réalisateur -- &language=fr-FR
 * ne traduit que le contenu (synopsis, genres), jamais le nom d'une
 * personne. Signalé par Ben sur "Nicky Larson, City Hunter" (doublage
 * japonais d'origine). Nouvelle fonction nomLisibleTMDb_ : cherche un
 * alias en alphabet latin dans les also_known_as de la personne,
 * UNIQUEMENT quand son nom est détecté en écriture non latine (cas
 * rare -- pas d'appel réseau supplémentaire pour la quasi-totalité
 * des castings).
 *
 * Correctif V4.6.3 (19/09/2026) : ajout d'un garde-fou défensif
 * (avertirSiTypeInattendu_, 01_UTILS.gs) avant les 2 choix d'endpoint
 * movie/tv déduits de Type -- Phase D (Étape 3) du chantier "Séparer
 * Catégorie et Statut dans Type". Ne change aucun comportement
 * (endpoint par défaut inchangé), journalise juste si Type contenait
 * un jour autre chose qu'une des 4 catégories attendues.
 *
 * Correctif V4.6.2 (11/09/2026) : nouvelle fonction
 * resoudreTmdbIdDepuisImdb_ (endpoint TMDb /find) -- permet de
 * résoudre un ID IMDb en ID TMDb, utilisée par tmdbIdDepuisLetterboxdV1_
 * (05_ENRICHISSEMENT.gs) quand une URL Letterboxd de la forme
 * .../imdb/ttXXXXXXX/ est fournie.
 * Dépendances : 00_CONFIG.gs, 01_UTILS.gs
 *
 * Correctif V4.6.1 (point 9) :
 * - l'endpoint TMDb (movie vs tv) ne dépend plus uniquement du champ Type.
 *   Un "Documentaire" peut exister côté TMDb comme film OU comme série
 *   documentaire ; avant ce correctif, un mauvais choix d'endpoint
 *   provoquait une "Erreur détail TMDb HTTP 404" obligeant à mentir sur le
 *   Type (le passer en "Série") pour contourner l'erreur — ce qui faussait
 *   ensuite le tri par genre côté app.
 * - chargerDetailTMDb_ tente maintenant l'endpoint déduit du Type, et si
 *   TMDb répond 404, retente automatiquement sur l'autre endpoint avant
 *   d'abandonner. Les autres codes d'erreur (401, 429, 5xx...) ne
 *   déclenchent jamais ce repli, seul un 404 le fait.
 * ============================================================
 */


function chercherTMDb_(titre, annee, type, realisateurActuel, tmdbIdManuel) {
  try {
    const apiKey = lireConfig_("TMDbApiKey", "");


    if (!apiKey) {
      return {
        valide: false,
        commentaire: "TMDbApiKey manquante dans CONFIG."
      };
    }


    if (tmdbIdManuel) {
      const detailManuel = chargerDetailTMDbAvecRepli_(
        tmdbIdManuel,
        type,
        apiKey,
        "TMDbID manuel prioritaire"
      );


      if (detailManuel && detailManuel.valide === true) {
        resoudreErreur_("TMDB", "chercherTMDb_");
      }


      return detailManuel;
    }


    const resultats = rechercherTMDb_(titre, annee, type, apiKey);


    if (!resultats || resultats.length === 0) {
      // La requête TMDb a bien abouti : l'absence de résultat est
      // un résultat métier valide, pas une erreur technique active.
      resoudreErreur_("TMDB", "chercherTMDb_");


      return {
        valide: false,
        commentaire: "Aucun résultat TMDb fiable."
      };
    }


    const meilleur = choisirMeilleurResultatTMDb_(titre, annee, resultats);


    if (!meilleur || meilleur.score < 60) {
      // La recherche a réussi mais aucun rapprochement suffisamment
      // fiable n'a été trouvé.
      resoudreErreur_("TMDB", "chercherTMDb_");


      return {
        valide: false,
        commentaire: meilleur
          ? "TMDb douteux : trouvé '" + (meilleur.title || meilleur.name || "") + "' pour '" + titre + "'."
          : "Aucun résultat TMDb fiable."
      };
    }


    const detailAutomatique = chargerDetailTMDbAvecRepli_(
      meilleur.id,
      type,
      apiKey,
      "TMDb trouvé automatiquement",
      meilleur.score
    );


    if (detailAutomatique && detailAutomatique.valide === true) {
      resoudreErreur_("TMDB", "chercherTMDb_");
    }


    return detailAutomatique;


  } catch (e) {
    erreur_("TMDB", "chercherTMDb_", String(e), e && e.stack ? e.stack : "");
    return {
      valide: false,
      commentaire: "Erreur TMDb : " + String(e)
    };
  }
}


function rechercherTMDb_(titre, annee, type, apiKey) {
  avertirSiTypeInattendu_(type, "rechercherTMDb_");
  const endpoint = type === "Série" ? "tv" : "movie";


  let url =
    "https://api.themoviedb.org/3/search/" +
    endpoint +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=fr-FR" +
    "&query=" +
    encodeURIComponent(titre || "");


  if (annee && endpoint === "movie") {
    url += "&year=" + encodeURIComponent(annee);
  }


  if (annee && endpoint === "tv") {
    url += "&first_air_date_year=" + encodeURIComponent(annee);
  }


  const res = fetchTMDbAvecRetry_(url, "recherche " + (titre || ""));
  const code = res.getResponseCode();


  if (code !== 200) {
    throw new Error(
      "Erreur recherche TMDb HTTP " + code +
      " : " + limiterTexteTMDb_(res.getContentText(), 500)
    );
  }


  const json = parserJsonTMDb_(res.getContentText(), "recherche " + (titre || ""));
  return json.results || [];
}


function choisirMeilleurResultatTMDb_(titre, annee, resultats) {
  const titreNorm = normalizeText_(titre);


  let meilleur = null;


  resultats.forEach(r => {
    const titreResultat = r.title || r.name || r.original_title || r.original_name || "";
    const titreResultatNorm = normalizeText_(titreResultat);


    let score = 0;


    if (titreNorm === titreResultatNorm) {
      score += 80;
    } else if (titreResultatNorm.includes(titreNorm) || titreNorm.includes(titreResultatNorm)) {
      score += 55;
    } else {
      score += scoreMotsCommunsTMDb_(titreNorm, titreResultatNorm);
    }


    const anneeResultat = extraireAnneeTMDb_(r.release_date || r.first_air_date || "");


    if (annee && anneeResultat && String(annee) === String(anneeResultat)) {
      score += 20;
    } else if (annee && anneeResultat && Math.abs(Number(annee) - Number(anneeResultat)) <= 1) {
      score += 10;
    }


    if (r.popularity) score += Math.min(10, Number(r.popularity) / 10);


    const candidat = Object.assign({}, r, { score: Math.round(score) });


    if (!meilleur || candidat.score > meilleur.score) {
      meilleur = candidat;
    }
  });


  return meilleur;
}


/**
 * Point 9 : tente l'endpoint déduit du Type ; si TMDb répond 404
 * précisément (l'ID n'existe pas sur cet endpoint), retente une seule
 * fois sur l'autre endpoint avant d'abandonner. Les autres erreurs
 * (401, 429, 5xx, réseau...) ne déclenchent jamais ce repli — seul un 404
 * signifie "mauvais endpoint", tout le reste est une vraie erreur à
 * remonter telle quelle.
 */
function chargerDetailTMDbAvecRepli_(tmdbId, type, apiKey, commentaireMatching, scoreForce) {
  avertirSiTypeInattendu_(type, "chargerDetailTMDbAvecRepli_");
  const endpointPrincipal = type === "Série" ? "tv" : "movie";
  const endpointAlterne = endpointPrincipal === "tv" ? "movie" : "tv";


  try {
    return chargerDetailTMDbSurEndpoint_(
      tmdbId,
      endpointPrincipal,
      apiKey,
      commentaireMatching,
      scoreForce
    );
  } catch (e) {
    if (String(e).indexOf("404") === -1) throw e;


    Logger.log(
      "TMDb 404 sur /" + endpointPrincipal + "/" + tmdbId +
      " — nouvelle tentative sur /" + endpointAlterne + "/" + tmdbId
    );


    return chargerDetailTMDbSurEndpoint_(
      tmdbId,
      endpointAlterne,
      apiKey,
      (commentaireMatching || "") + " (endpoint réel : " + endpointAlterne + ", pas " + endpointPrincipal + ")",
      scoreForce
    );
  }
}


/**
 * Détecte une écriture non latine (kanji, hangul, cyrillique, arabe,
 * thaï...) dans un nom -- déclenche la recherche d'un alias en
 * alphabet latin. Autorise les lettres latines de base + accents
 * français/européens courants (À-ÿ) + ponctuation usuelle des noms
 * propres (espace, tiret, apostrophe, point, virgule).
 */
function contientEcritureNonLatine_(nom) {
  // CORRECTIF (30/09/2026) -- la plage À-ÿ (Latin-1 Supplement) ne
  // couvrait pas les diacritiques d'Europe centrale/de l'Est ni du
  // vietnamien (ș/ț roumains, ł/ż polonais, ă/â déjà couverts par
  // À-ÿ mais pas tous) -- des noms parfaitement en alphabet latin
  // comme "Bogdan Mureșanu" ou "Magdalena Różczka" étaient à tort
  // signalés comme non latins (17 fiches sur le rattrapage du
  // 30/09/2026, dont plusieurs faux positifs constatés par Ben).
  // Latin Extended-A/B (U+0100-024F) + Latin Extended Additional
  // (U+1E00-1EFF, vietnamien) + diacritiques combinants ajoutés.
  // CORRECTIF 2 (30/09/2026) -- guillemets typographiques ("..." U+201C/
  // U+201D, '...' U+2018/2019, tiret cadratin U+2014/2013) ajoutés à la
  // ponctuation autorisée -- une simple citation dans un nom ("Dr.
  // Roseann "Chic" Canfora") n'a rien à voir avec l'écriture et ne
  // doit pas déclencher de recherche d'alias/translittération.
  return /[^\x00-\x7F\u00C0-\u024F\u1E00-\u1EFF\u0300-\u036F\u2018\u2019\u201C\u201D\u2013\u2014\s\-'.,]/.test(String(nom || ""));
}

/**
 * Cherche, parmi les also_known_as d'une personne TMDb, le premier
 * alias entièrement en alphabet latin. null si aucun (ou en cas
 * d'erreur réseau -- ne bloque jamais l'enrichissement pour ça).
 */
function trouverAliasLatinTMDb_(personId, apiKey) {
  try {
    const url =
      "https://api.themoviedb.org/3/person/" +
      encodeURIComponent(personId) +
      "?api_key=" + encodeURIComponent(apiKey);
    const res = fetchTMDbAvecRetry_(url, "alias personne " + personId);
    if (res.getResponseCode() !== 200) return null;
    const json = parserJsonTMDb_(res.getContentText(), "alias personne " + personId);
    const alias = (json.also_known_as || []).find(function (a) {
      return a && !contientEcritureNonLatine_(a);
    });
    return alias || null;
  } catch (e) {
    return null;
  }
}

/**
 * Nom d'affichage d'une personne (acteur/réalisateur) : son nom TMDb
 * tel quel s'il est déjà en alphabet latin (cas normal, aucun appel
 * réseau) ; sinon, un alias latin trouvé dans also_known_as ; sinon,
 * repli sur le nom d'origine (mieux vaut un nom en écriture native
 * que rien).
 */
/**
 * NOUVEAU (30/09/2026) -- deuxième et dernier recours quand aucun
 * alias latin n'existe dans also_known_as (cas fréquent pour un
 * acteur/réalisateur peu connu hors de son pays -- 70 fiches sur 118
 * concernées lors du rattrapage du 29/09/2026). Google Cloud
 * Translation API translittère le nom (pas une vraie "traduction" --
 * un nom propre n'a pas de sens à traduire, mais l'API rend
 * naturellement sa version en alphabet latin). Clé API dans
 * GoogleTranslateApiKey (feuille CONFIG, même mécanisme que
 * TMDbApiKey) -- si absente, retourne null sans bloquer
 * l'enrichissement (le nom d'origine reste affiché, comme avant ce
 * correctif).
 */
/**
 * NOUVEAU (30/09/2026) -- deuxième et dernier recours quand aucun
 * alias latin n'existe dans also_known_as (cas fréquent pour un
 * acteur/réalisateur peu connu hors de son pays -- 70 fiches sur 118
 * concernées lors du rattrapage du 29/09/2026). DeepL API translittère
 * le nom (pas une vraie "traduction" -- un nom propre n'a pas de sens
 * à traduire, mais l'API rend naturellement sa version en alphabet
 * latin). Choisi plutôt que Google Cloud Translation (remarque de
 * Ben, 30/09/2026) : même volume gratuit (500 000 caractères/mois,
 * largement suffisant ici) mais SANS carte bancaire à enregistrer --
 * l'API gratuite DeepL tourne sur un hôte séparé (api-free.deepl.com)
 * qui ne demande aucune facturation. Clé API dans DeepLApiKey (feuille
 * CONFIG, même mécanisme que TMDbApiKey) -- si absente, retourne null
 * sans bloquer l'enrichissement (le nom d'origine reste affiché,
 * comme avant ce correctif).
 */
function translittererNomV1_(nom, cleDeepL) {
  if (!cleDeepL) return null;
  try {
    // Une clé API Free DeepL se termine toujours par ":fx" -- distingue
    // l'hôte gratuit (api-free.deepl.com) du payant (api.deepl.com).
    const hote = /:fx$/.test(cleDeepL) ? "api-free.deepl.com" : "api.deepl.com";
    const options = {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "DeepL-Auth-Key " + cleDeepL },
      payload: JSON.stringify({ text: [nom], target_lang: "FR" }),
      muteHttpExceptions: true,
    };
    const res = UrlFetchApp.fetch("https://" + hote + "/v2/translate", options);
    if (res.getResponseCode() !== 200) return null;
    const json = JSON.parse(res.getContentText());
    const traduit = json.translations && json.translations[0] && json.translations[0].text;
    if (!traduit) return null;
    // DeepL renvoie parfois le texte inchangé si aucune transformation
    // n'est possible -- dans ce cas, toujours pas d'alphabet latin,
    // pas la peine de garder ce résultat.
    return contientEcritureNonLatine_(traduit) ? null : traduit;
  } catch (e) {
    return null;
  }
}

function nomLisibleTMDb_(personne, apiKey) {
  if (!contientEcritureNonLatine_(personne.name)) return personne.name;
  const alias = trouverAliasLatinTMDb_(personne.id, apiKey);
  if (alias) return alias;
  const translitteration = translittererNomV1_(personne.name, lireConfig_("DeepLApiKey", ""));
  return translitteration || personne.name;
}

function chargerDetailTMDbSurEndpoint_(tmdbId, endpoint, apiKey, commentaireMatching, scoreForce) {
  const url =
    "https://api.themoviedb.org/3/" +
    endpoint +
    "/" +
    encodeURIComponent(tmdbId) +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=fr-FR" +
    "&append_to_response=credits,external_ids,videos";


  const res = fetchTMDbAvecRetry_(url, "détail ID " + tmdbId);
  const code = res.getResponseCode();


  if (code !== 200) {
    throw new Error("Erreur détail TMDb HTTP " + code + " pour ID " + tmdbId);
  }


  const json = parserJsonTMDb_(res.getContentText(), "détail ID " + tmdbId);


  const credits = json.credits || {};
  const crew = credits.crew || [];
  const cast = credits.cast || [];


  // CORRECTIF (29/09/2026) -- language=fr-FR ci-dessus ne change RIEN
  // au nom d'une personne : TMDb n'a pas de traduction par langue pour
  // les noms, uniquement pour le contenu (synopsis, genres...). Un
  // acteur/doubleur enregistré sur TMDb sous son écriture native
  // (kanji, cyrillique...) sans alias latin défini comme nom principal
  // remonte donc tel quel -- signalé par Ben sur "Nicky Larson, City
  // Hunter" (doublage japonais d'origine, plusieurs noms de la
  // distribution en kanji). Un appel TMDb supplémentaire, UNIQUEMENT
  // pour les noms détectés en écriture non latine (cas rare -- la
  // quasi-totalité des castings n'en a besoin d'aucun), cherche un
  // alias en alphabet latin parmi les also_known_as de la personne.
  const realisateur =
    endpoint === "movie"
      ? crew
          .filter(p => p.job === "Director")
          .map(p => nomLisibleTMDb_(p, apiKey))
          .join(", ")
      : crew
          .filter(p => ["Creator", "Director"].includes(p.job))
          .map(p => nomLisibleTMDb_(p, apiKey))
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(", ");


  const casting = cast
    .slice(0, 8)
    .map(p => nomLisibleTMDb_(p, apiKey))
    .join(", ");


  const genres = (json.genres || []).map(g => g.name).join(", ");
  const genrePrincipal = (json.genres && json.genres[0]) ? json.genres[0].name : "";


  const dureeMinutes =
    endpoint === "movie"
      ? json.runtime || ""
      : (json.episode_run_time && json.episode_run_time[0]) || "";


  const affiche = json.poster_path
    ? "https://image.tmdb.org/t/p/w500" + json.poster_path
    : "";


  const imdbId =
    endpoint === "movie"
      ? json.imdb_id || ""
      : (json.external_ids && json.external_ids.imdb_id) || "";


  const titreOriginal =
    json.original_title ||
    json.original_name ||
    json.title ||
    json.name ||
    "";


  const bandeAnnonce = trouverBandeAnnonceUrl_(json.videos, endpoint, tmdbId, apiKey);


  return {
    valide: true,
    tmdbId: json.id,
    imdbId: imdbId,
    titreOriginal: titreOriginal,
    affiche: affiche,
    note: json.vote_average || "",
    casting: casting,
    realisateur: realisateur,
    synopsis: json.overview || "",
    duree: dureeMinutes ? formaterDureeTMDb_(dureeMinutes) : "",
    dureeMinutes: dureeMinutes || "",
    genre: genres,
    genrePrincipal: genrePrincipal,
    score: scoreForce || 100,
    commentaireMatching: commentaireMatching || "",
    bandeAnnonce: bandeAnnonce
  };
}


/**
 * Choisit la meilleure bande-annonce YouTube disponible parmi les résultats
 * déjà inclus dans la réponse principale (append_to_response=videos, en
 * français puisque la requête utilise language=fr-FR). Si aucune vidéo
 * française n'est trouvée, un second appel est fait sans filtre de langue
 * pour récupérer au moins la bande-annonce originale — c'est le seul cas
 * qui consomme un appel TMDb supplémentaire.
 */
function trouverBandeAnnonceUrl_(videosFr, endpoint, tmdbId, apiKey) {
  const meilleure = choisirMeilleureVideo_(videosFr);
  if (meilleure) return "https://www.youtube.com/watch?v=" + meilleure;


  try {
    const urlSansLangue =
      "https://api.themoviedb.org/3/" +
      endpoint +
      "/" +
      encodeURIComponent(tmdbId) +
      "/videos?api_key=" +
      encodeURIComponent(apiKey);


    const res = fetchTMDbAvecRetry_(urlSansLangue, "vidéos (repli) ID " + tmdbId);
    if (res.getResponseCode() !== 200) return "";


    const json = parserJsonTMDb_(res.getContentText(), "vidéos (repli) ID " + tmdbId);
    const cle = choisirMeilleureVideo_(json);
    return cle ? "https://www.youtube.com/watch?v=" + cle : "";
  } catch (e) {
    Logger.log("Bande-annonce (repli) indisponible pour ID " + tmdbId + " : " + e.message);
    return "";
  }
}


/**
 * Parmi un objet { results: [...] } (format TMDb "videos"), retourne la clé
 * YouTube de la meilleure bande-annonce trouvée, ou null. Priorité :
 * Trailer officiel YouTube > Trailer YouTube (non officiel) > Teaser YouTube.
 */
function choisirMeilleureVideo_(videos) {
  const resultats = (videos && videos.results) || [];
  const surYoutube = resultats.filter(v => v.site === "YouTube");


  const trailerOfficiel = surYoutube.find(v => v.type === "Trailer" && v.official);
  if (trailerOfficiel) return trailerOfficiel.key;


  const trailer = surYoutube.find(v => v.type === "Trailer");
  if (trailer) return trailer.key;


  const teaser = surYoutube.find(v => v.type === "Teaser");
  return teaser ? teaser.key : null;
}


/**
 * Appelle TMDb jusqu'à trois fois en cas d'incident temporaire.
 * Les codes fonctionnels (ex. 401 ou 404) ne sont jamais rejoués.
 */
/**
 * Résout un ID IMDb (format "tt1234567") en ID TMDb, via l'endpoint
 * officiel /find de TMDb -- utilisé quand une URL Letterboxd de la
 * forme letterboxd.com/imdb/ttXXXXXXX/ est fournie dans URLLetterboxd
 * (voir tmdbIdDepuisLetterboxdV1_ dans 05_ENRICHISSEMENT.gs). Retourne
 * l'ID TMDb (string) ou null si rien trouvé.
 */
function resoudreTmdbIdDepuisImdb_(imdbId, typeAttendu, apiKey) {
  if (!/^tt\d+$/i.test(String(imdbId || "").trim())) return null;

  const url =
    "https://api.themoviedb.org/3/find/" + encodeURIComponent(imdbId) +
    "?api_key=" + encodeURIComponent(apiKey) +
    "&external_source=imdb_id";

  const reponse = fetchTMDbAvecRetry_(url, "find IMDb " + imdbId);
  if (reponse.getResponseCode() !== 200) return null;

  const json = parserJsonTMDb_(reponse.getContentText(), "find IMDb " + imdbId);

  // Préfère le type attendu (Film -> movie_results, Série -> tv_results)
  // quand on le connaît, sinon prend ce qui est disponible.
  const veutSerie = normalizeText_(typeAttendu || "").indexOf("serie") >= 0;
  const listes = veutSerie
    ? [json.tv_results, json.movie_results]
    : [json.movie_results, json.tv_results];

  for (const liste of listes) {
    if (Array.isArray(liste) && liste.length > 0 && liste[0] && liste[0].id) {
      return String(liste[0].id);
    }
  }
  return null;
}


function fetchTMDbAvecRetry_(url, contexte) {
  const maximumTentatives = 3;
  const codesTemporaires = [429, 500, 502, 503, 504];
  let derniereErreur = null;


  for (let tentative = 1; tentative <= maximumTentatives; tentative++) {
    try {
      const reponse = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const code = reponse.getResponseCode();


      if (!codesTemporaires.includes(code) || tentative === maximumTentatives) {
        return reponse;
      }


      Logger.log(
        "TMDb temporairement indisponible (HTTP " + code + ")" +
        " | " + (contexte || "appel") +
        " | nouvelle tentative " + (tentative + 1) + "/" + maximumTentatives
      );


    } catch (e) {
      derniereErreur = e;


      if (tentative === maximumTentatives) {
        throw new Error(
          "Échec réseau TMDb après " + maximumTentatives +
          " tentatives (" + (contexte || "appel") + ") : " + String(e)
        );
      }


      Logger.log(
        "Incident réseau TMDb" +
        " | " + (contexte || "appel") +
        " | nouvelle tentative " + (tentative + 1) + "/" + maximumTentatives
      );
    }


    Utilities.sleep(750 * Math.pow(2, tentative - 1));
  }


  throw derniereErreur || new Error("Échec TMDb sans réponse.");
}


function parserJsonTMDb_(texte, contexte) {
  try {
    return JSON.parse(texte || "{}");
  } catch (e) {
    throw new Error("Réponse JSON TMDb invalide (" + (contexte || "appel") + ").");
  }
}


function limiterTexteTMDb_(texte, longueurMax) {
  const valeur = String(texte || "");
  const maximum = Number(longueurMax) || 500;
  return valeur.length > maximum ? valeur.substring(0, maximum) + "…" : valeur;
}


function scoreMotsCommunsTMDb_(a, b) {
  const aw = new Set(String(a || "").split(" ").filter(Boolean));
  const bw = new Set(String(b || "").split(" ").filter(Boolean));


  let score = 0;


  aw.forEach(w => {
    if (bw.has(w)) score += 12;
  });


  return score;
}


function extraireAnneeTMDb_(dateText) {
  const s = String(dateText || "");
  const m = s.match(/^(\d{4})/);
  return m ? m[1] : "";
}


function formaterDureeTMDb_(minutes) {
  const m = Number(minutes);
  if (!m || isNaN(m)) return "";


  const h = Math.floor(m / 60);
  const min = m % 60;


  if (h <= 0) return min + "min";
  if (min === 0) return h + "h";


  return h + "h" + String(min).padStart(2, "0");
}


function testTMDbV4() {
  const r = chercherTMDb_("Fury", "2014", "Film", "", "");
  Logger.log(JSON.stringify(r, null, 2));
}


function testerTMDbV46() {
  Logger.log("===== TEST TMDB V4.6 =====");


  const codesReessayables = [429, 500, 502, 503, 504];
  const codesNonReessayables = [200, 400, 401, 403, 404];


  if (codesReessayables.some(code => ![429, 500, 502, 503, 504].includes(code))) {
    throw new Error("Liste des codes temporaires incorrecte.");
  }


  if (codesNonReessayables.some(code => [429, 500, 502, 503, 504].includes(code))) {
    throw new Error("Un code fonctionnel est classé temporaire.");
  }


  const resultat = chercherTMDb_("Fury", "2014", "Film", "", "");
  if (!resultat || !resultat.valide || !resultat.tmdbId) {
    throw new Error("Le test réel TMDb n'a pas renvoyé Fury.");
  }


  Logger.log("OK | TMDbID=" + resultat.tmdbId + " | Titre=" + resultat.titreOriginal);
  Logger.log("===== TMDB V4.6 VALIDÉ =====");
}


/**
 * Test du repli d'endpoint (point 9) — vérifie qu'un ID connu pour être une
 * série (ex. une donnée de test côté tv) retrouve bien son détail même
 * lorsqu'on lui fournit un Type qui pointerait à tort vers "movie" au
 * départ. N'écrit rien, se contente d'appeler TMDb.
 */
function testerRepliEndpointTMDbV461() {
  Logger.log("===== TEST REPLI ENDPOINT TMDB V4.6.1 =====");
  // Breaking Bad, tmdbId 1396, est une série — si on force type="Film"
  // (donc endpoint "movie" en premier), /movie/1396 doit répondre 404 et
  // le repli doit récupérer le bon détail via /tv/1396.
  const apiKey = lireConfig_("TMDbApiKey", "");
  const resultat = chargerDetailTMDbAvecRepli_(1396, "Film", apiKey, "test repli");
  Logger.log(JSON.stringify(resultat, null, 2));
  if (!resultat || !resultat.valide) {
    throw new Error("Le repli d'endpoint n'a pas fonctionné pour l'ID de test 1396.");
  }
  Logger.log("OK | Repli d'endpoint fonctionnel | Titre=" + resultat.titreOriginal);
  Logger.log("===== FIN TEST REPLI ENDPOINT =====");
}
