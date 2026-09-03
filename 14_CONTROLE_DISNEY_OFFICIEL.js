/**
 * ============================================================
 * CinéMaison V4
 * Script  : 14_CONTROLE_DISNEY_OFFICIEL.gs
 * Rôle    : Création, diagnostic et import sécurisé Disney+ officiel
 * Version : 1.0.0 — VERSION DE TEST
 * ============================================================
 *
 * Principes de sécurité :
 * - aucune dépendance à RapidAPI ou à une API tierce ;
 * - le premier diagnostic n'écrit rien et ne contacte aucun service ;
 * - la création et l'actualisation ne modifient que CONTROLE_DISNEY ;
 * - la simulation n'écrit rien dans Films ;
 * - une plateforme déjà détectée n'est jamais supprimée ;
 * - une date provenant d'une autre source n'est jamais écrasée ;
 * - AUCUNE_ALERTE et ERREUR ne suppriment jamais une date existante ;
 * - la cohérence d'une date est calculée depuis ControleLe ;
 * - un relevé Edge vieux de plus de 7 jours est refusé.
 */


const DISNEY_CONTROLE_FEUILLE_V100 = "CONTROLE_DISNEY";
const DISNEY_SOURCE_OFFICIELLE_V100 = "DISNEY+ OFFICIEL";
const DISNEY_PLATEFORME_V100 = "DISNEY+";
const DISNEY_AGE_MAX_RESULTAT_JOURS_V100 = 7;
const DISNEY_ECHEANCE_MAX_JOURS_V100 = 60;


const DISNEY_ENTETES_LISTE_V100 = [
  "IDFilm", "LigneFilms", "Titre", "Annee", "IMDbID",
  "URLDisney", "DisneyID", "MessageDisney",
  "DateRetraitDetectee", "ControleLe", "StatutControle",
  "CommentaireControle"
];




/**
 * PREMIER TEST À LANCER.
 * Lecture seule, y compris si CONTROLE_DISNEY n'existe pas encore.
 */
