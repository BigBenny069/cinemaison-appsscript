/**
 * ============================================================
 * CinéMaison V4
 * Script : 08_DECLENCHEURS.gs
 * Rôle   : Gestion centralisée et sécurisée des déclencheurs
 * Version: 4.4.2
 * Dépendances :
 *   - 00_CONFIG.gs
 *   - 01_UTILS.gs
 * ============================================================
 *
 * V4.4.2 :
 * - ajoute enrichirSurModification comme tâche officielle ;
 * - prend en charge le type MODIFICATION (onEdit du tableur) ;
 * - ajoute un installateur ciblé des automatismes d'enrichissement ;
 * - conserve la création transactionnelle de la V4.4.1.
 *
 * V4.4.1 :
 * - diagnostic en lecture seule avant toute application ;
 * - validation stricte des tâches officielles ;
 * - refus d'une valeur Actif vide ou invalide ;
 * - refus d'une ligne officielle absente, en double ou inconnue ;
 * - contrôle du nombre, du type et de la source des déclencheurs ;
 * - certification des cadences créées par cette version ;
 * - création transactionnelle avant suppression des anciens ;
 * - préservation de tous les déclencheurs temporaires/non gérés.
 */


const DECLENCHEURS_V441_VERSION = "4.4.2";
const DECLENCHEURS_V44_FEUILLE = "PARAMETRES_DECLENCHEURS";
const DECLENCHEURS_V441_MANIFESTE =
  "CINEMAISON_DECLENCHEURS_V442_MANIFESTE";


const DECLENCHEURS_V44_ENTETES = [
  "Ordre",
  "Actif",
  "Fonction",
  "Déclenchement",
  "Fréquence",
  "Heure",
  "Description",
  "DernièreInstallation",
  "Statut"
];


const DECLENCHEURS_V44_DEFAUT = [
  [1, "OUI", "enrichirNouvellesFichesV4", "MINUTES", 5, "",
    "Enrichit les nouvelles fiches ajoutées depuis AppSheet"],
  [2, "OUI", "enrichirLetterboxdEnAttenteV4", "MINUTES", 5, "",
    "Complète les fiches Letterboxd en attente"],
  [3, "OUI", "enrichirSurModification", "MODIFICATION", "", "",
    "Réenrichit immédiatement la ligne après modification du titre, de l'année ou de l'URL Letterboxd"],
  [4, "OUI", "synchroniserGenresV4", "HEURES", 6, "",
    "Synchronise la liste des genres"],
  [5, "OUI", "controleCanalDisponibilitesCloudflare", "QUOTIDIEN", 1, 6,
    "Contrôle quotidien complet des disponibilités CANAL+"],
  [6, "OUI", "verificationEnrichissements", "QUOTIDIEN", 1, 7,
    "Vérifie les enrichissements incomplets"],
  [7, "OUI", "envoyerMailSyntheseErreurs", "QUOTIDIEN", 1, 8,
    "Envoie uniquement les erreurs encore actives"],
  [8, "OUI", "afficherMenuControlesStreamingV1_", "OUVERTURE", "", "",
    "Affiche le menu Contrôles streaming à l'ouverture"]
];




/**
 * Crée ou complète la feuille de paramètres.
 * Ne crée, ne supprime et ne modifie aucun déclencheur.
 */
