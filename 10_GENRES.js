/**
 * ============================================================
 * CinéMaison V4
 * Script  : 10_GENRES.gs
 * Rôle    : Synchronisation automatique de la liste des genres
 * Version : 1.2.0
 * ============================================================
 *
 * SOURCES
 * -------
 * Films[Genre]
 * Films[GenrePrincipal]
 *
 * DESTINATION
 * -----------
 * Genres[Genre]
 * Genres[Icone]
 * Genres[Ordre]
 *
 * PRINCIPES
 * ----------
 * - Un genre simple = une ligne.
 * - Découpage automatique sur : /  &  ,  ;  |  retours ligne.
 * - Aucune combinaison du type "Action & Aventure" n'est conservée.
 * - Suppression des doublons sans tenir compte des accents/majuscules.
 * - Conservation des icônes existantes.
 * - Attribution automatique d'une icône aux nouveaux genres.
 * - Conservation prioritaire de l'ordre existant.
 * - Aucun genre existant n'est supprimé automatiquement.
 * - Aucune modification de la feuille Films.
 * - La colonne virtuelle AppSheet LibelleAffichage reste calculée
 *   dans AppSheet et n'est jamais écrite par ce script.
 * - Le déclencheur est géré exclusivement par 08_DECLENCHEURS.gs.
 * ============================================================
 */


const GENRES_V11 = Object.freeze({
  VERSION: "1.2.0",


  FEUILLE_FILMS: "Films",
  FEUILLE_GENRES: "Genres",


  COLONNE_FILMS_GENRE: "Genre",
  COLONNE_FILMS_GENRE_PRINCIPAL: "GenrePrincipal",


  ENTETE_GENRE: "Genre",
  ENTETE_ICONE: "Icone",
  ENTETE_ORDRE: "Ordre",


  ICONE_PAR_DEFAUT: "🎬",


  // Un genre multiple est découpé sur :
  // /  &  ,  ;  |  retours ligne
  REGEX_SEPARATEURS: /[\/&,;|\n\r]+/
});




/**
 * ============================================================
 * Référentiel interne officiel des genres et icônes
 * ============================================================
 */
const REFERENTIEL_GENRES_V11 = Object.freeze({
  "action": { nom: "Action", icone: "💣" },
  "animation": { nom: "Animation", icone: "🧚" },
  "aventure": { nom: "Aventure", icone: "🧭" },
  "biopic": { nom: "Biopic", icone: "🎭" },
  "comedie": { nom: "Comédie", icone: "😂" },
  "comedie dramatique": { nom: "Comédie dramatique", icone: "🎭" },
  "concert": { nom: "Concert", icone: "🎤" },
  "crime": { nom: "Crime", icone: "🔪" },
  "documentaire": { nom: "Documentaire", icone: "🎥" },
  "drame": { nom: "Drame", icone: "🎭" },
  "espionnage": { nom: "Espionnage", icone: "🕵️" },
  "familial": { nom: "Familial", icone: "👨‍👩‍👧‍👦" },
  "famille": { nom: "Familial", icone: "👨‍👩‍👧‍👦" },
  "fantastique": { nom: "Fantastique", icone: "🧙" },
  "guerre": { nom: "Guerre", icone: "🪖" },
  "histoire": { nom: "Histoire", icone: "📜" },
  "historique": { nom: "Histoire", icone: "📜" },
  "horreur": { nom: "Horreur", icone: "🧟" },
  "musical": { nom: "Musique", icone: "🎶" },
  "musique": { nom: "Musique", icone: "🎶" },
  "mystere": { nom: "Mystère", icone: "🕵️" },
  "policier": { nom: "Policier", icone: "🚔" },
  "romance": { nom: "Romance", icone: "❤️" },
  "science fiction": { nom: "Science-Fiction", icone: "🛸" },
  "sciencefiction": { nom: "Science-Fiction", icone: "🛸" },
  "sci fi": { nom: "Science-Fiction", icone: "🛸" },
  "scifi": { nom: "Science-Fiction", icone: "🛸" },
  "sport": { nom: "Sport", icone: "⚽" },
  "telefilm": { nom: "Téléfilm", icone: "📺" },
  "thriller": { nom: "Thriller", icone: "💥" },
  "western": { nom: "Western", icone: "🤠" },


  // Variantes anglaises
  "adventure": { nom: "Aventure", icone: "🧭" },
  "comedy": { nom: "Comédie", icone: "😂" },
  "documentary": { nom: "Documentaire", icone: "🎥" },
  "drama": { nom: "Drame", icone: "🎭" },
  "family": { nom: "Familial", icone: "👨‍👩‍👧‍👦" },
  "fantasy": { nom: "Fantastique", icone: "🧙" },
  "history": { nom: "Histoire", icone: "📜" },
  "horror": { nom: "Horreur", icone: "🧟" },
  "music": { nom: "Musique", icone: "🎶" },
  "mystery": { nom: "Mystère", icone: "🕵️" },
  "tv movie": { nom: "Téléfilm", icone: "📺" },
  "war": { nom: "Guerre", icone: "🪖" }
});




