/**
 * ============================================================
 * CinéMaison V4
 * Script  : 17_CONTROLE_STREAMING_GENERIQUE.gs
 * Rôle    : Diagnostic et import sécurisé des résultats officiels
 *           Netflix / Disney+ (équivalent générique de
 *           11_CONTROLE_PRIME_OFFICIEL.gs, laissé intact pour Prime).
 * Version : 1.0
 *
 * Correctif V1.0 (10/09/2026) : création initiale. Reprend exactement
 * les mêmes principes de sécurité que 11_CONTROLE_PRIME_OFFICIEL.gs
 * (validé de longue date, jamais touché -- Ben a demandé explicitement
 * de ne pas y toucher), mais paramétrés par plateforme via
 * PLATEFORMES_STREAMING_V1 ci-dessous plutôt que dupliqués dans un
 * nouveau fichier par plateforme -- ajouter une future plateforme
 * (ex. Apple TV+) n'ajoutera qu'une entrée à cet objet.
 *
 * Deux différences volontaires par rapport à Prime :
 * - Pas de validation croisée "message doit contenir exactement X jours"
 *   -- ce garde-fou de Prime vérifie la propre construction de son
 *   message ("Quitte Prime Video dans X jours"), qui est un format
 *   spécifique à Prime. Le champ Message envoyé par api/controle-
 *   streaming.js est un texte libre selon la plateforme (ex: "Dernier
 *   jour sur Netflix : 3 octobre") -- non conçu pour être re-parsé. La
 *   cohérence DateRetraitDetectee <-> JoursRestants (le vrai garde-fou
 *   contre une erreur de calcul) reste vérifiée à l'identique.
 * - Pas de logique de bascule Type (Indispo/VOD/Bientôt disponible) --
 *   Netflix ne détecte pour l'instant que INCLUS/INCONNU (aucun
 *   exemple réel de VOD/indisponible observé sur Netflix, et Disney+
 *   ne fournit aucun signal du tout, voir 10/09/2026). Prévu pour être
 *   ajouté plateforme par plateforme si besoin, sur le même principe
 *   que PRIME_STATUT_VERS_TYPE_V1.
 * ============================================================
 *
 * Principes de sécurité (identiques à Prime) :
 * - la simulation n'écrit rien dans Films ;
 * - une plateforme déjà détectée n'est jamais supprimée ;
 * - une date provenant d'une autre source n'est jamais écrasée ;
 * - AUCUNE_ALERTE et ERREUR ne suppriment jamais une date existante ;
 * - la cohérence d'une date est vérifiée par rapport à ControleLe, pas
 *   au jour où l'import est exécuté ;
 * - un résultat vieux de plus de 7 jours est refusé.
 */

const STREAMING_AGE_MAX_RESULTAT_JOURS_V1 = 7;


// Une entrée par plateforme -- tout ce dont ce fichier a besoin pour
// s'adapter. "motifs" sert à reconnaître la valeur de la colonne
// Plateforme dans Films (comparée en majuscules, accents retirés).
const PLATEFORMES_STREAMING_V1 = Object.freeze({
  NETFLIX: {
    feuilleControle: "CONTROLE_NETFLIX",
    sourceOfficielle: "NETFLIX OFFICIEL",
    libellePlateforme: "NETFLIX",
    motifs: ["NETFLIX"],
  },
  DISNEY: {
    feuilleControle: "CONTROLE_DISNEY",
    sourceOfficielle: "DISNEY+ OFFICIEL",
    libellePlateforme: "DISNEY+",
    motifs: ["DISNEY"],
  },
});

/**
 * Premier test à lancer après installation pour une plateforme donnée.
 * Lecture seule : aucune écriture et aucun appel externe.
 * Ex : diagnostiquerControleStreamingOfficielV1("NETFLIX")
 */
