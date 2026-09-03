/**
 * ============================================================
 * CinéMaison V4
 * Script  : 11_CONTROLE_PRIME_OFFICIEL.gs
 * Rôle    : Diagnostic et import sécurisé des résultats Prime Video officiels
 * Version : 1.1.1
 * ============================================================
 *
 * Principes de sécurité :
 * - la simulation n'écrit rien dans Films ;
 * - une plateforme déjà détectée n'est jamais supprimée ;
 * - une date provenant d'une autre source n'est jamais écrasée ;
 * - AUCUNE_ALERTE et ERREUR ne suppriment jamais une date existante ;
 * - les résultats Edge peuvent être collés avec leur en-tête en N1 ou N2.
 * - la cohérence d'une date est vérifiée par rapport à ControleLe, pas au jour
 *   où l'import est exécuté ;
 * - un relevé Edge vieux de plus de 7 jours est refusé.
 */


const PRIME_CONTROLE_FEUILLE_V110 = "CONTROLE_PRIME";
const PRIME_SOURCE_OFFICIELLE_V110 = "PRIME VIDEO OFFICIEL";
const PRIME_PLATEFORME_V110 = "PRIME VIDEO";
const PRIME_AGE_MAX_RESULTAT_JOURS_V111 = 7;




/**
 * Premier test à lancer après installation.
 * Lecture seule : aucune écriture et aucun appel externe.
 */
function diagnostiquerControlePrimeOfficielV110() {
  const contexte = chargerContextePrimeV110_({ resultatsFacultatifs: true });
  const hFilms = contexte.hFilms;
  const donneesFilms = contexte.donneesFilms;


  let avecTitre = 0;
  let fichesPrime = 0;
  let avecDate = 0;
  let sansDate = 0;
  let avecAutresPlateformesDetectees = 0;
  let sourcePrime = 0;
  let sourceAutre = 0;
  const idsPrime = {};


  for (let i = 1; i < donneesFilms.length; i++) {
    const ligne = donneesFilms[i];
    const titre = String(ligne[hFilms.Titre] || "").trim();
    if (titre) avecTitre++;


    if (!estPrimeVideoV110_(ligne[hFilms.Plateforme])) continue;


    fichesPrime++;
    const id = String(ligne[hFilms.ID] || "").trim();
    if (id) idsPrime[id] = true;


    if (ligne[hFilms.DateDisponibiliteAuto]) avecDate++;
    else sansDate++;


    const detectees = String(ligne[hFilms.PlateformesDetectees] || "").trim();
    if (contientAutrePlateformePrimeV110_(detectees)) {
      avecAutresPlateformesDetectees++;
    }


    const source = String(ligne[hFilms.SourceDisponibiliteAuto] || "").trim();
    if (estSourcePrimeV110_(source)) sourcePrime++;
    else if (source) sourceAutre++;
  }


  let lignesListe = 0;
  let idsListeUniques = 0;
  let doublonsListe = 0;
  let absentsListe = 0;
  let nonPrimeDansListe = 0;
  const vusListe = {};


  if (contexte.controle && contexte.controle.getLastRow() >= 2) {
    const liste = contexte.controle
      .getRange(1, 1, contexte.controle.getLastRow(), 7)
      .getValues();


    const depart = String(liste[0][0] || "").trim() === "IDFilm" ? 1 : 0;
    for (let i = depart; i < liste.length; i++) {
      const id = String(liste[i][0] || "").trim();
      if (!id) continue;
      lignesListe++;
      if (vusListe[id]) doublonsListe++;
      else {
        vusListe[id] = true;
        idsListeUniques++;
      }
      if (!contexte.filmsParId[id]) absentsListe++;
      else if (!estPrimeVideoV110_(
        contexte.filmsParId[id].valeurs[hFilms.Plateforme]
      )) nonPrimeDansListe++;
    }
  }


  const idsPrimeManquants = Object.keys(idsPrime).filter(function(id) {
    return !vusListe[id];
  }).length;


  let lignesResultats = 0;
  let enteteResultats = "ABSENTE";
  let datesDetectees = 0;
  let aucuneAlerte = 0;
  let erreursResultats = 0;


  if (contexte.resultats) {
    enteteResultats = "N" + contexte.resultats.ligneEntete;
    lignesResultats = contexte.resultats.lignes.length - 1;
    const hR = contexte.resultats.index;
    for (let i = 1; i < contexte.resultats.lignes.length; i++) {
      const statut = String(
        contexte.resultats.lignes[i][hR.StatutControle] || ""
      ).trim().toUpperCase();
      if (statut === "DATE_DETECTEE") datesDetectees++;
      else if (statut === "AUCUNE_ALERTE") aucuneAlerte++;
      else if (statut) erreursResultats++;
    }
  }


  Logger.log("===== DIAGNOSTIC PRIME OFFICIEL V1.1.1 =====");
  Logger.log("Fiches avec titre : " + avecTitre);
  Logger.log("Fiches PRIME VIDEO reconnues : " + fichesPrime);
  Logger.log("Avec DateDisponibiliteAuto : " + avecDate);
  Logger.log("Sans DateDisponibiliteAuto : " + sansDate);
  Logger.log("Avec autre plateforme déjà détectée : " + avecAutresPlateformesDetectees);
  Logger.log("Source PRIME VIDEO OFFICIEL : " + sourcePrime);
  Logger.log("Date gérée par une autre source : " + sourceAutre);
  Logger.log("Feuille CONTROLE_PRIME : " + (contexte.controle ? "PRÉSENTE" : "ABSENTE"));
  Logger.log("Lignes préparées A:G : " + lignesListe);
  Logger.log("ID uniques A:G : " + idsListeUniques);
  Logger.log("Doublons A:G : " + doublonsListe);
  Logger.log("ID A:G absents de Films : " + absentsListe);
  Logger.log("Lignes A:G qui ne sont plus PRIME : " + nonPrimeDansListe);
  Logger.log("Fiches PRIME absentes de A:G : " + idsPrimeManquants);
  Logger.log("En-tête résultats Edge : " + enteteResultats);
  Logger.log("Lignes résultats Edge : " + lignesResultats);
  Logger.log("Résultats DATE_DETECTEE : " + datesDetectees);
  Logger.log("Résultats AUCUNE_ALERTE : " + aucuneAlerte);
  Logger.log("Autres statuts résultats : " + erreursResultats);
  Logger.log("Protection multi-plateformes : ACTIVE");
  Logger.log("Protection dates d'autres sources : ACTIVE");
  Logger.log("Cohérence calculée depuis ControleLe : ACTIVE");
  Logger.log("Âge maximal d'un relevé Edge : " + PRIME_AGE_MAX_RESULTAT_JOURS_V111 + " jours");
  Logger.log("AUCUNE ÉCRITURE EFFECTUÉE");
  Logger.log("AUCUN APPEL EXTERNE EFFECTUÉ");
  Logger.log("===== FIN DIAGNOSTIC PRIME OFFICIEL =====");
}