function initialiserParametresDeclencheursV44() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  let feuille = classeur.getSheetByName(DECLENCHEURS_V44_FEUILLE);
  let creee = false;


  if (!feuille) {
    feuille = classeur.insertSheet(DECLENCHEURS_V44_FEUILLE);
    creee = true;
  }


  const fonctionsExistantes = {};


  if (feuille.getLastRow() >= 2 && feuille.getLastColumn() >= 3) {
    feuille
      .getRange(2, 3, feuille.getLastRow() - 1, 1)
      .getDisplayValues()
      .forEach(function(ligne) {
        const nom = String(ligne[0] || "").trim();
        if (nom) fonctionsExistantes[nom] = true;
      });
  }


  feuille
    .getRange(1, 1, 1, DECLENCHEURS_V44_ENTETES.length)
    .setValues([DECLENCHEURS_V44_ENTETES]);


  DECLENCHEURS_V44_DEFAUT.forEach(function(definition) {
    const fonction = definition[2];


    if (!fonctionsExistantes[fonction]) {
      feuille.appendRow(
        definition.concat(["", creee ? "À INSTALLER" : "À VÉRIFIER"])
      );
    }
  });


  /*
   * Migration V4.4.1 -> V4.4.2 :
   * l'ajout de la tâche n° 3 décale les ordres suivants. Les cadences,
   * heures et choix Actif existants sont conservés.
   */
  const ordreParFonction = {};


  DECLENCHEURS_V44_DEFAUT.forEach(function(definition) {
    ordreParFonction[definition[2]] = definition[0];
  });


  if (feuille.getLastRow() >= 2) {
    const fonctions = feuille
      .getRange(2, 3, feuille.getLastRow() - 1, 1)
      .getDisplayValues();


    fonctions.forEach(function(ligne, index) {
      const fonction = String(ligne[0] || "").trim();


      if (ordreParFonction[fonction] !== undefined) {
        feuille
          .getRange(index + 2, 1)
          .setValue(ordreParFonction[fonction]);
      }
    });
  }


  formaterFeuilleDeclencheursV44_(feuille);


  Logger.log("===== PARAMÈTRES DÉCLENCHEURS V4.4.2 =====");
  Logger.log("Feuille : " + DECLENCHEURS_V44_FEUILLE);
  Logger.log("Nombre de tâches : " + (feuille.getLastRow() - 1));
  Logger.log("Aucun déclencheur n'a été modifié.");


  journal_(
    "DECLENCHEURS",
    "INITIALISATION_PARAMETRES",
    "OK",
    "Feuille créée ou vérifiée sans modifier les déclencheurs"
  );
}




/**
 * Diagnostic complet et strictement en lecture seule.
 *
 * Apps Script n'expose pas la cadence d'un déclencheur existant.
 * Une cadence est donc déclarée CERTIFIÉE uniquement si le déclencheur
 * correspond au manifeste enregistré lors d'une installation V4.4.2.
 */
