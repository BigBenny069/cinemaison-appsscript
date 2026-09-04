/**
 * ============================================================
 * CinéMaison V4
 * Script : 05_ENRICHISSEMENT.gs
 * Rôle   : Orchestration TMDb + Letterboxd
 * Version: 4.6.1
 * Dépendances :
 *   - 00_CONFIG.gs
 *   - 01_UTILS.gs
 *   - 02_TMDB.gs
 *   - 03_LETTERBOXD.gs
 *
 * IMPORTANT :
 * Ce script ne touche jamais aux disponibilités.
 *
 * Correctif V4.6.1 (04/09/2026) :
 * - Constat du 03/09/2026 18h23 : un timeout transitoire du service
 *   Google Sheets ("Service Spreadsheets timed out...") sur UN SEUL
 *   film faisait échouer toute la boucle enrichirFilmsV4_ — les films
 *   restants du lot n'étaient pas traités ce cycle-ci (repris
 *   automatiquement au cycle suivant, donc rien de perdu, mais tout le
 *   lot retardé à cause d'un seul raté passager côté Google, avec un
 *   email d'erreur à chaque fois).
 * - Chaque film est désormais traité dans son propre try/catch : un
 *   échec sur une fiche est journalisé individuellement (nouveau
 *   compteur "Erreurs" dans le récapitulatif de cycle + erreur_()
 *   dédiée par film), et la boucle continue normalement sur les films
 *   suivants au lieu de tout interrompre.
 *
 * Correctif V4.6.0 :
 * - chercherLetterboxd_ reçoit désormais le Type (Film/Série/...) de la
 *   fiche, transmis à son tour à 03_LETTERBOXD.gs. Avant ce correctif, la
 *   redirection fiable via TMDbID (rechercherLetterboxdViaTmdb_) tentait
 *   toujours le format "film" (/tmdb/{id}/), qui ne fonctionne pas pour
 *   les séries — celles-ci retombaient donc systématiquement sur la
 *   recherche par titre, plus fragile, sans même essayer la redirection
 *   fiable. Voir 03_LETTERBOXD.gs V4.5.0 pour le détail du correctif.
 *
 * Correctif V4.5.9 :
 * - urlLetterboxdModifiee ne dépend plus de empreinteAvecUrl pour détecter
 *   un changement : si aucune empreinte fiable de l'URL n'existe (fiche
 *   enrichie avant l'ajout de ce champ, ou jamais migrée), on suppose par
 *   défaut qu'une vérification est due. Avant ce correctif, une fiche dans
 *   ce cas ne détectait JAMAIS un changement d'URL Letterboxd fait depuis
 *   l'app — la note restait figée indéfiniment, même après plusieurs
 *   "Redemander une vérification".
 *
 * Correctif V4.5.8 :
 * - tmdbIncomplet vérifie désormais aussi URLBandeAnnonce ; une fiche déjà
 *   complète (affiche/synopsis/réalisateur/note/durée) mais sans bande-
 *   annonce n'était jusqu'ici JAMAIS retraitée par TMDb, même après avoir
 *   vidé EtatEnrichissement/StatutEnrichissement (bouton "Bandes-annonces
 *   manquantes" de l'app) : le bloc d'appel à chercherTMDb_ était
 *   entièrement sauté car aucun autre champ ne manquait.
 * ============================================================
 */

const VERSION_ENRICHISSEMENT_V4 = "V4.6.0";
const SEPARATEUR_EMPREINTE_ENRICHISSEMENT_V45 = "#";
const VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_9 = "V4.5.9";
const VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_8 = "V4.5.8";
const VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_7 = "V4.5.7";
const VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_6 = "V4.5.6";
const VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_5 = "V4.5.5";
const VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_4 = "V4.5.4";
const VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_2 = "V4.5.3";
const VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE = "V4.5.2";
const VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_3 = "V4.5.1";
const VERSION_EMPREINTE_ENRICHISSEMENT_LEGACY = "V4.5.0";
const MAX_LIGNES_PAR_MODIFICATION_V454 = 10;
const LOT_LETTERBOXD_NORMAL_V456 = 5;
const LOT_LETTERBOXD_RATTRAPAGE_V456 = 15;
const SEUIL_RATTRAPAGE_LETTERBOXD_V456 = 30;
const LOT_ENRICHISSEMENT_INITIAL_NORMAL_V457 = 3;
const LOT_ENRICHISSEMENT_INITIAL_RATTRAPAGE_V457 = 15;
const SEUIL_RATTRAPAGE_ENRICHISSEMENT_INITIAL_V457 = 30;
const DUREE_MAX_CYCLE_INITIAL_V457_MS = 270000;



function construireEmpreinteEnrichissementV45_(identite) {
  identite = identite || {};

  return [
    safeTrim_(identite.titre || ""),
    safeTrim_(identite.annee || ""),
    normalizeText_(identite.type || ""),
    safeTrim_(identite.tmdbId || ""),
    safeTrim_(identite.imdbId || ""),
    safeTrim_(identite.urlLetterboxd || "")
  ]
    .map(function(valeur) {
      return encodeURIComponent(valeur);
    })
    .join("|");
}



function identiteDepuisLigneV45_(row, h) {
  return {
    titre: cleanTitle_(get_(row, h, "Titre")),
    annee: get_(row, h, "Annee"),
    type: get_(row, h, "Type"),
    tmdbId: get_(row, h, "TMDbID"),
    imdbId: get_(row, h, "IMDbID"),
    urlLetterboxd: get_(row, h, "URLLetterboxd")
  };
}



function versionAvecEmpreinteV45_(identite) {
  return VERSION_ENRICHISSEMENT_V4 +
    SEPARATEUR_EMPREINTE_ENRICHISSEMENT_V45 +
    construireEmpreinteEnrichissementV45_(identite);
}



function extraireEmpreinteEnrichissementV45_(version) {
  version = safeTrim_(version);
  const versions = [
    VERSION_ENRICHISSEMENT_V4,
    VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_9,
    VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_8,
    VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_7,
    VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_6,
    VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_5,
    VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_4,
    VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_2,
    VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE,
    VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_3,
    VERSION_EMPREINTE_ENRICHISSEMENT_LEGACY
  ];

  for (let i = 0; i < versions.length; i++) {
    const prefixe = versions[i] +
      SEPARATEUR_EMPREINTE_ENRICHISSEMENT_V45;

    if (version.indexOf(prefixe) === 0) {
      return version.substring(prefixe.length);
    }
  }

  return "";
}



function estEmpreinteLegacyEnrichissementV451_(version) {
  const prefixe = VERSION_EMPREINTE_ENRICHISSEMENT_LEGACY +
    SEPARATEUR_EMPREINTE_ENRICHISSEMENT_V45;

  return safeTrim_(version).indexOf(prefixe) === 0;
}