/**
 * ============================================================
 * Fonction principale
 * ============================================================
 */
function synchroniserGenresV4() {
  const lock = LockService.getScriptLock();


  if (!lock.tryLock(30000)) {
    journalGenresV11_(
      "IGNORE",
      "Une synchronisation des genres est déjà en cours"
    );


    return {
      ok: false,
      ignore: true,
      version: GENRES_V11.VERSION,
      message: "Synchronisation déjà en cours"
    };
  }


  try {
    const classeur = SpreadsheetApp.getActiveSpreadsheet();


    const feuilleFilms = classeur.getSheetByName(
      GENRES_V11.FEUILLE_FILMS
    );


    const feuilleGenres = classeur.getSheetByName(
      GENRES_V11.FEUILLE_GENRES
    );


    if (!feuilleFilms) {
      throw new Error(
        "Feuille introuvable : " + GENRES_V11.FEUILLE_FILMS
      );
    }


    if (!feuilleGenres) {
      throw new Error(
        "Feuille introuvable : " + GENRES_V11.FEUILLE_GENRES
      );
    }


    const genresDetectes = extraireGenresFilmsV11_(feuilleFilms);
    const genresExistants = lireGenresExistantsV11_(feuilleGenres);


    const resultat = fusionnerGenresV11_(
      genresDetectes,
      genresExistants
    );


    ecrireGenresV11_(
      feuilleGenres,
      resultat.lignes
    );


    const message =
      "Genres détectés=" + genresDetectes.length +
      " | Existants=" + genresExistants.length +
      " | Ajoutés=" + resultat.ajoutes.length +
      " | Total=" + resultat.lignes.length +
      (
        resultat.ajoutes.length
          ? " | Nouveaux=" + resultat.ajoutes.join(", ")
          : ""
      );


    journalGenresV11_("OK", message);


    // La lecture, la fusion et l'écriture de la table Genres ont toutes
    // abouti : les anciennes erreurs de cette synchronisation sont closes.
    resoudreErreur_("GENRES", "synchroniserGenresV4");


    return {
      ok: true,
      version: GENRES_V11.VERSION,
      genresDetectes: genresDetectes.length,
      genresExistants: genresExistants.length,
      genresAjoutes: resultat.ajoutes,
      totalGenres: resultat.lignes.length
    };


  } catch (e) {
    journalGenresV11_("ERREUR", String(e));
    enregistrerErreurGenresV11_(e);
    throw e;


  } finally {
    lock.releaseLock();
  }
}




/**
 * ============================================================
 * Extraction depuis Films
 * ============================================================
 */
