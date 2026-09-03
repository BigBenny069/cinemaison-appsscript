/**
 * ============================================================
 * CinéMaison V4
 * Script : 03_LETTERBOXD.gs
 * Rôle   : Recherche automatique et lecture Letterboxd
 * Version: 4.5.5
 * Dépendances :
 *   - 00_CONFIG.gs
 *   - 01_UTILS.gs
 *
 * Stratégie :
 *
 * 1. Si une URL Letterboxd manuelle existe :
 *    - lecture directe de la page ;
 *    - récupération de la note et des votes.
 *
 * 2. Si l'URL est absente :
 *    - recherche prioritaire via IMDbID ;
 *    - puis redirection officielle via TMDbID ;
 *    - puis recherche par URL probable issue du titre et de l'année.
 *
 * 3. Si aucune page fiable n'est trouvée :
 *    - écrit PAS DE LETTERBOXD, PAS DE NOTE et PAS DE VOTE ;
 *    - la fiche reste considérée comme correctement enrichie ;
 *    - un contrôle ultérieur peut remplacer automatiquement
 *      ces textes par de vraies données.
 *
 * IMPORTANT :
 * Les réponses HTTP 403 rencontrées pendant une recherche
 * automatique ne sont pas enregistrées comme erreurs techniques.
 * Elles sont traitées comme une recherche non concluante.
 *
 * Correctif V4.5.0 :
 * - chercherLetterboxd_ et rechercherUrlLetterboxdAutomatique_ reçoivent
 *   désormais un 7e paramètre "type" (Film/Série/...), transmis par
 *   05_ENRICHISSEMENT.gs.
 * - rechercherLetterboxdViaTmdb_ utilise ce type pour choisir le bon
 *   format de redirection : Letterboxd exige /tmdb/{id}/tv/ pour une
 *   série et /tmdb/{id}/ pour un film — avant ce correctif, seul le
 *   format "film" était jamais tenté, donc cette redirection fiable ne
 *   fonctionnait jamais pour une fiche de Type "Série", qui retombait
 *   alors directement sur la recherche par titre (moins fiable) sans
 *   même essayer la bonne redirection.
 * - Par sécurité (Type mal renseigné ou fiche mal catégorisée), les DEUX
 *   formats sont tentés dans l'ordre déduit du Type, jamais un seul.
 *
 * Correctif V4.5.1 :
 * - rechercherLetterboxdViaTmdb_ ne tente plus AUCUNE redirection TMDb
 *   pour une Série : Letterboxd confirme officiellement que seuls les
 *   films sont auto-importés via ce mécanisme, jamais les séries.
 *
 * Correctif V4.5.2 :
 * - Bug identifié suite à un signalement CinéRadar : une URL manuelle
 *   de la forme "https://letterboxd.com/tmdb/{id}/" (lien de
 *   redirection TMDb, tel qu'envoyé par CinéRadar dans son champ
 *   urlLetterboxd) n'était PAS reconnue comme une URL manuelle valide
 *   — seul le format déjà résolu "/film/..." l'était. Résultat : le
 *   lien fourni était silencieusement ignoré, puis écrasé par la
 *   recherche automatique quelques secondes plus tard, sans trace nulle
 *   part (pas d'erreur, pas de log).
 * - estUrlLetterboxdManuelleAcceptableV452_ (nouvelle fonction) élargit
 *   la reconnaissance aux formats /film/, /tmdb/ et /imdb/ — ces deux
 *   derniers sont des redirections que lirePageLetterboxd_ résout déjà
 *   correctement (fetchLetterboxdResponse_ suit les redirections), donc
 *   aucun autre changement n'est nécessaire : la page se résout vers la
 *   bonne fiche /film/... et c'est cette URL canonique qui est écrite.
 * - estUrlLetterboxdReelleV43_ (utilisée ailleurs pour valider qu'une
 *   URL déjà en base est "réelle") est élargie de la même façon, pour
 *   qu'un lien /tmdb/ ou /imdb/ déjà stocké ne soit pas à tort considéré
 *   comme absent.
 *
 * Correctif V4.5.3 :
 * - Asymétrie identifiée le 03/09/2026 sur les 4 premiers films ajoutés
 *   depuis que "Nouvelle Entrée" (app) pré-remplit systématiquement une
 *   URL /tmdb/{id} : contrairement à la recherche automatique (échec
 *   absorbé silencieusement -> marqueurs PAS DE FICHE/NOTE/VOTE), une
 *   URL manuelle invalide abandonnait immédiatement en
 *   A_VERIFIER_LETTERBOXD, y compris pour un raté purement transitoire
 *   de Letterboxd (confirmé par diagnostic : la même URL retestée
 *   quelques minutes plus tard fonctionnait parfaitement).
 * - chercherLetterboxd_ retente désormais une fois, après 2,5s de pause,
 *   avant d'abandonner une URL manuelle. Ne change rien au comportement
 *   de la recherche automatique, déjà correct.
 *
 * Correctif V4.5.4 :
 * - Nouveau constat concret (FILM1130) : l'URL de redirection
 *   /tmdb/{id} échoue de façon répétée alors que l'URL déjà résolue
 *   /film/{slug}/ fonctionne à chaque fois pour la même page. Le
 *   suivi automatique de redirection (followRedirects:true) ne
 *   garantit pas nos en-têtes personnalisés sur la requête suivant le
 *   saut. lirePageLetterboxd_ résout donc désormais lui-même ce saut en
 *   deux requêtes distinctes (voir
 *   resoudreRedirectionLetterboxdManuelleV454_), pour que la requête
 *   finale vers /film/... parte toujours avec nos en-têtes complets.
 *
 * Correctif V4.5.5 :
 * - Constat du 03/09/2026 (FILM1131/FILM1132) : le correctif V4.5.4 a
 *   été confirmé pleinement fonctionnel en exécution manuelle (éditeur
 *   Apps Script), mais échoue encore de façon reproductible quand
 *   chercherLetterboxd_ tourne via un DÉCLENCHEUR (webhook immédiat ou
 *   cycle horaire). Hypothèse la plus probable : les déclencheurs
 *   Google Apps Script tournent sur un pool d'adresses IP partagé,
 *   plus exposé à la protection anti-robot de Letterboxd que les
 *   sessions interactives de l'éditeur — facteur hors du contrôle de ce
 *   code.
 * - Une seule tentative supplémentaire (V4.5.3) s'est révélée
 *   insuffisante. Portée à 3 tentatives supplémentaires (4 au total),
 *   avec des pauses croissantes (3s, 6s, 10s), pour une URL manuelle
 *   uniquement. Reste largement sous la marge du verrou de 90s pris
 *   par reenrichirParIdSheetV1_ (09_WEBHOOK.gs).
 * ============================================================
 */

