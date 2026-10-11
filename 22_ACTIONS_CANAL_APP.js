/**
 * ============================================================
 * CinéMaison V4
 * Script  : 22_ACTIONS_CANAL_APP.js
 * Rôle    : Actions CANAL+ lançables depuis l'application (Réglages >
 *           CONTRÔLE CANAL+), donc depuis le téléphone, sans ouvrir
 *           l'éditeur Apps Script :
 *             - canalRecontrolerAVerifier : refait le contrôle des dates
 *               des seules fiches "A_VERIFIER_CANAL" (avec réessais) et
 *               envoie un mail avec le résultat fiche par fiche ;
 *             - canalControleComplet : démarre le contrôle complet des
 *               dates (par lots, toutes les 5 min, mail de bilan à la fin) ;
 *             - canalEtatControle : mail avec l'avancement du contrôle
 *               complet en cours (ou du dernier) ;
 *             - canalArreterControle : arrête le contrôle complet ;
             - canalReclasserVod : marque VOD_SANS_DATE les fiches Canal+
               « à vérifier » qui sont en réalité de la VOD (sans erreur HTTP) ;
             - primeNettoyageApercu / primeNettoyageAppliquer : liste, puis
               efface, les dates de fin automatiques périmées des fiches
               Prime en Abonnement complémentaire / VOD.
 * Version : 1.1 (11/10/2026)
 *
 * Le webhook doit répondre vite (Vercel coupe les appels longs) : les deux
 * actions longues programment donc un déclencheur UNIQUE dans ~1 seconde
 * qui fait le vrai travail ; la réponse à l'application est immédiate.
 * Dépend de 06_CONNECTEURS_PLATEFORMES.js (V4.8.6), 11_CONTROLE_PRIME_OFFICIEL.js (V1.11) et 09_WEBHOOK.js (V2.28).
 * ============================================================
 */

const CANAL_APP_DEST_SERVICE_V1 = "AjoutAutoPrime";

function traiterCanalActionAppV1_(corps) {
  const action = String(corps.action || "");
  try {
    if (action === "canalRecontrolerAVerifier") {
      if (dejaTraiteRecemment_("canalAppRecontroler")) {
        return reponseJsonWebhook_({ ok: true, doublonIgnore: true });
      }
      programmerExecutionUniqueCanalAppV1_("executerCanalRecontrolerAVerifierV1");
      return reponseJsonWebhook_({ ok: true, message: "Lancé : le résultat arrive par mail dans 1 à 2 minutes." });
    }

    if (action === "canalReclasserVod" || action === "primeNettoyageApercu" || action === "primeNettoyageAppliquer") {
      if (dejaTraiteRecemment_("canalAppAsync_" + action)) {
        return reponseJsonWebhook_({ ok: true, doublonIgnore: true });
      }
      const handler = {
        canalReclasserVod: "executerCanalReclasserVodV1",
        primeNettoyageApercu: "executerPrimeNettoyageApercuV1",
        primeNettoyageAppliquer: "executerPrimeNettoyageAppliquerV1",
      }[action];
      programmerExecutionUniqueCanalAppV1_(handler);
      return reponseJsonWebhook_({ ok: true, message: "Lancé : le résultat arrive par mail dans 1 à 2 minutes." });
    }

    if (action === "canalControleComplet") {
      const etat = lireEtatControleCompletCanalV4_();
      if (etat && etat.actif) {
        return reponseJsonWebhook_({
          ok: true,
          dejaEnCours: true,
          message: "Un contrôle complet est déjà en cours (" + Number(etat.traites || 0) + " fiches traitées). Utilise « ÉTAT » pour le suivre.",
        });
      }
      if (dejaTraiteRecemment_("canalAppControleComplet")) {
        return reponseJsonWebhook_({ ok: true, doublonIgnore: true });
      }
      programmerExecutionUniqueCanalAppV1_("executerCanalControleCompletV1");
      return reponseJsonWebhook_({ ok: true, message: "Contrôle complet lancé : il avance par lots toutes les 5 minutes, bilan par mail à la fin." });
    }

    if (action === "canalEtatControle") {
      if (dejaTraiteRecemment_("canalAppEtat")) {
        return reponseJsonWebhook_({ ok: true, doublonIgnore: true });
      }
      envoyerMailEtatControleCanalAppV1_();
      return reponseJsonWebhook_({ ok: true, message: "Mail d'état envoyé." });
    }

    if (action === "canalArreterControle") {
      const etat = lireEtatControleCompletCanalV4_();
      if (!etat || !etat.actif) {
        return reponseJsonWebhook_({ ok: true, message: "Aucun contrôle complet en cours." });
      }
      arreterControleCompletCanalV4();
      return reponseJsonWebhook_({ ok: true, message: "Contrôle complet arrêté (" + Number(etat.traites || 0) + " fiches déjà traitées)." });
    }

    return reponseJsonWebhook_({ ok: false, error: "Action CANAL+ inconnue : " + action });
  } catch (err) {
    journal_("CANAL_APP", action, "ERREUR", String(err));
    return reponseJsonWebhook_({ ok: false, error: String(err) });
  }
}

