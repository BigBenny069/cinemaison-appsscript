/**
 * ============================================================
 * CinéMaison V4
 * Script  : 11_CONTROLE_PRIME_OFFICIEL.gs
 * Rôle    : Diagnostic et import sécurisé des résultats Prime Video officiels
 * Version : 1.7 (23/09/2026)
 * ============================================================
 *
 * Correctif V1.7 (23/09/2026) : ajout du bloc ARRIVEE_DETECTEE,
 * symétrique de DATE_DETECTEE mais pour une fiche BIENTOT_DISPONIBLE
 * (compte à rebours avant disponibilité plutôt qu'avant retrait) --
 * jusqu'ici, joursAvantDisponible était bien détecté par prime.js mais
 * jamais transmis jusqu'ici, donc jamais aucune date affichée pour ces
 * fiches (signalé par Ben, captures à l'appui : badge "BIENTÔT" sans
 * aucun compte à rebours). Bloc entièrement à part, DATE_DETECTEE
 * inchangé -- réutilise DateDisponibiliteAuto (même champ, sens
 * différent selon StatutAcces) et les compteurs existants.
 *
 * Correctif V1.6 (19/09/2026) : remplace le mécanisme V1.2 ci-dessous
 * -- Phase D du chantier "Séparer Catégorie et Statut dans Type" (voir
 * migration Phase C, migrerTypeVersStatutAccesV1(), et Phase D côté
 * Vercel/App.jsx). Le statut Prime détecté (StatutPrimeDetecte) est
 * désormais écrit dans une colonne StatutAcces DÉDIÉE :
 *   - INDISPONIBLE -> StatutAcces = "Indispo"
 *   - VOD -> StatutAcces = "VOD"
 *   - BIENTOT_DISPONIBLE -> StatutAcces = "Bientôt disponible"
 *   - ABONNEMENT_COMPLEMENTAIRE -> StatutAcces = "Abonnement complémentaire"
 *     (vue dédiée + badge "ABO SUPP" prévus côté App.jsx, Phase D)
 *   - INCLUS -> StatutAcces = "Inclus"
 *   - (INCONNU n'arrive plus jusqu'ici : filtré en amont côté
 *     prime.js, jamais écrit dans CONTROLE_PRIME -- voir
 *     alerterStatutsInconnusPrime_, 18/09/2026)
 * Type n'est PLUS JAMAIS modifié par ce mécanisme -- il ne porte plus
 * que la catégorie (Film/Série/Documentaire/Spectacle), fixée une
 * fois pour toutes par la migration Phase C. TypeContenuOriginal
 * devient donc inutile (jamais créée en pratique de toute façon).
 *
 * Correctif V1.5 (19/09/2026) : ajout de migrerTypeVersStatutAccesV1(),
 * migration ponctuelle Phase C du chantier "Séparer Catégorie et
 * Statut dans Type" -- transfère les statuts VOD/Indispo/Bientôt
 * disponible actuellement mélangés dans Type vers une nouvelle
 * colonne StatutAcces, restaure Type à "Film" pour ces fiches
 * (vérifié à la main, aucune exception). À lancer une seule fois,
 * avant le reste de la Phase D. N'ajoute ni ne modifie
 * TypeContenuOriginal (jamais créée en pratique, devenue inutile).
 *
 * Correctif V1.4 (13/09/2026) : detailFiche_ plantait sur les 3
 * plateformes ("ReferenceError: idFilm is not defined") -- idFilm est
 * déclaré à l'intérieur de la boucle (portée locale à chaque tour),
 * mais detailFiche_ est définie avant la boucle et n'y avait donc pas
 * accès. L'id est maintenant passé en paramètre explicite. Aucune
 * donnée perdue entre-temps (l'écriture réelle n'était pas affectée,
 * seule l'étape de vérification/mail plantait après coup).
 *
 * Correctif V1.3 (13/09/2026) : traiterResultatsPrimeOfficielV110_
 * collecte maintenant aussi le détail par catégorie (id/titre/durée/
 * type/affiche), purement additif -- alimente la page "Voir le
 * détail" du mail de contrôle (voir 09_WEBHOOK.gs). Aucune ligne de
 * la logique de validation existante n'a été modifiée ou supprimée.
 *
 * Correctif V1.2 (historique, remplacé par V1.6 ci-dessus) : mise à
 * jour automatique de Type selon le statut Prime détecté
 * (StatutPrimeDetecte, 7e colonne CONTROLE_PRIME, ajoutée par
 * api/controle-prime.js V1.1) :
 *   - INDISPONIBLE -> Type = "Indispo"
 *   - VOD -> Type = "VOD"
 *   - BIENTOT_DISPONIBLE -> Type = "Bientôt disponible"
 *   - INCLUS -> restaure le Type d'origine (Film/Série/Documentaire/
 *     Spectacle), mémorisé dans une nouvelle colonne TypeContenuOriginal
 *     (créée au besoin par ajouterColonneTypeContenuOriginalV1(), à
 *     lancer une fois depuis l'éditeur avant le premier import qui
 *     touche Type). Si TypeContenuOriginal est vide alors que Type est
 *     déjà un statut (Indispo/VOD/Bientôt disponible saisi à la main
 *     avant ce correctif), on part du principe que c'était "Film" (cas
 *     largement majoritaire chez Ben) -- loggé explicitement à chaque
 *     fois pour qu'il puisse vérifier les cas où ce serait faux.
 *   - ABONNEMENT_COMPLEMENTAIRE / INCONNU : Type non touché, aucune vue
 *     dédiée pour l'instant.
 * Ne concerne QUE les fiches PRIME VIDEO (Netflix/Disney auront leur
 * propre logique similaire plus tard, CANAL+ n'est pas concerné).
 *
 * Correctif V1.1.2 (07/09/2026) : ajout d'un "return" du résumé
 * (compteurs) à la toute fin de traiterResultatsPrimeOfficielV110_ --
 * AUCUNE ligne existante modifiée, juste une valeur de retour en plus
 * (ignorée quand la fonction est lancée depuis l'éditeur, comme avant).
 * Sert à construire l'email de validation "Appliquer" (09_WEBHOOK.gs).
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

// V2.0 (19/09/2026) : écrit dans StatutAcces, jamais dans Type -- voir
// le correctif détaillé en tête de fichier.
const PRIME_STATUT_VERS_STATUTACCES_V1 = Object.freeze({
  "INDISPONIBLE": "Indispo",
  "VOD": "VOD",
  "BIENTOT_DISPONIBLE": "Bientôt disponible",
  "ABONNEMENT_COMPLEMENTAIRE": "Abonnement complémentaire",
  "INCLUS": "Inclus",
});




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
  return traiterResultatsPrimeOfficielV110_(false);
}




function appliquerResultatsPrimeOfficiel() {
  return traiterResultatsPrimeOfficielV110_(true);
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

  // Correctif V1.3 (13/09/2026) : collecte du détail par catégorie
  // (id/titre/durée/type/affiche), purement additif -- ne change rien
  // à la logique de validation ci-dessus, sert uniquement à alimenter
  // la page "Voir le détail" du mail (voir 09_WEBHOOK.gs).
  const details = { sansAlerte: [], conflitsProteges: [], datesValidees: [], ignores: [], erreurs: [] };
  function detailFiche_(f, id) {
    if (!f) return { id: id };
    return {
      id: id,
      titre: f.valeurs[hFilms.Titre] || "",
      duree: hFilms.Duree !== undefined ? (f.valeurs[hFilms.Duree] || "") : "",
      type: hFilms.Type !== undefined ? (f.valeurs[hFilms.Type] || "") : "",
      affiche: hFilms.Affiche !== undefined ? (f.valeurs[hFilms.Affiche] || "") : "",
      plateforme: "PRIME VIDEO",
    };
  }


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
      details.ignores.push({ id: idFilm, raison: "ID absent de Films" });
      continue;
    }


    if (!estPrimeVideoV110_(film.valeurs[hFilms.Plateforme])) {
      Logger.log("IGNORÉ | " + idFilm + " | plateforme différente de PRIME VIDEO");
      ignores++;
      details.ignores.push(Object.assign(detailFiche_(film, idFilm), { raison: "plateforme différente de PRIME VIDEO" }));
      continue;
    }


    const statut = String(resultat[hResultats.StatutControle] || "")
      .trim().toUpperCase();
    const message = String(resultat[hResultats.MessagePrime] || "").trim();


    if (statut !== "AUCUNE_ALERTE" && statut !== "DATE_DETECTEE" && statut !== "ARRIVEE_DETECTEE") {
      Logger.log("IGNORÉ SANS EFFACEMENT | " + idFilm + " | statut=" + statut);
      ignores++;
      details.ignores.push(Object.assign(detailFiche_(film, idFilm), { raison: "statut=" + statut }));
      continue;
    }


    const controleLe = convertirDateControlePrimeV111_(
      resultat[hResultats.ControleLe]
    );
    if (!controleLe) {
      Logger.log("ERREUR HORODATAGE | " + idFilm + " | ControleLe invalide");
      erreurs++;
      details.erreurs.push(Object.assign(detailFiche_(film, idFilm), { raison: "ControleLe invalide" }));
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
      details.erreurs.push(Object.assign(detailFiche_(film, idFilm), { raison: "résultat trop ancien (" + ageResultat + " jours)" }));
      continue;
    }
    controlesValides++;

    // V2.0 (19/09/2026) : calcul du changement de StatutAcces éventuel,
    // une seule fois ici -- appliqué dans les 3 branches d'écriture
    // plus bas (AUCUNE_ALERTE, CONFLIT PROTÉGÉ, DATE_DETECTEE), car
    // c'est indépendant du suivi de date (ça reflète juste la
    // disponibilité actuelle détectée par Prime). Type n'est plus
    // jamais touché ici -- voir le correctif détaillé en tête de fichier.
    const statutPrimeDetecte = String(
      resultat[hResultats.StatutPrimeDetecte] || ""
    ).trim().toUpperCase();
    const nouveauStatutAcces = (hFilms.StatutAcces !== undefined)
      ? calculerNouveauStatutAccesV1_(film.valeurs[hFilms.StatutAcces], statutPrimeDetecte)
      : null;
    if (nouveauStatutAcces === null && hFilms.StatutAcces === undefined) {
      Logger.log(
        "  [StatutAcces] Colonne StatutAcces introuvable dans Films -- lance " +
        "migrerTypeVersStatutAccesV1() une fois (Phase C), StatutAcces non modifié pour " + idFilm + "."
      );
    }

    function ecrireStatutAccesSiBesoin_() {
      if (!nouveauStatutAcces) return;
      Logger.log(
        "  [StatutAcces] " + idFilm + " : " + (film.valeurs[hFilms.StatutAcces] || "(vide)") +
        " -> " + nouveauStatutAcces
      );
      ecrireChampPrimeV110_(films, film.ligne, hFilms, "StatutAcces", nouveauStatutAcces);
    }


    const plateformesAvant = String(
      film.valeurs[hFilms.PlateformesDetectees] || ""
    ).trim();
    const plateformesApres = ajouterPlateformePrimeV110_(plateformesAvant);
    const plateformeAjoutee = plateformesApres !== plateformesAvant;
    if (plateformeAjoutee) ajoutsPlateforme++;


    if (statut === "AUCUNE_ALERTE") {
      sansAlerte++;
      details.sansAlerte.push(detailFiche_(film, idFilm));
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
        ecrireStatutAccesSiBesoin_();
      }
      continue;
    }


    // NOUVEAU (23/09/2026) -- symétrique du bloc DATE_DETECTEE plus bas,
    // mais pour une fiche BIENTOT_DISPONIBLE (pas encore sortie) plutôt
    // qu'une fiche sur le départ. Volontairement un bloc À PART entier
    // (jamais mélangé au bloc DATE_DETECTEE existant, dont la regex/le
    // wording sont spécifiques au départ) -- bloc DATE_DETECTEE
    // entièrement inchangé. Réutilise DateDisponibiliteAuto (même
    // champ que pour un départ -- sa vraie signification dépend de
    // StatutAcces, géré côté App.jsx) et les compteurs existants
    // (datesValidees/changements/conflitsProteges), pour ne rien
    // ajouter au format du mail récapitulatif.
    if (statut === "ARRIVEE_DETECTEE") {
      const joursArrivee = Number(resultat[hResultats.JoursRestants]);
      const correspondanceMessageArrivee = message.match(
        /Disponible\s+sur\s+Prime\s+Video\s+dans\s+(\d+)\s+jours?/i
      );
      if (!correspondanceMessageArrivee || !isFinite(joursArrivee) || joursArrivee < 0 || joursArrivee > 60 ||
          Number(correspondanceMessageArrivee[1]) !== joursArrivee) {
        Logger.log("ERREUR VALIDATION ARRIVÉE | " + idFilm + " | message=" + message);
        erreurs++;
        details.erreurs.push(Object.assign(detailFiche_(film, idFilm), { raison: "message arrivée invalide" }));
        continue;
      }

      const dateArrivee = convertirDateResultatPrimeV110_(
        resultat[hResultats.DateRetraitDetectee]
      );
      if (!dateArrivee) {
        Logger.log("ERREUR DATE ARRIVÉE | " + idFilm);
        erreurs++;
        details.erreurs.push(Object.assign(detailFiche_(film, idFilm), { raison: "date arrivée invalide" }));
        continue;
      }

      const differenceArrivee = Math.round(
        (dateArrivee.getTime() - jourControle.getTime()) / 86400000
      );
      if (Math.abs(differenceArrivee - joursArrivee) > 1) {
        Logger.log(
          "ERREUR COHÉRENCE ARRIVÉE | " + idFilm + " | jours=" + joursArrivee +
          " | différence=" + differenceArrivee
        );
        erreurs++;
        details.erreurs.push(Object.assign(detailFiche_(film, idFilm), { raison: "incohérence jours/date arrivée" }));
        continue;
      }

      const ancienneDateArrivee = film.valeurs[hFilms.DateDisponibiliteAuto];
      const ancienneSourceArrivee = String(
        film.valeurs[hFilms.SourceDisponibiliteAuto] || ""
      ).trim();
      const autreSourceArriveeProtegee = !!ancienneDateArrivee && !!ancienneSourceArrivee &&
        !estSourcePrimeV110_(ancienneSourceArrivee);

      if (autreSourceArriveeProtegee) {
        conflitsProteges++;
        details.conflitsProteges.push(Object.assign(detailFiche_(film, idFilm), { raisonConflit: "source conservée : " + ancienneSourceArrivee }));
        Logger.log(
          "CONFLIT PROTÉGÉ ARRIVÉE | " + idFilm + " | ligne " + film.ligne +
          " | source conservée=" + ancienneSourceArrivee
        );
        if (ecrire) {
          ecrireChampPrimeV110_(films, film.ligne, hFilms,
            "DernierControleDisponibilite", controleLe);
          if (plateformeAjoutee) {
            ecrireChampPrimeV110_(films, film.ligne, hFilms,
              "PlateformesDetectees", plateformesApres);
          }
          ecrireStatutAccesSiBesoin_();
        }
        continue;
      }

      datesValidees++;
      const dateArriveeChangee = !memeDatePrimeV110_(ancienneDateArrivee, dateArrivee);
      if (dateArriveeChangee) changements++;
      details.datesValidees.push(Object.assign(detailFiche_(film, idFilm), {
        dateRetrait: formaterDatePrimeV110_(dateArrivee),
        changee: dateArriveeChangee,
      }));
      Logger.log(
        "DATE ARRIVÉE VALIDÉE | " + idFilm + " | ligne " + film.ligne + " | " +
        formaterDatePrimeV110_(dateArrivee) +
        (dateArriveeChangee ? " | changement" : " | identique")
      );

      if (ecrire) {
        ecrireChampPrimeV110_(films, film.ligne, hFilms,
          "DateDisponibiliteAuto", dateArrivee);
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
          formaterDatePrimeV110_(dateArrivee));
        if (dateArriveeChangee) {
          ecrireChampPrimeV110_(films, film.ligne, hFilms,
            "DernierChangementDisponibilite", maintenant);
        }
        ecrireStatutAccesSiBesoin_();
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
      details.erreurs.push(Object.assign(detailFiche_(film, idFilm), { raison: "message invalide" }));
      continue;
    }


    const dateRetrait = convertirDateResultatPrimeV110_(
      resultat[hResultats.DateRetraitDetectee]
    );
    if (!dateRetrait) {
      Logger.log("ERREUR DATE | " + idFilm);
      erreurs++;
      details.erreurs.push(Object.assign(detailFiche_(film, idFilm), { raison: "date invalide" }));
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
      details.erreurs.push(Object.assign(detailFiche_(film, idFilm), { raison: "incohérence jours/date" }));
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
      details.conflitsProteges.push(Object.assign(detailFiche_(film, idFilm), { raisonConflit: "source conservée : " + ancienneSource }));
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
        ecrireStatutAccesSiBesoin_();
      }
      continue;
    }


    datesValidees++;
    const dateChangee = !memeDatePrimeV110_(ancienneDate, dateRetrait);
    if (dateChangee) changements++;
    details.datesValidees.push(Object.assign(detailFiche_(film, idFilm), {
      dateRetrait: formaterDatePrimeV110_(dateRetrait),
      changee: dateChangee,
    }));
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
    ecrireStatutAccesSiBesoin_();
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

  return {
    ecrire: ecrire,
    controlesValides: controlesValides,
    datesValidees: datesValidees,
    sansAlerte: sansAlerte,
    conflitsProteges: conflitsProteges,
    ajoutsPlateforme: ajoutsPlateforme,
    changements: changements,
    ignores: ignores,
    erreurs: erreurs,
    details: details,
  };
}




/**
 * Calcule la nouvelle valeur de StatutAcces à partir du statut Prime
 * détecté. Beaucoup plus simple que l'ancienne calculerNouveauTypeV1_
 * (V1.2-V1.5, historique) : StatutAcces est un champ dédié qui ne
 * porte QUE le statut -- plus besoin de mémoriser/restaurer une
 * catégorie ailleurs, Type n'est plus jamais touché ici. Retourne
 * null si rien ne doit changer (statut non reconnu, ou déjà à jour).
 */