const VERSION_LETTERBOXD_V4 = "V4.5.5";
const LETTERBOXD_BASE_V4 = "https://letterboxd.com";
const LETTERBOXD_PAS_DE_FICHE_V43 = "PAS DE LETTERBOXD";
const LETTERBOXD_PAS_DE_NOTE_V43 = "PAS DE NOTE";
const LETTERBOXD_PAS_DE_VOTE_V43 = "PAS DE VOTE";

/**
 * Reconnaît les trois valeurs métier Letterboxd.
 */
function estMarqueurLetterboxdV43_(valeur) {
  const texte = safeTrim_(valeur).toUpperCase();
  return (
    texte === LETTERBOXD_PAS_DE_FICHE_V43 ||
    texte === LETTERBOXD_PAS_DE_NOTE_V43 ||
    texte === LETTERBOXD_PAS_DE_VOTE_V43
  );
}

/**
 * V4.5.2 : URL Letterboxd "réelle" = fiche déjà résolue (/film/...) OU
 * lien de redirection connu (/tmdb/... ou /imdb/...) que le reste du
 * code sait suivre. Avant ce correctif, seul /film/ comptait.
 */
function estUrlLetterboxdReelleV43_(valeur) {
  const texte = safeTrim_(valeur);
  return (
    /letterboxd\.com\/film\//i.test(texte) ||
    /letterboxd\.com\/tmdb\//i.test(texte) ||
    /letterboxd\.com\/imdb\//i.test(texte)
  );
}

/**
 * V4.5.2 : même élargissement, dédié à la vérification d'une URL
 * SAISIE MANUELLEMENT (ou fournie par un appelant externe comme
 * CinéRadar) avant de la prioriser dans chercherLetterboxd_. Nom
 * distinct de estUrlLetterboxdReelleV43_ pour ne pas mélanger "URL déjà
 * en base considérée comme réelle" et "URL saisie jugée exploitable" —
 * même si leur définition se recoupe aujourd'hui, ce sont deux
 * questions différentes qui pourraient diverger plus tard.
 */
function estUrlLetterboxdManuelleAcceptableV452_(valeur) {
  const texte = safeTrim_(valeur);
  return (
    /letterboxd\.com\/film\//i.test(texte) ||
    /letterboxd\.com\/tmdb\//i.test(texte) ||
    /letterboxd\.com\/imdb\//i.test(texte)
  );
}

function estNoteLetterboxdReelleV43_(valeur) {
  if (
    valeur === "" ||
    valeur === null ||
    valeur === undefined ||
    estMarqueurLetterboxdV43_(valeur)
  ) {
    return false;
  }
  const note = Number(String(valeur).replace(",", "."));
  return !isNaN(note) && note > 0;
}

function estVotesLetterboxdReelV43_(valeur) {
  if (
    valeur === "" ||
    valeur === null ||
    valeur === undefined ||
    estMarqueurLetterboxdV43_(valeur)
  ) {
    return false;
  }
  const votes = Number(valeur);
  return !isNaN(votes) && votes > 0;
}

/**
 * Une donnée réelle ou un marqueur explicite est une donnée
 * métier complète. Les marqueurs ne mettent donc plus la fiche
 * en A_VERIFIER_LETTERBOXD.
 */
function estResultatLetterboxdJustifieV43_(url, note, votes) {
  const urlOk =
    estUrlLetterboxdReelleV43_(url) ||
    safeTrim_(url).toUpperCase() === LETTERBOXD_PAS_DE_FICHE_V43;
  const noteOk =
    estNoteLetterboxdReelleV43_(note) ||
    safeTrim_(note).toUpperCase() === LETTERBOXD_PAS_DE_NOTE_V43;
  const votesOk =
    estVotesLetterboxdReelV43_(votes) ||
    safeTrim_(votes).toUpperCase() === LETTERBOXD_PAS_DE_VOTE_V43;
  return urlOk && noteOk && votesOk;
}

function doitRecontrolerLetterboxdV43_(url, note, votes) {
  return (
    estMarqueurLetterboxdV43_(url) ||
    estMarqueurLetterboxdV43_(note) ||
    estMarqueurLetterboxdV43_(votes)
  );
}

