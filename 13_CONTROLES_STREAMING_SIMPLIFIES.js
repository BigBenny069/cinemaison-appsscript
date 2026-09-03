/**
 * ============================================================
 * CinéMaison
 * Script  : 13_CONTROLES_STREAMING_SIMPLIFIES.gs
 * Version : 1.1.2 — PRÉPARATION DISNEY+ UNIQUEMENT
 *
 * Menu commun pour Prime Video, Netflix et Disney+.
 * Les scripts validés 11, 12 et 14 restent inchangés.
 * ============================================================
 */




/**
 * PREMIER TEST À LANCER APRÈS REMPLACEMENT DU SCRIPT 13.
 * Lecture seule : aucune feuille, donnée ou déclencheur n'est modifié.
 */
function diagnostiquerIntegrationDisneyMenuStreamingV112() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const controles = [
    ["verifierResultatsPrimeOfficielSansEcriture", typeof verifierResultatsPrimeOfficielSansEcriture === "function"],
    ["appliquerResultatsPrimeOfficiel", typeof appliquerResultatsPrimeOfficiel === "function"],
    ["verifierResultatsNetflixOfficielSansEcriture", typeof verifierResultatsNetflixOfficielSansEcriture === "function"],
    ["appliquerResultatsNetflixOfficiel", typeof appliquerResultatsNetflixOfficiel === "function"],
    ["actualiserListeControleDisneyOfficielV100", typeof actualiserListeControleDisneyOfficielV100 === "function"],
    ["verifierResultatsDisneyOfficielSansEcriture", typeof verifierResultatsDisneyOfficielSansEcriture === "function"],
    ["appliquerResultatsDisneyOfficiel", typeof appliquerResultatsDisneyOfficiel === "function"]
  ];
  const feuilles = [
    "CONTROLE_PRIME",
    "CONTROLE_NETFLIX",
    "CONTROLE_DISNEY"
  ];
  let fonctionsAbsentes = 0;
  let feuillesAbsentes = 0;


  Logger.log("===== DIAGNOSTIC MENU STREAMING V1.1.2 =====");
  controles.forEach(function(controle) {
    Logger.log(
      "Fonction " + controle[0] + " : " +
      (controle[1] ? "PRÉSENTE" : "ABSENTE")
    );
    if (!controle[1]) fonctionsAbsentes++;
  });
  feuilles.forEach(function(nom) {
    const presente = Boolean(classeur.getSheetByName(nom));
    Logger.log("Feuille " + nom + " : " + (presente ? "PRÉSENTE" : "ABSENTE"));
    if (!presente) feuillesAbsentes++;
  });
  Logger.log("Fonctions absentes : " + fonctionsAbsentes);
  Logger.log("Feuilles absentes : " + feuillesAbsentes);
  Logger.log(
    "Intégration prête : " +
    (fonctionsAbsentes === 0 && feuillesAbsentes === 0 ? "OUI" : "NON")
  );
  Logger.log("Préparation Prime : CONSERVÉE");
  Logger.log("Préparation Netflix : CONSERVÉE");
  Logger.log("Préparation Disney+ : ACTUALISATION NON DESTRUCTIVE");
  Logger.log("AUCUNE ÉCRITURE EFFECTUÉE");
  Logger.log("AUCUN DÉCLENCHEUR MODIFIÉ");
  Logger.log("AUCUN APPEL EXTERNE EFFECTUÉ");
  Logger.log("===== FIN DIAGNOSTIC MENU STREAMING =====");
}




/**
 * À exécuter une seule fois après validation du diagnostic pour
 * actualiser le menu dans Google Sheets.
 */