function diagnostiquerDeclencheursV441() {
  Logger.log("===== DIAGNOSTIC DÉCLENCHEURS V4.4.2 =====");


  const diagnostic = {
    version: DECLENCHEURS_V441_VERSION,
    configurationValide: false,
    applicationAutorisee: false,
    installationConforme: false,
    cadencesCertifiees: false,
    erreursConfiguration: [],
    avertissements: [],
    taches: [],
    autresDeclencheursPreserves: []
  };


  let definitions = [];


  try {
    definitions = lireParametresDeclencheursV44_();
    validerParametresDeclencheursV44_(definitions);
    diagnostic.configurationValide = true;
    diagnostic.applicationAutorisee = true;
    Logger.log("CONFIGURATION | CONFORME | 8 tâches officielles");
  } catch (erreur) {
    const message = String(erreur.message || erreur);
    diagnostic.erreursConfiguration.push(message);
    Logger.log("CONFIGURATION | BLOQUÉE | " + message);
  }


  const triggers = ScriptApp.getProjectTriggers();
  const parFonction = {};


  triggers.forEach(function(trigger) {
    const fonction = trigger.getHandlerFunction();
    if (!parFonction[fonction]) parFonction[fonction] = [];
    parFonction[fonction].push(trigger);
  });


  const manifeste = lireManifesteDeclencheursV441_();
  const idsCertifies = {};


  if (manifeste && Array.isArray(manifeste.taches)) {
    manifeste.taches.forEach(function(tache) {
      if (tache && tache.id) idsCertifies[tache.id] = tache;
    });
  }


  let structureConforme = diagnostic.configurationValide;
  let toutesCadencesCertifiees = diagnostic.configurationValide;


  definitions.forEach(function(definition) {
    const trouves = parFonction[definition.fonction] || [];
    const attendu = definition.actif ? 1 : 0;
    const nombreOk = trouves.length === attendu;
    let typeOk = true;
    let cadenceCertifiee = !definition.actif;
    let detailCadence = definition.actif
      ? "NON CERTIFIABLE AVANT INSTALLATION V4.4.2"
      : "SANS OBJET";


    if (definition.actif && trouves.length === 1) {
      typeOk = typeDeclencheurConformeV441_(trouves[0], definition);
      const id = trouves[0].getUniqueId();
      const certificat = idsCertifies[id];


      if (
        certificat &&
        certificat.fonction === definition.fonction &&
        certificat.signature === signatureDefinitionV441_(definition)
      ) {
        cadenceCertifiee = true;
        detailCadence = "CERTIFIÉE V4.4.2";
      }
    }


    const ok = nombreOk && typeOk;
    if (!ok) structureConforme = false;
    if (!cadenceCertifiee) toutesCadencesCertifiees = false;


    const etat = {
      fonction: definition.fonction,
      actif: definition.actif,
      attendu: attendu,
      trouve: trouves.length,
      typeEtSourceConformes: typeOk,
      cadence: detailCadence,
      configuration: descriptionHoraireDeclencheurV44_(definition)
    };


    diagnostic.taches.push(etat);


    Logger.log(
      (ok ? "STRUCTURE OK" : "À VÉRIFIER") +
      " | " + definition.fonction +
      " | attendu=" + attendu +
      " | trouvé=" + trouves.length +
      " | type/source=" + (typeOk ? "OK" : "NON") +
      " | cadence=" + detailCadence +
      " | réglage=" + etat.configuration
    );
  });


  const officielles = fonctionsOfficiellesDeclencheursV441_();


  triggers.forEach(function(trigger) {
    const fonction = trigger.getHandlerFunction();


    if (!officielles.includes(fonction)) {
      diagnostic.autresDeclencheursPreserves.push({
        fonction: fonction,
        typeEvenement: String(trigger.getEventType()),
        source: String(trigger.getTriggerSource())
      });
    }
  });


  diagnostic.installationConforme =
    diagnostic.configurationValide && structureConforme;
  diagnostic.cadencesCertifiees =
    diagnostic.installationConforme && toutesCadencesCertifiees;


  if (
    definitions.some(function(definition) {
      return definition.actif &&
        definition.type === "MINUTES" &&
        definition.frequence === 5;
    })
  ) {
    diagnostic.avertissements.push(
      "Les tâches de 5 minutes doivent conserver leur verrou LockService commun."
    );
  }


  Logger.log(
    "Autres déclencheurs préservés : " +
    diagnostic.autresDeclencheursPreserves.length
  );


  diagnostic.autresDeclencheursPreserves.forEach(function(autre) {
    Logger.log(
      "PRÉSERVÉ | " + autre.fonction +
      " | " + autre.typeEvenement +
      " | " + autre.source
    );
  });


  Logger.log(
    "Configuration valide : " +
    (diagnostic.configurationValide ? "OUI" : "NON")
  );
  Logger.log(
    "Application autorisée : " +
    (diagnostic.applicationAutorisee ? "OUI" : "NON")
  );
  Logger.log(
    "Structure installée conforme : " +
    (diagnostic.installationConforme ? "OUI" : "NON")
  );
  Logger.log(
    "Cadences certifiées V4.4.2 : " +
    (diagnostic.cadencesCertifiees ? "OUI" : "NON")
  );
  Logger.log("AUCUN DÉCLENCHEUR MODIFIÉ");
  Logger.log("AUCUNE ÉCRITURE EFFECTUÉE");
  Logger.log("===== FIN DIAGNOSTIC DÉCLENCHEURS =====");


  return diagnostic;
}




/**
 * Applique les paramètres après validation stricte.
 * Les nouveaux déclencheurs sont tous créés avant suppression des anciens.
 */