function resultatSansLetterboxdV43_(commentaire) {
  return {
    erreur: false,
    ignore: false,
    donneesAbsentes: true,
    url: LETTERBOXD_PAS_DE_FICHE_V43,
    note: LETTERBOXD_PAS_DE_NOTE_V43,
    votes: LETTERBOXD_PAS_DE_VOTE_V43,
    source: "PAS_DE_LETTERBOXD",
    commentaire: commentaire || ""
  };
}

/**
 * Point d'entrée principal utilisé par 05_ENRICHISSEMENT.gs.
 *
 * V4.5.0 : accepte désormais "type" (7e paramètre), transmis à
 * rechercherUrlLetterboxdAutomatique_ pour que la redirection TMDb
 * choisisse le bon format (film ou série).
 *
 * V4.5.2 : la priorité "URL manuelle" reconnaît maintenant aussi les
 * liens /tmdb/ et /imdb/, pas seulement /film/ (voir
 * estUrlLetterboxdManuelleAcceptableV452_ ci-dessus).
 */
function chercherLetterboxd_(
  titre,
  annee,
  imdbId,
  urlManuelle,
  tmdbId,
  titreOriginal,
  type
) {
  try {
    const titrePropre = cleanTitle_(titre);
    const titreOriginalPropre = cleanTitle_(titreOriginal);
    const urlSaisie = safeTrim_(urlManuelle);
    let urlTrouvee = "";
    let source = "";

    /**
     * 1. URL manuelle prioritaire.
     */
    if (urlSaisie && estUrlLetterboxdManuelleAcceptableV452_(urlSaisie)) {
      urlTrouvee = nettoyerUrlLetterboxd_(urlSaisie);
      source = "URL_MANUELLE";
    }

    /**
     * 2. Recherche automatique (titre français, puis repli TMDbID,
     * puis repli titre original si le titre français n'a rien donné).
     */
    if (!urlTrouvee) {
      const recherche = rechercherUrlLetterboxdAutomatique_(
        titrePropre,
        annee,
        imdbId,
        tmdbId,
        titreOriginalPropre,
        type
      );
      if (recherche && recherche.url) {
        urlTrouvee = recherche.url;
        source = recherche.source || "AUTOMATIQUE";
      }
    }

    if (!urlTrouvee) {
      const sansFiche = resultatSansLetterboxdV43_(
        "Aucune fiche Letterboxd trouvée automatiquement"
      );
      resoudreErreur_("LETTERBOXD", "chercherLetterboxd_");
      return sansFiche;
    }

    let infos = lirePageLetterboxd_(urlTrouvee);

    /**
     * V4.5.3 : nouvelle(s) tentative(s) pour une URL manuelle (source
     * "URL_MANUELLE") avant d'abandonner.
     *
     * Constat du 03/09/2026 : contrairement à la recherche automatique
     * (qui absorbe silencieusement un échec Letterboxd et retombe sur
     * les marqueurs "PAS DE FICHE"/"PAS DE NOTE"/"PAS DE VOTE"), une URL
     * manuelle invalide déclenchait jusqu'ici un abandon immédiat en
     * A_VERIFIER_LETTERBOXD au moindre raté — y compris un raté
     * purement transitoire de Letterboxd (mur anti-robot ponctuel,
     * timing réseau).
     *
     * Ce cas est devenu bien plus fréquent depuis que "Nouvelle Entrée"
     * (côté app) pré-remplit systématiquement une URL /tmdb/{id} pour
     * chaque film ajouté — chaque nouvel ajout emprunte donc maintenant
     * ce chemin "URL_MANUELLE" strict, là où un ajout sans URL passait
     * avant par le chemin tolérant de la recherche automatique.
     *
     * Correctif V4.5.5 : une seule tentative supplémentaire (V4.5.3)
     * s'est révélée insuffisante en pratique — constat du 03/09/2026 sur
     * FILM1131/FILM1132 : échec systématique et reproductible quand
     * chercherLetterboxd_ est appelé depuis un DÉCLENCHEUR (webhook
     * immédiat ou cycle horaire), alors que la même URL, testée à la
     * main depuis l'éditeur Apps Script au même moment, réussit à
     * chaque fois. L'hypothèse la plus probable : les déclencheurs
     * Google tournent sur un pool d'adresses IP partagé, plus
     * facilement repéré et limité par la protection anti-robot de
     * Letterboxd que les sessions interactives de l'éditeur — un
     * facteur hors de notre contrôle, non corrigible côté code.
     * Pallliatif : jusqu'à 3 tentatives supplémentaires (4 au total),
     * avec des pauses croissantes (3s, 6s, 10s ~ 19s de plus au total),
     * pour maximiser les chances de retomber sur une fenêtre où ce pool
     * n'est pas limité. Reste sous la marge du verrou de 90s pris par
     * reenrichirParIdSheetV1_ (09_WEBHOOK.gs) et loin de la limite de
     * 6 minutes d'un déclencheur — aucun risque de dépassement.
     * Ne s'applique qu'aux URL manuelles : la recherche automatique
     * reste inchangée, elle gérait déjà ce cas correctement.
     */
    if (source === "URL_MANUELLE") {
      const pausesRetryV455 = [3000, 6000, 10000];
      for (
        let tentative = 0;
        tentative < pausesRetryV455.length &&
        (!infos || !infos.pageValide);
        tentative++
      ) {
        Utilities.sleep(pausesRetryV455[tentative]);
        infos = lirePageLetterboxd_(urlTrouvee);
      }
    }

    if (!infos || !infos.pageValide) {
      if (source !== "URL_MANUELLE") {
        const sansFicheFiable = resultatSansLetterboxdV43_(
          "Aucune fiche Letterboxd fiable trouvée automatiquement"
        );
        resoudreErreur_("LETTERBOXD", "chercherLetterboxd_");
        return sansFicheFiable;
      }
      return {
        erreur: true,
        url: urlTrouvee,
        note: "",
        votes: "",
        source: source,
        commentaire: "Page Letterboxd inaccessible ou invalide (après 4 tentatives)"
      };
    }

    const resultat = {
      erreur: false,
      ignore: false,
      url: infos.urlCanonique || urlTrouvee,
      note: estNoteLetterboxdReelleV43_(infos.note)
        ? infos.note
        : LETTERBOXD_PAS_DE_NOTE_V43,
      votes: estVotesLetterboxdReelV43_(infos.votes)
        ? infos.votes
        : LETTERBOXD_PAS_DE_VOTE_V43,
      donneesAbsentes:
        !estNoteLetterboxdReelleV43_(infos.note) ||
        !estVotesLetterboxdReelV43_(infos.votes),
      source: source,
      commentaire: ""
    };
    resoudreErreur_("LETTERBOXD", "chercherLetterboxd_");
    return resultat;
  } catch (e) {
    erreur_(
      "LETTERBOXD",
      "chercherLetterboxd_",
      String(e),
      e && e.stack ? e.stack : ""
    );
    return {
      erreur: true,
      url: "",
      note: "",
      votes: "",
      source: "ERREUR",
      commentaire: "Erreur Letterboxd : " + String(e)
    };
  }
}

