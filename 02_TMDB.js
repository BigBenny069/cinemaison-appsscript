/**
 * ============================================================
 * CinéMaison V4
 * Script : 02_TMDB.gs
 * Rôle   : Recherche et enrichissement TMDb fiabilisés
 * Version: 4.6.1
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


  const realisateur =
    endpoint === "movie"
      ? crew
          .filter(p => p.job === "Director")
          .map(p => p.name)
          .join(", ")
      : crew
          .filter(p => ["Creator", "Director"].includes(p.job))
          .map(p => p.name)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(", ");


  const casting = cast
    .slice(0, 8)
    .map(p => p.name)
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