function analyserIdentiteEnrichissementV45_(row, h) {
  const identite = identiteDepuisLigneV45_(row, h);
  const versionStockee = get_(row, h, "VersionEnrichissement");
  const empreinteLegacy =
    estEmpreinteLegacyEnrichissementV451_(versionStockee);
  const empreinteActuelle =
    construireEmpreinteEnrichissementV45_(identite);
  const empreintePrecedente =
    extraireEmpreinteEnrichissementV45_(
      versionStockee
    );

  let ancienne = null;

  if (empreintePrecedente) {
    const valeurs = empreintePrecedente
      .split("|")
      .map(function(valeur) {
        try {
          return decodeURIComponent(valeur);
        } catch (e) {
          return valeur;
        }
      });

    ancienne = {
      titre: valeurs[0] || "",
      annee: valeurs[1] || "",
      type: valeurs[2] || "",
      tmdbId: valeurs[3] || "",
      imdbId: valeurs[4] || "",
      urlLetterboxd: valeurs[5] || ""
    };
  }

  const empreinteAvecUrl =
    !!empreintePrecedente &&
    empreintePrecedente.split("|").length >= 6;

  const titreActuelBrut = safeTrim_(identite.titre || "");
  const titreActuelNormalise = normalizeText_(titreActuelBrut);
  const titrePrecedent = ancienne ? ancienne.titre : "";

  const champsRechercheModifies =
    !!ancienne &&
    (
      (
        empreinteLegacy
          ? titrePrecedent !== titreActuelNormalise
          : titrePrecedent !== titreActuelBrut
      ) ||
      ancienne.annee !== safeTrim_(identite.annee || "") ||
      ancienne.type !== normalizeText_(identite.type || "")
    );

  const tmdbIdModifie =
    !!ancienne &&
    ancienne.tmdbId !== safeTrim_(identite.tmdbId || "");

  const imdbIdModifie =
    !!ancienne &&
    ancienne.imdbId !== safeTrim_(identite.imdbId || "");

  const urlLetterboxdModifiee =
    // Correctif V4.5.9 : si aucune empreinte fiable de l'URL n'existe
    // (fiche enrichie avant l'ajout de ce champ, ou jamais migrée), on
    // considère par défaut qu'une vérification est due plutôt que de ne
    // JAMAIS détecter le changement — c'était la cause du bug où changer
    // l'URL Letterboxd depuis l'app ne mettait jamais à jour la note,
    // même après plusieurs "Redemander une vérification".
    !ancienne ||
    !empreinteAvecUrl ||
    ancienne.urlLetterboxd !==
      safeTrim_(identite.urlLetterboxd || "");

  const identiteModifiee =
    !!empreintePrecedente &&
    (champsRechercheModifies || tmdbIdModifie || imdbIdModifie);

  return {
    identite: identite,
    empreintePresente: !!empreintePrecedente,
    empreinteAvecUrl: empreinteAvecUrl,
    empreinteLegacy: empreinteLegacy,
    modifiee:
      identiteModifiee ||
      urlLetterboxdModifiee,
    identiteModifiee: identiteModifiee,
    urlLetterboxdModifiee: urlLetterboxdModifiee,
    champsRechercheModifies: champsRechercheModifies,
    tmdbIdModifie: tmdbIdModifie,
    imdbIdModifie: imdbIdModifie
  };
}



function enrichirSurModification(e) {
  try {
    const succes =
      enrichirLignesModifieesV454_(e);

    if (succes === true) {
      resoudreErreur_(
        "MAILS",
        "enrichirSurModification"
      );
    }

    return succes === true;

  } catch (err) {
    try {
      envoyerMailErreurScript_(
        err,
        "enrichirSurModification"
      );
    } catch (mailErr) {
      Logger.log(
        "Échec du mail d'erreur enrichirSurModification : " +
        String(mailErr)
      );
    }

    throw err;
  }
}



function enrichirLignesModifieesV454_(e) {
  if (!e || !e.range) {
    throw new Error(
      "enrichirSurModification doit être appelé par un déclencheur " +
      "« Lors de la modification » ; ne pas l'exécuter manuellement."
    );
  }

  const range = e.range;
  const sheet = range.getSheet();

  if (!sheet || sheet.getName() !== SHEETS.FILMS) {
    return true;
  }

  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    return true;
  }

  const entetes = sheet
    .getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0];

  const colonneTitre =
    trouverColonneEvenementV454_(entetes, ["Titre"]);
  const colonneAnnee =
    trouverColonneEvenementV454_(entetes, ["Annee", "Année"]);
  const colonneUrl =
    trouverColonneEvenementV454_(
      entetes,
      ["URLLetterboxd", "URL Letterboxd"]
    );

  const colonnesObligatoires = [
    { nom: "Titre", index: colonneTitre },
    { nom: "Annee", index: colonneAnnee },
    { nom: "URLLetterboxd", index: colonneUrl }
  ];

  const manquantes = colonnesObligatoires
    .filter(function(colonne) {
      return colonne.index < 1;
    })
    .map(function(colonne) {
      return colonne.nom;
    });

  if (manquantes.length > 0) {
    throw new Error(
      "Colonnes introuvables dans " +
      SHEETS.FILMS +
      " : " +
      manquantes.join(", ")
    );
  }

  const premiereColonne = range.getColumn();
  const derniereColonne =
    premiereColonne + range.getNumColumns() - 1;

  const titreModifie =
    colonneTitre >= premiereColonne &&
    colonneTitre <= derniereColonne;
  const anneeModifiee =
    colonneAnnee >= premiereColonne &&
    colonneAnnee <= derniereColonne;
  const urlModifiee =
    colonneUrl >= premiereColonne &&
    colonneUrl <= derniereColonne;

  if (!titreModifie && !anneeModifiee && !urlModifiee) {
    return true;
  }

  const premiereLigne = Math.max(2, range.getRow());
  const derniereLigne = Math.min(
    sheet.getLastRow(),
    range.getLastRow()
  );

  if (derniereLigne < premiereLigne) {
    return true;
  }

  const nombreDemande =
    derniereLigne - premiereLigne + 1;
  const nombreATraiter = Math.min(
    nombreDemande,
    MAX_LIGNES_PAR_MODIFICATION_V454
  );

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(120000)) {
    throw new Error(
      "Un autre enrichissement est déjà en cours. " +
      "La ligne sera reprise par le cycle automatique."
    );
  }

  try {
    const data = sheet
      .getRange(
        premiereLigne,
        1,
        nombreATraiter,
        lastColumn
      )
      .getValues();
    const h = headers_(entetes);

    let traites = 0;
    let ignores = 0;
    let ok = 0;
    let aVerifier = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = premiereLigne + i;
      const titre = cleanTitle_(get_(row, h, "Titre"));

      if (!titre) {
        ignores++;
        continue;
      }

      const analyse =
        analyserIdentiteEnrichissementV45_(row, h);

      analyse.modifiee = true;
      analyse.identiteModifiee = true;
      analyse.champsRechercheModifies =
        titreModifie || anneeModifiee;
      analyse.urlLetterboxdModifiee = urlModifiee;
      analyse.conserverUrlLetterboxd =
        urlModifiee &&
        estUrlLetterboxdReelleV43_(
          safeTrim_(get_(row, h, "URLLetterboxd"))
        );

      preparerLigneEnrichissementV4_(
        sheet,
        rowNumber,
        row,
        h,
        true
      );

      const resultat = enrichirUneLigneV4_(
        sheet,
        rowNumber,
        row,
        h,
        false,
        analyse
      );

      traites++;

      if (resultat && resultat.statut === "OK") {
        ok++;
      } else {
        aVerifier++;
      }

      Utilities.sleep(350);
    }

    if (nombreDemande > nombreATraiter) {
      journal_(
        "ENRICHISSEMENT",
        "MODIFICATION",
        "PARTIEL",
        "Lignes demandées=" +
          nombreDemande +
          " | traitées immédiatement=" +
          nombreATraiter +
          " | le solde sera repris par le cycle automatique"
      );
    }

    journal_(
      "ENRICHISSEMENT",
      "MODIFICATION",
      "TERMINE",
      "Lignes traitées=" +
        traites +
        " | OK=" +
        ok +
        " | À vérifier=" +
        aVerifier +
        " | ignorées=" +
        ignores
    );

    return true;

  } finally {
    lock.releaseLock();
  }
}