/**
 * Recherche automatique d'une URL Letterboxd.
 * V4.5.0 : "type" en 6e paramètre, transmis à rechercherLetterboxdViaTmdb_.
 */
function rechercherUrlLetterboxdAutomatique_(
  titre,
  annee,
  imdbId,
  tmdbId,
  titreOriginal,
  type
) {
  /**
   * Priorité 1 : redirection IMDb officielle de Letterboxd.
   *
   * Exemple :
   * https://letterboxd.com/imdb/tt2713180/
   */
  if (imdbId) {
    const viaImdb = rechercherLetterboxdViaImdb_(imdbId);
    if (viaImdb) {
      return { url: viaImdb, source: "IMDB_REDIRECT" };
    }
  }

  /**
   * Priorité 2 : redirection TMDb officielle de Letterboxd, même
   * principe que la redirection IMDb ci-dessus. Le format d'URL diffère
   * selon qu'il s'agit d'un film ou d'une série (voir
   * rechercherLetterboxdViaTmdb_ pour le détail V4.5.0/V4.5.1).
   *
   * Exemples :
   * https://letterboxd.com/tmdb/27205/     (film)
   */
  if (tmdbId) {
    const viaTmdb = rechercherLetterboxdViaTmdb_(tmdbId, type);
    if (viaTmdb) {
      return { url: viaTmdb, source: "TMDB_REDIRECT" };
    }
  }

  /**
   * Priorité 3 : essais d'URL probables à partir du titre (français,
   * tel qu'enregistré dans la fiche).
   */
  const viaSlug = rechercherLetterboxdViaSlug_(titre, annee);
  if (viaSlug) {
    return { url: viaSlug, source: "SLUG_TITRE" };
  }

  /**
   * Priorité 4 : repli sur le titre original si le titre français n'a
   * rien donné et qu'il est réellement différent (évite une recherche
   * identique en double).
   */
  if (
    titreOriginal &&
    titreOriginal.toLowerCase() !== (titre || "").toLowerCase()
  ) {
    const viaSlugOriginal = rechercherLetterboxdViaSlug_(titreOriginal, annee);
    if (viaSlugOriginal) {
      return { url: viaSlugOriginal, source: "SLUG_TITRE_ORIGINAL" };
    }
  }

  return { url: "", source: "NON_TROUVE" };
}

/**
 * Recherche par IMDbID.
 */
function rechercherLetterboxdViaImdb_(imdbId) {
  const identifiant = safeTrim_(imdbId);
  if (!/^tt\d+$/i.test(identifiant)) {
    return "";
  }
  const url = LETTERBOXD_BASE_V4 + "/imdb/" + encodeURIComponent(identifiant) + "/";
  const response = fetchLetterboxdResponse_(url, false);
  if (!response) {
    return "";
  }
  const code = response.getResponseCode();
  if (code === 301 || code === 302 || code === 303 || code === 307 || code === 308) {
    const headers = response.getHeaders();
    const location = getHeaderLetterboxd_(headers, "Location");
    if (location && /letterboxd\.com\/film\//i.test(location)) {
      return nettoyerUrlLetterboxd_(location);
    }
  }
  /**
   * Certains appels peuvent suivre la page IMDb directement
   * et contenir un canonical film.
   */
  if (code === 200) {
    const html = response.getContentText();
    const canonical = extraireUrlCanoniqueLetterboxd_(html);
    if (canonical) {
      return canonical;
    }
  }
  return "";
}

/**
 * Recherche par TMDbID — même principe que rechercherLetterboxdViaImdb_
 * ci-dessus, Letterboxd proposant la même redirection officielle pour
 * les identifiants TMDb — MAIS UNIQUEMENT POUR LES FILMS.
 *
 * Correctif V4.5.1 : la tentative V4.5.0 d'ajouter /tv pour les séries
 * était une fausse bonne idée. Letterboxd confirme officiellement
 * (letterboxd.zendesk.com, "I see a film entry on TMDb, why isn't it on
 * Letterboxd?") que les séries ne sont PAS auto-importées via ce
 * mécanisme : seuls les films le sont automatiquement ; les séries
 * limitées/miniséries sont ajoutées manuellement par leur équipe. Un test
 * réel (Breaking Bad, tmdbId 1396) confirme que /tmdb/1396/tv/ ne
 * redirige vers rien. Pour un Type "Série", cette fonction ne tente donc
 * plus aucune redirection TMDb et retourne directement "" — la recherche
 * automatique passe à l'étape suivante (slug par titre), seule option
 * réaliste pour une série sur Letterboxd.
 */