function appliquerParametresDeclencheursV44() {
  const definitions = lireParametresDeclencheursV44_();
  validerParametresDeclencheursV44_(definitions);


  const fonctionsOfficielles = fonctionsOfficiellesDeclencheursV441_();
  const anciens = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return fonctionsOfficielles.includes(trigger.getHandlerFunction());
  });


  const nouveaux = [];
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const fuseau = Session.getScriptTimeZone();


  try {
    definitions.forEach(function(definition) {
      if (!definition.actif) return;


      const nouveau = creerDeclencheurV441_(
        definition,
        classeur,
        fuseau
      );


      nouveaux.push({
        trigger: nouveau,
        definition: definition
      });
    });


    verifierNouveauxDeclencheursV441_(nouveaux, definitions);


  } catch (erreur) {
    nouveaux.forEach(function(element) {
      try {
        ScriptApp.deleteTrigger(element.trigger);
      } catch (ignoree) {
        Logger.log(
          "Nettoyage à vérifier pour " +
          element.definition.fonction +
          " : " + String(ignoree)
        );
      }
    });


    journal_(
      "DECLENCHEURS",
      "APPLICATION_PARAMETRES",
      "ERREUR",
      "Nouvelle installation annulée ; ancienne configuration conservée"
    );


    throw new Error(
      "Installation annulée : aucun ancien déclencheur n'a été supprimé. " +
      String(erreur.message || erreur)
    );
  }


  anciens.forEach(function(trigger) {
    ScriptApp.deleteTrigger(trigger);
  });


  const manifeste = {
    version: DECLENCHEURS_V441_VERSION,
    dateInstallation: new Date().toISOString(),
    fuseau: fuseau,
    taches: nouveaux.map(function(element) {
      return {
        id: element.trigger.getUniqueId(),
        fonction: element.definition.fonction,
        signature: signatureDefinitionV441_(element.definition)
      };
    })
  };


  PropertiesService
    .getScriptProperties()
    .setProperty(
      DECLENCHEURS_V441_MANIFESTE,
      JSON.stringify(manifeste)
    );


  const dateInstallation = new Date();


  definitions.forEach(function(definition) {
    majEtatDeclencheurV44_(
      definition.ligne,
      definition.actif ? dateInstallation : "",
      definition.actif ? "INSTALLÉ V4.4.2" : "DÉSACTIVÉ"
    );
  });


  Logger.log("===== APPLICATION DÉCLENCHEURS V4.4.2 =====");
  Logger.log("Anciens officiels supprimés : " + anciens.length);
  Logger.log("Nouveaux officiels installés : " + nouveaux.length);
  Logger.log("Déclencheurs non gérés préservés : OUI");
  Logger.log("Manifeste de cadence enregistré : OUI");
  Logger.log("Erreurs : 0");
  Logger.log("===== FIN APPLICATION DÉCLENCHEURS =====");


  journal_(
    "DECLENCHEURS",
    "APPLICATION_PARAMETRES",
    "OK",
    "Supprimés : " + anciens.length +
      " | Installés : " + nouveaux.length +
      " | Temporaires/non gérés préservés"
  );
}




/**
 * Compatibilité : installation depuis la feuille existante.
 */
function installerDeclencheursV4() {
  initialiserParametresDeclencheursV44();
  appliquerParametresDeclencheursV44();
}




/**
 * Supprime uniquement les 8 fonctions officielles actuelles.
 * Ne supprime jamais un déclencheur temporaire ou une ancienne fonction.
 */
function supprimerTousDeclencheursCinemaisonV4() {
  const officiels = fonctionsOfficiellesDeclencheursV441_();
  let supprimes = 0;


  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (officiels.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
      supprimes++;
    }
  });


  Logger.log("Déclencheurs officiels supprimés : " + supprimes);
  Logger.log("Déclencheurs temporaires/non gérés préservés.");
  return supprimes;
}




function listerDeclencheursV4() {
  const triggers = ScriptApp.getProjectTriggers();
  const resultat = [];


  Logger.log("===== DÉCLENCHEURS CINÉMAISON V4.4.2 =====");


  triggers.forEach(function(trigger) {
    const ligne = {
      fonction: trigger.getHandlerFunction(),
      typeEvenement: String(trigger.getEventType()),
      source: String(trigger.getTriggerSource()),
      id: trigger.getUniqueId()
    };


    resultat.push(ligne);


    Logger.log(
      ligne.fonction +
      " | " + ligne.typeEvenement +
      " | " + ligne.source
    );
  });


  Logger.log("Total : " + triggers.length);
  return resultat;
}




/**
 * Vérification après installation. Met à jour uniquement les statuts
 * de la feuille ; utiliser diagnostiquerDeclencheursV441 pour une lecture seule.
 */