function trouverColonneEvenementV454_(entetes, nomsAcceptes) {
  const normaliser = function(valeur) {
    return String(valeur || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();
  };

  const acceptees = nomsAcceptes.map(normaliser);

  for (let i = 0; i < entetes.length; i++) {
    if (acceptees.includes(normaliser(entetes[i]))) {
      return i + 1;
    }
  }

  return -1;
}



function verificationEnrichissements() {
  try {
    const succes = enrichirFilmsV4_(
      maxFilmsParCycle_(),
      false,
      false
    );

    if (succes !== true) {
      return false;
    }

    ecrireConfig_(
      "DernierEnrichissement",
      new Date()
    );

    ecrireConfig_(
      "VersionScript",
      VERSION_ENRICHISSEMENT_V4
    );

    resoudreErreur_(
      "MAILS",
      "verificationEnrichissements"
    );

    return true;

  } catch (err) {
    envoyerMailErreurScript_(
      err,
      "verificationEnrichissements"
    );
  }
}



function revoirToutesLesFichesV51() {
  revisionCompleteBibliotheque();
}



function revisionCompleteBibliotheque() {
  try {
    const succes = enrichirFilmsV4_(
      maxRevisionParCycle_(),
      true,
      false
    );

    if (succes !== true) {
      return false;
    }

    ecrireConfig_(
      "DernierEnrichissement",
      new Date()
    );

    ecrireConfig_(
      "DerniereRevisionComplete",
      new Date()
    );

    ecrireConfig_(
      "VersionScript",
      VERSION_ENRICHISSEMENT_V4
    );

    resoudreErreur_(
      "MAILS",
      "revisionCompleteBibliotheque"
    );

    return true;

  } catch (err) {
    envoyerMailErreurScript_(
      err,
      "revisionCompleteBibliotheque"
    );
  }
}



function revisionFichesIncompletes() {
  try {
    const succes = enrichirFilmsV4_(
      maxRevisionParCycle_(),
      true,
      true
    );

    if (succes !== true) {
      return false;
    }

    ecrireConfig_(
      "DernierEnrichissement",
      new Date()
    );

    ecrireConfig_(
      "DerniereRevisionFichesIncompletes",
      new Date()
    );

    ecrireConfig_(
      "VersionScript",
      VERSION_ENRICHISSEMENT_V4
    );

    resoudreErreur_(
      "MAILS",
      "revisionFichesIncompletes"
    );

    return true;

  } catch (err) {
    envoyerMailErreurScript_(
      err,
      "revisionFichesIncompletes"
    );
  }
}



function enrichirFilmsV4_(
  maxFilms,
  modeRevision,
  seulementIncompletes,
  dureeMaxMs
) {
  const lock =
    LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    journal_(
      "ENRICHISSEMENT",
      "LOCK",
      "IGNORE",
      "Un enrichissement est déjà en cours"
    );

    return false;
  }

  try {
    const debutCycle = new Date().getTime();
    const limiteDuree =
      Number(dureeMaxMs || 0);
    const sheet =
      getSheet_(SHEETS.FILMS);

    if (!sheet) {
      erreur_(
        "ENRICHISSEMENT",
        "INIT",
        "Feuille Films introuvable",
        ""
      );

      return false;
    }

    resoudreErreur_(
      "ENRICHISSEMENT",
      "INIT",
      "Feuille Films introuvable"
    );

    const data =
      sheet.getDataRange().getValues();

    if (data.length < 2) {
      return true;
    }

    const h = headers_(data[0]);
    const maxTentatives =
      maxTentatives_();

    let traites = 0;
    let ok = 0;
    let aVerifier = 0;
    let ignores = 0;
    let erreurs = 0;
    let arretTemps = false;

    for (
      let i = data.length - 1;
      i >= 1;
      i--
    ) {
      if (traites >= maxFilms) {
        break;
      }

      if (
        traites > 0 &&
        limiteDuree > 0 &&
        new Date().getTime() - debutCycle >= limiteDuree
      ) {
        arretTemps = true;
        break;
      }

      const rowNumber = i + 1;
      const row = data[i];

      const titre = cleanTitle_(
        get_(row, h, "Titre")
      );

      if (!titre) {
        ignores++;
        continue;
      }

      const ficheIncomplete =
        estFicheIncompleteV4_(row, h);

      const analyseIdentite =
        analyserIdentiteEnrichissementV45_(row, h);

      if (
        seulementIncompletes &&
        !ficheIncomplete &&
        !analyseIdentite.modifiee
      ) {
        ignores++;
        continue;
      }

      const tmdbId =
        get_(row, h, "TMDbID");

      const etat = safeTrim_(
        get_(
          row,
          h,
          "EtatEnrichissement"
        )
      );

      const version = safeTrim_(
        get_(
          row,
          h,
          "VersionEnrichissement"
        )
      );

      const tentatives = Number(
        get_(
          row,
          h,
          "TentativesEnrichissement"
        ) || 0
      );

      const ficheComplete =
        !ficheIncomplete &&
        etat === "OK" &&
        (
          (
            analyseIdentite.empreintePresente &&
            !analyseIdentite.modifiee
          ) ||
          (
            !analyseIdentite.empreintePresente &&
            !!version
          )
        );

      if (
        !modeRevision &&
        ficheComplete
      ) {
        ignores++;
        continue;
      }

      if (
        !modeRevision &&
        !tmdbId &&
        tentatives >= maxTentatives &&
        etat !== "EN_ATTENTE" &&
        etat !== ""
      ) {
        ignores++;
        continue;
      }

      /**
       * Correctif V4.5.6 (04/09/2026) : chaque film est désormais traité
       * dans son propre try/catch. Avant ce correctif, une exception sur
       * UN SEUL film (ex. "Service Spreadsheets timed out..." — un
       * timeout transitoire de Google, pas un bug applicatif) faisait
       * remonter l'exception jusqu'à enrichirNouvellesFichesV4, qui
       * arrêtait TOUT le lot en cours : les films suivants dans cette
       * même exécution n'étaient pas du tout traités ce cycle-ci (ils
       * l'étaient au cycle suivant, donc rien n'était perdu
       * définitivement — mais le lot entier était retardé à cause d'un
       * seul film malchanceux, et ça déclenchait un email d'erreur pour
       * un simple raté passager côté Google).
       * Maintenant : un film en échec est journalisé individuellement
       * (compteur "erreurs" + erreur_() dédiée), et la boucle continue
       * normalement sur les films suivants.
       */
      try {
        preparerLigneEnrichissementV4_(
          sheet,
          rowNumber,
          row,
          h,
          analyseIdentite.modifiee
        );

        const resultat =
          enrichirUneLigneV4_(
            sheet,
            rowNumber,
            row,
            h,
            modeRevision,
            analyseIdentite
          );

        traites++;

        if (
          resultat &&
          resultat.statut === "OK"
        ) {
          ok++;
        } else {
          aVerifier++;
        }
      } catch (erreurFilm) {
        erreurs++;
        erreur_(
          "ENRICHISSEMENT",
          "FILM_LIGNE_" + rowNumber,
          "Échec sur la fiche \"" +
            titre +
            "\" (ligne " +
            rowNumber +
            ") — reprise automatique au cycle suivant",
          String(erreurFilm)
        );
      }

      Utilities.sleep(500);
    }

    journal_(
      "ENRICHISSEMENT",
      "CYCLE",
      "TERMINE",
      "Traités=" +
        traites +
        " | OK=" +
        ok +
        " | À vérifier=" +
        aVerifier +
        " | Ignorés=" +
        ignores +
        " | Erreurs=" +
        erreurs +
        " | Arrêt sécurité temps=" +
        (arretTemps ? "OUI" : "NON")
    );

    return true;

  } finally {
    lock.releaseLock();
  }
}



function preparerLigneEnrichissementV4_(
  sheet,
  rowNumber,
  row,
  h,
  reinitialiserTentatives
) {
  const tmdbId =
    get_(row, h, "TMDbID");

  const tentatives = Number(
    get_(
      row,
      h,
      "TentativesEnrichissement"
    ) || 0
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "EtatEnrichissement",
    "EN_COURS",
    { force: true }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "MessageEnrichissement",
    "Enrichissement de la fiche en cours",
    { force: true }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "DernierEnrichissement",
    new Date(),
    { force: true }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "TentativesEnrichissement",
    reinitialiserTentatives
      ? 0
      : (
          tmdbId
            ? 0
            : tentatives + 1
        ),
    { force: true }
  );
}