function rechercherLetterboxdViaTmdb_(tmdbId, type) {
  const identifiant = safeTrim_(tmdbId);
  if (!/^\d+$/.test(identifiant)) {
    return "";
  }
  const estSerie = normalizeText_(type || "").indexOf("serie") !== -1;
  if (estSerie) {
    return "";
  }
  const url = LETTERBOXD_BASE_V4 + "/tmdb/" + encodeURIComponent(identifiant) + "/";
  const response = fetchLetterboxdResponse_(url, false);
  if (!response) {
    return "";
  }
  const code = response.getResponseCode();
  if (code === 301 || code === 302 || code === 303 || code === 307 || code === 308) {
    const headers = response.getHeaders();
    const location = getHeaderLetterboxd_(headers, "Location");
    if (location && /letterboxd\.com\/film\//i.test(location)) {
      return nettoyerUrlLetterboxd_(location);
    }
  }
  if (code === 200) {
    const html = response.getContentText();
    const canonical = extraireUrlCanoniqueLetterboxd_(html);
    if (canonical) {
      return canonical;
    }
  }
  return "";
}

/**
 * Recherche par slug probable.
 */
function rechercherLetterboxdViaSlug_(titre, annee) {
  const slug = slugLetterboxd_(titre);
  if (!slug) {
    return "";
  }
  const candidats = [];
  /**
   * Beaucoup de fiches utilisent uniquement le titre.
   */
  candidats.push(LETTERBOXD_BASE_V4 + "/film/" + slug + "/");
  /**
   * Certaines fiches ajoutent l'année au slug.
   */
  if (annee) {
    candidats.push(LETTERBOXD_BASE_V4 + "/film/" + slug + "-" + String(annee).trim() + "/");
  }
  for (let i = 0; i < candidats.length; i++) {
    const url = candidats[i];
    const infos = lirePageLetterboxdSilencieuse_(url);
    if (infos && infos.pageValide && pageCorrespondAuFilmLetterboxd_(infos, titre, annee)) {
      return infos.urlCanonique || nettoyerUrlLetterboxd_(url);
    }
    Utilities.sleep(250);
  }
  return "";
}

/**
 * Vérifie que la page trouvée correspond raisonnablement au film.
 */
function pageCorrespondAuFilmLetterboxd_(infos, titre, annee) {
  if (!infos || !infos.pageValide) {
    return false;
  }
  const titreRecherche = normalizeText_(titre);
  const titrePage = normalizeText_(infos.titrePage || "");
  if (!titreRecherche || !titrePage) {
    return false;
  }
  const titreCompatible =
    titrePage === titreRecherche ||
    titrePage.includes(titreRecherche) ||
    titreRecherche.includes(titrePage);
  if (!titreCompatible) {
    return false;
  }
  /**
   * Si l'année de la page est connue, elle doit correspondre
   * à un an près. Cela couvre certaines dates de sortie décalées.
   */
  if (annee && infos.anneePage) {
    const ecart = Math.abs(Number(annee) - Number(infos.anneePage));
    if (ecart > 1) {
      return false;
    }
  }
  return true;
}

/**
 * V4.5.4 : résout manuellement UNE redirection (/tmdb/... ou /imdb/...)
 * en deux requêtes distinctes, plutôt que de compter sur
 * followRedirects:true.
 *
 * Constat concret du 03/09/2026 (FILM1130 "Le Mage du Kremlin") :
 * l'URL de redirection https://letterboxd.com/tmdb/1291659 échouait de
 * façon répétée (page jugée non valide), alors que l'URL déjà résolue
 * https://letterboxd.com/film/the-wizard-of-the-kremlin/ — la même page
 * de destination — fonctionnait à chaque fois, testée manuellement par
 * Ben. Le seul point commun distinguant ces deux cas est le saut de
 * redirection lui-même : quand Apps Script suit une redirection tout
 * seul (followRedirects:true), il ne garantit pas de renvoyer nos
 * en-têtes personnalisés (dont le User-Agent forcé) sur la requête qui
 * suit la redirection — un comportement peu documenté côté
 * UrlFetchApp. Une requête envoyée directement à l'URL déjà résolue,
 * elle, part toujours avec l'en-tête complet.
 *
 * Retourne l'URL résolue (chaîne) si un saut a bien eu lieu, ou null si
 * l'URL fournie n'était pas une redirection (auquel cas l'appelant
 * garde l'URL d'origine).
 */
function resoudreRedirectionLetterboxdManuelleV454_(url) {
  const reponseSansSuivi = fetchLetterboxdResponse_(url, false);
  if (!reponseSansSuivi) {
    return null;
  }
  const code = reponseSansSuivi.getResponseCode();
  const estRedirection =
    code === 301 ||
    code === 302 ||
    code === 303 ||
    code === 307 ||
    code === 308;
  if (!estRedirection) {
    return null;
  }
  const location = getHeaderLetterboxd_(
    reponseSansSuivi.getHeaders(),
    "Location"
  );
  if (!location) {
    return null;
  }
  if (/^https?:\/\//i.test(location)) {
    return location;
  }
  return (
    LETTERBOXD_BASE_V4 +
    (location.indexOf("/") === 0 ? location : "/" + location)
  );
}