function diagnostiquerCreationControleDisneyOfficielV100() {
  const contexte = chargerContexteDisneyV100_({
    controleFacultatif: true,
    resultatsFacultatifs: true
  });
  const hFilms = contexte.hFilms;
  const donneesFilms = contexte.donneesFilms;


  let avecTitre = 0;
  let fichesDisney = 0;
  let sansId = 0;
  let sansAnnee = 0;
  let sansImdb = 0;
  let avecDate = 0;
  let sansDate = 0;
  let avecAutresPlateformesDetectees = 0;
  let sourceDisney = 0;
  let sourceAutre = 0;
  const idsDisney = {};


  for (let i = 1; i < donneesFilms.length; i++) {
    const ligne = donneesFilms[i];
    const titre = String(ligne[hFilms.Titre] || "").trim();
    if (titre) avecTitre++;
    if (!estDisneyV100_(ligne[hFilms.Plateforme])) continue;


    fichesDisney++;
    const id = String(ligne[hFilms.ID] || "").trim();
    if (id) idsDisney[id] = true;
    else sansId++;
    if (!ligne[hFilms.Annee]) sansAnnee++;
    if (!String(ligne[hFilms.IMDbID] || "").trim()) sansImdb++;
    if (ligne[hFilms.DateDisponibiliteAuto]) avecDate++;
    else sansDate++;


    const detectees = String(
      ligne[hFilms.PlateformesDetectees] || ""
    ).trim();
    if (contientAutrePlateformeDisneyV100_(detectees)) {
      avecAutresPlateformesDetectees++;
    }


    const source = String(
      ligne[hFilms.SourceDisponibiliteAuto] || ""
    ).trim();
    if (estSourceDisneyV100_(source)) sourceDisney++;
    else if (source) sourceAutre++;
  }


  const statsListe = analyserListeDisneyV100_(contexte);
  const statsResultats = analyserResultatsDisneyV100_(contexte.resultats);


  Logger.log("===== DIAGNOSTIC CRÉATION DISNEY+ OFFICIEL V1.0.0 =====");
  Logger.log("Fiches avec titre : " + avecTitre);
  Logger.log("Fiches DISNEY+ reconnues : " + fichesDisney);
  Logger.log("Fiches DISNEY+ sans ID : " + sansId);
  Logger.log("Fiches DISNEY+ sans année : " + sansAnnee);
  Logger.log("Fiches DISNEY+ sans IMDbID : " + sansImdb);
  Logger.log("Avec DateDisponibiliteAuto : " + avecDate);
  Logger.log("Sans DateDisponibiliteAuto : " + sansDate);
  Logger.log(
    "Avec autre plateforme déjà détectée : " +
    avecAutresPlateformesDetectees
  );
  Logger.log("Source DISNEY+ OFFICIEL : " + sourceDisney);
  Logger.log("Date gérée par une autre source : " + sourceAutre);
  Logger.log(
    "Feuille CONTROLE_DISNEY : " +
    (contexte.controle ? "PRÉSENTE" : "ABSENTE — À CRÉER")
  );
  Logger.log("Lignes préparées A:L : " + statsListe.lignes);
  Logger.log("ID uniques A:L : " + statsListe.idsUniques);
  Logger.log("Doublons A:L : " + statsListe.doublons);
  Logger.log("ID A:L absents de Films : " + statsListe.absentsFilms);
  Logger.log("Lignes A:L qui ne sont plus DISNEY+ : " + statsListe.nonDisney);
  Logger.log(
    "Fiches DISNEY+ absentes de A:L : " +
    Object.keys(idsDisney).filter(function(id) {
      return !statsListe.idsVus[id];
    }).length
  );
  Logger.log("Lignes A:L avec URL Disney+ : " + statsListe.avecUrl);
  Logger.log("Lignes A:L sans URL Disney+ : " + statsListe.sansUrl);
  Logger.log("En-tête résultats Edge : " + statsResultats.entete);
  Logger.log("Emplacements résultats Edge lus : " + statsResultats.lignes);
  Logger.log("Lignes Edge avec ID : " + statsResultats.avecId);
  Logger.log("Lignes Edge vides : " + statsResultats.vides);
  Logger.log("Résultats DATE_DETECTEE : " + statsResultats.dates);
  Logger.log("Résultats AUCUNE_ALERTE : " + statsResultats.sansAlerte);
  Logger.log("Autres statuts résultats : " + statsResultats.autres);
  Logger.log("Protection multi-plateformes : ACTIVE");
  Logger.log("Protection dates d'autres sources : ACTIVE");
  Logger.log("Cohérence calculée depuis ControleLe : ACTIVE");
  Logger.log(
    "Âge maximal d'un relevé Edge : " +
    DISNEY_AGE_MAX_RESULTAT_JOURS_V100 + " jours"
  );
  Logger.log(
    "Échéance Disney+ maximale acceptée : " +
    DISNEY_ECHEANCE_MAX_JOURS_V100 + " jours"
  );
  Logger.log("AUCUNE ÉCRITURE EFFECTUÉE");
  Logger.log("AUCUN APPEL EXTERNE EFFECTUÉ");
  Logger.log("===== FIN DIAGNOSTIC CRÉATION DISNEY+ =====");
}




/**
 * Crée CONTROLE_DISNEY uniquement si elle n'existe pas encore.
 * N'écrit jamais dans Films et n'effectue aucun appel externe.
 */
function creerControleDisneyOfficielV100() {
  const contexte = chargerContexteDisneyV100_({
    controleFacultatif: true,
    resultatsFacultatifs: true
  });
  if (contexte.controle) {
    throw new Error(
      "CONTROLE_DISNEY existe déjà. Utilisez " +
      "actualiserListeControleDisneyOfficielV100() pour ajouter les nouvelles fiches."
    );
  }


  const controle = contexte.classeur.insertSheet(
    DISNEY_CONTROLE_FEUILLE_V100
  );
  const lignes = construireListeDisneyV100_(contexte);
  ecrireListeDisneyV100_(controle, lignes);


  Logger.log("===== CRÉATION CONTROLE_DISNEY V1.0.0 =====");
  Logger.log("Fiches DISNEY+ préparées : " + (lignes.length - 1));
  Logger.log("Écriture dans Films : NON");
  Logger.log("Appel externe : NON");
  Logger.log("===== FIN CRÉATION CONTROLE_DISNEY =====");
}