function enrichirUneLigneV4_(
  sheet,
  rowNumber,
  row,
  h,
  modeRevision,
  analyseIdentite
) {
  analyseIdentite =
    analyseIdentite ||
    analyserIdentiteEnrichissementV45_(row, h);

  const identiteModifiee =
    !!analyseIdentite.identiteModifiee;

  const urlLetterboxdModifiee =
    !!analyseIdentite.urlLetterboxdModifiee;

  const forcerReecritureTmdb =
    !!modeRevision || identiteModifiee;

  const titre =
    cleanTitle_(
      get_(row, h, "Titre")
    );

  const annee =
    get_(row, h, "Annee");

  const type =
    get_(row, h, "Type");

  const realisateurActuel =
    get_(row, h, "Réalisateur");

  let tmdbId =
    get_(row, h, "TMDbID");

  let imdbId =
    get_(row, h, "IMDbID");

  let titreOriginal =
    get_(row, h, "TitreOriginal");

  let okTmdb = false;
  let okLetterboxd = false;

  let commentaireTmdb = "";
  let commentaireLetterboxd = "";

  // Correctif V4.5.8 : URLBandeAnnonce fait maintenant partie des champs
  // qui définissent une fiche "incomplète". Avant ce correctif, une fiche
  // déjà pourvue d'affiche/synopsis/réalisateur/note/durée mais sans
  // bande-annonce ne déclenchait plus jamais de nouvel appel TMDb, même
  // après avoir vidé EtatEnrichissement/StatutEnrichissement (bouton
  // "Bandes-annonces manquantes" côté app) — le correctif corrige ce point
  // précis, sans toucher au reste du comportement.
  const tmdbIncomplet =
    !tmdbId ||
    !imdbId ||
    !get_(row, h, "Affiche") ||
    !get_(row, h, "Synopsis") ||
    !get_(row, h, "Réalisateur") ||
    !get_(row, h, "NoteTMDb") ||
    !get_(row, h, "DureeMinutes") ||
    !get_(row, h, "URLBandeAnnonce");

  if (
    modeRevision ||
    identiteModifiee ||
    tmdbIncomplet
  ) {
    const conserverTmdbIdSaisi =
      !identiteModifiee ||
      analyseIdentite.tmdbIdModifie ||
      !analyseIdentite.champsRechercheModifies;

    const tmdbIdRecherche =
      conserverTmdbIdSaisi
        ? tmdbId
        : "";

    const tmdb =
      chercherTMDb_(
        titre,
        annee,
        type,
        realisateurActuel,
        tmdbIdRecherche
      );

    if (
      tmdb &&
      tmdb.valide
    ) {
      ecrireResultatTmdbV4_(
        sheet,
        rowNumber,
        h,
        tmdb,
        forcerReecritureTmdb,
        tmdbId
      );

      tmdbId = tmdb.tmdbId;
      imdbId = tmdb.imdbId;
      titreOriginal =
        tmdb.titreOriginal ||
        titreOriginal;
      okTmdb = true;

    } else {
      commentaireTmdb =
        tmdb && tmdb.commentaire
          ? tmdb.commentaire
          : "Aucun résultat TMDb fiable";

      setProtected_(
        sheet,
        rowNumber,
        h,
        "EtatIdentification",
        "A_VERIFIER_TMDB",
        { force: true }
      );
    }

  } else {
    okTmdb = true;
  }

  let urlLetterboxd =
    safeTrim_(
      get_(
        row,
        h,
        "URLLetterboxd"
      )
    );

  const noteLetterboxd =
    get_(row, h, "NoteLetterboxd");

  const votesLetterboxd =
    get_(row, h, "VotesLetterboxd");

  const letterboxdJustifie =
    estResultatLetterboxdJustifieV43_(
      urlLetterboxd,
      noteLetterboxd,
      votesLetterboxd
    );

  if (
    modeRevision ||
    identiteModifiee ||
    urlLetterboxdModifiee ||
    !letterboxdJustifie
  ) {
    const urlLetterboxdRecherche =
      identiteModifiee &&
      !analyseIdentite.conserverUrlLetterboxd
        ? ""
        : urlLetterboxd;

    const lb =
      chercherLetterboxd_(
        titre,
        annee,
        imdbId,
        urlLetterboxdRecherche,
        tmdbId,
        titreOriginal,
        type
      );

    if (
      lb &&
      !lb.erreur &&
      !lb.ignore
    ) {
      ecrireResultatLetterboxdV4_(
        sheet,
        rowNumber,
        h,
        lb
      );

      urlLetterboxd =
        safeTrim_(lb.url);

      okLetterboxd = true;

    } else if (
      lb &&
      lb.ignore
    ) {
      okLetterboxd = true;

    } else {
      commentaireLetterboxd =
        lb && lb.commentaire
          ? lb.commentaire
          : "Erreur technique Letterboxd";
    }

  } else {
    okLetterboxd = true;
  }

  let statut = "OK";
  let commentaireFinal = "";

  if (
    !okTmdb &&
    !okLetterboxd
  ) {
    statut = "A_VERIFIER";
    commentaireFinal =
      [
        commentaireTmdb,
        commentaireLetterboxd
      ]
        .filter(Boolean)
        .join(" | ");

  } else if (!okTmdb) {
    statut = "A_VERIFIER_TMDB";
    commentaireFinal =
      commentaireTmdb;

  } else if (!okLetterboxd) {
    statut =
      "A_VERIFIER_LETTERBOXD";

    commentaireFinal =
      commentaireLetterboxd;
  }

  finaliserEnrichissementV4_(
    sheet,
    rowNumber,
    h,
    statut,
    commentaireFinal,
    okTmdb
      && (
        !urlLetterboxdModifiee ||
        okLetterboxd
      )
      ? versionAvecEmpreinteV45_({
          titre: titre,
          annee: annee,
          type: type,
          tmdbId: tmdbId,
          imdbId: imdbId,
          urlLetterboxd: urlLetterboxd
        })
      : ""
  );

  Logger.log(
    "ENRICHISSEMENT | ligne " +
      rowNumber +
      " | " +
      titre +
      " | " +
      statut
  );

  return {
    statut: statut
  };
}



function ecrireResultatTmdbV4_(
  sheet,
  rowNumber,
  h,
  tmdb,
  forcerReecriture,
  ancienTmdbId
) {
  setProtected_(
    sheet,
    rowNumber,
    h,
    "Affiche",
    tmdb.affiche,
    { force: forcerReecriture }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "NoteTMDb",
    tmdb.note,
    { force: true }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "Casting",
    tmdb.casting,
    { force: forcerReecriture }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "Réalisateur",
    tmdb.realisateur,
    { force: forcerReecriture }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "Synopsis",
    tmdb.synopsis,
    { force: forcerReecriture }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "Duree",
    tmdb.duree,
    { force: forcerReecriture }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "URLBandeAnnonce",
    tmdb.bandeAnnonce,
    { force: forcerReecriture }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "DureeMinutes",
    tmdb.dureeMinutes,
    { force: true }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "Genre",
    tmdb.genre,
    { force: forcerReecriture }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "GenrePrincipal",
    tmdb.genrePrincipal,
    { force: forcerReecriture }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "TMDbID",
    tmdb.tmdbId,
    {
      force:
        forcerReecriture ||
        !ancienTmdbId
    }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "IMDbID",
    tmdb.imdbId,
    { force: true }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "TitreOriginal",
    tmdb.titreOriginal,
    { force: true }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "ScoreConfianceTMDb",
    tmdb.score,
    { force: true }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "EtatIdentification",
    "OK",
    { force: true }
  );
}



function ecrireResultatLetterboxdV4_(
  sheet,
  rowNumber,
  h,
  resultat
) {
  setProtected_(
    sheet,
    rowNumber,
    h,
    "URLLetterboxd",
    resultat.url,
    { force: true }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "NoteLetterboxd",
    resultat.note,
    { force: true }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "VotesLetterboxd",
    resultat.votes,
    { force: true }
  );
}



function finaliserEnrichissementV4_(
  sheet,
  rowNumber,
  h,
  statut,
  commentaire,
  versionAvecEmpreinte
) {
  setProtected_(
    sheet,
    rowNumber,
    h,
    "EtatEnrichissement",
    statut,
    { force: true }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "StatutEnrichissement",
    statut,
    { force: true }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "DateEnrichissement",
    new Date(),
    { force: true }
  );

  setProtected_(
    sheet,
    rowNumber,
    h,
    "DernierEnrichissement",
    new Date(),
    { force: true }
  );

  if (versionAvecEmpreinte) {
    setProtected_(
      sheet,
      rowNumber,
      h,
      "VersionEnrichissement",
      versionAvecEmpreinte,
      { force: true }
    );
  }

  if (statut === "OK") {
    setProtected_(
      sheet,
      rowNumber,
      h,
      "MessageEnrichissement",
      "Fiche enrichie automatiquement",
      { force: true }
    );

    setProtected_(
      sheet,
      rowNumber,
      h,
      "CommentaireIdentification",
      "",
      { force: true }
    );

  } else {
    setProtected_(
      sheet,
      rowNumber,
      h,
      "MessageEnrichissement",
      "Fiche à vérifier",
      { force: true }
    );

    setProtected_(
      sheet,
      rowNumber,
      h,
      "CommentaireIdentification",
      commentaire || "",
      { force: true }
    );
  }
}