function calculerNouveauStatutAccesV1_(statutAccesActuel, statutPrime) {
  statutAccesActuel = String(statutAccesActuel || "").trim();
  const nouveauStatut = PRIME_STATUT_VERS_STATUTACCES_V1[statutPrime];
  if (!nouveauStatut) return null; // statut Prime non reconnu -- StatutAcces inchangé
  if (statutAccesActuel === nouveauStatut) return null; // déjà à jour
  return nouveauStatut;
}


/**
 * À lancer UNE SEULE FOIS depuis l'éditeur Apps Script, avant le
 * premier import qui touche Type -- ajoute la colonne TypeContenuOriginal
 * à Films si elle n'existe pas déjà. Ne fait rien si elle est déjà là.
 */
function ajouterColonneTypeContenuOriginalV1() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const films = classeur.getSheetByName("Films");
  if (!films) throw new Error("La feuille Films est introuvable.");

  const entetes = films.getRange(1, 1, 1, films.getLastColumn()).getValues()[0]
    .map(function(e) { return String(e || "").trim(); });

  if (entetes.indexOf("TypeContenuOriginal") !== -1) {
    Logger.log("TypeContenuOriginal existe déjà -- rien fait.");
    return;
  }

  const colonne = films.getLastColumn() + 1;
  films.getRange(1, colonne).setValue("TypeContenuOriginal").setFontWeight("bold");
  Logger.log("Colonne TypeContenuOriginal ajoutée (colonne " + colonne + ").");
}