/**
 * Ajoute les nouvelles fiches Disney+ et actualise A:E.
 * Les URL/ID, les résultats techniques et N:V sont conservés.
 */
function actualiserListeControleDisneyOfficielV100() {
  const contexte = chargerContexteDisneyV100_({
    controleFacultatif: false,
    resultatsFacultatifs: true
  });
  const controle = contexte.controle;
  const derniereLigne = Math.max(1, controle.getLastRow());
  const existantes = controle
    .getRange(1, 1, derniereLigne, DISNEY_ENTETES_LISTE_V100.length)
    .getValues();
  verifierEntetesListeDisneyV100_(existantes[0]);


  const parId = {};
  for (let i = 1; i < existantes.length; i++) {
    const id = String(existantes[i][0] || "").trim();
    if (id && parId[id] === undefined) parId[id] = i;
  }


  const nouvelleListe = construireListeDisneyV100_(contexte);
  let ajouts = 0;
  let misesAJour = 0;


  for (let i = 1; i < nouvelleListe.length; i++) {
    const ligne = nouvelleListe[i];
    const id = String(ligne[0] || "").trim();
    if (!id) continue;


    if (parId[id] === undefined) {
      existantes.push(ligne);
      parId[id] = existantes.length - 1;
      ajouts++;
      continue;
    }


    const position = parId[id];
    let changee = false;
    for (let c = 1; c <= 4; c++) {
      if (String(existantes[position][c] || "") !== String(ligne[c] || "")) {
        existantes[position][c] = ligne[c];
        changee = true;
      }
    }
    if (changee) misesAJour++;
  }


  controle
    .getRange(1, 1, existantes.length, DISNEY_ENTETES_LISTE_V100.length)
    .setValues(existantes);
  formaterControleDisneyV100_(controle, existantes.length);


  Logger.log("===== ACTUALISATION CONTROLE_DISNEY V1.0.0 =====");
  Logger.log("Nouvelles fiches ajoutées : " + ajouts);
  Logger.log("Identités A:E actualisées : " + misesAJour);
  Logger.log("Lignes existantes supprimées : 0");
  Logger.log("Résultats Edge N:V conservés : OUI");
  Logger.log("Écriture dans Films : NON");
  Logger.log("Appel externe : NON");
  Logger.log("===== FIN ACTUALISATION CONTROLE_DISNEY =====");
}




function verifierResultatsDisneyOfficielSansEcriture() {
  traiterResultatsDisneyOfficielV100_(false);
}




function appliquerResultatsDisneyOfficiel() {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(30000)) {
    throw new Error("Un autre traitement CinéMaison est déjà en cours.");
  }
  try {
    traiterResultatsDisneyOfficielV100_(true);
  } finally {
    verrou.releaseLock();
  }
}