function estFicheIncompleteV4_(
  row,
  h
) {
  const tmdbId =
    safeTrim_(get_(row, h, "TMDbID"));

  const etatIdentification =
    safeTrim_(get_(row, h, "EtatIdentification"));

  const urlLetterboxd =
    safeTrim_(
      get_(
        row,
        h,
        "URLLetterboxd"
      )
    );

  const noteLetterboxd =
    get_(row, h, "NoteLetterboxd");

  const votesLetterboxd =
    get_(row, h, "VotesLetterboxd");

  const letterboxdJustifie =
    estResultatLetterboxdJustifieV43_(
      urlLetterboxd,
      noteLetterboxd,
      votesLetterboxd
    );

  return !(
    tmdbId &&
    etatIdentification === "OK" &&
    letterboxdJustifie
  );
}



function enrichirNouvellesFichesV4() {
  try {
    const configuration =
      determinerModeEnrichissementInitialV457_();

    journal_(
      "ENRICHISSEMENT",
      "MODE_RATTRAPAGE_INITIAL",
      configuration.mode,
      "Stock=" +
        configuration.stock +
        " | lot=" +
        configuration.lot +
        " | seuil=" +
        SEUIL_RATTRAPAGE_ENRICHISSEMENT_INITIAL_V457 +
        " | lignes=" +
        (
          configuration.premiereLigne > 0
            ? configuration.premiereLigne +
              "-" +
              configuration.derniereLigne
            : "aucune"
        )
    );

    const succes =
      enrichirFilmsV4_(
        configuration.lot,
        false,
        false,
        DUREE_MAX_CYCLE_INITIAL_V457_MS
      );

    if (succes === true) {
      resoudreErreur_(
        "MAILS",
        "enrichirNouvellesFichesV4"
      );
    }

    return succes === true;

  } catch (err) {
    try {
      envoyerMailErreurScript_(
        err,
        "enrichirNouvellesFichesV4"
      );
    } catch (mailErr) {
      Logger.log(
        "Échec du mail d'erreur enrichirNouvellesFichesV4 : " +
        String(mailErr)
      );
    }

    throw err;
  }
}



function compterStockEnrichissementInitialV457_(data, h) {
  const resultat = {
    stock: 0,
    premiereLigne: 0,
    derniereLigne: 0
  };
  const maxTentatives = maxTentatives_();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const titre = cleanTitle_(get_(row, h, "Titre"));

    if (!titre) {
      continue;
    }

    const ficheIncomplete =
      estFicheIncompleteV4_(row, h);
    const analyse =
      analyserIdentiteEnrichissementV45_(row, h);
    const tmdbId =
      safeTrim_(get_(row, h, "TMDbID"));
    const etat =
      safeTrim_(get_(row, h, "EtatEnrichissement"));
    const version =
      safeTrim_(get_(row, h, "VersionEnrichissement"));
    const tentatives = Number(
      get_(row, h, "TentativesEnrichissement") || 0
    );

    const ficheComplete =
      !ficheIncomplete &&
      etat === "OK" &&
      (
        (
          analyse.empreintePresente &&
          !analyse.modifiee
        ) ||
        (
          !analyse.empreintePresente &&
          !!version
        )
      );

    if (ficheComplete) {
      continue;
    }

    if (
      !tmdbId &&
      tentatives >= maxTentatives &&
      etat !== "EN_ATTENTE" &&
      etat !== ""
    ) {
      continue;
    }

    const rowNumber = i + 1;
    resultat.stock++;

    if (resultat.premiereLigne === 0) {
      resultat.premiereLigne = rowNumber;
    }

    resultat.derniereLigne = rowNumber;
  }

  return resultat;
}



function tailleLotEnrichissementInitialV457_(stock) {
  return stock >
    SEUIL_RATTRAPAGE_ENRICHISSEMENT_INITIAL_V457
    ? LOT_ENRICHISSEMENT_INITIAL_RATTRAPAGE_V457
    : LOT_ENRICHISSEMENT_INITIAL_NORMAL_V457;
}



function determinerModeEnrichissementInitialV457_() {
  const sheet = getSheet_(SHEETS.FILMS);

  if (!sheet) {
    throw new Error("Feuille Films introuvable.");
  }

  const data = sheet.getDataRange().getValues();
  const h = data.length > 0 ? headers_(data[0]) : {};
  const stock =
    data.length > 1
      ? compterStockEnrichissementInitialV457_(data, h)
      : {
          stock: 0,
          premiereLigne: 0,
          derniereLigne: 0
        };
  const lot =
    tailleLotEnrichissementInitialV457_(stock.stock);

  return {
    stock: stock.stock,
    premiereLigne: stock.premiereLigne,
    derniereLigne: stock.derniereLigne,
    lot: lot,
    mode:
      lot === LOT_ENRICHISSEMENT_INITIAL_RATTRAPAGE_V457
        ? "ACCELERE"
        : "NORMAL"
  };
}



function testerModeRattrapageEnrichissementInitialV457() {
  const configuration =
    determinerModeEnrichissementInitialV457_();
  const passages =
    configuration.stock > 0
      ? Math.ceil(configuration.stock / configuration.lot)
      : 0;
  const minutesEstimees = passages * 5;

  Logger.log(
    "===== TEST RATTRAPAGE ENRICHISSEMENT INITIAL V4.5.7 ====="
  );
  Logger.log("Version : " + VERSION_ENRICHISSEMENT_V4);
  Logger.log(
    "Stock initial réellement éligible : " +
    configuration.stock
  );
  Logger.log(
    "Plage constatée : " +
    (
      configuration.premiereLigne > 0
        ? configuration.premiereLigne +
          " à " +
          configuration.derniereLigne
        : "aucune"
    )
  );
  Logger.log("Mode : " + configuration.mode);
  Logger.log("Taille maximale du lot : " + configuration.lot);
  Logger.log(
    "Arrêt de sécurité par cycle : " +
    Math.floor(DUREE_MAX_CYCLE_INITIAL_V457_MS / 1000) +
    " secondes"
  );
  Logger.log("Passages théoriques : " + passages);
  Logger.log(
    "Durée théorique minimale : " +
    minutesEstimees +
    " minutes"
  );
  Logger.log("TMDb + IMDb + Letterboxd concernés : OUI");
  Logger.log("Feuille Films modifiée : NON");
  Logger.log("Déclencheurs modifiés : NON");
  Logger.log("Test global : OK");
  Logger.log("===== FIN TEST RATTRAPAGE INITIAL =====");

  return {
    ok: true,
    version: VERSION_ENRICHISSEMENT_V4,
    stock: configuration.stock,
    premiereLigne: configuration.premiereLigne,
    derniereLigne: configuration.derniereLigne,
    mode: configuration.mode,
    lot: configuration.lot,
    passagesTheoriques: passages,
    minutesTheoriquesMinimales: minutesEstimees,
    feuilleFilmsModifiee: false,
    declencheursModifies: false
  };
}



function forcerReenrichissementFicheV451() {
  throw new Error(
    "Cette commande V4.5.1 utilisait une fenêtre indisponible depuis l'éditeur. " +
    "Pour Honey Don’t!, exécutez forcerReenrichissementHoneyDontV452."
  );
}



function forcerReenrichissementHoneyDontV452() {
  return forcerReenrichissementFicheParCleV452_(
    "https://letterboxd.com/film/honey-dont/"
  );
}