/**
 * NOUVEAU (19/09/2026) -- migration ponctuelle, Phase C du chantier
 * "Séparer Catégorie et Statut dans Type" (voir échange du
 * 18-19/09/2026). À lancer UNE SEULE FOIS depuis l'éditeur Apps
 * Script, avant le déploiement du reste de la Phase D (le code qui
 * lira/écrira StatutAcces partout ailleurs -- App.jsx, get-films.js/
 * update-film.js, les collecteurs, 02_TMDB.gs, 04_DISPONIBILITES_TMDB.gs).
 *
 * Ajoute la colonne StatutAcces si elle n'existe pas encore, puis pour
 * chaque fiche où Type contient AUJOURD'HUI un statut (VOD/Indispo/
 * Bientôt disponible) plutôt qu'une vraie catégorie : transfère ce
 * statut vers StatutAcces et restaure Type à "Film".
 *
 * "Film" pour toutes, sans distinction -- pas une supposition par
 * défaut comme l'ancien PRIME_TYPE_PAR_DEFAUT_V1 (V1.2-V1.5,
 * supprimé en V2.0, plus nécessaire) :
 * les 109 fiches concernées à ce jour ont été listées et vérifiées à
 * la main par Ben (fichier migration-type-a-verifier.csv), confirmé
 * le 19/09/2026 qu'aucune n'est en réalité une Série/Documentaire/
 * Spectacle. Si de nouvelles fiches VOD/Indispo sont apparues entre
 * cette vérification et le lancement de cette fonction, VÉRIFIE-LES
 * D'ABORD à la main (filtre Type sur l'onglet Films) avant de lancer,
 * sinon elles seraient basculées en "Film" sans contrôle.
 *
 * Contrairement à TypeContenuOriginal (colonne jamais créée en
 * pratique malgré le correctif V1.2 -- devenue inutile avec cette
 * séparation, plus besoin de "sauvegarder" la catégorie ailleurs une
 * fois que Type ne contient plus jamais de statut), cette migration
 * ne s'appuie sur aucun filet de sécurité automatique : la
 * vérification manuelle en amont EST le filet de sécurité ici.
 *
 * Idempotent : sans effet si relancé -- une fiche déjà migrée a
 * Type="Film", donc plus dans STATUTS_A_MIGRER_V1 au tour suivant.
 */
