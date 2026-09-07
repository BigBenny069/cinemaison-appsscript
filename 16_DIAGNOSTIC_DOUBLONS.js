/**
 * ============================================================
 * CinéMaison V4
 * Script  : 16_DIAGNOSTIC_DOUBLONS.gs
 * Rôle    : Détecter les fiches Films en double (même Titre+Année),
 *           en distinguant deux cas :
 *             - MÊME PLATEFORME : très probablement une vraie erreur
 *               (ex: Blown away en double, découvert le 06/09/2026 via
 *               les ambiguïtés du mail Prime) -- à nettoyer.
 *             - PLATEFORMES DIFFÉRENTES : normal et voulu (le même film
 *               peut légitimement être suivi sur CANAL+ ET Prime en même
 *               temps) -- pour information seulement, rien à corriger.
 * Version : 1.0 (06/09/2026)
 * ============================================================
 *
 * Usage : lance detecterDoublonsFilmsV1() depuis l'éditeur Apps Script.
 * Résultat écrit dans un nouvel onglet DIAGNOSTIC_DOUBLONS (recréé à
 * chaque lancement), PAS dans Films -- purement un rapport de lecture,
 * ne modifie jamais Films.
 */

function detecterDoublonsFilmsV1() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const films = classeur.getSheetByName("Films");
  if (!films) throw new Error("La feuille Films est introuvable.");

  const donnees = films.getDataRange().getValues();
  if (donnees.length < 2) throw new Error("La feuille Films est vide.");

  const entetes = donnees[0].map(function(e) { return String(e || "").trim(); });
  const colID = entetes.indexOf("ID");
  const colTitre = entetes.indexOf("Titre");
  const colAnnee = entetes.indexOf("Annee");
  const colPlateforme = entetes.indexOf("Plateforme");
  if (colID === -1 || colTitre === -1 || colAnnee === -1 || colPlateforme === -1) {
    throw new Error("Colonne ID, Titre, Annee ou Plateforme introuvable dans Films.");
  }

  // Regroupe par Titre+Année normalisés (accents/casse ignorés).
  const groupes = {};
  for (let i = 1; i < donnees.length; i++) {
    const titre = String(donnees[i][colTitre] || "").trim();
    if (!titre) continue;
    const annee = String(donnees[i][colAnnee] || "").trim();
    const cle = normaliserTitreDoublonsV1_(titre) + "|" + annee;

    if (!groupes[cle]) groupes[cle] = [];
    groupes[cle].push({
      ligne: i + 1,
      id: String(donnees[i][colID] || "").trim(),
      titre: titre,
      annee: annee,
      plateforme: String(donnees[i][colPlateforme] || "").trim(),
    });
  }

  const memePlateforme = [];
  const plateformesDifferentes = [];

  Object.keys(groupes).forEach(function(cle) {
    const membres = groupes[cle];
    if (membres.length < 2) return;

    const plateformesUniques = Array.from(new Set(membres.map(function(m) { return m.plateforme; })));

    if (plateformesUniques.length === 1) {
      memePlateforme.push(membres);
    } else {
      plateformesDifferentes.push(membres);
    }
  });

  ecrireRapportDoublonsV1_(classeur, memePlateforme, plateformesDifferentes);

  Logger.log(
    "Doublons même plateforme (à vérifier) : " + memePlateforme.length +
    " groupe(s) | Doublons plateformes différentes (normal) : " +
    plateformesDifferentes.length + " groupe(s)."
  );
  Logger.log("Détail écrit dans l'onglet DIAGNOSTIC_DOUBLONS.");
}

function normaliserTitreDoublonsV1_(titre) {
  return String(titre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function ecrireRapportDoublonsV1_(classeur, memePlateforme, plateformesDifferentes) {
  const nomOnglet = "DIAGNOSTIC_DOUBLONS";
  let feuille = classeur.getSheetByName(nomOnglet);
  if (feuille) classeur.deleteSheet(feuille);
  feuille = classeur.insertSheet(nomOnglet);

  let ligne = 1;

  feuille.getRange(ligne, 1).setValue("MÊME PLATEFORME -- À VÉRIFIER (probable erreur)").setFontWeight("bold");
  ligne += 1;
  feuille.getRange(ligne, 1, 1, 5).setValues([["Titre", "Année", "Plateforme", "ID", "Ligne Films"]]).setFontWeight("bold");
  ligne += 1;
  memePlateforme.forEach(function(membres) {
    membres.forEach(function(m) {
      feuille.getRange(ligne, 1, 1, 5).setValues([[m.titre, m.annee, m.plateforme, m.id, m.ligne]]);
      ligne += 1;
    });
    ligne += 1; // ligne vide entre chaque groupe
  });

  ligne += 2;
  feuille.getRange(ligne, 1).setValue("PLATEFORMES DIFFÉRENTES -- NORMAL, POUR INFO").setFontWeight("bold");
  ligne += 1;
  feuille.getRange(ligne, 1, 1, 5).setValues([["Titre", "Année", "Plateforme", "ID", "Ligne Films"]]).setFontWeight("bold");
  ligne += 1;
  plateformesDifferentes.forEach(function(membres) {
    membres.forEach(function(m) {
      feuille.getRange(ligne, 1, 1, 5).setValues([[m.titre, m.annee, m.plateforme, m.id, m.ligne]]);
      ligne += 1;
    });
    ligne += 1;
  });

  feuille.autoResizeColumns(1, 5);
  feuille.setFrozenRows(0);
}
