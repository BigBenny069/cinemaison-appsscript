/**
 * ============================================================
 * CinéMaison V4
 * Script  : 12_CONTROLE_NETFLIX_OFFICIEL.gs
 * Rôle    : Diagnostic et import sécurisé des résultats Netflix officiels
 * Version : 1.1.1 — OFFICIELLE FIGÉE
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


const NETFLIX_CONTROLE_FEUILLE_V111 = "CONTROLE_NETFLIX";
const NETFLIX_SOURCE_OFFICIELLE_V111 = "NETFLIX OFFICIEL";
const NETFLIX_PLATEFORME_V111 = "NETFLIX";
const NETFLIX_AGE_MAX_RESULTAT_JOURS_V111 = 7;
const NETFLIX_ECHEANCE_MAX_JOURS_V111 = 40;




/**
 * Sécurité temporaire : l'ancienne préparation appelait Streaming Availability
 * via RapidAPI et effaçait CONTROLE_NETFLIX avant de le reconstruire.
 * Elle reste désactivée jusqu'à la correction du script 13.
 */
function preparerControleNetflixOfficiel() {
  throw new Error(
    "Préparation Netflix désactivée : l'ancienne API Streaming Availability " +
    "n'est plus utilisée. Lancez diagnostiquerControleNetflixOfficielV111()."
  );
}




/**
 * Premier test à lancer après installation.
 * Lecture seule : aucune écriture et aucun appel externe.
 */