function verifierDeclencheursV4() {
  const diagnostic = diagnostiquerDeclencheursV441();
  const definitions = lireParametresDeclencheursV44_();
  const parFonction = {};


  diagnostic.taches.forEach(function(tache) {
    parFonction[tache.fonction] = tache;
  });


  definitions.forEach(function(definition) {
    const tache = parFonction[definition.fonction];
    let statut = "À VÉRIFIER";


    if (!definition.actif && tache && tache.trouve === 0) {
      statut = "DÉSACTIVÉ";
    } else if (
      definition.actif &&
      tache &&
      tache.trouve === 1 &&
      tache.typeEtSourceConformes &&
      tache.cadence === "CERTIFIÉE V4.4.2"
    ) {
      statut = "INSTALLÉ V4.4.2";
    }


    majEtatDeclencheurV44_(definition.ligne, "", statut);
  });


  journal_(
    "DECLENCHEURS",
    "VERIFICATION",
    diagnostic.cadencesCertifiees ? "OK" : "A_VERIFIER",
    "Tâches contrôlées : " + definitions.length
  );


  return diagnostic.cadencesCertifiees;
}




function reinstallerEtVerifierDeclencheursV4() {
  initialiserParametresDeclencheursV44();
  appliquerParametresDeclencheursV44();
  Utilities.sleep(1000);
  verifierDeclencheursV4();
}




/**
 * Installation unique du correctif d'automatisation V4.5.4.
 *
 * Cette fonction :
 * - ajoute la huitième tâche officielle enrichirSurModification ;
 * - remet les deux cycles d'enrichissement rapide à 5 minutes ;
 * - installe le déclencheur onEdit du tableur ;
 * - conserve tous les autres horaires et choix Actif existants ;
 * - applique puis vérifie transactionnellement les déclencheurs.
 */
function installerCorrectifAutomatismesEnrichissementV454() {
  initialiserParametresDeclencheursV44();


  const feuille = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(DECLENCHEURS_V44_FEUILLE);


  if (!feuille) {
    throw new Error(
      "La feuille " + DECLENCHEURS_V44_FEUILLE + " est introuvable."
    );
  }


  const valeurs = feuille.getDataRange().getValues();
  const h = indexEntetesDeclencheursV44_(valeurs[0]);
  const reglages = {
    enrichirNouvellesFichesV4: {
      actif: "OUI",
      type: "MINUTES",
      frequence: 5,
      heure: ""
    },
    enrichirLetterboxdEnAttenteV4: {
      actif: "OUI",
      type: "MINUTES",
      frequence: 5,
      heure: ""
    },
    enrichirSurModification: {
      actif: "OUI",
      type: "MODIFICATION",
      frequence: "",
      heure: ""
    }
  };


  const trouvees = {};


  for (let i = 1; i < valeurs.length; i++) {
    const fonction = String(
      valeurs[i][h.fonction] || ""
    ).trim();
    const reglage = reglages[fonction];


    if (!reglage) continue;


    feuille.getRange(i + 1, h.actif + 1).setValue(reglage.actif);
    feuille.getRange(i + 1, h.declenchement + 1).setValue(reglage.type);
    feuille.getRange(i + 1, h.frequence + 1).setValue(reglage.frequence);
    feuille.getRange(i + 1, h.heure + 1).setValue(reglage.heure);
    trouvees[fonction] = true;
  }


  Object.keys(reglages).forEach(function(fonction) {
    if (!trouvees[fonction]) {
      throw new Error(
        "Paramètre de déclencheur introuvable : " + fonction
      );
    }
  });


  SpreadsheetApp.flush();
  appliquerParametresDeclencheursV44();
  Utilities.sleep(1000);


  const conforme = verifierDeclencheursV4();


  if (!conforme) {
    throw new Error(
      "Les déclencheurs ont été installés mais la vérification " +
      "finale n'est pas conforme. Consultez le journal."
    );
  }


  Logger.log("===== CORRECTIF AUTOMATISMES ENRICHISSEMENT V4.5.4 =====");
  Logger.log("enrichirNouvellesFichesV4 : toutes les 5 minutes");
  Logger.log("enrichirLetterboxdEnAttenteV4 : toutes les 5 minutes");
  Logger.log("enrichirSurModification : lors de la modification");
  Logger.log("Installation vérifiée : OUI");
  Logger.log("===== FIN CORRECTIF AUTOMATISMES =====");


  return true;
}