function migrerTypeVersStatutAccesV1() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const films = classeur.getSheetByName("Films");
  if (!films) throw new Error("La feuille Films est introuvable.");

  const entetes = films.getRange(1, 1, 1, films.getLastColumn()).getValues()[0]
    .map(function(e) { return String(e || "").trim(); });

  let colStatutAcces = entetes.indexOf("StatutAcces");
  if (colStatutAcces === -1) {
    colStatutAcces = films.getLastColumn();
    films.getRange(1, colStatutAcces + 1).setValue("StatutAcces").setFontWeight("bold");
    Logger.log("Colonne StatutAcces ajoutée (colonne " + (colStatutAcces + 1) + ").");
    entetes.push("StatutAcces");
  } else {
    Logger.log("Colonne StatutAcces déjà présente (colonne " + (colStatutAcces + 1) + ").");
  }

  const colType = entetes.indexOf("Type");
  const colId = entetes.indexOf("ID");
  if (colType === -1) throw new Error("Colonne Type introuvable dans Films.");

  const STATUTS_A_MIGRER_V1 = ["VOD", "Indispo", "Bientôt disponible"];
  const donnees = films.getDataRange().getValues();
  let migrees = 0;

  for (let i = 1; i < donnees.length; i++) {
    const typeActuel = String(donnees[i][colType] || "").trim();
    if (STATUTS_A_MIGRER_V1.indexOf(typeActuel) === -1) continue;

    const ligne = i + 1; // 1-indexé pour getRange (ligne 1 = en-tête)
    films.getRange(ligne, colType + 1).setValue("Film");
    films.getRange(ligne, colStatutAcces + 1).setValue(typeActuel);
    migrees++;
    Logger.log(
      "  " + (colId !== -1 ? donnees[i][colId] : "ligne " + ligne) +
      " : Type " + typeActuel + " -> Film, StatutAcces=" + typeActuel
    );
  }

  Logger.log(migrees + " fiche(s) migrée(s) (Type restauré à Film, StatutAcces renseigné).");
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






