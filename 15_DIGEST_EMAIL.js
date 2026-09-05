/**
 * ============================================================
 * CinéMaison V4
 * Script : 15_DIGEST_EMAIL.gs
 * Rôle   : Email quotidien récapitulatif des films qui partent bientôt
 * Version: 1.1
 * Dépendances : 00_CONFIG.gs, 01_UTILS.gs
 *
 * Correctif V1.1 (05/09/2026) :
 * - Retrait du lien "VOIR SUR LETTERBOXD →" (Ben n'en a pas l'usage).
 * - Ajout à la place, sur la même ligne infos que la plateforme et le
 *   J-X : la durée (colonne "Duree", déjà présente dans le Sheet, ex.
 *   "1h31") et la note Letterboxd (colonne "NoteLetterboxd", format
 *   virgule décimale française "3,54" -> normalisée en point avant
 *   parsing, puis affichée "★ 3.5", même logique que parseRating() côté
 *   App.jsx pour rester cohérent visuellement avec l'app).
 *
 * PRINCIPE :
 * Une fois par jour, envoie un email récapitulatif (mise en forme façon
 * CinéRadar) listant tous les films dont la date de disponibilité tombe
 * dans les N prochains jours (N réglable depuis l'app), avec une section
 * globale et deux sections séparées pour les fiches taguées Romy / Benoit.
 *
 * RÉGLAGES (lus depuis CONFIG via lireConfig_, modifiables depuis l'app
 * via 09_WEBHOOK.gs) :
 *   DigestEmailActif        : "OUI" ou "NON"
 *   DigestEmailSeuilJours   : nombre de jours (ex. "7")
 *   DigestEmailDestinataires: adresses séparées par des virgules
 *
 * MISE EN PLACE (une seule fois, manuellement) :
 * Ce déclencheur n'est PAS intégré au système géré de 08_DECLENCHEURS.gs
 * (qui exige exactement 8 tâches officielles) — il est installé à part,
 * pour ne rien risquer de casser sur ce système existant. Exécute une
 * fois depuis l'éditeur :
 *   installerDeclencheurDigestEmailV1()
 * ============================================================
 */

const DIGEST_EMAIL_HEURE_DEFAUT_V1 = 8; // 8h du matin


/**
 * Installe le déclencheur quotidien (une seule fois, manuellement).
 * Supprime d'abord un éventuel ancien déclencheur du même nom pour éviter
 * les doublons si on relance l'installation.
 */
function installerDeclencheurDigestEmailV1() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "envoyerDigestEmailQuotidienV1") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("envoyerDigestEmailQuotidienV1")
    .timeBased()
    .everyDays(1)
    .atHour(DIGEST_EMAIL_HEURE_DEFAUT_V1)
    .create();

  Logger.log(
    "Déclencheur du résumé quotidien installé vers " +
    DIGEST_EMAIL_HEURE_DEFAUT_V1 + "h."
  );
}


function supprimerDeclencheurDigestEmailV1() {
  let supprimes = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "envoyerDigestEmailQuotidienV1") {
      ScriptApp.deleteTrigger(t);
      supprimes++;
    }
  });
  Logger.log("Déclencheurs du résumé quotidien supprimés : " + supprimes);
}


/**
 * Point d'entrée principal — appelé par le déclencheur quotidien.
 */