/**
 * Lecture complète d'une page Letterboxd.
 */
function lirePageLetterboxd_(url) {
  let urlAUtiliser = url;

  /**
   * V4.5.4 : pour une URL de redirection Letterboxd (/tmdb/ ou /imdb/),
   * on résout le saut nous-mêmes avant la vraie lecture — voir
   * resoudreRedirectionLetterboxdManuelleV454_ pour le détail du
   * problème constaté. N'a aucun effet sur une URL déjà résolue
   * (/film/...), qui n'est jamais une redirection.
   */
  if (/letterboxd\.com\/(tmdb|imdb)\//i.test(String(url || ""))) {
    const resolue = resoudreRedirectionLetterboxdManuelleV454_(url);
    if (resolue) {
      urlAUtiliser = resolue;
    }
  }

  const response = fetchLetterboxdResponse_(urlAUtiliser, true);
  if (!response) {
    return {
      pageValide: false,
      urlCanonique: "",
      titrePage: "",
      anneePage: "",
      note: "",
      votes: ""
    };
  }
  const code = response.getResponseCode();
  if (code !== 200) {
    /**
     * Une URL manuelle invalide doit remonter comme résultat
     * non concluant, sans faire planter tout l'enrichissement.
     */
    return {
      pageValide: false,
      httpStatus: code,
      urlCanonique: "",
      titrePage: "",
      anneePage: "",
      note: "",
      votes: ""
    };
  }
  const html = response.getContentText();
  return analyserPageLetterboxd_(html, urlAUtiliser);
}

/**
 * Variante silencieuse utilisée pendant les essais automatiques.
 */
function lirePageLetterboxdSilencieuse_(url) {
  try {
    return lirePageLetterboxd_(url);
  } catch (e) {
    return {
      pageValide: false,
      urlCanonique: "",
      titrePage: "",
      anneePage: "",
      note: "",
      votes: ""
    };
  }
}

/**
 * Analyse du HTML Letterboxd.
 */
function analyserPageLetterboxd_(html, urlDemandee) {
  const contenu = String(html || "");
  if (!contenu) {
    return {
      pageValide: false,
      urlCanonique: "",
      titrePage: "",
      anneePage: "",
      note: "",
      votes: ""
    };
  }
  const urlCanonique = extraireUrlCanoniqueLetterboxd_(contenu);
  const titrePage = extraireTitreLetterboxd_(contenu);
  const anneePage = extraireAnneeLetterboxd_(contenu);
  const note = extraireNoteLetterboxd_(contenu);
  const votes = extraireVotesLetterboxd_(contenu);
  const pageValide =
    /letterboxd/i.test(contenu) &&
    (/\/film\//i.test(urlCanonique || urlDemandee || "") || !!titrePage);
  return {
    pageValide: pageValide,
    urlCanonique: urlCanonique || nettoyerUrlLetterboxd_(urlDemandee),
    titrePage: titrePage,
    anneePage: anneePage,
    note: note,
    votes: votes
  };
}

/**
 * Appel HTTP Letterboxd.
 */
function fetchLetterboxdResponse_(url, suivreRedirections) {
  try {
    return UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: suivreRedirections !== false,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml," + "application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,fr-FR;q=0.8,fr;q=0.7",
        "Cache-Control": "no-cache"
      }
    });
  } catch (e) {
    return null;
  }
}

/**
 * Extraction de l'URL canonical.
 */
function extraireUrlCanoniqueLetterboxd_(html) {
  const patterns = [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,
    /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = String(html || "").match(patterns[i]);
    if (match && match[1] && /letterboxd\.com\/film\//i.test(match[1])) {
      return nettoyerUrlLetterboxd_(match[1]);
    }
  }
  return "";
}

/**
 * Extraction du titre.
 */
function extraireTitreLetterboxd_(html) {
  const patterns = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /"name"\s*:\s*"([^"]+)"/i,
    /<title>([^<]+)<\/title>/i
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = String(html || "").match(patterns[i]);
    if (match && match[1]) {
      return nettoyerTitrePageLetterboxd_(decoderEntitesLetterboxd_(match[1]));
    }
  }
  return "";
}

/**
 * Extraction de l'année.
 */