function extraireGenresFilmsV11_(feuilleFilms) {
  const data = feuilleFilms.getDataRange().getDisplayValues();


  if (data.length < 2) {
    return [];
  }


  const headers = creerIndexEntetesGenresV11_(data[0]);


  const indexGenre = headers[
    normaliserCleGenreV11_(GENRES_V11.COLONNE_FILMS_GENRE)
  ];


  const indexGenrePrincipal = headers[
    normaliserCleGenreV11_(GENRES_V11.COLONNE_FILMS_GENRE_PRINCIPAL)
  ];


  if (
    indexGenre === undefined &&
    indexGenrePrincipal === undefined
  ) {
    throw new Error(
      "Colonnes Genre et GenrePrincipal introuvables dans Films"
    );
  }


  const genresParCle = {};


  for (let i = 1; i < data.length; i++) {
    const row = data[i];


    if (indexGenre !== undefined) {
      ajouterGenresDepuisTexteV11_(
        genresParCle,
        row[indexGenre]
      );
    }


    if (indexGenrePrincipal !== undefined) {
      ajouterGenresDepuisTexteV11_(
        genresParCle,
        row[indexGenrePrincipal]
      );
    }
  }


  return Object.keys(genresParCle)
    .map(function(cle) {
      return genresParCle[cle];
    })
    .sort(function(a, b) {
      return a.localeCompare(
        b,
        "fr",
        { sensitivity: "base" }
      );
    });
}




/**
 * Découpe les genres multiples et ne conserve qu'un genre simple.
 */
function ajouterGenresDepuisTexteV11_(genresParCle, texte) {
  if (!texte) {
    return;
  }


  const morceaux = String(texte)
    .split(GENRES_V11.REGEX_SEPARATEURS)
    .map(function(valeur) {
      return nettoyerNomGenreV11_(valeur);
    })
    .filter(Boolean);


  morceaux.forEach(function(genreBrut) {
    const infoGenre = obtenirGenreOfficielV11_(genreBrut);


    if (!infoGenre.nom) {
      return;
    }


    const cle = normaliserCleGenreV11_(infoGenre.nom);


    if (!genresParCle[cle]) {
      genresParCle[cle] = infoGenre.nom;
    }
  });
}




/**
 * ============================================================
 * Lecture de la feuille Genres
 * ============================================================
 */
function lireGenresExistantsV11_(feuilleGenres) {
  const data = feuilleGenres.getDataRange().getDisplayValues();


  if (!data.length) {
    return [];
  }


  const headers = creerIndexEntetesGenresV11_(data[0]);


  const indexGenre = headers[
    normaliserCleGenreV11_(GENRES_V11.ENTETE_GENRE)
  ];


  const indexIcone = headers[
    normaliserCleGenreV11_(GENRES_V11.ENTETE_ICONE)
  ];


  const indexOrdre = headers[
    normaliserCleGenreV11_(GENRES_V11.ENTETE_ORDRE)
  ];


  if (indexGenre === undefined) {
    throw new Error(
      "Colonne Genre introuvable dans la feuille Genres"
    );
  }


  const resultats = [];
  const dejaVus = {};


  for (let i = 1; i < data.length; i++) {
    const texteGenre = nettoyerNomGenreV11_(
      data[i][indexGenre]
    );


    if (!texteGenre) {
      continue;
    }


    /**
     * Une ligne existante peut elle-même contenir une ancienne
     * combinaison comme "Action & Aventure".
     * On la découpe ici pour restaurer le principe :
     * un genre simple = une ligne.
     */
    const genresSimples = String(texteGenre)
      .split(GENRES_V11.REGEX_SEPARATEURS)
      .map(function(valeur) {
        return nettoyerNomGenreV11_(valeur);
      })
      .filter(Boolean);


    genresSimples.forEach(function(genreSimple, position) {
      const infoGenre = obtenirGenreOfficielV11_(genreSimple);
      const cle = normaliserCleGenreV11_(infoGenre.nom);


      if (!cle || dejaVus[cle]) {
        return;
      }


      dejaVus[cle] = true;


      resultats.push({
        genre: infoGenre.nom,


        /**
         * On conserve l'icône existante uniquement lorsque la ligne
         * contenait déjà un seul genre. Pour une ancienne combinaison,
         * le référentiel interne attribue la bonne icône à chaque genre.
         */
        icone:
          genresSimples.length === 1 &&
          indexIcone !== undefined
            ? String(data[i][indexIcone] || "").trim()
            : infoGenre.icone,


        ordre:
          indexOrdre !== undefined
            ? (Number(data[i][indexOrdre]) || 0) + position
            : 0
      });
    });
  }


  resultats.sort(function(a, b) {
    if (
      a.ordre &&
      b.ordre &&
      a.ordre !== b.ordre
    ) {
      return a.ordre - b.ordre;
    }


    if (a.ordre && !b.ordre) {
      return -1;
    }


    if (!a.ordre && b.ordre) {
      return 1;
    }


    return a.genre.localeCompare(
      b.genre,
      "fr",
      { sensitivity: "base" }
    );
  });


  return resultats;
}