function envoyerDigestEmailQuotidienV1() {
  try {
    const actif = String(lireConfig_("DigestEmailActif", "NON")).trim().toUpperCase();

    if (actif !== "OUI") {
      journal_("DIGEST_EMAIL", "ENVOI", "IGNORE", "DigestEmailActif = " + actif);
      return false;
    }

    const destinatairesBrut = String(lireConfig_("DigestEmailDestinataires", "")).trim();

    if (!destinatairesBrut) {
      journal_("DIGEST_EMAIL", "ENVOI", "IGNORE", "Aucun destinataire configuré");
      return false;
    }

    const seuil = Number(lireConfig_("DigestEmailSeuilJours", "7")) || 7;

    const sheet = getSheet_(SHEETS.FILMS);
    if (!sheet) {
      erreur_("DIGEST_EMAIL", "ENVOI", "Feuille Films introuvable", "");
      return false;
    }

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return true;

    const h = headers_(data[0]);
    const partentBientot = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const titre = cleanTitle_(get_(row, h, "Titre"));
      if (!titre) continue;

      const jours = joursAvantExpirationDigestV1_(row, h);
      if (jours === null || jours < 0 || jours > seuil) continue;

      partentBientot.push({
        titre: titre,
        annee: get_(row, h, "Annee"),
        plateforme: get_(row, h, "Plateforme"),
        affiche: get_(row, h, "Affiche"),
        duree: get_(row, h, "Duree"),
        noteLetterboxd: get_(row, h, "NoteLetterboxd"),
        jours: jours,
        romy: toBool_(get_(row, h, "Romy")),
        benoit: toBool_(get_(row, h, "Benoit"))
      });
    }

    if (partentBientot.length === 0) {
      journal_("DIGEST_EMAIL", "ENVOI", "IGNORE", "Aucun film ne part dans les " + seuil + " prochains jours");
      return true;
    }

    partentBientot.sort(function(a, b) { return a.jours - b.jours; });

    const pourRomy = partentBientot.filter(function(f) { return f.romy; });
    const pourBenoit = partentBientot.filter(function(f) { return f.benoit; });

    const html = construireHtmlDigestEmailV1_(partentBientot, pourRomy, pourBenoit, seuil);

    const destinataires = destinatairesBrut
      .split(/[,;]/)
      .map(function(e) { return e.trim(); })
      .filter(Boolean);

    MailApp.sendEmail({
      to: destinataires.join(","),
      subject: "CinéMaison - V2 - " + partentBientot.length + " film(s) partent bientôt",
      htmlBody: html
    });

    journal_(
      "DIGEST_EMAIL",
      "ENVOI",
      "OK",
      "Films=" + partentBientot.length +
      " | Romy=" + pourRomy.length +
      " | Benoit=" + pourBenoit.length +
      " | Destinataires=" + destinataires.length
    );

    resoudreErreur_("DIGEST_EMAIL", "ENVOI");

    return true;

  } catch (e) {
    erreur_("DIGEST_EMAIL", "ENVOI", String(e), e && e.stack ? e.stack : "");
    try {
      envoyerMailErreurScript_(e, "envoyerDigestEmailQuotidienV1");
    } catch (mailErr) {
      Logger.log("Échec du mail d'erreur envoyerDigestEmailQuotidienV1 : " + String(mailErr));
    }
    return false;
  }
}


/**
 * Nombre de jours avant expiration, même logique de priorité que côté
 * app (DateDisponibilite manuelle prioritaire, sinon DateDisponibiliteAuto).
 * Retourne null si aucune date exploitable.
 */
function joursAvantExpirationDigestV1_(row, h) {
  const manuelle = get_(row, h, "DateDisponibilite");
  const auto = get_(row, h, "DateDisponibiliteAuto");
  const valeur = manuelle || auto;

  if (!valeur) return null;

  const dateStr = normaliserDate_(valeur);
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;

  const date = ymdToDate_(dateStr);
  if (!date || isNaN(date.getTime())) return null;

  const aujourdHui = new Date();
  aujourdHui.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.round((date.getTime() - aujourdHui.getTime()) / 86400000);
}


/**
 * Construit le HTML de l'email — inspiré du style CinéRadar (fond crème,
 * titre sérif, liseré doré, cartes par film). Les emails ne supportent
 * qu'un sous-ensemble de CSS et uniquement en inline : pas de classes,
 * pas de feuille de style externe.
 */