function installerMenuControlesStreaming() {
  verifierDependancesMenuStreamingV112_();


  const classeur = SpreadsheetApp.getActiveSpreadsheet();


  /* Évite de créer plusieurs déclencheurs identiques. */
  ScriptApp
    .getProjectTriggers()
    .filter(function(declencheur) {
      return (
        declencheur.getHandlerFunction() ===
        "afficherMenuControlesStreamingV1_"
      );
    })
    .forEach(function(declencheur) {
      ScriptApp.deleteTrigger(declencheur);
    });


  ScriptApp
    .newTrigger("afficherMenuControlesStreamingV1_")
    .forSpreadsheet(classeur)
    .onOpen()
    .create();


  afficherMenuControlesStreamingV1_();


  SpreadsheetApp
    .getUi()
    .alert(
      "Le menu Contrôles streaming est installé pour " +
      "Prime Video, Netflix et Disney+."
    );
}




/** Crée le menu visible dans Google Sheets. */
function afficherMenuControlesStreamingV1_() {
  SpreadsheetApp
    .getUi()
    .createMenu("🎬 Contrôles streaming")
    .addItem(
      "1 — Actualiser Disney+ (Prime + Netflix conservés)",
      "preparerControlesStreamingOfficiels"
    )
    .addSeparator()
    .addItem(
      "2 — Simuler les trois imports",
      "verifierControlesStreamingSansEcriture"
    )
    .addItem(
      "3 — Importer les résultats validés",
      "appliquerControlesStreamingAvecConfirmation"
    )
    .addSeparator()
    .addItem(
      "Ouvrir CONTROLE_PRIME",
      "ouvrirFeuilleControlePrimeV1_"
    )
    .addItem(
      "Ouvrir CONTROLE_NETFLIX",
      "ouvrirFeuilleControleNetflixV1_"
    )
    .addItem(
      "Ouvrir CONTROLE_DISNEY",
      "ouvrirFeuilleControleDisneyV110_"
    )
    .addToUi();
}




/**
 * Actualise uniquement la liste technique Disney+.
 *
 * Prime : CONTROLE_PRIME est volontairement conservée.
 * Netflix : CONTROLE_NETFLIX est volontairement conservée ; la préparation
 * historique utilisant Streaming Availability est désactivée.
 * Disney+ : A:E est actualisé et les URL, identifiants et résultats
 * Edge existants sont conservés par le connecteur 14.
 */
function preparerControlesStreamingOfficiels() {
  verifierDependancesMenuStreamingV112_();


  const interfaceUtilisateur = SpreadsheetApp.getUi();
  const confirmation = interfaceUtilisateur.alert(
    "Actualiser le contrôle Disney+",
    "Les listes Prime et Netflix seront conservées sans modification. " +
    "La liste Disney+ sera actualisée sans supprimer ses URL, " +
    "identifiants ni résultats Edge. Continuer ?",
    interfaceUtilisateur.ButtonSet.YES_NO
  );


  if (confirmation !== interfaceUtilisateur.Button.YES) return;


  Logger.log("===== ACTUALISATION DISNEY+ UNIQUEMENT =====");
  Logger.log("CONTROLE_PRIME conservée sans modification");
  Logger.log("CONTROLE_NETFLIX conservée sans modification");
  actualiserListeControleDisneyOfficielV100();
  Logger.log("===== FIN PRÉPARATION COMMUNE =====");


  interfaceUtilisateur.alert(
    "Actualisation terminée.\n\n" +
    "CONTROLE_PRIME a été conservée sans modification.\n" +
    "CONTROLE_NETFLIX a été conservée sans modification.\n" +
    "CONTROLE_DISNEY a été actualisée sans effacer ses relevés."
  );
}




/** Exécute les trois simulations sans modifier Films. */
function verifierControlesStreamingSansEcriture() {
  verifierDependancesMenuStreamingV112_();


  const interfaceUtilisateur = SpreadsheetApp.getUi();


  Logger.log("===== SIMULATION PRIME + NETFLIX + DISNEY+ =====");
  verifierResultatsPrimeOfficielSansEcriture();
  verifierResultatsNetflixOfficielSansEcriture();
  verifierResultatsDisneyOfficielSansEcriture();
  Logger.log("===== FIN SIMULATION COMMUNE =====");


  interfaceUtilisateur.alert(
    "Simulation des trois plateformes terminée sans écriture.\n\n" +
    "Consulte le journal d’exécution avant de lancer l’import."
  );
}




