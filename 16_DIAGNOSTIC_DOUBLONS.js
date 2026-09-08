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
 * Version : 1.2 (08/09/2026)
 * ============================================================
 *
 * Correctif V1.2 : jusqu'à 2 nouvelles tentatives (pause 2s puis 4s)
 * sur la lecture de Films et l'écriture du rapport -- un "Service
 * Spreadsheets timed out" est resté possible même après le passage à
 * un seul appel d'écriture (charge ponctuelle côté Google, ou Sheet
 * sollicité en même temps par un autre script comme prime.js).
 *
 * Correctif V1.1 : écriture du rapport en un seul appel réseau au lieu
 * d'un appel par ligne (plus rapide, moins sujet au "Service
 * Spreadsheets timed out" que sur un gros Sheet).
 *
 * Usage : lance detecterDoublonsFilmsV1() depuis l'éditeur Apps Script.
 * Résultat écrit dans un nouvel onglet DIAGNOSTIC_DOUBLONS (recréé à
 * chaque lancement), PAS dans Films -- purement un rapport de lecture,
 * ne modifie jamais Films.
 */

/** Réessaie jusqu'à 2 fois (pause 2s puis 4s) si fonction() lève une exception. */
function avecNouvellesTentativesDoublonsV1_(fonction, description) {
  const pauses = [2000, 4000];
  let derniereErreur;
  for (let tentative = 0; tentative <= pauses.length; tentative++) {
    try {
      return fonction();
    } catch (e) {
      derniereErreur = e;
      if (tentative < pauses.length) {
        Logger.log(
          "[" + description + "] tentative " + (tentative + 1) +
          " échouée (" + e.message + "), nouvel essai dans " +
          (pauses[tentative] / 1000) + "s..."
        );
        Utilities.sleep(pauses[tentative]);
      }
    }
  }
  throw derniereErreur;
}

function detecterDoublonsFilmsV1() {
  const classeur = SpreadsheetApp.getActiveSpreadsheet();
  const films = classeur.getSheetByName("Films");
  if (!films) throw new Error("La feuille Films est introuvable.");

  const donnees = avecNouvellesTentativesDoublonsV1_(
    function() { return films.getDataRange().getValues(); },
    "lecture Films"
  );
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

  avecNouvellesTentativesDoublonsV1_(
    function() { ecrireRapportDoublonsV1_(classeur, memePlateforme, plateformesDifferentes); },
    "écriture DIAGNOSTIC_DOUBLONS"
  );

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

/**
 * V1.1 (08/09/2026) : réécriture pour tout écrire en UN SEUL appel
 * setValues() (plus quelques appels de mise en forme groupés), au lieu
 * d'un appel réseau par ligne comme avant -- beaucoup plus rapide, et
 * surtout beaucoup moins sujet au "Service Spreadsheets timed out"
 * rencontré le 08/09/2026 (plus d'appels réseau = plus de chances
 * qu'un seul d'entre eux traîne et fasse échouer tout le lot).
 */
function ecrireRapportDoublonsV1_(classeur, memePlateforme, plateformesDifferentes) {
  const nomOnglet = "DIAGNOSTIC_DOUBLONS";
  let feuille = classeur.getSheetByName(nomOnglet);
  if (feuille) classeur.deleteSheet(feuille);
  feuille = classeur.insertSheet(nomOnglet);

  const lignes = [];
  const lignesGrasEnTete = []; // numéros de ligne (1-indexé) à mettre en gras

  function ajouterTitre(texte) {
    lignes.push([texte, "", "", "", ""]);
    lignesGrasEnTete.push(lignes.length);
  }

  function ajouterEntetesColonnes() {
    lignes.push(["Titre", "Année", "Plateforme", "ID", "Ligne Films"]);
    lignesGrasEnTete.push(lignes.length);
  }

  function ajouterGroupes(groupes) {
    groupes.forEach(function(membres) {
      membres.forEach(function(m) {
        lignes.push([m.titre, m.annee, m.plateforme, m.id, m.ligne]);
      });
      lignes.push(["", "", "", "", ""]); // ligne vide entre chaque groupe
    });
  }

  ajouterTitre("MÊME PLATEFORME -- À VÉRIFIER (probable erreur)");
  ajouterEntetesColonnes();
  ajouterGroupes(memePlateforme);

  lignes.push(["", "", "", "", ""]);
  lignes.push(["", "", "", "", ""]);
  ajouterTitre("PLATEFORMES DIFFÉRENTES -- NORMAL, POUR INFO");
  ajouterEntetesColonnes();
  ajouterGroupes(plateformesDifferentes);

  // Un seul appel réseau pour tout le contenu.
  feuille.getRange(1, 1, lignes.length, 5).setValues(lignes);

  // Un seul appel réseau pour tout le gras (RangeList regroupe les
  // adresses non contiguës en une seule requête).
  const adressesGras = lignesGrasEnTete.map(function(l) { return "A" + l + ":E" + l; });
  if (adressesGras.length > 0) {
    feuille.getRangeList(adressesGras).setFontWeight("bold");
  }

  feuille.autoResizeColumns(1, 5);
  feuille.setFrozenRows(0);
}