/** Programme l'exécution de nomFonction dans ~1 s (une seule fois). */
function programmerExecutionUniqueCanalAppV1_(nomFonction) {
  supprimerDeclencheurCanalV4_(nomFonction);
  ScriptApp.newTrigger(nomFonction).timeBased().after(1000).create();
}

/** Déclencheur unique : recontrôle + mail de résultat. */
function executerCanalRecontrolerAVerifierV1() {
  supprimerDeclencheurCanalV4_("executerCanalRecontrolerAVerifierV1");
  try {
    const resultats = recontrolerFichesCanalAVerifierV1();
    envoyerMailRecontroleCanalAppV1_(resultats);
    journal_("CANAL_APP", "RECONTROLE_A_VERIFIER", "OK", "Fiches recontrôlées=" + resultats.length);
  } catch (err) {
    journal_("CANAL_APP", "RECONTROLE_A_VERIFIER", "ERREUR", String(err));
    envoyerMailTexteCanalAppV1_("CinéMaison - V2 - CANAL+ : recontrôle en erreur", "Le recontrôle des fiches à vérifier a échoué : " + String(err));
  }
}

/** Déclencheur unique : reclasse les VOD Canal+ « à vérifier ». */
function executerCanalReclasserVodV1() {
  supprimerDeclencheurCanalV4_("executerCanalReclasserVodV1");
  try {
    const r = reclasserVodSansDateCanalV1();
    const lignes = [];
    r.titresReclasses.forEach(function (t) { lignes.push("✓ Reclassée VOD : " + t); });
    r.restantes.forEach(function (t) { lignes.push("• Reste à vérifier (pas VOD) : " + t); });
    envoyerMailListeCanalAppV1_(
      "CinéMaison - V2 - CANAL+ : reclassement VOD (" + r.reclassees + ")",
      "CANAL+ · RECLASSEMENT VOD",
      r.reclassees + " fiche(s) marquée(s) VOD (pas de date de fin à vérifier) · " + r.restantes.length + " fiche(s) encore à vérifier sans erreur HTTP.",
      lignes
    );
    journal_("CANAL_APP", "RECLASSER_VOD", "OK", "Reclassées=" + r.reclassees + " | Restantes=" + r.restantes.length);
  } catch (err) {
    journal_("CANAL_APP", "RECLASSER_VOD", "ERREUR", String(err));
    envoyerMailTexteCanalAppV1_("CinéMaison - V2 - CANAL+ : reclassement VOD en erreur", String(err));
  }
}

/** Déclencheurs uniques : nettoyage Prime (aperçu / application). */
function executerPrimeNettoyageApercuV1() { executerPrimeNettoyageCanalAppV1_(false, "executerPrimeNettoyageApercuV1"); }
function executerPrimeNettoyageAppliquerV1() { executerPrimeNettoyageCanalAppV1_(true, "executerPrimeNettoyageAppliquerV1"); }