function extraireAnneeLetterboxd_(html) {
  const patterns = [
    /"datePublished"\s*:\s*"(\d{4})/i,
    /<meta[^>]+property=["']og:title["'][^>]+content=["'][^"']*\((\d{4})\)/i,
    /\/films\/year\/(\d{4})\//i
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = String(html || "").match(patterns[i]);
    if (match && match[1]) {
      return match[1];
    }
  }
  return "";
}

/**
 * Extraction de la note.
 */
function extraireNoteLetterboxd_(html) {
  /**
   * Priorité au bloc JSON-LD structuré du film lui-même (voir
   * extraireDonneesStructureesFilmLetterboxd_ ci-dessous).
   *
   * Raison : les anciennes regex libres (ci-dessous, conservées en
   * repli) cherchent "ratingValue" n'importe où dans la page — y
   * compris dans les cartes "Similar Films", les avis individuels,
   * ou une story recommandée, qui portent chacun leur propre note.
   * Une page suffisamment riche en contenu annexe peut donc faire
   * remonter une note totalement étrangère au film demandé. Isoler
   * le JSON-LD et vérifier @type == "Movie"/"TVSeries" élimine ce
   * risque : impossible d'accrocher autre chose que la fiche du
   * film lui-même.
   */
  const structure = extraireDonneesStructureesFilmLetterboxd_(html);
  if (
    structure &&
    structure.aggregateRating &&
    structure.aggregateRating.ratingValue != null &&
    structure.aggregateRating.ratingValue !== ""
  ) {
    return normaliserNoteLetterboxd_(structure.aggregateRating.ratingValue);
  }
  /**
   * Repli — ancien comportement, gardé pour les pages où le JSON-LD
   * serait absent ou mal formé.
   */
  const patterns = [
    /"ratingValue"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/i,
    /averageRating["']?\s*:\s*["']?([0-9]+(?:\.[0-9]+)?)/i,
    /data-average-rating=["']([0-9]+(?:\.[0-9]+)?)["']/i
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = String(html || "").match(patterns[i]);
    if (match && match[1]) {
      return normaliserNoteLetterboxd_(match[1]);
    }
  }
  return "";
}

/**
 * Isole chaque bloc <script type="application/ld+json"> de la page
 * et retient le premier objet dont @type vaut "Movie" ou "TVSeries"
 * ET qui possède un aggregateRating — c'est-à-dire la fiche du film
 * demandé, jamais un film "similaire" ou un avis individuel.
 */
function extraireDonneesStructureesFilmLetterboxd_(html) {
  const contenu = String(html || "");
  const regexScript = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regexScript.exec(contenu)) !== null) {
    try {
      const donnees = JSON.parse(match[1]);
      const objets = Array.isArray(donnees) ? donnees : [donnees];
      for (let i = 0; i < objets.length; i++) {
        const objet = objets[i];
        const type = objet && objet["@type"];
        if (objet && (type === "Movie" || type === "TVSeries") && objet.aggregateRating) {
          return objet;
        }
      }
    } catch (e) {
      /**
       * Bloc JSON-LD mal formé ou tronqué par l'extraction —
       * on continue avec le bloc suivant plutôt que d'abandonner
       * toute la page.
       */
      continue;
    }
  }
  return null;
}

/**
 * Extraction du nombre de votes.
 */
function extraireVotesLetterboxd_(html) {
  /**
   * Même raisonnement que extraireNoteLetterboxd_ — priorité au
   * JSON-LD scopé au film, repli sur les anciennes regex libres.
   */
  const structure = extraireDonneesStructureesFilmLetterboxd_(html);
  if (
    structure &&
    structure.aggregateRating &&
    structure.aggregateRating.ratingCount != null &&
    structure.aggregateRating.ratingCount !== ""
  ) {
    return normaliserVotesLetterboxd_(structure.aggregateRating.ratingCount);
  }
  const patterns = [
    /"ratingCount"\s*:\s*"?([0-9,.\s]+)"?/i,
    /ratingCount["']?\s*:\s*["']?([0-9,.\s]+)/i,
    /data-rating-count=["']([0-9,.\s]+)["']/i
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = String(html || "").match(patterns[i]);
    if (match && match[1]) {
      return normaliserVotesLetterboxd_(match[1]);
    }
  }
  return "";
}

/**
 * Nettoyage de l'URL Letterboxd.
 */
function nettoyerUrlLetterboxd_(url) {
  let valeur = safeTrim_(url);
  if (!valeur) {
    return "";
  }
  if (!/^https?:\/\//i.test(valeur)) {
    valeur = "https://" + valeur;
  }
  const match = valeur.match(/https?:\/\/(?:www\.)?letterboxd\.com\/film\/([^/?#]+)\/?/i);
  if (match && match[1]) {
    return LETTERBOXD_BASE_V4 + "/film/" + match[1] + "/";
  }
  return valeur;
}

/**
 * Création d'un slug compatible avec la majorité des URL.
 */
function slugLetterboxd_(texte) {
  return String(texte || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Nettoyage du titre récupéré sur la page.
 */
function nettoyerTitrePageLetterboxd_(titre) {
  return String(titre || "")
    .replace(/\s*[([]\d{4}[)\]]\s*/g, " ")
    .replace(/\s*[•\-|]\s*Letterboxd.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalisation de la note.
 */
function normaliserNoteLetterboxd_(valeur) {
  const nombre = Number(String(valeur || "").replace(",", ".").trim());
  if (isNaN(nombre)) {
    return "";
  }
  return Math.round(nombre * 100) / 100;
}

/**
 * Normalisation des votes.
 */
function normaliserVotesLetterboxd_(valeur) {
  const chiffres = String(valeur || "").replace(/[^0-9]/g, "");
  return chiffres ? Number(chiffres) : "";
}

/**
 * Recherche insensible à la casse d'un header HTTP.
 */
function getHeaderLetterboxd_(headers, nom) {
  const recherche = String(nom || "").toLowerCase();
  const cles = Object.keys(headers || {});
  for (let i = 0; i < cles.length; i++) {
    if (String(cles[i]).toLowerCase() === recherche) {
      return headers[cles[i]];
    }
  }
  return "";
}

/**
 * Décodage minimal des entités HTML.
 */
function decoderEntitesLetterboxd_(texte) {
  return String(texte || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Tests.
 */
function testLetterboxdV42AvecUrl() {
  const resultat = chercherLetterboxd_(
    "Fury",
    "2014",
    "tt2713180",
    "https://letterboxd.com/film/fury-2014/"
  );
  Logger.log(JSON.stringify(resultat, null, 2));
}

function testLetterboxdV42Automatique() {
  const resultat = chercherLetterboxd_("Fury", "2014", "tt2713180", "");
  Logger.log(JSON.stringify(resultat, null, 2));
}

/**
 * Test V4.5.2 — reproduit exactement le cas signalé : une URL manuelle
 * au format /tmdb/{id}/ (celle envoyée par CinéRadar) doit maintenant
 * être acceptée comme URL_MANUELLE et se résoudre vers la vraie fiche,
 * au lieu d'être ignorée et remplacée par la recherche automatique.
 */
function testerUrlManuelleTmdbV452() {
  Logger.log("===== TEST V4.5.2 : URL MANUELLE AU FORMAT /tmdb/ =====");
  const resultat = chercherLetterboxd_(
    "Fury",
    "2014",
    "",
    "https://letterboxd.com/tmdb/205596/",
    "",
    "",
    "Film"
  );
  Logger.log(JSON.stringify(resultat, null, 2));
  if (resultat.source !== "URL_MANUELLE") {
    throw new Error(
      "L'URL /tmdb/ manuelle aurait dû être reconnue comme URL_MANUELLE, source obtenue : " +
        resultat.source
    );
  }
  if (!/letterboxd\.com\/film\//i.test(resultat.url)) {
    throw new Error("L'URL finale aurait dû être résolue vers /film/, obtenu : " + resultat.url);
  }
  Logger.log("OK | URL /tmdb/ manuelle acceptée et résolue vers : " + resultat.url);
  Logger.log("===== FIN TEST =====");
}

/**
 * Tests V4.5.1 — vérifient qu'une série ne déclenche plus aucun appel
 * réseau inutile (correctif du faux /tv testé et confirmé non
 * fonctionnel), et qu'un film continue de fonctionner normalement.
 * Lecture seule pour le film (vrai appel réseau) ; aucun appel réseau
 * pour la série.
 */
function testerRedirectionTmdbFilmSauteePourSerieV451() {
  Logger.log("===== TEST V4.5.1 : REDIRECTION TMDB SAUTÉE POUR UNE SÉRIE =====");
  const url = rechercherLetterboxdViaTmdb_(1396, "Série");
  Logger.log("URL trouvée (doit être vide) : '" + url + "'");
  if (url !== "") {
    throw new Error("rechercherLetterboxdViaTmdb_ aurait dû retourner une chaine vide pour une série.");
  }
  Logger.log("OK | La redirection TMDb est bien sautée pour une série, comme prévu");
  Logger.log("===== FIN TEST =====");
}

function testerRedirectionTmdbFilmV451() {
  Logger.log("===== TEST V4.5.1 : REDIRECTION TMDB POUR UN FILM =====");
  const url = rechercherLetterboxdViaTmdb_(27205, "Film");
  Logger.log("URL trouvée : " + url);
  if (!url || !/letterboxd\.com\/film\//i.test(url)) {
    throw new Error("La redirection TMDb pour un film n'a pas fonctionné.");
  }
  Logger.log("OK | Redirection film fonctionnelle");
  Logger.log("===== FIN TEST =====");
}

/**
 * Diagnostic — appelle directement letterboxd.com/tmdb/27205/ (Parasite)
 * et affiche la réponse brute reçue (code HTTP, en-tête Location si
 * présent, aperçu du corps) sans passer par la logique de redirection.
 * Sert uniquement à voir ce que Letterboxd renvoie réellement, pour
 * distinguer un simple souci de redirection non suivie d'un vrai blocage
 * (page de vérification anti-robot, etc.). N'écrit rien.
 */
function testerDiagnosticTmdbFilmV451() {
  Logger.log("===== DIAGNOSTIC TMDB FILM V4.5.1 =====");
  const url = "https://letterboxd.com/tmdb/27205/";
  const reponseSansSuivi = fetchLetterboxdResponse_(url, false);
  if (reponseSansSuivi) {
    const code = reponseSansSuivi.getResponseCode();
    Logger.log("Sans suivi de redirection — code HTTP : " + code);
    const headers = reponseSansSuivi.getHeaders();
    Logger.log("Location : " + (getHeaderLetterboxd_(headers, "Location") || "(absent)"));
    Logger.log("Set-Cookie présent : " + (getHeaderLetterboxd_(headers, "Set-Cookie") ? "OUI" : "NON"));
    Logger.log("Aperçu du corps (500 premiers caractères) :");
    Logger.log(String(reponseSansSuivi.getContentText() || "").slice(0, 500));
  } else {
    Logger.log("Sans suivi de redirection — aucune réponse (échec réseau).");
  }
  Logger.log("---");
  const reponseAvecSuivi = fetchLetterboxdResponse_(url, true);
  if (reponseAvecSuivi) {
    const code2 = reponseAvecSuivi.getResponseCode();
    Logger.log("Avec suivi de redirection — code HTTP final : " + code2);
    const html = reponseAvecSuivi.getContentText();
    Logger.log("Longueur du corps : " + (html ? html.length : 0) + " caractères");
    Logger.log("Contient 'letterboxd' : " + (/letterboxd/i.test(html) ? "OUI" : "NON"));
    Logger.log("Contient '/film/' : " + (/\/film\//i.test(html) ? "OUI" : "NON"));
    Logger.log(
      "Contient un mur de vérification probable (captcha/cloudflare/robot) : " +
        (/captcha|are you human|cloudflare|checking your browser|access denied/i.test(html) ? "OUI" : "NON")
    );
    Logger.log("Aperçu du corps (500 premiers caractères) :");
    Logger.log(String(html || "").slice(0, 500));
  } else {
    Logger.log("Avec suivi de redirection — aucune réponse (échec réseau).");
  }
  Logger.log("===== FIN DIAGNOSTIC =====");
}