function testDeclencheursV4() {
  return diagnostiquerDeclencheursV441();
}




function ouvrirParametresDeclencheursV44() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = classeur.getSheetByName(DECLENCHEURS_V44_FEUILLE);


  if (!feuille) {
    throw new Error(
      "Exécute d'abord initialiserParametresDeclencheursV44."
    );
  }


  classeur.setActiveSheet(feuille);
}




function lireParametresDeclencheursV44_() {
  const feuille = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(DECLENCHEURS_V44_FEUILLE);


  if (!feuille) {
    throw new Error(
      "La feuille " + DECLENCHEURS_V44_FEUILLE + " est introuvable."
    );
  }


  const valeurs = feuille.getDataRange().getValues();


  if (valeurs.length < 2) {
    throw new Error("Aucun paramètre de déclencheur n'est défini.");
  }


  const h = indexEntetesDeclencheursV44_(valeurs[0]);
  const obligatoires = [
    "ordre",
    "actif",
    "fonction",
    "declenchement",
    "frequence",
    "heure"
  ];


  obligatoires.forEach(function(entete) {
    if (h[entete] === undefined) {
      throw new Error("Colonne manquante : " + entete);
    }
  });


  const resultat = [];


  for (let i = 1; i < valeurs.length; i++) {
    const ligneVide = valeurs[i].every(function(valeur) {
      return String(valeur || "").trim() === "";
    });


    if (ligneVide) continue;


    const fonction = String(valeurs[i][h.fonction] || "").trim();


    if (!fonction) {
      throw new Error("Fonction vide à la ligne " + (i + 1) + ".");
    }


    const actifBrut = String(valeurs[i][h.actif] || "")
      .trim()
      .toUpperCase();


    if (!["OUI", "NON"].includes(actifBrut)) {
      throw new Error(
        "Valeur Actif invalide à la ligne " + (i + 1) +
        " pour " + fonction + " : '" + actifBrut +
        "'. Utiliser uniquement OUI ou NON."
      );
    }


    resultat.push({
      ligne: i + 1,
      ordre: Number(valeurs[i][h.ordre]),
      actif: actifBrut === "OUI",
      actifBrut: actifBrut,
      fonction: fonction,
      type: String(valeurs[i][h.declenchement] || "")
        .trim()
        .toUpperCase(),
      frequence: valeurNumeriqueOuVideV441_(
        valeurs[i][h.frequence]
      ),
      heure: valeurNumeriqueOuVideV441_(valeurs[i][h.heure]),
      description: h.description === undefined
        ? ""
        : String(valeurs[i][h.description] || "")
    });
  }


  return resultat;
}