/**
 * ============================================================
 * Fusion genres existants + nouveaux genres
 * ============================================================
 */
function fusionnerGenresV11_(genresDetectes, genresExistants) {
  const lignes = [];
  const genresConnus = {};
  const ajoutes = [];


  let prochainOrdre = 1;


  /**
   * 1. Conserve les genres existants simples et dédoublonnés.
   */
  genresExistants.forEach(function(element) {
    const infoGenre = obtenirGenreOfficielV11_(element.genre);
    const cle = normaliserCleGenreV11_(infoGenre.nom);


    if (!cle || genresConnus[cle]) {
      return;
    }


    const ordre =
      element.ordre > 0
        ? element.ordre
        : prochainOrdre;


    lignes.push({
      genre: infoGenre.nom,
      icone:
        element.icone ||
        infoGenre.icone ||
        GENRES_V11.ICONE_PAR_DEFAUT,
      ordre: ordre
    });


    genresConnus[cle] = true;
    prochainOrdre = Math.max(prochainOrdre, ordre + 1);
  });


  /**
   * 2. Ajoute uniquement les genres simples réellement absents.
   */
  genresDetectes.forEach(function(genreDetecte) {
    const infoGenre = obtenirGenreOfficielV11_(genreDetecte);
    const cle = normaliserCleGenreV11_(infoGenre.nom);


    if (!cle || genresConnus[cle]) {
      return;
    }


    lignes.push({
      genre: infoGenre.nom,
      icone:
        infoGenre.icone ||
        GENRES_V11.ICONE_PAR_DEFAUT,
      ordre: prochainOrdre
    });


    genresConnus[cle] = true;
    ajoutes.push(infoGenre.nom);
    prochainOrdre++;
  });


  lignes.sort(function(a, b) {
    if (a.ordre !== b.ordre) {
      return a.ordre - b.ordre;
    }


    return a.genre.localeCompare(
      b.genre,
      "fr",
      { sensitivity: "base" }
    );
  });


  /**
   * Réattribue un ordre propre et continu :
   * 1, 2, 3, 4...
   */
  lignes.forEach(function(element, index) {
    element.ordre = index + 1;
  });


  return {
    lignes: lignes,
    ajoutes: ajoutes
  };
}




/**
 * ============================================================
 * Écriture dans Genres
 * ============================================================
 */
function ecrireGenresV11_(feuilleGenres, lignes) {
  feuilleGenres
    .getRange(1, 1, 1, 3)
    .setValues([[
      GENRES_V11.ENTETE_GENRE,
      GENRES_V11.ENTETE_ICONE,
      GENRES_V11.ENTETE_ORDRE
    ]]);


  const derniereLigne = Math.max(
    feuilleGenres.getLastRow(),
    2
  );


  if (derniereLigne > 1) {
    feuilleGenres
      .getRange(
        2,
        1,
        derniereLigne - 1,
        3
      )
      .clearContent();
  }


  if (!lignes.length) {
    return;
  }


  const valeurs = lignes.map(function(element) {
    return [
      element.genre,
      element.icone,
      element.ordre
    ];
  });


  feuilleGenres
    .getRange(
      2,
      1,
      valeurs.length,
      3
    )
    .setValues(valeurs);
}