function verifierResultatsPrimeOfficielSansEcriture() {
  traiterResultatsPrimeOfficielV110_(false);
}




function appliquerResultatsPrimeOfficiel() {
  traiterResultatsPrimeOfficielV110_(true);
}




function traiterResultatsPrimeOfficielV110_(ecrire) {
  const contexte = chargerContextePrimeV110_({ resultatsFacultatifs: false });
  const films = contexte.films;
  const hFilms = contexte.hFilms;
  const lignesResultats = contexte.resultats.lignes;
  const hResultats = contexte.resultats.index;
  const maintenant = new Date();
  const aujourdHui = normaliserJourPrimeV111_(maintenant);


  let controlesValides = 0;
  let datesValidees = 0;
  let sansAlerte = 0;
  let ignores = 0;
  let erreurs = 0;
  let conflitsProteges = 0;
  let ajoutsPlateforme = 0;
  let changements = 0;


  Logger.log("===== IMPORT PRIME OFFICIEL V1.1.1 =====");
  Logger.log("Mode : " + (ecrire ? "ÉCRITURE" : "SIMULATION SANS ÉCRITURE"));
  Logger.log("En-tête Edge détecté en N" + contexte.resultats.ligneEntete);


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


    if (!estPrimeVideoV110_(film.valeurs[hFilms.Plateforme])) {
      Logger.log("IGNORÉ | " + idFilm + " | plateforme différente de PRIME VIDEO");
      ignores++;
      continue;
    }


    const statut = String(resultat[hResultats.StatutControle] || "")
      .trim().toUpperCase();
    const message = String(resultat[hResultats.MessagePrime] || "").trim();


    if (statut !== "AUCUNE_ALERTE" && statut !== "DATE_DETECTEE") {
      Logger.log("IGNORÉ SANS EFFACEMENT | " + idFilm + " | statut=" + statut);
      ignores++;
      continue;
    }


    const controleLe = convertirDateControlePrimeV111_(
      resultat[hResultats.ControleLe]
    );
    if (!controleLe) {
      Logger.log("ERREUR HORODATAGE | " + idFilm + " | ControleLe invalide");
      erreurs++;
      continue;
    }


    const jourControle = normaliserJourPrimeV111_(controleLe);
    const ageResultat = Math.round(
      (aujourdHui.getTime() - jourControle.getTime()) / 86400000
    );
    if (ageResultat < -1 || ageResultat > PRIME_AGE_MAX_RESULTAT_JOURS_V111) {
      Logger.log(
        "RÉSULTAT TROP ANCIEN | " + idFilm + " | âge=" + ageResultat +
        " jours | contrôle=" + formaterDatePrimeV110_(jourControle)
      );
      erreurs++;
      continue;
    }
    controlesValides++;


    const plateformesAvant = String(
      film.valeurs[hFilms.PlateformesDetectees] || ""
    ).trim();
    const plateformesApres = ajouterPlateformePrimeV110_(plateformesAvant);
    const plateformeAjoutee = plateformesApres !== plateformesAvant;
    if (plateformeAjoutee) ajoutsPlateforme++;


    if (statut === "AUCUNE_ALERTE") {
      sansAlerte++;
      Logger.log(
        "SANS ALERTE | " + idFilm + " | ligne " + film.ligne +
        " | date existante conservée" +
        (plateformeAjoutee ? " | PRIME sera ajoutée aux plateformes" : "")
      );


      if (ecrire) {
        ecrireChampPrimeV110_(films, film.ligne, hFilms,
          "DernierControleDisponibilite", controleLe);
        if (plateformeAjoutee) {
          ecrireChampPrimeV110_(films, film.ligne, hFilms,
            "PlateformesDetectees", plateformesApres);
        }
      }
      continue;
    }


    const jours = Number(resultat[hResultats.JoursRestants]);
    const correspondanceMessage = message.match(
      /Quitte\s+Prime\s+Video\s+dans\s+(\d+)\s+jours?/i
    );
    if (!correspondanceMessage || !isFinite(jours) || jours < 0 || jours > 60 ||
        Number(correspondanceMessage[1]) !== jours) {
      Logger.log("ERREUR VALIDATION | " + idFilm + " | message=" + message);
      erreurs++;
      continue;
    }


    const dateRetrait = convertirDateResultatPrimeV110_(
      resultat[hResultats.DateRetraitDetectee]
    );
    if (!dateRetrait) {
      Logger.log("ERREUR DATE | " + idFilm);
      erreurs++;
      continue;
    }


    const difference = Math.round(
      (dateRetrait.getTime() - jourControle.getTime()) / 86400000
    );
    if (Math.abs(difference - jours) > 1) {
      Logger.log(
        "ERREUR COHÉRENCE | " + idFilm + " | jours=" + jours +
        " | différence=" + difference +
        " | contrôle=" + formaterDatePrimeV110_(jourControle)
      );
      erreurs++;
      continue;
    }


    const ancienneDate = film.valeurs[hFilms.DateDisponibiliteAuto];
    const ancienneSource = String(
      film.valeurs[hFilms.SourceDisponibiliteAuto] || ""
    ).trim();
    const autreSourceProtegee = !!ancienneDate && !!ancienneSource &&
      !estSourcePrimeV110_(ancienneSource);


    if (autreSourceProtegee) {
      conflitsProteges++;
      Logger.log(
        "CONFLIT PROTÉGÉ | " + idFilm + " | ligne " + film.ligne +
        " | source conservée=" + ancienneSource +
        " | date Prime=" + formaterDatePrimeV110_(dateRetrait)
      );
      if (ecrire) {
        ecrireChampPrimeV110_(films, film.ligne, hFilms,
          "DernierControleDisponibilite", controleLe);
        if (plateformeAjoutee) {
          ecrireChampPrimeV110_(films, film.ligne, hFilms,
            "PlateformesDetectees", plateformesApres);
        }
      }
      continue;
    }


    datesValidees++;
    const dateChangee = !memeDatePrimeV110_(ancienneDate, dateRetrait);
    if (dateChangee) changements++;
    Logger.log(
      "DATE VALIDÉE | " + idFilm + " | ligne " + film.ligne + " | " +
      formaterDatePrimeV110_(dateRetrait) +
      (dateChangee ? " | changement" : " | identique")
    );


    if (!ecrire) continue;


    ecrireChampPrimeV110_(films, film.ligne, hFilms,
      "DateDisponibiliteAuto", dateRetrait);
    ecrireChampPrimeV110_(films, film.ligne, hFilms,
      "SourceDisponibiliteAuto", PRIME_SOURCE_OFFICIELLE_V110);
    ecrireChampPrimeV110_(films, film.ligne, hFilms,
      "DernierControleDisponibilite", controleLe);
    ecrireChampPrimeV110_(films, film.ligne, hFilms,
      "StatutDisponibiliteAuto", "DATE_CONNUE");
    ecrireChampPrimeV110_(films, film.ligne, hFilms,
      "StatutDisponibilite", "DATE_CONNUE");
    if (plateformeAjoutee) {
      ecrireChampPrimeV110_(films, film.ligne, hFilms,
        "PlateformesDetectees", plateformesApres);
    }
    ecrireChampPrimeV110_(films, film.ligne, hFilms,
      "CommentaireDisponibilite",
      "Prime Video officiel : " + message + " / Date calculée : " +
      formaterDatePrimeV110_(dateRetrait));
    if (dateChangee) {
      ecrireChampPrimeV110_(films, film.ligne, hFilms,
        "DernierChangementDisponibilite", maintenant);
    }
  }


  Logger.log("Contrôles valides : " + controlesValides);
  Logger.log("Dates validées : " + datesValidees);
  Logger.log("Sans alerte : " + sansAlerte);
  Logger.log("Conflits d'autre source protégés : " + conflitsProteges);
  Logger.log("Ajouts PRIME aux plateformes : " + ajoutsPlateforme);
  Logger.log("Changements de date : " + changements);
  Logger.log("Ignorés : " + ignores);
  Logger.log("Erreurs : " + erreurs);
  if (!ecrire) Logger.log("AUCUNE ÉCRITURE EFFECTUÉE");
  Logger.log("===== FIN IMPORT PRIME OFFICIEL =====");
}




