/**
 * ============================================================
 * 30_TITRES_PLATEFORME.gs
 * Version: 1.0 (26/10/2026)
 *
 * But : remplacer le Titre de fiches déjà dans l'app par le titre EXACT
 * de la plateforme, quand les deux sont très différents (cas réel FILM1393 :
 * TMDb l'appelle "Senritsu Kaiki File Kowasugi! File 01: ...", Shadowz
 * "Les Dossiers Paranormaux - #1 La Femme à la Bouche Fendue").
 *
 * Appelé par l'outil local titres-plateformes.js (webhook, action
 * "renommerTitresPlateforme") APRÈS que Ben a validé fiche par fiche.
 * Reçoit { renommages: [{ id, titre }] }.
 *
 * Sécurités :
 * - ne touche QUE la cellule Titre (et l'empreinte d'enrichissement, voir
 *   ci-dessous) ; jamais une autre colonne ;
 * - une fiche sans TMDbID est ignorée : sans lui, l'enrichissement
 *   chercherait le film par son nouveau titre et pourrait ne plus le
 *   retrouver ;
 * - EMPREINTE : l'enrichissement retient dans VersionEnrichissement le titre
 *   avec lequel il a travaillé ; si le titre change, il refait une recherche
 *   par titre (qui pourrait choisir un autre film). On met donc à jour
 *   UNIQUEMENT le titre mémorisé dans cette empreinte, le reste est conservé
 *   tel quel -> aucune nouvelle recherche, la fiche reste sur le même film ;
 * - un titre commençant par = + - @ est refusé (le Sheet le prendrait pour
 *   une formule) ; 200 fiches maximum par appel ; chaque changement est
 *   écrit au journal "ancien -> nouveau".
 * ============================================================
 */

const TITRES_PLATEFORME_MAX_PAR_APPEL_V1 = 200;

/** Cœur : { renommes, ignores, details:[...] } -- sans effet de bord hors Sheet. */
function renommerTitresPlateformeV1_(renommages) {
  const liste = Array.isArray(renommages) ? renommages : [];
  const resume = { renommes: 0, ignores: 0, details: [] };

  if (liste.length > TITRES_PLATEFORME_MAX_PAR_APPEL_V1) {
    throw new Error("Trop de fiches d'un coup (" + liste.length + " > " + TITRES_PLATEFORME_MAX_PAR_APPEL_V1 + ").");
  }

  const feuille = getSheet_(SHEETS.FILMS);
  const valeurs = feuille.getDataRange().getValues();
  const h = getHeadersMapV4_(valeurs[0]);
  ["ID", "Titre", "TMDbID"].forEach(function (col) {
    if (h[col] === undefined) throw new Error("Colonne Films manquante : " + col);
  });

  const ligneParId = {};
  for (let i = 1; i < valeurs.length; i++) {
    const id = String(valeurs[i][h.ID] || "").trim();
    if (id) ligneParId[id] = i;
  }

  liste.forEach(function (r) {
    const id = String((r && r.id) || "").trim();
    const nouveau = String((r && r.titre) || "").replace(/\s+/g, " ").trim();
    const ignorer = function (raison) {
      resume.ignores++;
      resume.details.push("IGNORÉ " + id + " : " + raison);
    };

    if (!id || ligneParId[id] === undefined) return ignorer("fiche introuvable");
    if (nouveau.length < 2 || nouveau.length > 200) return ignorer("titre vide ou trop long");
    if (/^[=+\-@]/.test(nouveau)) return ignorer("titre commençant par = + - @ (pris pour une formule)");

    const i = ligneParId[id];
    const ligne = valeurs[i];
    const actuel = String(ligne[h.Titre] || "").trim();
    if (actuel === nouveau) return ignorer("titre déjà identique");
    if (!String(ligne[h.TMDbID] || "").trim()) return ignorer("pas de TMDbID (renommer risquerait de casser l'enrichissement)");

    feuille.getRange(i + 1, h.Titre + 1).setValue(nouveau);

    // Empreinte : on ne remplace QUE le premier élément (le titre).
    let noteEmpreinte = "empreinte inchangée (fiche pas encore enrichie)";
    if (h.VersionEnrichissement !== undefined) {
      const version = safeTrim_(ligne[h.VersionEnrichissement]);
      const empreinte = extraireEmpreinteEnrichissementV45_(version);
      if (empreinte) {
        const morceaux = empreinte.split("|");
        const legacy = estEmpreinteLegacyEnrichissementV451_(version);
        morceaux[0] = encodeURIComponent(legacy ? normalizeText_(safeTrim_(cleanTitle_(nouveau))) : safeTrim_(cleanTitle_(nouveau)));
        const prefixe = version.substring(0, version.indexOf(SEPARATEUR_EMPREINTE_ENRICHISSEMENT_V45) + 1);
        feuille.getRange(i + 1, h.VersionEnrichissement + 1).setValue(prefixe + morceaux.join("|"));
        noteEmpreinte = "empreinte mise à jour";
      }
    }

    resume.renommes++;
    resume.details.push("CHANGÉ " + id + " : " + actuel + " -> " + nouveau + " (" + noteEmpreinte + ")");
    journal_("TITRES", "TITRE_PLATEFORME_APPLIQUE", "OK", id + " | " + actuel + " -> " + nouveau);
  });

  return resume;
}

/** Traitement de l'action webhook "renommerTitresPlateforme" (secret déjà vérifié par doPost). */
function traiterRenommerTitresPlateformeV1_(corps) {
  try {
    const resume = renommerTitresPlateformeV1_(corps.renommages);
    return reponseJsonWebhook_({ ok: true, resume: resume });
  } catch (e) {
    journal_("TITRES", "TITRE_PLATEFORME_APPLIQUE", "ERREUR", String(e.message || e));
    return reponseJsonWebhook_({ ok: false, error: String(e.message || e) });
  }
}

/**
 * Test à la main depuis l'éditeur Apps Script (sans l'outil local) :
 * renomme UNE fiche. Mets l'ID et le titre voulus dans les deux lignes.
 */
function testerRenommerUneFicheV1() {
  const resume = renommerTitresPlateformeV1_([{ id: "FILM0000", titre: "Titre de la plateforme" }]);
  Logger.log(resume.details.join("\n"));
}