function traiterResultatsDisneyOfficielV100_(ecrire) {
  const contexte = chargerContexteDisneyV100_({
    controleFacultatif: false,
    resultatsFacultatifs: false
  });
  const films = contexte.films;
  const hFilms = contexte.hFilms;
  const lignesResultats = contexte.resultats.lignes;
  const hResultats = contexte.resultats.index;
  const maintenant = new Date();
  const aujourdHui = normaliserJourDisneyV100_(maintenant);
  const idsResultats = {};


  const stats = {
    lignesEdge: Math.max(0, lignesResultats.length - 1),
    vides: 0,
    valides: 0,
    dates: 0,
    sansAlerte: 0,
    conflits: 0,
    ajoutsPlateforme: 0,
    changements: 0,
    ignores: 0,
    erreurs: 0,
    doublons: 0
  };


  Logger.log("===== IMPORT DISNEY+ OFFICIEL V1.0.0 =====");
  Logger.log("Mode : " + (ecrire ? "ÉCRITURE" : "SIMULATION SANS ÉCRITURE"));
  Logger.log("En-tête Edge détecté en N" + contexte.resultats.ligneEntete);


  for (let i = 1; i < lignesResultats.length; i++) {
    const resultat = lignesResultats[i];
    const idFilm = String(resultat[hResultats.IDFilm] || "").trim();
    if (!idFilm) {
      stats.vides++;
      continue;
    }
    if (idsResultats[idFilm]) {
      Logger.log("ERREUR DOUBLON EDGE | " + idFilm);
      stats.doublons++;
      stats.erreurs++;
      continue;
    }
    idsResultats[idFilm] = true;


    const film = contexte.filmsParId[idFilm];
    if (!film) {
      Logger.log("IGNORÉ | ID absent de Films : " + idFilm);
      stats.ignores++;
      continue;
    }
    if (!estDisneyV100_(film.valeurs[hFilms.Plateforme])) {
      Logger.log("IGNORÉ | " + idFilm + " | plateforme différente de DISNEY+");
      stats.ignores++;
      continue;
    }


    const statut = String(resultat[hResultats.StatutControle] || "")
      .trim().toUpperCase();
    const message = String(resultat[hResultats.MessageDisney] || "").trim();
    if (statut !== "AUCUNE_ALERTE" && statut !== "DATE_DETECTEE") {
      Logger.log(
        "IGNORÉ SANS EFFACEMENT | " + idFilm +
        " | statut=" + (statut || "(VIDE)")
      );
      stats.ignores++;
      continue;
    }


    const controleLe = convertirDateControleDisneyV100_(
      resultat[hResultats.ControleLe]
    );
    if (!controleLe) {
      Logger.log("ERREUR HORODATAGE | " + idFilm + " | ControleLe invalide");
      stats.erreurs++;
      continue;
    }
    const jourControle = normaliserJourDisneyV100_(controleLe);
    const age = Math.round(
      (aujourdHui.getTime() - jourControle.getTime()) / 86400000
    );
    if (age < -1 || age > DISNEY_AGE_MAX_RESULTAT_JOURS_V100) {
      Logger.log(
        "RÉSULTAT TROP ANCIEN | " + idFilm + " | âge=" + age +
        " jours | contrôle=" + formaterDateDisneyV100_(jourControle)
      );
      stats.erreurs++;
      continue;
    }
    stats.valides++;


    const plateformesAvant = String(
      film.valeurs[hFilms.PlateformesDetectees] || ""
    ).trim();
    const plateformesApres = ajouterPlateformeDisneyV100_(plateformesAvant);
    const plateformeAjoutee = plateformesApres !== plateformesAvant;
    if (plateformeAjoutee) stats.ajoutsPlateforme++;


    if (statut === "AUCUNE_ALERTE") {
      stats.sansAlerte++;
      Logger.log(
        "SANS ALERTE | " + idFilm + " | ligne " + film.ligne +
        " | date existante conservée" +
        (plateformeAjoutee ? " | DISNEY+ sera ajoutée aux plateformes" : "")
      );
      if (ecrire) {
        ecrireChampDisneyV100_(films, film.ligne, hFilms,
          "DernierControleDisponibilite", controleLe);
        if (plateformeAjoutee) {
          ecrireChampDisneyV100_(films, film.ligne, hFilms,
            "PlateformesDetectees", plateformesApres);
        }
      }
      continue;
    }


    if (!messageRetraitDisneyValideV100_(message)) {
      Logger.log("ERREUR VALIDATION | " + idFilm + " | message=" + message);
      stats.erreurs++;
      continue;
    }
    const dateRetrait = convertirDateResultatDisneyV100_(
      resultat[hResultats.DateRetraitDetectee]
    );
    if (!dateRetrait) {
      Logger.log("ERREUR DATE | " + idFilm);
      stats.erreurs++;
      continue;
    }
    const echeance = Math.round(
      (dateRetrait.getTime() - jourControle.getTime()) / 86400000
    );
    if (echeance < 0 || echeance > DISNEY_ECHEANCE_MAX_JOURS_V100) {
      Logger.log(
        "ERREUR COHÉRENCE | " + idFilm + " | échéance=" + echeance +
        " jours | contrôle=" + formaterDateDisneyV100_(jourControle)
      );
      stats.erreurs++;
      continue;
    }


    const ancienneDate = film.valeurs[hFilms.DateDisponibiliteAuto];
    const ancienneSource = String(
      film.valeurs[hFilms.SourceDisponibiliteAuto] || ""
    ).trim();
    const autreSourceProtegee = !!ancienneDate && !!ancienneSource &&
      !estSourceDisneyV100_(ancienneSource);
    if (autreSourceProtegee) {
      stats.conflits++;
      Logger.log(
        "CONFLIT PROTÉGÉ | " + idFilm + " | ligne " + film.ligne +
        " | source conservée=" + ancienneSource +
        " | date Disney+=" + formaterDateDisneyV100_(dateRetrait)
      );
      if (ecrire) {
        ecrireChampDisneyV100_(films, film.ligne, hFilms,
          "DernierControleDisponibilite", controleLe);
        if (plateformeAjoutee) {
          ecrireChampDisneyV100_(films, film.ligne, hFilms,
            "PlateformesDetectees", plateformesApres);
        }
      }
      continue;
    }


    stats.dates++;
    const dateChangee = !memeDateDisneyV100_(ancienneDate, dateRetrait);
    if (dateChangee) stats.changements++;
    Logger.log(
      "DATE VALIDÉE | " + idFilm + " | ligne " + film.ligne + " | " +
      formaterDateDisneyV100_(dateRetrait) +
      (dateChangee ? " | changement" : " | identique")
    );


    if (!ecrire) continue;
    ecrireChampDisneyV100_(films, film.ligne, hFilms,
      "DateDisponibiliteAuto", dateRetrait);
    ecrireChampDisneyV100_(films, film.ligne, hFilms,
      "SourceDisponibiliteAuto", DISNEY_SOURCE_OFFICIELLE_V100);
    ecrireChampDisneyV100_(films, film.ligne, hFilms,
      "DernierControleDisponibilite", controleLe);
    ecrireChampDisneyV100_(films, film.ligne, hFilms,
      "StatutDisponibiliteAuto", "DATE_CONNUE");
    ecrireChampDisneyV100_(films, film.ligne, hFilms,
      "StatutDisponibilite", "DATE_CONNUE");
    if (plateformeAjoutee) {
      ecrireChampDisneyV100_(films, film.ligne, hFilms,
        "PlateformesDetectees", plateformesApres);
    }
    ecrireChampDisneyV100_(films, film.ligne, hFilms,
      "CommentaireDisponibilite",
      "Disney+ officiel : " + message + " / Date détectée : " +
      formaterDateDisneyV100_(dateRetrait));
    if (dateChangee) {
      ecrireChampDisneyV100_(films, film.ligne, hFilms,
        "DernierChangementDisponibilite", maintenant);
    }
  }


  Logger.log("Emplacements Edge lus : " + stats.lignesEdge);
  Logger.log("Lignes Edge vides : " + stats.vides);
  Logger.log("Contrôles valides : " + stats.valides);
  Logger.log("Dates validées : " + stats.dates);
  Logger.log("Sans alerte : " + stats.sansAlerte);
  Logger.log("Conflits d'autre source protégés : " + stats.conflits);
  Logger.log("Ajouts DISNEY+ aux plateformes : " + stats.ajoutsPlateforme);
  Logger.log("Changements de date : " + stats.changements);
  Logger.log("Doublons Edge : " + stats.doublons);
  Logger.log("Ignorés : " + stats.ignores);
  Logger.log("Erreurs : " + stats.erreurs);
  if (!ecrire) Logger.log("AUCUNE ÉCRITURE EFFECTUÉE");
  Logger.log("===== FIN IMPORT DISNEY+ OFFICIEL =====");
}