/**
 * ============================================================
 * Référentiel interne
 * ============================================================
 */
function obtenirGenreOfficielV11_(genreBrut) {
  const nomNettoye = nettoyerNomGenreV11_(genreBrut);


  if (!nomNettoye) {
    return {
      nom: "",
      icone: ""
    };
  }


  const cle = normaliserCleGenreV11_(nomNettoye);
  const reference = REFERENTIEL_GENRES_V11[cle];


  if (reference) {
    return {
      nom: reference.nom,
      icone: reference.icone
    };
  }


  return {
    nom: mettreEnFormeNomGenreV11_(nomNettoye),
    icone: GENRES_V11.ICONE_PAR_DEFAUT
  };
}




/**
 * ============================================================
 * Normalisation
 * ============================================================
 */
function nettoyerNomGenreV11_(genre) {
  return String(genre || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—]+/, "")
    .replace(/[\s\-–—]+$/, "")
    .trim();
}




function normaliserCleGenreV11_(texte) {
  return String(texte || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}




function mettreEnFormeNomGenreV11_(texte) {
  return String(texte || "")
    .toLowerCase()
    .replace(
      /(^|[\s'-])([a-zà-ÿ])/g,
      function(correspondance, separateur, lettre) {
        return separateur + lettre.toUpperCase();
      }
    );
}




/**
 * ============================================================
 * Utilitaires d'en-têtes
 * ============================================================
 */
function creerIndexEntetesGenresV11_(ligneEntetes) {
  const index = {};


  ligneEntetes.forEach(function(entete, position) {
    const cle = normaliserCleGenreV11_(entete);


    if (cle) {
      index[cle] = position;
    }
  });


  return index;
}




/**
 * ============================================================
 * Journalisation
 * ============================================================
 */
function journalGenresV11_(statut, message) {
  Logger.log(
    "GENRES | SYNCHRONISATION | " +
    statut +
    " | " +
    message
  );


  try {
    if (typeof journal_ === "function") {
      journal_(
        "GENRES",
        "SYNCHRONISATION",
        statut,
        message
      );
    }
  } catch (e) {
    Logger.log(
      "Journal V4 indisponible : " +
      String(e)
    );
  }
}




function enregistrerErreurGenresV11_(erreur) {
  try {
    if (typeof erreur_ === "function") {
      erreur_(
        "GENRES",
        "synchroniserGenresV4",
        String(erreur),
        erreur && erreur.stack
          ? erreur.stack
          : ""
      );
    }
  } catch (e) {
    Logger.log(
      "Impossible d'enregistrer l'erreur Genres : " +
      String(e)
    );
  }
}




/**
 * ============================================================
 * Tests
 * ============================================================
 */
function testGenresV4() {
  const resultat = synchroniserGenresV4();


  Logger.log(
    JSON.stringify(
      resultat,
      null,
      2
    )
  );


  return resultat;
}




/**
 * ============================================================
 * Test de sécurité du découpage
 * ============================================================
 *
 * Ce test n'écrit rien dans Google Sheets.
 */
function testDecoupageGenresV11() {
  const genres = {};


  [
    "Action & Aventure",
    "Science-Fiction & Fantastique",
    "Drame / Romance",
    "Horreur, Thriller",
    "Crime; Mystère",
    "Animation | Familial"
  ].forEach(function(texte) {
    ajouterGenresDepuisTexteV11_(genres, texte);
  });


  const resultat = Object.keys(genres)
    .map(function(cle) {
      return genres[cle];
    })
    .sort();


  Logger.log(
    JSON.stringify(
      resultat,
      null,
      2
    )
  );


  return resultat;
}