function diagnostiquerControleStreamingOfficielV1(plateforme) {
  const config = configPlateformeStreamingV1_(plateforme);
  const contexte = chargerContexteStreamingV1_(config, { resultatsFacultatifs: true });
  const hFilms = contexte.hFilms;
  const donneesFilms = contexte.donneesFilms;

  let avecTitre = 0;
  let fichesPlateforme = 0;
  let avecDate = 0;
  let sansDate = 0;
  const idsPlateforme = {};

  for (let i = 1; i < donneesFilms.length; i++) {
    const ligne = donneesFilms[i];
    const titre = String(ligne[hFilms.Titre] || "").trim();
    if (titre) avecTitre++;

    if (!estPlateformeStreamingV1_(config, ligne[hFilms.Plateforme])) continue;

    fichesPlateforme++;
    const id = String(ligne[hFilms.ID] || "").trim();
    if (id) idsPlateforme[id] = true;

    if (ligne[hFilms.DateDisponibiliteAuto]) avecDate++;
    else sansDate++;
  }

  let lignesResultats = 0;
  let enteteResultats = "ABSENTE";
  let datesDetectees = 0;
  let aucuneAlerte = 0;
  let autresStatuts = 0;

  if (contexte.resultats) {
    enteteResultats = "N" + contexte.resultats.ligneEntete;
    lignesResultats = contexte.resultats.lignes.length - 1;
    const hR = contexte.resultats.index;
    for (let i = 1; i < contexte.resultats.lignes.length; i++) {
      const statut = String(contexte.resultats.lignes[i][hR.StatutControle] || "").trim().toUpperCase();
      if (statut === "DATE_DETECTEE") datesDetectees++;
      else if (statut === "AUCUNE_ALERTE") aucuneAlerte++;
      else if (statut) autresStatuts++;
    }
  }

  Logger.log("===== DIAGNOSTIC " + config.libellePlateforme + " OFFICIEL V1.0 =====");
  Logger.log("Fiches avec titre : " + avecTitre);
  Logger.log("Fiches " + config.libellePlateforme + " reconnues : " + fichesPlateforme);
  Logger.log("Avec DateDisponibiliteAuto : " + avecDate);
  Logger.log("Sans DateDisponibiliteAuto : " + sansDate);
  Logger.log("Feuille " + config.feuilleControle + " : " + (contexte.controle ? "PRÉSENTE" : "ABSENTE"));
  Logger.log("En-tête résultats : " + enteteResultats);
  Logger.log("Lignes résultats : " + lignesResultats);
  Logger.log("Résultats DATE_DETECTEE : " + datesDetectees);
  Logger.log("Résultats AUCUNE_ALERTE : " + aucuneAlerte);
  Logger.log("Autres statuts résultats : " + autresStatuts);
  Logger.log("AUCUNE ÉCRITURE EFFECTUÉE");
  Logger.log("===== FIN DIAGNOSTIC " + config.libellePlateforme + " OFFICIEL =====");
}

function verifierResultatsStreamingOfficielSansEcriture(plateforme) {
  return traiterResultatsStreamingOfficielV1_(plateforme, false);
}

function appliquerResultatsStreamingOfficiel(plateforme) {
  return traiterResultatsStreamingOfficielV1_(plateforme, true);
}