function chargerContexteDisneyV100_(options) {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const films = classeur.getSheetByName("Films");
  const controle = classeur.getSheetByName(DISNEY_CONTROLE_FEUILLE_V100);
  if (!films) throw new Error("La feuille Films est introuvable.");
  if (!controle && !(options && options.controleFacultatif)) {
    throw new Error("La feuille CONTROLE_DISNEY est introuvable.");
  }


  const donneesFilms = films.getDataRange().getValues();
  if (donneesFilms.length < 2) throw new Error("La feuille Films est vide.");
  const hFilms = indexEntetesDisneyV100_(donneesFilms[0]);
  [
    "ID", "Titre", "Annee", "IMDbID", "Plateforme",
    "DateDisponibiliteAuto", "SourceDisponibiliteAuto",
    "DernierControleDisponibilite", "StatutDisponibiliteAuto",
    "PlateformesDetectees", "DernierChangementDisponibilite",
    "CommentaireDisponibilite", "StatutDisponibilite"
  ].forEach(function(entete) {
    if (hFilms[entete] === undefined) {
      throw new Error("Colonne Films manquante : " + entete);
    }
  });


  const filmsParId = {};
  for (let i = 1; i < donneesFilms.length; i++) {
    const id = String(donneesFilms[i][hFilms.ID] || "").trim();
    if (id) filmsParId[id] = { ligne: i + 1, valeurs: donneesFilms[i] };
  }


  let resultats = null;
  if (controle) resultats = lireResultatsDisneyV100_(controle);
  if (!resultats && !(options && options.resultatsFacultatifs)) {
    throw new Error(
      "Résultats Edge introuvables dans CONTROLE_DISNEY. " +
      "Collez le tableau complet à partir de N1."
    );
  }


  return {
    classeur: classeur,
    films: films,
    controle: controle,
    donneesFilms: donneesFilms,
    hFilms: hFilms,
    filmsParId: filmsParId,
    resultats: resultats
  };
}