function forcerReenrichissementFicheParCleV452_(recherche) {
  recherche = safeTrim_(recherche);

  if (!recherche) {
    throw new Error("Aucun ID, titre ou URL Letterboxd fourni.");
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error("Un autre enrichissement est déjà en cours.");
  }

  try {
    const sheet = getSheet_(SHEETS.FILMS);
    const data = sheet.getDataRange().getValues();
    const h = headers_(data[0]);
    const rechercheMinuscule = recherche.toLocaleLowerCase();
    const correspondances = [];

    for (let i = 1; i < data.length; i++) {
      const id = safeTrim_(get_(data[i], h, "IDFilm"));
      const titre = safeTrim_(get_(data[i], h, "Titre"));
      const urlLetterboxd = safeTrim_(get_(data[i], h, "URLLetterboxd"));

      if (
        id === recherche ||
        titre.toLocaleLowerCase() === rechercheMinuscule ||
        urlLetterboxd.toLocaleLowerCase() === rechercheMinuscule
      ) {
        correspondances.push(i);
      }
    }

    if (correspondances.length === 0) {
      throw new Error("Aucune fiche trouvée pour : " + recherche);
    }

    if (correspondances.length > 1) {
      throw new Error(
        "Plusieurs fiches correspondent. Utilisez une clé unique (IDFilm ou URL)."
      );
    }

    const index = correspondances[0];
    const row = data[index];
    const rowNumber = index + 1;
    const analyse = analyserIdentiteEnrichissementV45_(row, h);

    analyse.modifiee = true;
    analyse.identiteModifiee = true;
    analyse.champsRechercheModifies = true;
    analyse.conserverUrlLetterboxd =
      estUrlLetterboxdReelleV43_(
        safeTrim_(get_(row, h, "URLLetterboxd"))
      );

    preparerLigneEnrichissementV4_(
      sheet,
      rowNumber,
      row,
      h,
      true
    );

    const resultat = enrichirUneLigneV4_(
      sheet,
      rowNumber,
      row,
      h,
      false,
      analyse
    );

    const statut =
      resultat && resultat.statut ? resultat.statut : "À vérifier";

    Logger.log(
      "RÉENRICHISSEMENT TERMINÉ | " +
      safeTrim_(get_(row, h, "IDFilm")) + " | " +
      safeTrim_(get_(row, h, "Titre")) + " | statut=" + statut
    );

    return resultat;

  } finally {
    lock.releaseLock();
  }
}



function simulerMigrationEmpreintesEnrichissementV45() {
  migrerEmpreintesEnrichissementV45_(false);
}



function initialiserEmpreintesEnrichissementV45() {
  migrerEmpreintesEnrichissementV45_(true);
}



function simulerMigrationEmpreintesEnrichissementV451() {
  migrerEmpreintesEnrichissementV45_(false);
}



function migrerEmpreintesEnrichissementV451() {
  migrerEmpreintesEnrichissementV45_(true);
}



function simulerMigrationEmpreintesEnrichissementV453() {
  migrerEmpreintesEnrichissementV45_(false);
}



function migrerEmpreintesEnrichissementV453() {
  migrerEmpreintesEnrichissementV45_(true);
}



function migrerEmpreintesEnrichissementV45_(ecrire) {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error("Un autre enrichissement est déjà en cours.");
  }

  try {
    const sheet = getSheet_(SHEETS.FILMS);

    if (!sheet) {
      throw new Error("Feuille Films introuvable");
    }

    const data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      Logger.log("Aucune fiche à analyser.");
      return;
    }

    const h = headers_(data[0]);
    let analysees = 0;
    let eligibles = 0;
    let dejaInitialisees = 0;
    let initialisees = 0;
    let ignorees = 0;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const titre = safeTrim_(get_(row, h, "Titre"));

      if (!titre) {
        continue;
      }

      analysees++;

      const tmdbId = safeTrim_(get_(row, h, "TMDbID"));
      const identification = safeTrim_(
        get_(row, h, "EtatIdentification")
      ).toUpperCase();
      const etatEnrichissement = safeTrim_(
        get_(row, h, "EtatEnrichissement")
      ).toUpperCase();
      const statutEnrichissement = safeTrim_(
        get_(row, h, "StatutEnrichissement")
      ).toUpperCase();

      if (
        !tmdbId ||
        identification !== "OK" ||
        (
          etatEnrichissement !== "OK" &&
          statutEnrichissement !== "OK"
        )
      ) {
        ignorees++;
        continue;
      }

      eligibles++;

      const analyse = analyserIdentiteEnrichissementV45_(row, h);

      if (
        analyse.empreintePresente &&
        analyse.empreinteAvecUrl
      ) {
        dejaInitialisees++;
        continue;
      }

      if (ecrire) {
        setProtected_(
          sheet,
          i + 1,
          h,
          "VersionEnrichissement",
          versionAvecEmpreinteV45_(analyse.identite),
          { force: true }
        );
      }

      initialisees++;
    }

    Logger.log("===== MIGRATION EMPREINTES ENRICHISSEMENT V4.5.3 =====");
    Logger.log("Mode : " + (ecrire ? "ÉCRITURE" : "SIMULATION"));
    Logger.log("Fiches analysées : " + analysees);
    Logger.log("Fiches éligibles : " + eligibles);
    Logger.log("Déjà initialisées : " + dejaInitialisees);
    Logger.log(
      (ecrire ? "Initialisées : " : "À initialiser : ") +
      initialisees
    );
    Logger.log("Ignorées car non finalisées : " + ignorees);
    if (!ecrire) {
      Logger.log("AUCUNE ÉCRITURE EFFECTUÉE");
    }
    Logger.log("AUCUN APPEL EXTERNE EFFECTUÉ");
    Logger.log("===== FIN MIGRATION EMPREINTES V4.5.3 =====");

  } finally {
    lock.releaseLock();
  }
}



function simulerRelectureLetterboxdMegalopolisV453() {
  const cible =
    trouverFicheParIdentifiantV453_("FILM0293");

  const row = cible.row;
  const h = cible.h;
  const analyse =
    analyserIdentiteEnrichissementV45_(row, h);

  Logger.log("===== SIMULATION RELECTURE LETTERBOXD MEGALOPOLIS V4.5.3 =====");
  Logger.log("Mode : LECTURE SEULE");
  Logger.log("Ligne Films : " + cible.rowNumber);
  Logger.log("Identifiant : " + cible.id);
  Logger.log("Titre : " + safeTrim_(get_(row, h, "Titre")));
  Logger.log("Année : " + safeTrim_(get_(row, h, "Annee")));
  Logger.log(
    "URLLetterboxd : " +
    safeTrim_(get_(row, h, "URLLetterboxd"))
  );
  Logger.log(
    "Note actuelle : " +
    safeTrim_(get_(row, h, "NoteLetterboxd"))
  );
  Logger.log(
    "Votes actuels : " +
    safeTrim_(get_(row, h, "VotesLetterboxd"))
  );
  Logger.log(
    "Empreinte avec URL : " +
    (analyse.empreinteAvecUrl ? "OUI" : "NON")
  );
  Logger.log("TMDb appelé : NON");
  Logger.log("Letterboxd appelé : NON");
  Logger.log("AUCUNE ÉCRITURE EFFECTUÉE");
  Logger.log("Relecture ciblée autorisée : OUI");
  Logger.log("===== FIN SIMULATION MEGALOPOLIS =====");
}