function chargerContextePrimeV110_(options) {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const films = classeur.getSheetByName("Films");
  const controle = classeur.getSheetByName(PRIME_CONTROLE_FEUILLE_V110);
  if (!films) throw new Error("La feuille Films est introuvable.");


  const donneesFilms = films.getDataRange().getValues();
  if (donneesFilms.length < 2) throw new Error("La feuille Films est vide.");


  const hFilms = indexEntetesPrimeV110_(donneesFilms[0]);
  [
    "ID", "Titre", "Plateforme", "DateDisponibiliteAuto",
    "SourceDisponibiliteAuto", "DernierControleDisponibilite",
    "StatutDisponibiliteAuto", "PlateformesDetectees",
    "DernierChangementDisponibilite", "CommentaireDisponibilite",
    "StatutDisponibilite"
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
  if (controle) resultats = lireResultatsPrimeV110_(controle);
  if (!resultats && !(options && options.resultatsFacultatifs)) {
    throw new Error(
      "Résultats Edge introuvables dans CONTROLE_PRIME. " +
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




function lireResultatsPrimeV110_(controle) {
  const derniereLigne = controle.getLastRow();
  if (derniereLigne < 1 || controle.getMaxColumns() < 23) return null;


  const nombreLignes = Math.max(1, derniereLigne);
  const valeurs = controle.getRange(1, 14, nombreLignes, 10).getValues();
  let positionEntete = -1;
  for (let i = 0; i < Math.min(2, valeurs.length); i++) {
    if (String(valeurs[i][0] || "").trim() === "IDFilm") {
      positionEntete = i;
      break;
    }
  }
  if (positionEntete < 0) return null;


  const lignes = valeurs.slice(positionEntete);
  const index = indexEntetesPrimeV110_(lignes[0]);
  [
    "IDFilm", "MessagePrime", "JoursRestants",
    "DateRetraitDetectee", "ControleLe", "StatutControle"
  ].forEach(function(entete) {
    if (index[entete] === undefined) {
      throw new Error("Colonne résultat manquante : " + entete);
    }
  });
  return { lignes: lignes, index: index, ligneEntete: positionEntete + 1 };
}




function ajouterPlateformePrimeV110_(valeur) {
  const texte = String(valeur || "").trim();
  if (estPrimeVideoV110_(texte)) return texte;
  return texte ? texte + ", " + PRIME_PLATEFORME_V110 : PRIME_PLATEFORME_V110;
}




function contientAutrePlateformePrimeV110_(valeur) {
  const normalise = normaliserPrimeV110_(valeur)
    .replace(/AMAZON PRIME|PRIME VIDEO|PRIME/g, "")
    .replace(/[,;|/+\-]+/g, "")
    .trim();
  return normalise !== "";
}




function estPrimeVideoV110_(valeur) {
  const plateforme = normaliserPrimeV110_(valeur);
  return plateforme.indexOf("PRIME VIDEO") >= 0 ||
    plateforme.indexOf("AMAZON PRIME") >= 0 ||
    /(^|[,;|/+])\s*PRIME\s*($|[,;|/+])/.test(plateforme);
}




function estSourcePrimeV110_(valeur) {
  return normaliserPrimeV110_(valeur).indexOf("PRIME") >= 0;
}




function normaliserPrimeV110_(valeur) {
  return String(valeur || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}




function convertirDateResultatPrimeV110_(valeur) {
  if (!valeur) return null;
  if (Object.prototype.toString.call(valeur) === "[object Date]" &&
      !isNaN(valeur.getTime())) {
    const copie = new Date(valeur);
    copie.setHours(12, 0, 0, 0);
    return copie;
  }
  const correspondance = String(valeur).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!correspondance) return null;
  const date = new Date(
    Number(correspondance[1]), Number(correspondance[2]) - 1,
    Number(correspondance[3]), 12, 0, 0, 0
  );
  return isNaN(date.getTime()) ? null : date;
}




function convertirDateControlePrimeV111_(valeur) {
  if (!valeur) return null;
  if (Object.prototype.toString.call(valeur) === "[object Date]" &&
      !isNaN(valeur.getTime())) {
    return new Date(valeur);
  }


  const texte = String(valeur).trim();
  let correspondance = texte.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (correspondance) {
    const dateFr = new Date(
      Number(correspondance[3]), Number(correspondance[2]) - 1,
      Number(correspondance[1]), Number(correspondance[4] || 12),
      Number(correspondance[5] || 0), Number(correspondance[6] || 0), 0
    );
    return isNaN(dateFr.getTime()) ? null : dateFr;
  }


  correspondance = texte.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!correspondance) return null;
  const dateIso = new Date(
    Number(correspondance[1]), Number(correspondance[2]) - 1,
    Number(correspondance[3]), Number(correspondance[4] || 12),
    Number(correspondance[5] || 0), Number(correspondance[6] || 0), 0
  );
  return isNaN(dateIso.getTime()) ? null : dateIso;
}




function normaliserJourPrimeV111_(date) {
  const jour = new Date(date);
  jour.setHours(12, 0, 0, 0);
  return jour;
}




function memeDatePrimeV110_(valeurA, valeurB) {
  const dateA = convertirDateResultatPrimeV110_(valeurA);
  const dateB = convertirDateResultatPrimeV110_(valeurB);
  if (!dateA || !dateB) return false;
  return dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate();
}




function formaterDatePrimeV110_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}




function ecrireChampPrimeV110_(feuille, ligne, index, nomColonne, valeur) {
  feuille.getRange(ligne, index[nomColonne] + 1).setValue(valeur);
}




function indexEntetesPrimeV110_(entetes) {
  const index = {};
  entetes.forEach(function(entete, position) {
    const nom = String(entete || "").trim();
    if (nom) index[nom] = position;
  });
  return index;
}