function construireListeDisneyV100_(contexte) {
  const h = contexte.hFilms;
  const donnees = contexte.donneesFilms;
  const urlIndex = trouverPremiereColonneDisneyV100_(h, [
    "URLDisney", "URLDisneyPlus", "LienDisney", "LienDisneyPlus"
  ]);
  const idIndex = trouverPremiereColonneDisneyV100_(h, [
    "DisneyID", "DisneyPlusID"
  ]);
  const sorties = [DISNEY_ENTETES_LISTE_V100.slice()];


  for (let i = 1; i < donnees.length; i++) {
    const ligne = donnees[i];
    if (!estDisneyV100_(ligne[h.Plateforme])) continue;
    const idFilm = String(ligne[h.ID] || "").trim();
    if (!idFilm) continue;
    const url = urlIndex === undefined ? "" : String(ligne[urlIndex] || "").trim();
    const disneyId = idIndex === undefined ? "" : String(ligne[idIndex] || "").trim();
    sorties.push([
      idFilm,
      i + 1,
      String(ligne[h.Titre] || "").trim(),
      ligne[h.Annee] || "",
      String(ligne[h.IMDbID] || "").trim(),
      url,
      disneyId,
      "",
      "",
      "",
      url ? "PRET_POUR_EDGE" : "LIEN_DISNEY_A_COLLECTER",
      url ? "" : "Lien officiel Disney+ à associer depuis Edge."
    ]);
  }
  return sorties;
}




function ecrireListeDisneyV100_(controle, lignes) {
  controle
    .getRange(1, 1, lignes.length, DISNEY_ENTETES_LISTE_V100.length)
    .setValues(lignes);
  formaterControleDisneyV100_(controle, lignes.length);
}




function formaterControleDisneyV100_(controle, nombreLignes) {
  controle.setFrozenRows(1);
  controle
    .getRange(1, 1, 1, DISNEY_ENTETES_LISTE_V100.length)
    .setFontWeight("bold")
    .setBackground("#113CCF")
    .setFontColor("#FFFFFF");
  if (nombreLignes > 1) {
    controle.getRange(2, 2, nombreLignes - 1, 1).setNumberFormat("0");
  }
  controle.autoResizeColumns(1, DISNEY_ENTETES_LISTE_V100.length);
}