function traiterResultatsStreamingOfficielV1_(plateforme, ecrire) {
  const config = configPlateformeStreamingV1_(plateforme);
  const contexte = chargerContexteStreamingV1_(config, { resultatsFacultatifs: false });
  const films = contexte.films;
  const hFilms = contexte.hFilms;
  const lignesResultats = contexte.resultats.lignes;
  const hResultats = contexte.resultats.index;
  const maintenant = new Date();
  const aujourdHui = normaliserJourStreamingV1_(maintenant);

  let controlesValides = 0;
  let datesValidees = 0;
  let sansAlerte = 0;
  let ignores = 0;
  let erreurs = 0;
  let conflitsProteges = 0;
  let ajoutsPlateforme = 0;
  let changements = 0;

  Logger.log("===== IMPORT " + config.libellePlateforme + " OFFICIEL V1.0 =====");
  Logger.log("Mode : " + (ecrire ? "ÉCRITURE" : "SIMULATION SANS ÉCRITURE"));
  Logger.log("En-tête détecté en N" + contexte.resultats.ligneEntete);

  for (let i = 1; i < lignesResultats.length; i++) {
    const resultat = lignesResultats[i];
    const idFilm = String(resultat[hResultats.IDFilm] || "").trim();
    if (!idFilm) continue;

    const film = contexte.filmsParId[idFilm];
    if (!film) {
      Logger.log("IGNORÉ | ID absent de Films : " + idFilm);
      ignores++;
      continue;
    }

    if (!estPlateformeStreamingV1_(config, film.valeurs[hFilms.Plateforme])) {
      Logger.log("IGNORÉ | " + idFilm + " | plateforme différente de " + config.libellePlateforme);
      ignores++;
      continue;
    }

    const statut = String(resultat[hResultats.StatutControle] || "").trim().toUpperCase();

    if (statut !== "AUCUNE_ALERTE" && statut !== "DATE_DETECTEE") {
      Logger.log("IGNORÉ SANS EFFACEMENT | " + idFilm + " | statut=" + statut);
      ignores++;
      continue;
    }

    const controleLe = convertirDateControleStreamingV1_(resultat[hResultats.ControleLe]);
    if (!controleLe) {
      Logger.log("ERREUR HORODATAGE | " + idFilm + " | ControleLe invalide");
      erreurs++;
      continue;
    }

    const jourControle = normaliserJourStreamingV1_(controleLe);
    const ageResultat = Math.round((aujourdHui.getTime() - jourControle.getTime()) / 86400000);
    if (ageResultat < -1 || ageResultat > STREAMING_AGE_MAX_RESULTAT_JOURS_V1) {
      Logger.log(
        "RÉSULTAT TROP ANCIEN | " + idFilm + " | âge=" + ageResultat +
        " jours | contrôle=" + formaterDateStreamingV1_(jourControle)
      );
      erreurs++;
      continue;
    }
    controlesValides++;

    const plateformesAvant = String(film.valeurs[hFilms.PlateformesDetectees] || "").trim();
    const plateformesApres = ajouterPlateformeStreamingV1_(config, plateformesAvant);
    const plateformeAjoutee = plateformesApres !== plateformesAvant;
    if (plateformeAjoutee) ajoutsPlateforme++;

    if (statut === "AUCUNE_ALERTE") {
      sansAlerte++;
      Logger.log(
        "SANS ALERTE | " + idFilm + " | ligne " + film.ligne + " | date existante conservée" +
        (plateformeAjoutee ? " | " + config.libellePlateforme + " sera ajoutée aux plateformes" : "")
      );
      if (ecrire) {
        ecrireChampStreamingV1_(films, film.ligne, hFilms, "DernierControleDisponibilite", controleLe);
        if (plateformeAjoutee) {
          ecrireChampStreamingV1_(films, film.ligne, hFilms, "PlateformesDetectees", plateformesApres);
        }
      }
      continue;
    }

    // DATE_DETECTEE -- cohérence DateRetraitDetectee <-> JoursRestants
    // vérifiée (le vrai garde-fou), sans exiger un format de message
    // particulier (voir note de version en tête de fichier).
    const jours = Number(resultat[hResultats.JoursRestants]);
    if (!isFinite(jours) || jours < 0 || jours > 60) {
      Logger.log("ERREUR VALIDATION | " + idFilm + " | joursRestants=" + resultat[hResultats.JoursRestants]);
      erreurs++;
      continue;
    }

    const dateRetrait = convertirDateResultatStreamingV1_(resultat[hResultats.DateRetraitDetectee]);
    if (!dateRetrait) {
      Logger.log("ERREUR DATE | " + idFilm);
      erreurs++;
      continue;
    }

    const difference = Math.round((dateRetrait.getTime() - jourControle.getTime()) / 86400000);
    if (Math.abs(difference - jours) > 1) {
      Logger.log(
        "ERREUR COHÉRENCE | " + idFilm + " | jours=" + jours +
        " | différence=" + difference + " | contrôle=" + formaterDateStreamingV1_(jourControle)
      );
      erreurs++;
      continue;
    }

    const ancienneDate = film.valeurs[hFilms.DateDisponibiliteAuto];
    const ancienneSource = String(film.valeurs[hFilms.SourceDisponibiliteAuto] || "").trim();
    const autreSourceProtegee = !!ancienneDate && !!ancienneSource &&
      ancienneSource.toUpperCase().indexOf(config.libellePlateforme) === -1;

    if (autreSourceProtegee) {
      conflitsProteges++;
      Logger.log(
        "CONFLIT PROTÉGÉ | " + idFilm + " | ligne " + film.ligne +
        " | source conservée=" + ancienneSource +
        " | date " + config.libellePlateforme + "=" + formaterDateStreamingV1_(dateRetrait)
      );
      if (ecrire) {
        ecrireChampStreamingV1_(films, film.ligne, hFilms, "DernierControleDisponibilite", controleLe);
        if (plateformeAjoutee) {
          ecrireChampStreamingV1_(films, film.ligne, hFilms, "PlateformesDetectees", plateformesApres);
        }
      }
      continue;
    }

    datesValidees++;
    const dateChangee = !memeDateStreamingV1_(ancienneDate, dateRetrait);
    if (dateChangee) changements++;
    Logger.log(
      "DATE VALIDÉE | " + idFilm + " | ligne " + film.ligne + " | " +
      formaterDateStreamingV1_(dateRetrait) + (dateChangee ? " | changement" : " | identique")
    );

    if (!ecrire) continue;

    const message = String(resultat[hResultats.Message] || "").trim();
    ecrireChampStreamingV1_(films, film.ligne, hFilms, "DateDisponibiliteAuto", dateRetrait);
    ecrireChampStreamingV1_(films, film.ligne, hFilms, "SourceDisponibiliteAuto", config.sourceOfficielle);
    ecrireChampStreamingV1_(films, film.ligne, hFilms, "DernierControleDisponibilite", controleLe);
    ecrireChampStreamingV1_(films, film.ligne, hFilms, "StatutDisponibiliteAuto", "DATE_CONNUE");
    ecrireChampStreamingV1_(films, film.ligne, hFilms, "StatutDisponibilite", "DATE_CONNUE");
    if (plateformeAjoutee) {
      ecrireChampStreamingV1_(films, film.ligne, hFilms, "PlateformesDetectees", plateformesApres);
    }
    ecrireChampStreamingV1_(
      films, film.ligne, hFilms, "CommentaireDisponibilite",
      config.libellePlateforme + " officiel : " + message +
      " / Date calculée : " + formaterDateStreamingV1_(dateRetrait)
    );
    if (dateChangee) {
      ecrireChampStreamingV1_(films, film.ligne, hFilms, "DernierChangementDisponibilite", maintenant);
    }
  }

  Logger.log("Contrôles valides : " + controlesValides);
  Logger.log("Dates validées : " + datesValidees);
  Logger.log("Sans alerte : " + sansAlerte);
  Logger.log("Conflits d'autre source protégés : " + conflitsProteges);
  Logger.log("Ajouts " + config.libellePlateforme + " aux plateformes : " + ajoutsPlateforme);
  Logger.log("Changements de date : " + changements);
  Logger.log("Ignorés : " + ignores);
  Logger.log("Erreurs : " + erreurs);
  if (!ecrire) Logger.log("AUCUNE ÉCRITURE EFFECTUÉE");
  Logger.log("===== FIN IMPORT " + config.libellePlateforme + " OFFICIEL =====");

  return {
    plateforme: config.libellePlateforme,
    ecrire: ecrire,
    controlesValides: controlesValides,
    datesValidees: datesValidees,
    sansAlerte: sansAlerte,
    conflitsProteges: conflitsProteges,
    ajoutsPlateforme: ajoutsPlateforme,
    changements: changements,
    ignores: ignores,
    erreurs: erreurs,
  };
}