function validerParametresDeclencheursV44_(definitions) {
  if (!Array.isArray(definitions) || definitions.length !== 8) {
    throw new Error(
      "La configuration doit contenir exactement les 8 tâches officielles. " +
      "Trouvé : " + (definitions ? definitions.length : 0) + "."
    );
  }


  const attendues = fonctionsOfficiellesDeclencheursV441_();
  const fonctions = {};
  const ordres = {};
  const minutesAutorisees = [1, 5, 10, 15, 30];
  const heuresAutorisees = [1, 2, 4, 6, 8, 12];
  const typesAutorises = [
    "MINUTES",
    "HEURES",
    "QUOTIDIEN",
    "OUVERTURE",
    "MODIFICATION"
  ];


  definitions.forEach(function(definition) {
    if (fonctions[definition.fonction]) {
      throw new Error("Fonction en double : " + definition.fonction);
    }
    fonctions[definition.fonction] = true;


    if (!attendues.includes(definition.fonction)) {
      throw new Error(
        "Fonction non officielle dans la feuille : " + definition.fonction
      );
    }


    if (
      !Number.isInteger(definition.ordre) ||
      definition.ordre < 1 ||
      definition.ordre > 8 ||
      ordres[definition.ordre]
    ) {
      throw new Error(
        "Ordre invalide ou en double pour " + definition.fonction + "."
      );
    }
    ordres[definition.ordre] = true;


    if (!typesAutorises.includes(definition.type)) {
      throw new Error(
        "Déclenchement invalide pour " + definition.fonction +
        " : " + definition.type
      );
    }


    if (definition.type === "MINUTES") {
      if (!minutesAutorisees.includes(definition.frequence)) {
        throw new Error(
          "Fréquence en minutes invalide pour " + definition.fonction +
          ". Valeurs autorisées : 1, 5, 10, 15 ou 30."
        );
      }
      if (definition.heure !== "") {
        throw new Error(
          "La colonne Heure doit être vide pour " + definition.fonction + "."
        );
      }
    }


    if (definition.type === "HEURES") {
      if (!heuresAutorisees.includes(definition.frequence)) {
        throw new Error(
          "Fréquence en heures invalide pour " + definition.fonction +
          ". Valeurs autorisées : 1, 2, 4, 6, 8 ou 12."
        );
      }
      if (definition.heure !== "") {
        throw new Error(
          "La colonne Heure doit être vide pour " + definition.fonction + "."
        );
      }
    }


    if (definition.type === "QUOTIDIEN") {
      if (
        definition.frequence !== 1 ||
        !Number.isInteger(definition.heure) ||
        definition.heure < 0 ||
        definition.heure > 23
      ) {
        throw new Error(
          "Horaire quotidien invalide pour " + definition.fonction +
          ". Fréquence=1 et heure entière de 0 à 23 obligatoires."
        );
      }
    }


    if (
      definition.type === "OUVERTURE" ||
      definition.type === "MODIFICATION"
    ) {
      if (definition.frequence !== "" || definition.heure !== "") {
        throw new Error(
          "Fréquence et Heure doivent être vides pour " +
          definition.fonction + "."
        );
      }
    }
  });


  attendues.forEach(function(fonction) {
    if (!fonctions[fonction]) {
      throw new Error("Tâche officielle absente : " + fonction);
    }
  });
}




function creerDeclencheurV441_(definition, classeur, fuseau) {
  let constructeur;


  if (definition.type === "OUVERTURE") {
    constructeur = ScriptApp
      .newTrigger(definition.fonction)
      .forSpreadsheet(classeur)
      .onOpen();


  } else if (definition.type === "MODIFICATION") {
    constructeur = ScriptApp
      .newTrigger(definition.fonction)
      .forSpreadsheet(classeur)
      .onEdit();


  } else if (definition.type === "MINUTES") {
    constructeur = ScriptApp
      .newTrigger(definition.fonction)
      .timeBased()
      .everyMinutes(definition.frequence);


  } else if (definition.type === "HEURES") {
    constructeur = ScriptApp
      .newTrigger(definition.fonction)
      .timeBased()
      .everyHours(definition.frequence);


  } else if (definition.type === "QUOTIDIEN") {
    constructeur = ScriptApp
      .newTrigger(definition.fonction)
      .timeBased()
      .everyDays(1)
      .atHour(definition.heure)
      .inTimezone(fuseau);
  } else {
    throw new Error(
      "Type non pris en charge pour " + definition.fonction
    );
  }


  const nouveau = constructeur.create();


  Logger.log(
    "CRÉÉ | " + definition.fonction +
    " | " + descriptionHoraireDeclencheurV44_(definition)
  );


  return nouveau;
}




function verifierNouveauxDeclencheursV441_(nouveaux, definitions) {
  const attendus = definitions.filter(function(definition) {
    return definition.actif;
  });


  if (nouveaux.length !== attendus.length) {
    throw new Error(
      "Nombre de nouveaux déclencheurs incorrect : attendu " +
      attendus.length + ", créé " + nouveaux.length + "."
    );
  }


  const comptes = {};


  nouveaux.forEach(function(element) {
    const fonction = element.trigger.getHandlerFunction();
    comptes[fonction] = (comptes[fonction] || 0) + 1;


    if (
      fonction !== element.definition.fonction ||
      !typeDeclencheurConformeV441_(
        element.trigger,
        element.definition
      )
    ) {
      throw new Error(
        "Nouveau déclencheur non conforme : " +
        element.definition.fonction
      );
    }
  });


  attendus.forEach(function(definition) {
    if (comptes[definition.fonction] !== 1) {
      throw new Error(
        "Nouveau déclencheur absent ou en double : " +
        definition.fonction
      );
    }
  });
}