function executerPrimeNettoyageCanalAppV1_(ecrire, nomHandler) {
  supprimerDeclencheurCanalV4_(nomHandler);
  try {
    const r = nettoyageDatesAboVodPrimeV1_(ecrire);
    const lignes = [];
    r.libellesAEffacer.forEach(function (t) { lignes.push((ecrire ? "✓ Date effacée : " : "À effacer : ") + t); });
    r.libellesProtegees.forEach(function (t) { lignes.push("• Conservée (autre source) : " + t); });
    envoyerMailListeCanalAppV1_(
      "CinéMaison - V2 - PRIME : nettoyage des dates " + (ecrire ? "APPLIQUÉ" : "(aperçu)") + " (" + r.aEffacer + ")",
      "PRIME · NETTOYAGE DES DATES ABO+/VOD " + (ecrire ? "· APPLIQUÉ" : "· APERÇU"),
      (ecrire
        ? r.effacees + " date(s) de fin automatique effacée(s)"
        : r.aEffacer + " date(s) seraient effacées -- rien n'a été modifié. Si la liste te convient, lance « APPLIQUER LE NETTOYAGE »") +
        " · " + r.protegees + " conservée(s) (date issue d'une autre source que Prime).",
      lignes
    );
    journal_("CANAL_APP", "NETTOYAGE_PRIME", ecrire ? "APPLIQUE" : "APERCU", "A effacer=" + r.aEffacer + " | Effacees=" + r.effacees + " | Protegees=" + r.protegees);
  } catch (err) {
    journal_("CANAL_APP", "NETTOYAGE_PRIME", "ERREUR", String(err));
    envoyerMailTexteCanalAppV1_("CinéMaison - V2 - PRIME : nettoyage des dates en erreur", String(err));
  }
}

/** Mail générique : intro + liste de lignes. */
function envoyerMailListeCanalAppV1_(sujet, bandeau, intro, lignes) {
  const destinataires = destinatairesPourService_(CANAL_APP_DEST_SERVICE_V1);
  if (!destinataires) return false;
  const corps = '<p style="font-size:13px;color:#3A2E22;font-family:Arial,sans-serif;line-height:1.6">' + echapperHtmlCanalAppV1_(intro) + '</p>' +
    (lignes.length === 0
      ? '<p style="font-size:13px;color:#9A9182;font-family:Arial,sans-serif">Rien à signaler.</p>'
      : '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">' +
        lignes.map(function (l) {
          return '<tr><td style="padding:7px 0;border-bottom:1px solid #EFE7D6;font-size:13px;color:#3A2E22;font-family:Arial,sans-serif;line-height:1.5">' + echapperHtmlCanalAppV1_(l) + '</td></tr>';
        }).join("") + '</table>');
  MailApp.sendEmail({ to: destinataires, subject: sujet, htmlBody: enveloppeMailCanalAppV1_(bandeau, corps) });
  return true;
}

/** Déclencheur unique : démarre le contrôle complet. */
function executerCanalControleCompletV1() {
  supprimerDeclencheurCanalV4_("executerCanalControleCompletV1");
  try {
    demarrerControleCompletCanalV4();
  } catch (err) {
    journal_("CANAL_APP", "CONTROLE_COMPLET", "ERREUR", String(err));
    envoyerMailTexteCanalAppV1_("CinéMaison - V2 - CANAL+ : démarrage du contrôle complet en erreur", String(err));
  }
}

function echapperHtmlCanalAppV1_(t) {
  return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function enveloppeMailCanalAppV1_(titre, corpsHtml) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="color-scheme" content="light only"></head>' +
    '<body style="margin:0;padding:0;background:#F5EFE0"><div style="background:#F5EFE0;padding:24px 12px">' +
    '<div style="background:#FFFBF2;border-radius:8px;padding:28px 22px;max-width:560px;margin:0 auto;font-family:Georgia,serif">' +
    '<div style="font-size:22px;font-weight:bold;color:#3A2E22">CINÉ<span style="color:#B5622B">MAISON</span></div>' +
    '<div style="font-size:11px;letter-spacing:1.5px;color:#B5622B;margin-top:4px;font-family:Arial,sans-serif">' + echapperHtmlCanalAppV1_(titre) + '</div>' +
    '<div style="border-top:1px solid #E3D9C4;margin:16px 0"></div>' + corpsHtml + '</div></div></body></html>';
}

function envoyerMailTexteCanalAppV1_(sujet, texte) {
  const destinataires = destinatairesPourService_(CANAL_APP_DEST_SERVICE_V1);
  if (!destinataires) return false;
  MailApp.sendEmail({
    to: destinataires,
    subject: sujet,
    htmlBody: enveloppeMailCanalAppV1_("CANAL+", '<p style="font-size:13px;color:#3A2E22;font-family:Arial,sans-serif;line-height:1.6">' + echapperHtmlCanalAppV1_(texte) + '</p>'),
  });
  return true;
}