/** Importe Prime, Netflix et Disney+ après confirmation. */
function appliquerControlesStreamingAvecConfirmation() {
  verifierDependancesMenuStreamingV112_();


  const interfaceUtilisateur = SpreadsheetApp.getUi();
  const confirmation = interfaceUtilisateur.alert(
    "Importer les résultats officiels",
    "Cette opération écrira dans Films les résultats validés de " +
    "Prime Video, Netflix et Disney+.\n\n" +
    "As-tu vérifié la simulation des trois plateformes ?",
    interfaceUtilisateur.ButtonSet.YES_NO
  );


  if (confirmation !== interfaceUtilisateur.Button.YES) return;


  Logger.log("===== IMPORT PRIME + NETFLIX + DISNEY+ =====");
  appliquerResultatsPrimeOfficiel();
  appliquerResultatsNetflixOfficiel();
  appliquerResultatsDisneyOfficiel();
  Logger.log("===== FIN IMPORT COMMUN =====");


  interfaceUtilisateur.alert(
    "Import Prime Video, Netflix et Disney+ terminé.\n\n" +
    "Tu peux maintenant synchroniser AppSheet."
  );
}




/** Ouvre la feuille technique Prime. */
function ouvrirFeuilleControlePrimeV1_() {
  ouvrirFeuilleControleStreamingV112_("CONTROLE_PRIME");
}




/** Ouvre la feuille technique Netflix. */
function ouvrirFeuilleControleNetflixV1_() {
  ouvrirFeuilleControleStreamingV112_("CONTROLE_NETFLIX");
}




/** Ouvre la feuille technique Disney+. */
function ouvrirFeuilleControleDisneyV110_() {
  ouvrirFeuilleControleStreamingV112_("CONTROLE_DISNEY");
}




function ouvrirFeuilleControleStreamingV112_(nomFeuille) {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const feuille = classeur.getSheetByName(nomFeuille);


  if (!feuille) {
    SpreadsheetApp
      .getUi()
      .alert("La feuille " + nomFeuille + " est introuvable.");
    return;
  }


  classeur.setActiveSheet(feuille);
}




/**
 * Bloque les commandes communes si un connecteur requis manque.
 * Ne modifie aucune donnée.
 */
function verifierDependancesMenuStreamingV112_() {
  const absentes = [];
  if (typeof verifierResultatsPrimeOfficielSansEcriture !== "function") {
    absentes.push("verifierResultatsPrimeOfficielSansEcriture");
  }
  if (typeof appliquerResultatsPrimeOfficiel !== "function") {
    absentes.push("appliquerResultatsPrimeOfficiel");
  }
  if (typeof verifierResultatsNetflixOfficielSansEcriture !== "function") {
    absentes.push("verifierResultatsNetflixOfficielSansEcriture");
  }
  if (typeof appliquerResultatsNetflixOfficiel !== "function") {
    absentes.push("appliquerResultatsNetflixOfficiel");
  }
  if (typeof actualiserListeControleDisneyOfficielV100 !== "function") {
    absentes.push("actualiserListeControleDisneyOfficielV100");
  }
  if (typeof verifierResultatsDisneyOfficielSansEcriture !== "function") {
    absentes.push("verifierResultatsDisneyOfficielSansEcriture");
  }
  if (typeof appliquerResultatsDisneyOfficiel !== "function") {
    absentes.push("appliquerResultatsDisneyOfficiel");
  }


  if (absentes.length) {
    throw new Error(
      "Intégration streaming incomplète. Fonctions absentes : " +
      absentes.join(", ")
    );
  }
}