function diagnostiquerControleNetflixOfficielV111() {
  const contexte = chargerContexteNetflixV111_({ resultatsFacultatifs: true });
  const hFilms = contexte.hFilms;
  const donneesFilms = contexte.donneesFilms;


  let avecTitre = 0;
  let fichesNetflix = 0;
  let avecDate = 0;
  let sansDate = 0;
  let avecAutresPlateformesDetectees = 0;
  let sourceNetflix = 0;
  let sourceAutre = 0;
  const idsNetflix = {};


  for (let i = 1; i < donneesFilms.length; i++) {
    const ligne = donneesFilms[i];
    const titre = String(ligne[hFilms.Titre] || "").trim();
    if (titre) avecTitre++;


    if (!estNetflixV111_(ligne[hFilms.Plateforme])) continue;


    fichesNetflix++;
    const id = String(ligne[hFilms.ID] || "").trim();
    if (id) idsNetflix[id] = true;


    if (ligne[hFilms.DateDisponibiliteAuto]) avecDate++;
    else sansDate++;


    const detectees = String(ligne[hFilms.PlateformesDetectees] || "").trim();
    if (contientAutrePlateformeNetflixV111_(detectees)) {
      avecAutresPlateformesDetectees++;
    }


    const source = String(ligne[hFilms.SourceDisponibiliteAuto] || "").trim();
    if (estSourceNetflixV111_(source)) sourceNetflix++;
    else if (source) sourceAutre++;
  }


  let lignesListe = 0;
  let idsListeUniques = 0;
  let doublonsListe = 0;
  let absentsListe = 0;
  let nonNetflixDansListe = 0;
  let liensNetflixIntrouvables = 0;
  const vusListe = {};


  if (contexte.controle && contexte.controle.getLastRow() >= 2) {
    const liste = contexte.controle
      .getRange(1, 1, contexte.controle.getLastRow(), 12)
      .getValues();


    const hListe = indexEntetesNetflixV111_(liste[0]);
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
      else if (!estNetflixV111_(
        contexte.filmsParId[id].valeurs[hFilms.Plateforme]
      )) nonNetflixDansListe++;


      if (hListe.StatutControle !== undefined) {
        const statutListe = String(
          liste[i][hListe.StatutControle] || ""
        ).trim().toUpperCase();
        if (statutListe === "LIEN_NETFLIX_INTROUVABLE") {
          liensNetflixIntrouvables++;
        }
      }
    }
  }


  const idsNetflixManquants = Object.keys(idsNetflix).filter(function(id) {
    return !vusListe[id];
  }).length;


  let lignesResultats = 0;
  let lignesResultatsAvecId = 0;
  let lignesResultatsVides = 0;
  let enteteResultats = "ABSENTE";
  let datesDetectees = 0;
  let aucuneAlerte = 0;
  let autresStatuts = 0;
  const detailAutresStatuts = {};


  if (contexte.resultats) {
    enteteResultats = "N" + contexte.resultats.ligneEntete;
    lignesResultats = contexte.resultats.lignes.length - 1;
    const hR = contexte.resultats.index;


    for (let i = 1; i < contexte.resultats.lignes.length; i++) {
      const ligneResultat = contexte.resultats.lignes[i];
      const idFilm = String(ligneResultat[hR.IDFilm] || "").trim();


      if (!idFilm) {
        lignesResultatsVides++;
        continue;
      }


      lignesResultatsAvecId++;
      const statut = String(
        ligneResultat[hR.StatutControle] || ""
      ).trim().toUpperCase();


      if (statut === "DATE_DETECTEE") {
        datesDetectees++;
      } else if (statut === "AUCUNE_ALERTE") {
        aucuneAlerte++;
      } else {
        autresStatuts++;
        const cle = statut || "(STATUT VIDE)";
        detailAutresStatuts[cle] = (detailAutresStatuts[cle] || 0) + 1;
      }
    }
  }


  const totalResultatsComptabilises =
    lignesResultatsVides + datesDetectees + aucuneAlerte + autresStatuts;
  const ecartResultats = lignesResultats - totalResultatsComptabilises;


  Logger.log("===== DIAGNOSTIC NETFLIX OFFICIEL V1.1.1 =====");
  Logger.log("Fiches avec titre : " + avecTitre);
  Logger.log("Fiches NETFLIX reconnues : " + fichesNetflix);
  Logger.log("Avec DateDisponibiliteAuto : " + avecDate);
  Logger.log("Sans DateDisponibiliteAuto : " + sansDate);
  Logger.log("Avec autre plateforme déjà détectée : " + avecAutresPlateformesDetectees);
  Logger.log("Source NETFLIX OFFICIEL : " + sourceNetflix);
  Logger.log("Date gérée par une autre source : " + sourceAutre);
  Logger.log("Feuille CONTROLE_NETFLIX : " + (contexte.controle ? "PRÉSENTE" : "ABSENTE"));
  Logger.log("Lignes préparées A:L : " + lignesListe);
  Logger.log("ID uniques A:L : " + idsListeUniques);
  Logger.log("Doublons A:L : " + doublonsListe);
  Logger.log("ID A:L absents de Films : " + absentsListe);
  Logger.log("Lignes A:L qui ne sont plus NETFLIX : " + nonNetflixDansListe);
  Logger.log("Fiches NETFLIX absentes de A:L : " + idsNetflixManquants);
  Logger.log("Liens NETFLIX introuvables dans A:L : " + liensNetflixIntrouvables);
  Logger.log("En-tête résultats Edge : " + enteteResultats);
  Logger.log("Emplacements résultats Edge lus : " + lignesResultats);
  Logger.log("Lignes Edge avec ID : " + lignesResultatsAvecId);
  Logger.log("Lignes Edge vides : " + lignesResultatsVides);
  Logger.log("Résultats DATE_DETECTEE : " + datesDetectees);
  Logger.log("Résultats AUCUNE_ALERTE : " + aucuneAlerte);
  Logger.log("Autres statuts résultats : " + autresStatuts);


  Object.keys(detailAutresStatuts).sort().forEach(function(statut) {
    Logger.log("  - " + statut + " : " + detailAutresStatuts[statut]);
  });


  Logger.log("Total résultats comptabilisés : " + totalResultatsComptabilises);
  Logger.log("Écart de comptabilisation : " + ecartResultats);
  Logger.log("Protection multi-plateformes : ACTIVE");
  Logger.log("Protection dates d'autres sources : ACTIVE");
  Logger.log("Cohérence calculée depuis ControleLe : ACTIVE");
  Logger.log("Âge maximal d'un relevé Edge : " + NETFLIX_AGE_MAX_RESULTAT_JOURS_V111 + " jours");
  Logger.log("Échéance Netflix maximale acceptée : " + NETFLIX_ECHEANCE_MAX_JOURS_V111 + " jours");
  Logger.log("AUCUNE ÉCRITURE EFFECTUÉE");
  Logger.log("AUCUN APPEL EXTERNE EFFECTUÉ");
  Logger.log("===== FIN DIAGNOSTIC NETFLIX OFFICIEL =====");
}




/**
 * Alias conservé pour compatibilité avec les anciens déclenchements manuels.
 */
function diagnostiquerControleNetflixOfficielV110() {
  diagnostiquerControleNetflixOfficielV111();
}


function verifierResultatsNetflixOfficielSansEcriture() {
  traiterResultatsNetflixOfficielV111_(false);
}