function typeDeclencheurConformeV441_(trigger, definition) {
  const evenement = String(trigger.getEventType());
  const source = String(trigger.getTriggerSource());


  if (definition.type === "OUVERTURE") {
    return evenement === "ON_OPEN" && source === "SPREADSHEETS";
  }


  if (definition.type === "MODIFICATION") {
    return evenement === "ON_EDIT" && source === "SPREADSHEETS";
  }


  return evenement === "CLOCK" && source === "CLOCK";
}




function fonctionsOfficiellesDeclencheursV441_() {
  return DECLENCHEURS_V44_DEFAUT.map(function(definition) {
    return definition[2];
  });
}




function lireManifesteDeclencheursV441_() {
  const texte = PropertiesService
    .getScriptProperties()
    .getProperty(DECLENCHEURS_V441_MANIFESTE);


  if (!texte) return null;


  try {
    const manifeste = JSON.parse(texte);
    return manifeste && manifeste.version === DECLENCHEURS_V441_VERSION
      ? manifeste
      : null;
  } catch (erreur) {
    Logger.log("Manifeste V4.4.2 illisible : " + String(erreur));
    return null;
  }
}




function signatureDefinitionV441_(definition) {
  return [
    definition.fonction,
    definition.actif ? "OUI" : "NON",
    definition.type,
    String(definition.frequence),
    String(definition.heure)
  ].join("|");
}




function formaterFeuilleDeclencheursV44_(feuille) {
  const nbColonnes = DECLENCHEURS_V44_ENTETES.length;


  feuille.setFrozenRows(1);
  feuille.getRange(1, 1, 1, nbColonnes)
    .setFontWeight("bold")
    .setFontColor("#ffffff")
    .setBackground("#0b5968");


  feuille.getRange("B2:B")
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(["OUI", "NON"], true)
        .setAllowInvalid(false)
        .build()
    );


  feuille.getRange("D2:D")
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(
          [
            "MINUTES",
            "HEURES",
            "QUOTIDIEN",
            "OUVERTURE",
            "MODIFICATION"
          ],
          true
        )
        .setAllowInvalid(false)
        .build()
    );


  feuille.setColumnWidth(1, 60);
  feuille.setColumnWidth(2, 70);
  feuille.setColumnWidth(3, 280);
  feuille.setColumnWidth(4, 130);
  feuille.setColumnWidth(5, 90);
  feuille.setColumnWidth(6, 70);
  feuille.setColumnWidth(7, 360);
  feuille.setColumnWidth(8, 160);
  feuille.setColumnWidth(9, 180);
}




function majEtatDeclencheurV44_(ligne, dateInstallation, statut) {
  const feuille = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(DECLENCHEURS_V44_FEUILLE);


  if (!feuille) return;


  if (dateInstallation) {
    feuille.getRange(ligne, 8).setValue(dateInstallation);
  }


  feuille.getRange(ligne, 9).setValue(statut);
}




function descriptionHoraireDeclencheurV44_(definition) {
  if (definition.type === "OUVERTURE") return "à l'ouverture";
  if (definition.type === "MODIFICATION") {
    return "lors de la modification du tableur";
  }
  if (definition.type === "MINUTES") {
    return "toutes les " + definition.frequence + " minutes";
  }
  if (definition.type === "HEURES") {
    return "toutes les " + definition.frequence + " heures";
  }
  return "tous les jours vers " + definition.heure + " h";
}




function indexEntetesDeclencheursV44_(entetes) {
  const resultat = {};


  entetes.forEach(function(entete, index) {
    const cle = String(entete || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();


    resultat[cle] = index;
  });


  return resultat;
}




function valeurNumeriqueOuVideV441_(valeur) {
  if (valeur === "" || valeur === null || valeur === undefined) {
    return "";
  }


  const nombre = Number(valeur);
  return Number.isFinite(nombre) ? nombre : NaN;
}