function analyserListeDisneyV100_(contexte) {
  const stats = {
    lignes: 0, idsUniques: 0, doublons: 0, absentsFilms: 0,
    nonDisney: 0, avecUrl: 0, sansUrl: 0, idsVus: {}
  };
  if (!contexte.controle || contexte.controle.getLastRow() < 1) return stats;


  const valeurs = contexte.controle
    .getRange(1, 1, contexte.controle.getLastRow(), 12)
    .getValues();
  if (String(valeurs[0][0] || "").trim() !== "IDFilm") return stats;
  const h = indexEntetesDisneyV100_(valeurs[0]);


  for (let i = 1; i < valeurs.length; i++) {
    const id = String(valeurs[i][h.IDFilm] || "").trim();
    if (!id) continue;
    stats.lignes++;
    if (stats.idsVus[id]) stats.doublons++;
    else {
      stats.idsVus[id] = true;
      stats.idsUniques++;
    }
    const film = contexte.filmsParId[id];
    if (!film) stats.absentsFilms++;
    else if (!estDisneyV100_(
      film.valeurs[contexte.hFilms.Plateforme]
    )) stats.nonDisney++;


    const url = h.URLDisney === undefined
      ? ""
      : String(valeurs[i][h.URLDisney] || "").trim();
    if (url) stats.avecUrl++;
    else stats.sansUrl++;
  }
  return stats;
}




function analyserResultatsDisneyV100_(resultats) {
  const stats = {
    entete: "ABSENTE", lignes: 0, avecId: 0, vides: 0,
    dates: 0, sansAlerte: 0, autres: 0
  };
  if (!resultats) return stats;
  stats.entete = "N" + resultats.ligneEntete;
  stats.lignes = Math.max(0, resultats.lignes.length - 1);
  const h = resultats.index;
  for (let i = 1; i < resultats.lignes.length; i++) {
    const ligne = resultats.lignes[i];
    const id = String(ligne[h.IDFilm] || "").trim();
    if (!id) {
      stats.vides++;
      continue;
    }
    stats.avecId++;
    const statut = String(ligne[h.StatutControle] || "").trim().toUpperCase();
    if (statut === "DATE_DETECTEE") stats.dates++;
    else if (statut === "AUCUNE_ALERTE") stats.sansAlerte++;
    else stats.autres++;
  }
  return stats;
}




function lireResultatsDisneyV100_(controle) {
  const derniereLigne = controle.getLastRow();
  if (derniereLigne < 1 || controle.getMaxColumns() < 22) return null;
  const valeurs = controle
    .getRange(1, 14, Math.max(1, derniereLigne), 9)
    .getValues();
  let positionEntete = -1;
  for (let i = 0; i < Math.min(2, valeurs.length); i++) {
    if (String(valeurs[i][0] || "").trim() === "IDFilm") {
      positionEntete = i;
      break;
    }
  }
  if (positionEntete < 0) return null;


  const lignes = valeurs.slice(positionEntete);
  const index = indexEntetesDisneyV100_(lignes[0]);
  [
    "IDFilm", "MessageDisney", "DateRetraitDetectee",
    "ControleLe", "StatutControle"
  ].forEach(function(entete) {
    if (index[entete] === undefined) {
      throw new Error("Colonne résultat manquante : " + entete);
    }
  });
  return { lignes: lignes, index: index, ligneEntete: positionEntete + 1 };
}




function verifierEntetesListeDisneyV100_(entetes) {
  const h = indexEntetesDisneyV100_(entetes);
  DISNEY_ENTETES_LISTE_V100.forEach(function(entete) {
    if (h[entete] === undefined) {
      throw new Error("Colonne CONTROLE_DISNEY manquante : " + entete);
    }
  });
}




function trouverPremiereColonneDisneyV100_(index, noms) {
  for (let i = 0; i < noms.length; i++) {
    if (index[noms[i]] !== undefined) return index[noms[i]];
  }
  return undefined;
}




function messageRetraitDisneyValideV100_(message) {
  const texte = normaliserDisneyV100_(message);
  const annonce = /DERNIER JOUR|QUITTE|RETIRE|DISPONIBLE JUSQU|EXPIR/.test(texte);
  return annonce && /DISNEY/.test(texte);
}