function construireHtmlDigestEmailV1_(tous, pourRomy, pourBenoit, seuil) {
  const couleurFond = "#F4EFE6";
  const couleurCarte = "#FBF8F2";
  const couleurTexte = "#2B2620";
  const couleurOr = "#B8925A";
  const couleurMuted = "#8A8072";

  const carteFilm = function(f) {
    const urgence = f.jours <= 2 ? "#C0392B" : (f.jours <= 5 ? "#B8925A" : couleurMuted);
    const affiche = f.affiche
      ? '<img src="' + f.affiche + '" width="60" height="86" style="border-radius:4px;object-fit:cover;display:block;" alt="">'
      : '<div style="width:60px;height:86px;background:#E4DCCB;border-radius:4px;"></div>';

    const noteFormatee = formaterNoteLetterboxdDigestV1_(f.noteLetterboxd);

    const infosSecondaires = [
      f.plateforme || "",
      f.duree || "",
      noteFormatee ? "★ " + noteFormatee : ""
    ].filter(Boolean).join(" &middot; ");

    return (
      '<tr><td style="padding:14px 0;border-bottom:1px solid #E4DCCB;">' +
        '<table role="presentation" width="100%"><tr>' +
          '<td width="60" style="vertical-align:top;">' + affiche + '</td>' +
          '<td style="vertical-align:top;padding-left:16px;">' +
            '<div style="font-family:Georgia,serif;font-size:16px;color:' + couleurTexte + ';font-weight:bold;">' + escaperHtmlDigestV1_(f.titre) + (f.annee ? ' <span style="font-weight:normal;color:' + couleurMuted + ';">(' + f.annee + ')</span>' : '') + '</div>' +
            '<div style="font-family:monospace;font-size:11px;letter-spacing:1px;color:' + couleurMuted + ';text-transform:uppercase;margin-top:4px;">' + escaperHtmlDigestV1_(infosSecondaires) + ' &middot; <span style="color:' + urgence + ';font-weight:bold;">J-' + f.jours + '</span></div>' +
          '</td>' +
        '</tr></table>' +
      '</td></tr>'
    );
  };

  const sectionListe = function(titreSection, films) {
    if (!films || films.length === 0) return "";
    return (
      '<tr><td style="padding-top:26px;padding-bottom:10px;">' +
        '<div style="font-family:monospace;font-size:12px;letter-spacing:2px;color:' + couleurOr + ';text-transform:uppercase;border-bottom:1px solid ' + couleurOr + '55;padding-bottom:8px;">' + escaperHtmlDigestV1_(titreSection) + '</div>' +
      '</td></tr>' +
      '<tr><td><table role="presentation" width="100%">' +
        films.map(carteFilm).join("") +
      '</table></td></tr>'
    );
  };

  return (
    '<div style="background:' + couleurFond + ';padding:32px 16px;font-family:Georgia,serif;">' +
      '<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:' + couleurCarte + ';border-radius:12px;overflow:hidden;border:1px solid #E4DCCB;">' +
        '<tr><td style="padding:32px 28px 20px;border-bottom:1px solid #E4DCCB;">' +
          '<div style="font-family:Georgia,serif;font-size:28px;color:' + couleurTexte + ';font-weight:bold;letter-spacing:0.5px;">CINÉ<span style="color:' + couleurOr + ';">MAISON</span></div>' +
          '<div style="font-family:monospace;font-size:11px;letter-spacing:3px;color:' + couleurMuted + ';text-transform:uppercase;margin-top:4px;">Résumé quotidien &middot; ' + tous.length + ' film(s) sous ' + seuil + ' jours</div>' +
        '</td></tr>' +
        '<tr><td style="padding:0 28px 28px;">' +
          '<table role="presentation" width="100%">' +
            sectionListe("Tous les films", tous) +
            sectionListe("Pour Romy", pourRomy) +
            sectionListe("Pour Benoît", pourBenoit) +
          '</table>' +
        '</td></tr>' +
        '<tr><td style="padding:16px 28px;text-align:center;background:#EFE7D8;">' +
          '<span style="font-family:monospace;font-size:10px;color:' + couleurMuted + ';">Envoyé automatiquement par CinéMaison</span>' +
        '</td></tr>' +
      '</table>' +
    '</div>'
  );
}


function escaperHtmlDigestV1_(texte) {
  return String(texte || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


/**
 * Normalise "3,54" (virgule décimale française telle que stockée dans
 * le Sheet) en nombre, puis formate en 1 décimale ("3.5"). Même logique
 * que parseRating() dans App.jsx, pour rester cohérent avec l'affichage
 * dans l'app. Retourne "" si la valeur est vide ou non numérique.
 */
function formaterNoteLetterboxdDigestV1_(valeur) {
  if (valeur === null || valeur === undefined || valeur === "") return "";
  const n = Number(String(valeur).trim().replace(",", "."));
  return isNaN(n) ? "" : n.toFixed(1);
}


/**
 * Test manuel — force l'envoi immédiatement, quel que soit DigestEmailActif,
 * pour vérifier le rendu sans attendre le déclencheur quotidien. N'ENVOIE
 * PAS si aucun destinataire n'est configuré (mêmes garde-fous que la
 * version réelle, sauf le test sur DigestEmailActif).
 */
function testerEnvoyerDigestEmailV1() {
  const destinatairesBrut = String(lireConfig_("DigestEmailDestinataires", "")).trim();
  if (!destinatairesBrut) {
    throw new Error("Aucun destinataire configuré (DigestEmailDestinataires vide) — configure-le depuis l'app d'abord.");
  }

  const ancienActif = lireConfig_("DigestEmailActif", "NON");
  ecrireConfig_("DigestEmailActif", "OUI");

  try {
    const resultat = envoyerDigestEmailQuotidienV1();
    Logger.log("Résultat du test : " + resultat);
  } finally {
    ecrireConfig_("DigestEmailActif", ancienActif);
  }
}