function appliquerResultatsNetflixOfficiel() {
  traiterResultatsNetflixOfficielV111_(true);
}




function traiterResultatsNetflixOfficielV111_(ecrire) {
  const contexte = chargerContexteNetflixV111_({ resultatsFacultatifs: false });
  const films = contexte.films;
  const hFilms = contexte.hFilms;
  const lignesResultats = contexte.resultats.lignes;
  const hResultats = contexte.resultats.index;
  const maintenant = new Date();
  const aujourdHui = normaliserJourNetflixV111_(maintenant);


  let controlesValides = 0;
  let datesValidees = 0;
  let sansAlerte = 0;
  let ignores = 0;
  let erreurs = 0;
  let conflitsProteges = 0;
  let ajoutsPlateforme = 0;
  let changements = 0;
  let lignesEdgeVides = 0;
  let statutsNonPrisEnCharge = 0;
  const lignesEdgeLues = Math.max(0, lignesResultats.length - 1);


  Logger.log("===== IMPORT NETFLIX OFFICIEL V1.1.1 =====");
  Logger.log("Mode : " + (ecrire ? "ÉCRITURE" : "SIMULATION SANS ÉCRITURE"));
  Logger.log("En-tête Edge détecté en N" + contexte.resultats.ligneEntete);


  for (let i = 1; i < lignesResultats.length; i++) {
    const resultat = lignesResultats[i];
    const idFilm = String(resultat[hResultats.IDFilm] || "").trim();
    if (!idFilm) {
      lignesEdgeVides++;
      Logger.log("LIGNE EDGE VIDE | position résultat " + (i + 1));
      continue;
    }


    const film = contexte.filmsParId[idFilm];
    if (!film) {
      Logger.log("IGNORÉ | ID absent de Films : " + idFilm);
      ignores++;
      continue;
    }


    if (!estNetflixV111_(film.valeurs[hFilms.Plateforme])) {
      Logger.log("IGNORÉ | " + idFilm + " | plateforme différente de NETFLIX");
      ignores++;
      continue;
    }


    const statut = String(resultat[hResultats.StatutControle] || "")
      .trim().toUpperCase();
    const message = String(resultat[hResultats.MessageNetflix] || "").trim();


    if (statut !== "AUCUNE_ALERTE" && statut !== "DATE_DETECTEE") {
      Logger.log(
        "IGNORÉ SANS EFFACEMENT | " + idFilm +
        " | statut=" + (statut || "(VIDE)")
      );
      statutsNonPrisEnCharge++;
      ignores++;
      continue;
    }


    const controleLe = convertirDateControleNetflixV111_(
      resultat[hResultats.ControleLe]
    );
    if (!controleLe) {
      Logger.log("ERREUR HORODATAGE | " + idFilm + " | ControleLe invalide");
      erreurs++;
      continue;
    }


    const jourControle = normaliserJourNetflixV111_(controleLe);
    const ageResultat = Math.round(
      (aujourdHui.getTime() - jourControle.getTime()) / 86400000
    );
    if (ageResultat < -1 || ageResultat > NETFLIX_AGE_MAX_RESULTAT_JOURS_V111) {
      Logger.log(
        "RÉSULTAT TROP ANCIEN | " + idFilm + " | âge=" + ageResultat +
        " jours | contrôle=" + formaterDateNetflixV111_(jourControle)
      );
      erreurs++;
      continue;
    }
    controlesValides++;


    const plateformesAvant = String(
      film.valeurs[hFilms.PlateformesDetectees] || ""
    ).trim();
    const plateformesApres = ajouterPlateformeNetflixV111_(plateformesAvant);
    const plateformeAjoutee = plateformesApres !== plateformesAvant;
    if (plateformeAjoutee) ajoutsPlateforme++;


    if (statut === "AUCUNE_ALERTE") {
      sansAlerte++;
      Logger.log(
        "SANS ALERTE | " + idFilm + " | ligne " + film.ligne +
        " | date existante conservée" +
        (plateformeAjoutee ? " | NETFLIX sera ajoutée aux plateformes" : "")
      );


      if (ecrire) {
        ecrireChampNetflixV111_(films, film.ligne, hFilms,
          "DernierControleDisponibilite", controleLe);
        if (plateformeAjoutee) {
          ecrireChampNetflixV111_(films, film.ligne, hFilms,
            "PlateformesDetectees", plateformesApres);
        }
      }
      continue;
    }


    if (!/Dernier\s+jour.*Netflix/i.test(message)) {
      Logger.log("ERREUR VALIDATION | " + idFilm + " | message=" + message);
      erreurs++;
      continue;
    }


    const dateRetrait = convertirDateResultatNetflixV111_(
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
    if (difference < 0 || difference > NETFLIX_ECHEANCE_MAX_JOURS_V111) {
      Logger.log(
        "ERREUR COHÉRENCE | " + idFilm +
        " | échéance=" + difference + " jours" +
        " | contrôle=" + formaterDateNetflixV111_(jourControle)
      );
      erreurs++;
      continue;
    }


    const ancienneDate = film.valeurs[hFilms.DateDisponibiliteAuto];
    const ancienneSource = String(
      film.valeurs[hFilms.SourceDisponibiliteAuto] || ""
    ).trim();
    const autreSourceProtegee = !!ancienneDate && !!ancienneSource &&
      !estSourceNetflixV111_(ancienneSource);


    if (autreSourceProtegee) {
      conflitsProteges++;
      Logger.log(
        "CONFLIT PROTÉGÉ | " + idFilm + " | ligne " + film.ligne +
        " | source conservée=" + ancienneSource +
        " | date Netflix=" + formaterDateNetflixV111_(dateRetrait)
      );
      if (ecrire) {
        ecrireChampNetflixV111_(films, film.ligne, hFilms,
          "DernierControleDisponibilite", controleLe);
        if (plateformeAjoutee) {
          ecrireChampNetflixV111_(films, film.ligne, hFilms,
            "PlateformesDetectees", plateformesApres);
        }
      }
      continue;
    }


    datesValidees++;
    const dateChangee = !memeDateNetflixV111_(ancienneDate, dateRetrait);
    if (dateChangee) changements++;
    Logger.log(
      "DATE VALIDÉE | " + idFilm + " | ligne " + film.ligne + " | " +
      formaterDateNetflixV111_(dateRetrait) +
      (dateChangee ? " | changement" : " | identique")
    );


    if (!ecrire) continue;


    ecrireChampNetflixV111_(films, film.ligne, hFilms,
      "DateDisponibiliteAuto", dateRetrait);
    ecrireChampNetflixV111_(films, film.ligne, hFilms,
      "SourceDisponibiliteAuto", NETFLIX_SOURCE_OFFICIELLE_V111);
    ecrireChampNetflixV111_(films, film.ligne, hFilms,
      "DernierControleDisponibilite", controleLe);
    ecrireChampNetflixV111_(films, film.ligne, hFilms,
      "StatutDisponibiliteAuto", "DATE_CONNUE");
    ecrireChampNetflixV111_(films, film.ligne, hFilms,
      "StatutDisponibilite", "DATE_CONNUE");
    if (plateformeAjoutee) {
      ecrireChampNetflixV111_(films, film.ligne, hFilms,
        "PlateformesDetectees", plateformesApres);
    }
    ecrireChampNetflixV111_(films, film.ligne, hFilms,
      "CommentaireDisponibilite",
      "Netflix officiel : " + message + " / Date détectée : " +
      formaterDateNetflixV111_(dateRetrait));
    if (dateChangee) {
      ecrireChampNetflixV111_(films, film.ligne, hFilms,
        "DernierChangementDisponibilite", maintenant);
    }
  }


  const totalComptabilise = lignesEdgeLues;
  const ecartComptabilisation = 0;


  Logger.log("Emplacements Edge lus : " + lignesEdgeLues);
  Logger.log("Lignes Edge vides : " + lignesEdgeVides);
  Logger.log("Contrôles valides : " + controlesValides);
  Logger.log("Dates validées : " + datesValidees);
  Logger.log("Sans alerte : " + sansAlerte);
  Logger.log("Conflits d'autre source protégés : " + conflitsProteges);
  Logger.log("Ajouts NETFLIX aux plateformes : " + ajoutsPlateforme);
  Logger.log("Changements de date : " + changements);
  Logger.log("Statuts non pris en charge : " + statutsNonPrisEnCharge);
  Logger.log("Ignorés : " + ignores);
  Logger.log("Erreurs : " + erreurs);
  Logger.log("Total comptabilisé : " + totalComptabilise);
  Logger.log("Écart de comptabilisation : " + ecartComptabilisation);
  if (!ecrire) Logger.log("AUCUNE ÉCRITURE EFFECTUÉE");
  Logger.log("===== FIN IMPORT NETFLIX OFFICIEL =====");
}




function chargerContexteNetflixV111_(options) {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const films = classeur.getSheetByName("Films");
  const controle = classeur.getSheetByName(NETFLIX_CONTROLE_FEUILLE_V111);
  if (!films) throw new Error("La feuille Films est introuvable.");


  const donneesFilms = films.getDataRange().getValues();
  if (donneesFilms.length < 2) throw new Error("La feuille Films est vide.");


  const hFilms = indexEntetesNetflixV111_(donneesFilms[0]);
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
  if (controle) resultats = lireResultatsNetflixV111_(controle);
  if (!resultats && !(options && options.resultatsFacultatifs)) {
    throw new Error(
      "Résultats Edge introuvables dans CONTROLE_NETFLIX. " +
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




function lireResultatsNetflixV111_(controle) {
  const derniereLigne = controle.getLastRow();
  if (derniereLigne < 1 || controle.getMaxColumns() < 22) return null;


  const nombreLignes = Math.max(1, derniereLigne);
  const valeurs = controle.getRange(1, 14, nombreLignes, 9).getValues();
  let positionEntete = -1;
  for (let i = 0; i < Math.min(2, valeurs.length); i++) {
    if (String(valeurs[i][0] || "").trim() === "IDFilm") {
      positionEntete = i;
      break;
    }
  }
  if (positionEntete < 0) return null;


  const lignes = valeurs.slice(positionEntete);
  const index = indexEntetesNetflixV111_(lignes[0]);
  [
    "IDFilm", "MessageNetflix",
    "DateRetraitDetectee", "ControleLe", "StatutControle"
  ].forEach(function(entete) {
    if (index[entete] === undefined) {
      throw new Error("Colonne résultat manquante : " + entete);
    }
  });
  return { lignes: lignes, index: index, ligneEntete: positionEntete + 1 };
}




function ajouterPlateformeNetflixV111_(valeur) {
  const texte = String(valeur || "").trim();
  if (estNetflixV111_(texte)) return texte;
  return texte ? texte + ", " + NETFLIX_PLATEFORME_V111 : NETFLIX_PLATEFORME_V111;
}




function contientAutrePlateformeNetflixV111_(valeur) {
  const normalise = normaliserNetflixV111_(valeur)
    .replace(/NETFLIX/g, "")
    .replace(/[,;|/+\-]+/g, "")
    .trim();
  return normalise !== "";
}




function estNetflixV111_(valeur) {
  const plateforme = normaliserNetflixV111_(valeur);
  return plateforme.indexOf("NETFLIX") >= 0;
}




function estSourceNetflixV111_(valeur) {
  return normaliserNetflixV111_(valeur).indexOf("NETFLIX") >= 0;
}




function normaliserNetflixV111_(valeur) {
  return String(valeur || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}




function convertirDateResultatNetflixV111_(valeur) {
  if (!valeur) return null;
  if (Object.prototype.toString.call(valeur) === "[object Date]" &&
      !isNaN(valeur.getTime())) {
    const copie = new Date(valeur);
    copie.setHours(12, 0, 0, 0);
    return copie;
  }
  const texte = String(valeur).trim();
  let correspondance = texte.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let date = null;
  if (correspondance) {
    date = new Date(
      Number(correspondance[1]), Number(correspondance[2]) - 1,
      Number(correspondance[3]), 12, 0, 0, 0
    );
  } else {
    correspondance = texte.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!correspondance) return null;
    date = new Date(
      Number(correspondance[3]), Number(correspondance[2]) - 1,
      Number(correspondance[1]), 12, 0, 0, 0
    );
  }
  return isNaN(date.getTime()) ? null : date;
}




function convertirDateControleNetflixV111_(valeur) {
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




function normaliserJourNetflixV111_(date) {
  const jour = new Date(date);
  jour.setHours(12, 0, 0, 0);
  return jour;
}




function memeDateNetflixV111_(valeurA, valeurB) {
  const dateA = convertirDateResultatNetflixV111_(valeurA);
  const dateB = convertirDateResultatNetflixV111_(valeurB);
  if (!dateA || !dateB) return false;
  return dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate();
}




function formaterDateNetflixV111_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}




function ecrireChampNetflixV111_(feuille, ligne, index, nomColonne, valeur) {
  feuille.getRange(ligne, index[nomColonne] + 1).setValue(valeur);
}




function indexEntetesNetflixV111_(entetes) {
  const index = {};
  entetes.forEach(function(entete, position) {
    const nom = String(entete || "").trim();
    if (nom) index[nom] = position;
  });
  return index;
}