function ajouterPlateformeDisneyV100_(valeur) {
  const texte = String(valeur || "").trim();
  if (estDisneyV100_(texte)) return texte;
  return texte ? texte + ", " + DISNEY_PLATEFORME_V100 : DISNEY_PLATEFORME_V100;
}




function contientAutrePlateformeDisneyV100_(valeur) {
  const reste = normaliserDisneyV100_(valeur)
    .replace(/DISNEY\s*\+/g, "")
    .replace(/DISNEY\s+PLUS/g, "")
    .replace(/DISNEY/g, "")
    .replace(/[,;|/+\-]+/g, "")
    .trim();
  return reste !== "";
}




function estDisneyV100_(valeur) {
  return normaliserDisneyV100_(valeur).indexOf("DISNEY") >= 0;
}




function estSourceDisneyV100_(valeur) {
  return normaliserDisneyV100_(valeur).indexOf("DISNEY") >= 0;
}




function normaliserDisneyV100_(valeur) {
  return String(valeur || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}




function convertirDateResultatDisneyV100_(valeur) {
  if (!valeur) return null;
  if (Object.prototype.toString.call(valeur) === "[object Date]" &&
      !isNaN(valeur.getTime())) {
    const copie = new Date(valeur);
    copie.setHours(12, 0, 0, 0);
    return copie;
  }
  const correspondance = String(valeur).trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!correspondance) return null;
  const annee = Number(correspondance[1]);
  const mois = Number(correspondance[2]);
  const jour = Number(correspondance[3]);
  const date = new Date(annee, mois - 1, jour, 12, 0, 0, 0);
  if (isNaN(date.getTime()) || date.getFullYear() !== annee ||
      date.getMonth() !== mois - 1 || date.getDate() !== jour) return null;
  return date;
}




function convertirDateControleDisneyV100_(valeur) {
  if (!valeur) return null;
  if (Object.prototype.toString.call(valeur) === "[object Date]" &&
      !isNaN(valeur.getTime())) return new Date(valeur);


  const texte = String(valeur).trim();
  let c = texte.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (c) {
    return creerDateControleDisneyV100_(
      Number(c[3]), Number(c[2]), Number(c[1]),
      Number(c[4] || 12), Number(c[5] || 0), Number(c[6] || 0)
    );
  }
  c = texte.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!c) return null;
  return creerDateControleDisneyV100_(
    Number(c[1]), Number(c[2]), Number(c[3]),
    Number(c[4] || 12), Number(c[5] || 0), Number(c[6] || 0)
  );
}




function creerDateControleDisneyV100_(annee, mois, jour, heure, minute, seconde) {
  const date = new Date(annee, mois - 1, jour, heure, minute, seconde, 0);
  if (isNaN(date.getTime()) || date.getFullYear() !== annee ||
      date.getMonth() !== mois - 1 || date.getDate() !== jour ||
      date.getHours() !== heure || date.getMinutes() !== minute ||
      date.getSeconds() !== seconde) return null;
  return date;
}




function normaliserJourDisneyV100_(date) {
  const jour = new Date(date);
  jour.setHours(12, 0, 0, 0);
  return jour;
}




function memeDateDisneyV100_(valeurA, valeurB) {
  const dateA = convertirDateResultatDisneyV100_(valeurA);
  const dateB = convertirDateResultatDisneyV100_(valeurB);
  if (!dateA || !dateB) return false;
  return dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate();
}




function formaterDateDisneyV100_(date) {
  return Utilities.formatDate(
    date, Session.getScriptTimeZone(), "yyyy-MM-dd"
  );
}




function ecrireChampDisneyV100_(feuille, ligne, index, nomColonne, valeur) {
  feuille.getRange(ligne, index[nomColonne] + 1).setValue(valeur);
}




function indexEntetesDisneyV100_(entetes) {
  const index = {};
  entetes.forEach(function(entete, position) {
    const nom = String(entete || "").trim();
    if (nom) index[nom] = position;
  });
  return index;
}