function appliquerRelectureLetterboxdMegalopolisV453() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error("Un autre enrichissement est déjà en cours.");
  }

  try {
    const cible =
      trouverFicheParIdentifiantV453_("FILM0293");

    const sheet = cible.sheet;
    const row = cible.row;
    const rowNumber = cible.rowNumber;
    const h = cible.h;

    const titre =
      cleanTitle_(get_(row, h, "Titre"));
    const annee =
      get_(row, h, "Annee");
    const imdbId =
      safeTrim_(get_(row, h, "IMDbID"));
    const urlAvant =
      safeTrim_(get_(row, h, "URLLetterboxd"));
    const noteAvant =
      get_(row, h, "NoteLetterboxd");
    const votesAvant =
      get_(row, h, "VotesLetterboxd");

    if (
      normalizeText_(titre) !==
      normalizeText_("Megalopolis")
    ) {
      throw new Error(
        "FILM0293 ne correspond pas à Megalopolis."
      );
    }

    if (!estUrlLetterboxdReelleV43_(urlAvant)) {
      throw new Error(
        "URL Letterboxd réelle absente pour FILM0293."
      );
    }

    const resultat =
      chercherLetterboxd_(
        titre,
        annee,
        imdbId,
        urlAvant
      );

    if (
      !resultat ||
      resultat.erreur ||
      resultat.ignore
    ) {
      throw new Error(
        resultat && resultat.commentaire
          ? resultat.commentaire
          : "Relecture Letterboxd non concluante."
      );
    }

    ecrireResultatLetterboxdV4_(
      sheet,
      rowNumber,
      h,
      resultat
    );

    const etatIdentification =
      safeTrim_(
        get_(row, h, "EtatIdentification")
      );

    const statut =
      etatIdentification === "OK"
        ? "OK"
        : "A_VERIFIER_TMDB";

    finaliserEnrichissementV4_(
      sheet,
      rowNumber,
      h,
      statut,
      statut === "OK"
        ? ""
        : safeTrim_(
            get_(
              row,
              h,
              "CommentaireIdentification"
            )
          ),
      versionAvecEmpreinteV45_({
        titre: titre,
        annee: annee,
        type: get_(row, h, "Type"),
        tmdbId: get_(row, h, "TMDbID"),
        imdbId: imdbId,
        urlLetterboxd: resultat.url
      })
    );

    SpreadsheetApp.flush();

    Logger.log("===== RELECTURE LETTERBOXD MEGALOPOLIS V4.5.3 =====");
    Logger.log("Mode : ÉCRITURE CIBLÉE");
    Logger.log("Ligne Films : " + rowNumber);
    Logger.log("Identifiant : " + cible.id);
    Logger.log("URL avant : " + urlAvant);
    Logger.log("URL après : " + safeTrim_(resultat.url));
    Logger.log("Note avant : " + safeTrim_(noteAvant));
    Logger.log("Note après : " + safeTrim_(resultat.note));
    Logger.log("Votes avant : " + safeTrim_(votesAvant));
    Logger.log("Votes après : " + safeTrim_(resultat.votes));
    Logger.log("TMDb appelé : NON");
    Logger.log("Lignes traitées : 1");
    Logger.log("Statut final : " + statut);
    Logger.log("===== FIN RELECTURE MEGALOPOLIS =====");

    return {
      statut: statut,
      url: resultat.url,
      note: resultat.note,
      votes: resultat.votes
    };

  } finally {
    lock.releaseLock();
  }
}



function trouverFicheParIdentifiantV453_(identifiantRecherche) {
  const sheet =
    getSheet_(SHEETS.FILMS);

  if (!sheet) {
    throw new Error("Feuille Films introuvable.");
  }

  const data =
    sheet.getDataRange().getValues();

  if (data.length < 2) {
    throw new Error("Feuille Films vide.");
  }

  const h = headers_(data[0]);
  const correspondances = [];

  for (let i = 1; i < data.length; i++) {
    const id =
      safeTrim_(
        get_(data[i], h, "ID") ||
        get_(data[i], h, "IDFilm")
      );

    if (id === identifiantRecherche) {
      correspondances.push({
        sheet: sheet,
        row: data[i],
        rowNumber: i + 1,
        h: h,
        id: id
      });
    }
  }

  if (correspondances.length !== 1) {
    throw new Error(
      "Nombre de fiches trouvées pour " +
      identifiantRecherche +
      " : " +
      correspondances.length
    );
  }

  return correspondances[0];
}



function enrichirLetterboxdEnAttenteV4() {
  const lock =
    LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    journal_(
      "LETTERBOXD",
      "EN_ATTENTE",
      "IGNORE",
      "Un autre enrichissement est déjà en cours"
    );

    return;
  }

  try {
    const sheet =
      getSheet_(SHEETS.FILMS);

    if (!sheet) {
      erreur_(
        "LETTERBOXD",
        "EN_ATTENTE",
        "Feuille Films introuvable",
        ""
      );

      return;
    }

    resoudreErreur_(
      "LETTERBOXD",
      "EN_ATTENTE",
      "Feuille Films introuvable"
    );

    const data =
      sheet.getDataRange().getValues();

    if (data.length < 2) {
      return;
    }

    const h = headers_(data[0]);
    const stockRattrapage =
      compterStockRattrapageLetterboxdV456_(data, h);
    const maxParPassage =
      tailleLotLetterboxdV456_(stockRattrapage);
    const modeRattrapage =
      maxParPassage === LOT_LETTERBOXD_RATTRAPAGE_V456;

    journal_(
      "LETTERBOXD",
      "MODE_RATTRAPAGE",
      modeRattrapage ? "ACCELERE" : "NORMAL",
      "Stock=" +
        stockRattrapage +
        " | lot=" +
        maxParPassage +
        " | seuil=" +
        SEUIL_RATTRAPAGE_LETTERBOXD_V456
    );

    let traites = 0;
    let nettoyes = 0;
    let ok = 0;
    let aVerifier = 0;
    let erreurs = 0;

    for (
      let i = data.length - 1;
      i >= 1;
      i--
    ) {
      if (
        traites >= maxParPassage
      ) {
        break;
      }

      const row = data[i];
      const rowNumber = i + 1;

      const titre =
        cleanTitle_(
          get_(row, h, "Titre")
        );

      if (!titre) {
        continue;
      }

      const annee =
        get_(row, h, "Annee");

      const imdbId =
        safeTrim_(
          get_(row, h, "IMDbID")
        );

      const tmdbId =
        safeTrim_(
          get_(row, h, "TMDbID")
        );

      const type =
        get_(row, h, "Type");

      const titreOriginal =
        cleanTitle_(
          get_(row, h, "TitreOriginal")
        );

      if (!imdbId && !tmdbId) {
        continue;
      }

      const url =
        safeTrim_(
          get_(
            row,
            h,
            "URLLetterboxd"
          )
        );

      const note =
        get_(
          row,
          h,
          "NoteLetterboxd"
        );

      const votes =
        get_(
          row,
          h,
          "VotesLetterboxd"
        );

      const commentaire =
        safeTrim_(
          get_(
            row,
            h,
            "CommentaireIdentification"
          )
        );

      const etatIdentification =
        safeTrim_(
          get_(
            row,
            h,
            "EtatIdentification"
          )
        );

      const problemeTmdb =
        etatIdentification ===
        "A_VERIFIER_TMDB";

      const commentaireLbObsolete =
        /letterboxd/i.test(
          commentaire
        );

      const completReel =
        estUrlLetterboxdReelleV43_(url) &&
        estNoteLetterboxdReelleV43_(note) &&
        estVotesLetterboxdReelV43_(votes);

      const aRecontroler =
        doitRecontrolerLetterboxdV43_(
          url,
          note,
          votes
        );

      const versionEnrichissement =
        safeTrim_(
          get_(
            row,
            h,
            "VersionEnrichissement"
          )
        );

      const repriseRaccordementV455 =
        aRecontroler &&
        !estUrlLetterboxdReelleV43_(url) &&
        !estRaccordementAmelioreTraiteV456_(
          versionEnrichissement
        );

      if (completReel) {
        if (
          commentaireLbObsolete &&
          !problemeTmdb
        ) {
          finaliserEnrichissementV4_(
            sheet,
            rowNumber,
            h,
            "OK",
            ""
          );

          nettoyes++;

          journal_(
            "LETTERBOXD",
            "NETTOYAGE_COMMENTAIRE",
            "OK",
            titre +
              " | ligne=" +
              rowNumber
          );
        }

        continue;
      }

      const etatEnrichissement =
        safeTrim_(
          get_(
            row,
            h,
            "EtatEnrichissement"
          )
        );

      const dernier =
        get_(
          row,
          h,
          "DernierEnrichissement"
        );

      if (
        aRecontroler &&
        !estUrlLetterboxdReelleV43_(url) &&
        moinsDe24HeuresV4_(dernier) &&
        !repriseRaccordementV455
      ) {
        continue;
      }

      const ancienMessageLetterboxd =
        /url letterboxd manquante/i.test(commentaire);

      const echecAutomatiqueRecent =
        !url &&
        etatEnrichissement === "A_VERIFIER_LETTERBOXD" &&
        !ancienMessageLetterboxd &&
        moinsDe24HeuresV4_(dernier) &&
        !repriseRaccordementV455;

      if (echecAutomatiqueRecent) {
        continue;
      }

      try {
        const resultat =
          chercherLetterboxd_(
            titre,
            annee,
            imdbId,
            url,
            tmdbId,
            titreOriginal,
            type
          );

        traites++;

        if (
          resultat &&
          !resultat.erreur &&
          !resultat.ignore
        ) {
          ecrireResultatLetterboxdV4_(
            sheet,
            rowNumber,
            h,
            resultat
          );

          if (problemeTmdb) {
            finaliserEnrichissementV4_(
              sheet,
              rowNumber,
              h,
              "A_VERIFIER_TMDB",
              commentaire
            );

            aVerifier++;

          } else {
            finaliserEnrichissementV4_(
              sheet,
              rowNumber,
              h,
              "OK",
              ""
            );

            ok++;
          }

          journal_(
            "LETTERBOXD",
            url
              ? "URL_MANUELLE"
              : "RECHERCHE_AUTOMATIQUE",
            resultat.donneesAbsentes
              ? "SANS_DONNEE"
              : "OK",
            titre +
              " | ligne=" +
              rowNumber +
              " | note=" +
              resultat.note +
              " | votes=" +
              resultat.votes
          );

          resoudreErreur_(
            "LETTERBOXD",
            "EN_ATTENTE",
            titre
          );

        } else {
          aVerifier++;

          finaliserEnrichissementV4_(
            sheet,
            rowNumber,
            h,
            problemeTmdb
              ? "A_VERIFIER"
              : "A_VERIFIER_LETTERBOXD",
            resultat &&
            resultat.commentaire
              ? resultat.commentaire
              : "URL Letterboxd non trouvée automatiquement"
          );

          journal_(
            "LETTERBOXD",
            url
              ? "URL_MANUELLE"
              : "RECHERCHE_AUTOMATIQUE",
            "A_VERIFIER",
            titre +
              " | ligne=" +
              rowNumber
          );
        }

      } catch (e) {
        traites++;
        erreurs++;

        erreur_(
          "LETTERBOXD",
          "EN_ATTENTE",
          titre,
          String(e)
        );
      }

      Utilities.sleep(350);
    }

    if (
      traites > 0 ||
      nettoyes > 0
    ) {
      journal_(
        "LETTERBOXD",
        "EN_ATTENTE",
        "TERMINE",
        "Traités=" +
          traites +
          " | Nettoyés=" +
          nettoyes +
          " | OK=" +
          ok +
          " | À vérifier=" +
          aVerifier +
          " | Erreurs=" +
          erreurs
      );
    }

  } finally {
    lock.releaseLock();
  }
}