function envoyerMailRecontroleCanalAppV1_(resultats) {
  const destinataires = destinatairesPourService_(CANAL_APP_DEST_SERVICE_V1);
  if (!destinataires) return false;

  const restants = resultats.filter(function (r) { return r.statutFinal === "A_VERIFIER_CANAL"; }).length;
  let corps;
  if (resultats.length === 0) {
    corps = '<p style="font-size:13px;color:#3A2E22;font-family:Arial,sans-serif">Aucune fiche CANAL+ n\'était « à vérifier ». Rien à recontrôler.</p>';
  } else {
    corps = '<p style="font-size:13px;color:#3A2E22;font-family:Arial,sans-serif;line-height:1.6"><strong>' + resultats.length +
      '</strong> fiche(s) recontrôlée(s) · <strong>' + (resultats.length - restants) + '</strong> résolue(s) · <strong>' + restants + '</strong> encore à vérifier.</p>' +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">' +
      resultats.map(function (r) {
        const ok = r.statutFinal !== "A_VERIFIER_CANAL";
        return '<tr><td valign="top" style="padding:8px 0;border-bottom:1px solid #EFE7D6;font-size:13px;color:#3A2E22;font-family:Arial,sans-serif;line-height:1.5">' +
          '<strong>' + echapperHtmlCanalAppV1_(r.id) + '</strong> &middot; ' + echapperHtmlCanalAppV1_(r.titre) + '<br>' +
          '<span style="color:' + (ok ? '#2F7D4F' : '#B5622B') + ';font-weight:bold">' + (ok ? '✓ Résolu' : '✗ Toujours à vérifier') + '</span> &middot; ' +
          'Statut : ' + echapperHtmlCanalAppV1_(r.statutFinal || "?") +
          (r.dateFin ? ' &middot; Fin : ' + echapperHtmlCanalAppV1_(r.dateFin) : '') + '<br>' +
          '<span style="color:#9A9182;font-size:12px">' + echapperHtmlCanalAppV1_(r.commentaire || "") + '</span></td></tr>';
      }).join("") + '</table>';
  }
  MailApp.sendEmail({
    to: destinataires,
    subject: "CinéMaison - V2 - CANAL+ : recontrôle des fiches à vérifier (" + resultats.length + ")",
    htmlBody: enveloppeMailCanalAppV1_("CANAL+ · RECONTRÔLE DES FICHES À VÉRIFIER", corps),
  });
  return true;
}

function envoyerMailEtatControleCanalAppV1_() {
  const etat = lireEtatControleCompletCanalV4_();
  let texte;
  if (!etat) {
    texte = "Aucun contrôle complet CANAL+ n'a encore été lancé.";
  } else {
    const total = Math.max(0, SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.FILMS).getLastRow() - 1);
    texte = (etat.actif ? "EN COURS" : (etat.termineLe ? "TERMINÉ" : (etat.arreteLe ? "ARRÊTÉ" : "INACTIF"))) + "\n" +
      "Démarré : " + (etat.demarreLe || "?") + "\n" +
      (etat.termineLe ? "Terminé : " + etat.termineLe + "\n" : "") +
      (etat.arreteLe ? "Arrêté : " + etat.arreteLe + "\n" : "") +
      "Lignes parcourues : " + Math.max(0, Number(etat.prochainIndex || 1) - 1) + " / " + total + " (toutes plateformes)\n" +
      "Fiches CANAL+ traitées : " + Number(etat.traites || 0) + "\n" +
      "Dates connues : " + Number(etat.datesConnues || 0) + " · Plus de 6 mois : " + Number(etat.plusDe6Mois || 0) + "\n" +
      "À vérifier : " + Number(etat.aVerifier || 0) + " · Non trouvées : " + Number(etat.nonTrouves || 0) + "\n" +
      "VOD sans date : " + Number(etat.vodSansDate || 0) + " · Erreurs : " + Number(etat.erreurs || 0) + "\n" +
      "Lots : " + Number(etat.lots || 0);
  }
  const destinataires = destinatairesPourService_(CANAL_APP_DEST_SERVICE_V1);
  if (!destinataires) return false;
  MailApp.sendEmail({
    to: destinataires,
    subject: "CinéMaison - V2 - CANAL+ : état du contrôle des dates",
    htmlBody: enveloppeMailCanalAppV1_("CANAL+ · ÉTAT DU CONTRÔLE DES DATES",
      '<pre style="font-size:13px;color:#3A2E22;font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap;margin:0">' + echapperHtmlCanalAppV1_(texte) + '</pre>'),
  });
  return true;
}