function configPlateformeStreamingV1_(plateforme) {
  const cle = String(plateforme || "").trim().toUpperCase();
  const config = PLATEFORMES_STREAMING_V1[cle];
  if (!config) {
    throw new Error(
      'Plateforme streaming inconnue : "' + plateforme + '" -- attendu l\'une de : ' +
      Object.keys(PLATEFORMES_STREAMING_V1).join(", ")
    );
  }
  return config;
}

function estPlateformeStreamingV1_(config, valeur) {
  const normalise = normaliserStreamingV1_(valeur);
  return config.motifs.some(function (motif) { return normalise.indexOf(motif) >= 0; });
}

function ajouterPlateformeStreamingV1_(config, valeur) {
  const texte = String(valeur || "").trim();
  if (estPlateformeStreamingV1_(config, texte)) return texte;
  return texte ? texte + ", " + config.libellePlateforme : config.libellePlateforme;
}

function normaliserStreamingV1_(valeur) {
  return String(valeur || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function chargerContexteStreamingV1_(config, options) {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const films = classeur.getSheetByName("Films");
  const controle = classeur.getSheetByName(config.feuilleControle);
  if (!films) throw new Error("La feuille Films est introuvable.");

  const donneesFilms = films.getDataRange().getValues();
  if (donneesFilms.length < 2) throw new Error("La feuille Films est vide.");

  const hFilms = indexEntetesStreamingV1_(donneesFilms[0]);
  [
    "ID", "Titre", "Plateforme", "DateDisponibiliteAuto",
    "SourceDisponibiliteAuto", "DernierControleDisponibilite",
    "StatutDisponibiliteAuto", "PlateformesDetectees",
    "DernierChangementDisponibilite", "CommentaireDisponibilite",
    "StatutDisponibilite"
  ].forEach(function (entete) {
    if (hFilms[entete] === undefined) throw new Error("Colonne Films manquante : " + entete);
  });

  const filmsParId = {};
  for (let i = 1; i < donneesFilms.length; i++) {
    const id = String(donneesFilms[i][hFilms.ID] || "").trim();
    if (id) filmsParId[id] = { ligne: i + 1, valeurs: donneesFilms[i] };
  }

  let resultats = null;
  if (controle) resultats = lireResultatsStreamingV1_(controle);
  if (!resultats && !(options && options.resultatsFacultatifs)) {
    throw new Error(
      "Résultats introuvables dans " + config.feuilleControle + " -- lance d'abord le collecteur correspondant."
    );
  }

  return {
    classeur: classeur, films: films, controle: controle,
    donneesFilms: donneesFilms, hFilms: hFilms, filmsParId: filmsParId, resultats: resultats,
  };
}

function lireResultatsStreamingV1_(controle) {
  const derniereLigne = controle.getLastRow();
  if (derniereLigne < 1 || controle.getMaxColumns() < 20) return null;

  const nombreLignes = Math.max(1, derniereLigne);
  const valeurs = controle.getRange(1, 14, nombreLignes, 7).getValues();
  let positionEntete = -1;
  for (let i = 0; i < Math.min(2, valeurs.length); i++) {
    if (String(valeurs[i][0] || "").trim() === "IDFilm") {
      positionEntete = i;
      break;
    }
  }
  if (positionEntete < 0) return null;

  const lignes = valeurs.slice(positionEntete);
  const index = indexEntetesStreamingV1_(lignes[0]);
  ["IDFilm", "Message", "JoursRestants", "DateRetraitDetectee", "ControleLe", "StatutControle"].forEach(function (entete) {
    if (index[entete] === undefined) throw new Error("Colonne résultat manquante : " + entete);
  });
  return { lignes: lignes, index: index, ligneEntete: positionEntete + 1 };
}

function convertirDateResultatStreamingV1_(valeur) {
  if (!valeur) return null;
  if (Object.prototype.toString.call(valeur) === "[object Date]" && !isNaN(valeur.getTime())) {
    const copie = new Date(valeur);
    copie.setHours(12, 0, 0, 0);
    return copie;
  }
  const correspondance = String(valeur).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!correspondance) return null;
  const date = new Date(Number(correspondance[1]), Number(correspondance[2]) - 1, Number(correspondance[3]), 12, 0, 0, 0);
  return isNaN(date.getTime()) ? null : date;
}

function convertirDateControleStreamingV1_(valeur) {
  if (!valeur) return null;
  if (Object.prototype.toString.call(valeur) === "[object Date]" && !isNaN(valeur.getTime())) {
    return new Date(valeur);
  }
  const texte = String(valeur).trim();
  let correspondance = texte.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (correspondance) {
    const dateFr = new Date(
      Number(correspondance[3]), Number(correspondance[2]) - 1, Number(correspondance[1]),
      Number(correspondance[4] || 12), Number(correspondance[5] || 0), Number(correspondance[6] || 0), 0
    );
    return isNaN(dateFr.getTime()) ? null : dateFr;
  }
  correspondance = texte.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!correspondance) return null;
  const dateIso = new Date(
    Number(correspondance[1]), Number(correspondance[2]) - 1, Number(correspondance[3]),
    Number(correspondance[4] || 12), Number(correspondance[5] || 0), Number(correspondance[6] || 0), 0
  );
  return isNaN(dateIso.getTime()) ? null : dateIso;
}

function normaliserJourStreamingV1_(date) {
  const jour = new Date(date);
  jour.setHours(12, 0, 0, 0);
  return jour;
}

function memeDateStreamingV1_(valeurA, valeurB) {
  const dateA = convertirDateResultatStreamingV1_(valeurA);
  const dateB = convertirDateResultatStreamingV1_(valeurB);
  if (!dateA || !dateB) return false;
  return dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() && dateA.getDate() === dateB.getDate();
}

function formaterDateStreamingV1_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function ecrireChampStreamingV1_(feuille, ligne, index, nomColonne, valeur) {
  feuille.getRange(ligne, index[nomColonne] + 1).setValue(valeur);
}

function indexEntetesStreamingV1_(entetes) {
  const index = {};
  entetes.forEach(function (entete, position) {
    const nom = String(entete || "").trim();
    if (nom) index[nom] = position;
  });
  return index;
}