function moinsDe24HeuresV4_(valeur) {
  if (!valeur) {
    return false;
  }

  let date = null;

  if (
    Object.prototype.toString.call(
      valeur
    ) === "[object Date]"
  ) {
    date = valeur;

  } else if (
    typeof valeur === "number"
  ) {
    date = new Date(
      Math.round(
        (valeur - 25569) *
        86400 *
        1000
      )
    );

  } else {
    date = new Date(valeur);
  }

  if (
    !date ||
    isNaN(date.getTime())
  ) {
    return false;
  }

  return (
    new Date().getTime() -
    date.getTime()
  ) < 24 * 60 * 60 * 1000;
}



function estRaccordementAmelioreTraiteV456_(version) {
  const valeur = safeTrim_(version);
  const versions = [
    VERSION_ENRICHISSEMENT_V4,
    VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_6,
    VERSION_EMPREINTE_ENRICHISSEMENT_PRECEDENTE_5
  ];

  return versions.some(function(numeroVersion) {
    return valeur.indexOf(
      numeroVersion +
      SEPARATEUR_EMPREINTE_ENRICHISSEMENT_V45
    ) === 0;
  });
}



function compterStockRattrapageLetterboxdV456_(data, h) {
  let stock = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const titre = cleanTitle_(get_(row, h, "Titre"));

    if (!titre) {
      continue;
    }

    const imdbId = safeTrim_(get_(row, h, "IMDbID"));
    const tmdbId = safeTrim_(get_(row, h, "TMDbID"));

    if (!imdbId && !tmdbId) {
      continue;
    }

    const url = safeTrim_(get_(row, h, "URLLetterboxd"));
    const note = get_(row, h, "NoteLetterboxd");
    const votes = get_(row, h, "VotesLetterboxd");
    const version = safeTrim_(
      get_(row, h, "VersionEnrichissement")
    );

    if (
      doitRecontrolerLetterboxdV43_(url, note, votes) &&
      !estUrlLetterboxdReelleV43_(url) &&
      !estRaccordementAmelioreTraiteV456_(version)
    ) {
      stock++;
    }
  }

  return stock;
}



function tailleLotLetterboxdV456_(stock) {
  return stock > SEUIL_RATTRAPAGE_LETTERBOXD_V456
    ? LOT_LETTERBOXD_RATTRAPAGE_V456
    : LOT_LETTERBOXD_NORMAL_V456;
}



function testerModeRattrapageLetterboxdV456() {
  const sheet = getSheet_(SHEETS.FILMS);

  if (!sheet) {
    throw new Error("Feuille Films introuvable.");
  }

  const data = sheet.getDataRange().getValues();
  const h = data.length > 0 ? headers_(data[0]) : {};
  const stock =
    data.length > 1
      ? compterStockRattrapageLetterboxdV456_(data, h)
      : 0;
  const lot = tailleLotLetterboxdV456_(stock);
  const mode =
    lot === LOT_LETTERBOXD_RATTRAPAGE_V456
      ? "ACCELERE"
      : "NORMAL";
  const passages = stock > 0 ? Math.ceil(stock / lot) : 0;
  const minutesEstimees = passages * 5;

  Logger.log(
    "===== TEST MODE RATTRAPAGE LETTERBOXD V4.5.6 ====="
  );
  Logger.log("Version : " + VERSION_ENRICHISSEMENT_V4);
  Logger.log("Stock à reprendre : " + stock);
  Logger.log("Mode : " + mode);
  Logger.log("Taille du lot : " + lot);
  Logger.log("Passages estimés : " + passages);
  Logger.log("Durée estimée : " + minutesEstimees + " minutes");
  Logger.log("Feuille Films modifiée : NON");
  Logger.log("Déclencheurs modifiés : NON");
  Logger.log("Test global : OK");
  Logger.log("===== FIN TEST MODE RATTRAPAGE =====");

  return {
    ok: true,
    version: VERSION_ENRICHISSEMENT_V4,
    stock: stock,
    mode: mode,
    lot: lot,
    passagesEstimes: passages,
    minutesEstimees: minutesEstimees,
    feuilleFilmsModifiee: false,
    declencheursModifies: false
  };
}



function reinitialiserBandesAnnoncesManquantesV1(limite) {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName("Films");

  const data = sheet.getDataRange().getValues();
  const h = headers_(data[0]);

  let marquees = 0;
  let dejaOk = 0;
  let ignoreesPasEncoreEnrichies = 0;

  for (let i = 1; i < data.length; i++) {
    if (limite && marquees >= limite) break;

    const row = data[i];
    if (!row[0]) continue;

    const etat = String(get_(row, h, "EtatEnrichissement") || "").trim();
    const bandeAnnonce = String(get_(row, h, "URLBandeAnnonce") || "").trim();

    if (bandeAnnonce) {
      dejaOk++;
      continue;
    }
    if (etat !== "OK") {
      ignoreesPasEncoreEnrichies++;
      continue;
    }

    const rowNumber = i + 1;
    set_(sheet, rowNumber, h, "EtatEnrichissement", "");
    set_(sheet, rowNumber, h, "StatutEnrichissement", "");
    marquees++;
  }

  Logger.log(
    "Fiches remises en file pour récupérer leur bande-annonce : " + marquees +
    " | déjà pourvues : " + dejaOk +
    " | pas encore enrichies (déjà dans le circuit normal) : " + ignoreesPasEncoreEnrichies
  );

  return {
    marquees: marquees,
    dejaPourvues: dejaOk,
    pasEncoreEnrichies: ignoreesPasEncoreEnrichies
  };
}


