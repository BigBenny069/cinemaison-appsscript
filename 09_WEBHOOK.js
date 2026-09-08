/**
 * ============================================================
 * CinéMaison V4
 * Script : 09_WEBHOOK.gs
 * Rôle   : Point d'entrée Web App — déclenche un ré-enrichissement
 *          IMMÉDIAT d'une fiche depuis l'application (sans dépendre du
 *          cycle programmé toutes les 5 min, donc sans avoir besoin
 *          d'un PC allumé ou du Sheet ouvert). Reçoit aussi les réglages
 *          du résumé quotidien par email (V1.1).
 * Version: 2.1
 *
 * Correctif V2.1 (07/09/2026) : rien n'appelait jamais resoudreErreur_
 * pour le module "ENRICHISSEMENT" -- une erreur WEBHOOK_APP restait
 * ACTIVE indéfiniment même après une relance réussie juste après. Une
 * relance immédiate réussie referme maintenant sa propre erreur.
 *
 * Correctif V2.0 (07/09/2026) :
 * 2 nouvelles actions pour valider CONTROLE_PRIME sans repasser par
 * l'éditeur Apps Script :
 * - "lancerVerificationControlePrime" : appelée par prime.js juste après
 *   un envoi réussi vers CONTROLE_PRIME. Lance
 *   verifierResultatsPrimeOfficielSansEcriture() (SIMULATION), envoie le
 *   résumé complet par mail avec un bouton "VALIDER ET APPLIQUER" (le
 *   lien, construit par prime.js, est transmis tel quel -- pas de mot
 *   de passe à deviner côté Apps Script).
 * - "appliquerControlePrime" : appelée par api/appliquer-controle-
 *   prime.js (Vercel) suite à un vrai clic sur la page de confirmation.
 *   Lance appliquerResultatsPrimeOfficiel() pour de vrai (ÉCRITURE).
 * Dépendances : 00_CONFIG.gs, 01_UTILS.gs, 02_TMDB.gs, 03_LETTERBOXD.gs,
 *               05_ENRICHISSEMENT.gs, 10_DIGEST_EMAIL.gs
 *
 * PRINCIPE :
 * L'app (via api/update-film.js) appelle cette Web App en HTTP POST juste
 * après avoir modifié Titre / Année / URLLetterboxd, ou après un clic sur
 * "Redemander une vérification". doPost() ne fait QUE mettre la fiche en
 * file d'attente et répond immédiatement (quelques centaines de ms) — le
 * vrai travail (appels TMDb/Letterboxd, qui peuvent prendre plusieurs
 * secondes) se fait 2 secondes plus tard via un déclencheur éphémère, pour
 * ne jamais risquer de faire expirer la requête HTTP de l'app le temps
 * que Vercel attend une réponse.
 *
 * V1.1 : doPost() accepte aussi un second type de requête — un corps avec
 * "action": "updateDigestSettings" — utilisé par api/update-settings.js
 * pour écrire les réglages du résumé quotidien (10_DIGEST_EMAIL.gs) via
 * ecrireConfig_, sans jamais faire deviner à Vercel la structure exacte
 * de l'onglet CONFIG.
 *
 * Correctif V1.9 (06/09/2026) :
 * Ajout des liens "Ignorer" (suggestions) et "Validé, c'est normal"
 * (ambiguïtés) dans le mail -- écrivent dans l'onglet PRIME_IGNORES via
 * api/write-prime-ignore.js (Vercel), lu par prime.js à chaque run.
 * Sans clic sur l'un de ces boutons (ou "+ Ajouter"), un titre continue
 * maintenant à revenir dans les mails suivants au lieu de disparaître
 * tout seul après une seule mention.
 *
 * Correctif V1.8 (06/09/2026) :
 * Le mail de suggestions Prime inclut maintenant une section "AMBIGUÏTÉS
 * À VÉRIFIER" (titres qui correspondent à plusieurs fiches CinéMaison,
 * durée insuffisante pour départager) -- ces cas ne remontaient nulle
 * part avant, perdus dans la console à la fermeture de PowerShell.
 *
 * Correctif V1.7 (06/09/2026) :
 * Mail de suggestions Prime : ajout de l'affiche (vignette) et de la
 * durée à côté de chaque titre, même mise en page que le digest
 * quotidien (10_DIGEST_EMAIL.gs).
 *
 * Correctif V1.6 (06/09/2026) :
 * Chaque suggestion du mail a maintenant un bouton "+ AJOUTER À
 * CINÉMAISON" qui pointe vers api/suggestion-confirm.js (page de
 * confirmation Vercel, PAS ce fichier) -- l'ajout se fait entièrement
 * côté Vercel, ce fichier ne fait toujours qu'envoyer le mail.
 *
 * Correctif V1.5 (06/09/2026) :
 * Action renommée "alerteAjoutAutoPrime" -> "alerteSuggestionsPrime" --
 * prime.js (V2.12) n'auto-crée plus rien dans le Sheet (un test réel a
 * créé plusieurs fiches non voulues), il ne fait plus que suggérer par
 * mail. Contenu de l'email adapté en conséquence (lien vers la fiche
 * Prime, mention explicite que rien n'a été écrit).
 *
 * Correctif V1.4 (06/09/2026) :
 * Nouvelle action "alerteAjoutAutoPrime" -- appelée directement par
 * prime.js (pas via Vercel) en fin d'exécution s'il a auto-créé des
 * fiches pour des titres Prime sans correspondance CinéMaison. Envoie
 * UN SEUL mail récapitulatif pour tout le lot via
 * destinatairesPourService_("AjoutAutoPrime").
 *
 * Correctif V1.2 :
 * Erreur récurrente observée en journal ("ENRICHISSEMENT | WEBHOOK_APP |
 * Échec relance immédiate... Un autre enrichissement est déjà en
 * cours."). Cause identifiée : LockService.getScriptLock() est un verrou
 * GLOBAL À TOUT LE PROJET, pas propre à chaque fonction — or
 * 05_ENRICHISSEMENT.gs prend ce même verrou à 6 endroits différents pour
 * ses contrôles périodiques (toutes les quelques minutes), certains
 * pouvant le garder jusqu'à 120 secondes. reenrichirParIdSheetV1_
 * n'attendait que 30 secondes avant d'abandonner — largement insuffisant
 * si le webhook se déclenche pile pendant un de ces contrôles. Comme ce
 * traitement est déjà entièrement asynchrone (le déclencheur éphémère
 * tourne 2s après la réponse HTTP déjà envoyée à l'app, Ben n'attend rien
 * en direct), attendre plus longtemps ne dégrade aucune expérience
 * utilisateur. Délai porté de 30s à 90s. empilerReenrichissementWebhookV1_
 * (mise en file, opération courte) porté de 10s à 20s par la même
 * précaution, avec la même marge de sécurité raisonnable.
 *
 * Correctif V1.3 :
 * Le délai de 20s (V1.2) sur empilerReenrichissementWebhookV1_ dépassait
 * les 8 secondes que update-film.js/update-settings.js attendent avant
 * d'abandonner l'appel HTTP (AbortController côté Vercel) -- en cas de
 * verrou occupé, Vercel se déconnectait avant de savoir si la mise en
 * file avait réussi. Ramené à 5s, largement sous la limite Vercel.
 * reenrichirParIdSheetV1_ (90s) n'est pas concerné : il tourne 2s après
 * la réponse HTTP déjà envoyée, totalement déconnecté du délai Vercel.
 *
 * MISE EN PLACE (à faire une seule fois, manuellement) :
 * 1. Dans le Sheet CONFIG, ajoute une ligne "WebhookSecret" avec une valeur
 *    secrète de ton choix (une longue chaîne aléatoire suffit).
 * 2. Dans l'éditeur Apps Script : Déployer > Nouveau déploiement.
 *    Type : Application Web.
 *    Exécuter en tant que : Moi.
 *    Qui a accès : Tout le monde.
 * 3. Copie l'URL de déploiement obtenue (se termine par /exec).
 * 4. Sur Vercel, ajoute ces deux variables d'environnement (Production) :
 *      ENRICH_WEBHOOK_URL = l'URL copiée à l'étape 3
 *      ENRICH_WEBHOOK_SECRET = la même valeur que WebhookSecret (étape 1)
 * 5. Redéploie api/update-film.js et dépose api/update-settings.js.
 *
 * Si tu modifies ce fichier plus tard, il faut créer une NOUVELLE version
 * de déploiement (Déployer > Gérer les déploiements > crayon > Nouvelle
 * version) pour que le changement soit pris en compte — l'URL /exec reste
 * la même d'une version à l'autre.
 * ============================================================
 */

const WEBHOOK_REENRICH_QUEUE_PROP_V1 = "CINEMAISON_WEBHOOK_REENRICH_QUEUE_V1";
const WEBHOOK_REENRICH_HANDLER_V1 = "traiterFileReenrichissementWebhookV1";

/**
 * Point d'entrée HTTP POST. Cinq formes de corps JSON acceptées :
 *   1. { "secret": "...", "id": "FILM0123" }
 *      -> ré-enrichissement immédiat (inchangé depuis V1.0).
 *   2. { "secret": "...", "action": "updateDigestSettings",
 *        "actif": true|false, "seuilJours": 7, "destinataires": "a@x.com,b@y.com" }
 *      -> met à jour les réglages du résumé quotidien par email.
 *   3. { "secret": "...", "action": "alerteSuggestionsPrime",
 *        "fiches": [...], "ambiguites": [...] }
 *      -> envoie le mail de suggestions/ambiguïtés Prime (appelé par
 *      prime.js, en direct). N'écrit rien dans le Sheet.
 *   4. { "secret": "...", "action": "lancerVerificationControlePrime",
 *        "confirmUrl": "https://cinemaison-v2.vercel.app/api/controle-prime-confirm?pw=..." }
 *      -> lance la SIMULATION (verifierResultatsPrimeOfficielSansEcriture),
 *      envoie le résumé + bouton "Valider et appliquer" par mail
 *      (appelé par prime.js, en direct).
 *   5. { "secret": "...", "action": "appliquerControlePrime" }
 *      -> lance l'ÉCRITURE réelle (appliquerResultatsPrimeOfficiel),
 *      appelé par api/appliquer-controle-prime.js (Vercel) suite à un
 *      vrai clic sur la page de confirmation.
 */
function doPost(e) {
  try {
    const corps = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const secret = String(corps.secret || "");
    const secretAttendu = String(lireConfig_("WebhookSecret", ""));

    if (!secretAttendu || secret !== secretAttendu) {
      return reponseJsonWebhook_({ ok: false, error: "Secret incorrect" }, 401);
    }

    if (corps.action === "updateDigestSettings") {
      return traiterMiseAJourReglagesDigestV1_(corps);
    }

    if (corps.action === "alerteSuggestionsPrime") {
      return traiterAlerteSuggestionsPrimeV1_(corps);
    }

    if (corps.action === "lancerVerificationControlePrime") {
      return traiterLancerVerificationControlePrimeV1_(corps);
    }

    if (corps.action === "appliquerControlePrime") {
      return traiterAppliquerControlePrimeV1_(corps);
    }

    const id = safeTrim_(corps.id || "");
    if (!id) {
      return reponseJsonWebhook_({ ok: false, error: "id manquant" }, 400);
    }

    empilerReenrichissementWebhookV1_(id);
    return reponseJsonWebhook_({ ok: true, queued: true, id: id });
  } catch (err) {
    return reponseJsonWebhook_({ ok: false, error: String(err) }, 500);
  }
}

/**
 * Écrit les réglages du résumé quotidien dans CONFIG via ecrireConfig_ —
 * jamais d'écriture directe de cellule depuis Vercel, pour ne dépendre
 * que de la logique déjà fiable côté Apps Script.
 */
function traiterMiseAJourReglagesDigestV1_(corps) {
  const actif = corps.actif === true ? "OUI" : "NON";
  const seuilJours = Number(corps.seuilJours);
  const destinataires = String(corps.destinataires || "").trim();

  ecrireConfig_("DigestEmailActif", actif);
  if (Number.isFinite(seuilJours) && seuilJours > 0) {
    ecrireConfig_("DigestEmailSeuilJours", String(Math.round(seuilJours)));
  }

  // Garde toujours l'ancienne clé à jour (repli si la matrice n'existe
  // pas ou est supprimée un jour), ET met à jour la colonne "Digest" de
  // DESTINATAIRES_EMAIL si elle existe -- c'est cette dernière qui fait
  // réellement foi depuis sa création (voir destinatairesPourService_).
  ecrireConfig_("DigestEmailDestinataires", destinataires);
  const matriceMiseAJour = definirDestinatairesPourService_(
    "Digest",
    destinataires.split(/[,;]/)
  );

  journal_(
    "DIGEST_EMAIL",
    "REGLAGES_APP",
    "OK",
    "Actif=" + actif + " | Seuil=" + seuilJours + " | Destinataires=" +
    (destinataires ? destinataires.split(/[,;]/).length : 0) +
    " | Matrice=" + (matriceMiseAJour ? "OUI" : "NON (onglet absent)")
  );

  return reponseJsonWebhook_({ ok: true, actif: actif, seuilJours: seuilJours, destinataires: destinataires });
}

/**
 * Reçoit { secret, action: "alerteSuggestionsPrime", fiches: [{titre,
 * annee, type, plateforme, url}, ...], ambiguites: [{titre, raison,
 * dureePrimeMinutes, candidats: [{id, annee, duree}, ...]}, ...] }
 * depuis prime.js (appel direct au webhook, pas via Vercel -- un seul
 * mail pour tout le lot d'un run). PUREMENT INFORMATIF : rien n'est
 * écrit dans le Sheet ici.
 */
function traiterAlerteSuggestionsPrimeV1_(corps) {
  const fiches = Array.isArray(corps.fiches) ? corps.fiches : [];
  const ambiguites = Array.isArray(corps.ambiguites) ? corps.ambiguites : [];
  if (fiches.length === 0 && ambiguites.length === 0) {
    return reponseJsonWebhook_({ ok: false, error: "fiches et ambiguites vides" }, 400);
  }

  const destinataires = destinatairesPourService_("AjoutAutoPrime");
  if (destinataires) {
    const corpsHtml = construireHtmlSuggestionsPrimeV1_(fiches, ambiguites);
    const sujet = fiches.length > 0 && ambiguites.length > 0
      ? "CinéMaison - V2 - " + fiches.length + " suggestion(s) + " + ambiguites.length + " ambiguïté(s) (Prime)"
      : fiches.length > 0
        ? "CinéMaison - V2 - " + fiches.length + " suggestion(s) d'ajout (Prime)"
        : "CinéMaison - V2 - " + ambiguites.length + " ambiguïté(s) à vérifier (Prime)";
    MailApp.sendEmail({ to: destinataires, subject: sujet, htmlBody: corpsHtml });
  }

  journal_(
    "PRIME_SUGGESTIONS",
    "ALERTE_MAIL",
    destinataires ? "OK" : "IGNORE_SANS_DESTINATAIRE",
    fiches.length + " suggestion(s), " + ambiguites.length + " ambiguïté(s) : " +
    fiches.concat(ambiguites).map(function(f) { return f.titre; }).join(", ")
  );

  return reponseJsonWebhook_({ ok: true, mailEnvoye: !!destinataires, nombreFiches: fiches.length, nombreAmbiguites: ambiguites.length });
}


/**
 * Reçoit { secret, action: "lancerVerificationControlePrime" } depuis
 * prime.js (appel direct au webhook, juste après un envoi réussi vers
 * CONTROLE_PRIME). Lance verifierResultatsPrimeOfficielSansEcriture()
 * (11_CONTROLE_PRIME_OFFICIEL.gs, SIMULATION -- n'écrit rien), et
 * envoie le résumé par mail avec un bouton "Valider et appliquer" qui
 * pointe vers la page de confirmation Vercel (api/controle-prime-confirm.js).
 */
function traiterLancerVerificationControlePrimeV1_(corps) {
  const resume = verifierResultatsPrimeOfficielSansEcriture();

  const destinataires = destinatairesPourService_("AjoutAutoPrime");
  if (destinataires) {
    // confirmUrl est construit par prime.js (qui a déjà le mot de passe
    // via secrets-local.json) et transmis tel quel -- pas de clé de
    // config à deviner côté Apps Script.
    const corpsHtml = construireHtmlResumeControlePrimeV1_(resume, corps.confirmUrl);
    MailApp.sendEmail({
      to: destinataires,
      subject: "CinéMaison - V2 - Prime : " + resume.controlesValides + " contrôle(s) prêt(s) à appliquer",
      htmlBody: corpsHtml,
    });
  }

  journal_(
    "CONTROLE_PRIME",
    "VERIFICATION_AUTO",
    destinataires ? "OK" : "IGNORE_SANS_DESTINATAIRE",
    "Valides=" + resume.controlesValides + " | Changements=" + resume.changements +
    " | AjoutsPlateforme=" + resume.ajoutsPlateforme + " | Erreurs=" + resume.erreurs
  );

  return reponseJsonWebhook_({ ok: true, resume: resume, mailEnvoye: !!destinataires });
}


/**
 * Reçoit { secret, action: "appliquerControlePrime" } -- appelé par
 * api/appliquer-controle-prime.js (Vercel), lui-même déclenché par un
 * vrai clic humain sur la page de confirmation (jamais directement
 * depuis le lien du mail). Lance appliquerResultatsPrimeOfficiel() pour
 * de vrai (ÉCRITURE dans Films) et retourne le résumé.
 */
function traiterAppliquerControlePrimeV1_(corps) {
  const resume = appliquerResultatsPrimeOfficiel();

  journal_(
    "CONTROLE_PRIME",
    "APPLICATION_VALIDEE",
    "OK",
    "Changements=" + resume.changements + " | AjoutsPlateforme=" + resume.ajoutsPlateforme +
    " | Erreurs=" + resume.erreurs
  );

  return reponseJsonWebhook_({ ok: true, resume: resume });
}


/**
 * Même habillage (fond crème, logo CINÉMAISON) que les autres emails.
 */
function construireHtmlResumeControlePrimeV1_(resume, confirmUrl) {
  const lignes = [
    ["Contrôles valides", resume.controlesValides],
    ["Dates validées", resume.datesValidees],
    ["Sans alerte", resume.sansAlerte],
    ["Conflits d'autre source protégés", resume.conflitsProteges],
    ["Ajouts PRIME aux plateformes", resume.ajoutsPlateforme],
    ["Changements de date", resume.changements],
    ["Ignorés", resume.ignores],
    ["Erreurs", resume.erreurs],
  ].map(function(l) {
    return '<div style="display:flex;justify-content:space-between;padding:6px 0;' +
      'border-bottom:1px solid #EFE7D6;font-family:Arial,sans-serif;font-size:13px">' +
      '<span style="color:#9A9182">' + l[0] + '</span>' +
      '<span style="color:#3A2E22;font-weight:bold">' + l[1] + '</span></div>';
  }).join("");

  const bouton = confirmUrl
    ? '<a href="' + confirmUrl +
      '" style="display:inline-block;margin-top:16px;background:#B5622B;' +
      'color:#FFFBF2;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;' +
      'font-weight:bold;padding:10px 16px;border-radius:5px">VALIDER ET APPLIQUER</a>'
    : '<div style="font-size:12px;color:#9A9182;font-family:Arial,sans-serif;margin-top:16px">' +
      'Lien de validation manquant -- lance appliquerResultatsPrimeOfficiel() ' +
      'à la main dans l\'éditeur Apps Script.</div>';

  return (
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="color-scheme" content="light only">' +
    '<meta name="supported-color-schemes" content="light only">' +
    '</head><body style="margin:0;padding:0;background:#F5EFE0">' +
    '<div style="background:#F5EFE0;padding:24px 12px">' +
    '<div style="background:#FFFBF2;border-radius:8px;padding:28px 22px;' +
    'max-width:480px;margin:0 auto;font-family:Georgia,serif">' +
    '<div style="font-size:22px;font-weight:bold;color:#3A2E22">' +
    'CINÉ<span style="color:#B5622B">MAISON</span></div>' +
    '<div style="font-size:11px;letter-spacing:1.5px;color:#B5622B;' +
    'margin-top:4px;font-family:Arial,sans-serif">CONTRÔLE PRIME &middot; SIMULATION</div>' +
    '<div style="border-top:1px solid #E3D9C4;margin:16px 0"></div>' +
    lignes +
    bouton +
    '</div></div></body></html>'
  );
}


/**
 * Même habillage (fond crème, logo CINÉMAISON) que les autres emails.
 * Chaque titre pointe vers sa fiche Prime (lien cliquable) pour
 * vérifier rapidement de quoi il s'agit avant de décider de l'ajouter
 * ou non depuis l'app.
 */
function construireHtmlSuggestionsPrimeV1_(fiches, ambiguites) {
  ambiguites = ambiguites || [];

  let lignes = "";
  fiches.forEach(function(f) {
    const titreAffiche = escaperHtmlDigestV1_(f.titre) +
      (f.annee ? ' <span style="font-weight:normal;color:#9A9182">(' + f.annee + ')</span>' : '');

    const boutonAjout = f.confirmUrl
      ? '<a href="' + f.confirmUrl + '" style="display:inline-block;margin-top:8px;background:#B5622B;' +
        'color:#FFFBF2;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;' +
        'font-weight:bold;padding:8px 14px;border-radius:5px">+ AJOUTER À CINÉMAISON</a>'
      : '<span style="display:inline-block;margin-top:8px;color:#9A9182;font-family:Arial,sans-serif;' +
        'font-size:11px">année non détectée -- ajoute à la main depuis l\'app</span>';

    const lienIgnorer = f.ignorerUrl
      ? ' &nbsp; <a href="' + f.ignorerUrl + '" style="display:inline-block;margin-top:8px;' +
        'color:#9A9182;text-decoration:underline;font-family:Arial,sans-serif;font-size:11px">Ignorer</a>'
      : '';

    const duree = f.dureeMinutes
      ? Math.floor(f.dureeMinutes / 60) + "h" + String(f.dureeMinutes % 60).padStart(2, "0")
      : "";
    const infosSecondaires = [escaperHtmlDigestV1_(f.plateforme || ""), duree, "type suggéré : " + escaperHtmlDigestV1_(f.type || "?")]
      .filter(Boolean)
      .join(" &middot; ");

    const imageHtml = f.affiche
      ? '<img src="' + f.affiche + '" width="50" height="75" style="border-radius:4px;object-fit:cover;flex-shrink:0;margin-right:12px" alt="">'
      : '<div style="width:50px;height:75px;border-radius:4px;background:#E3D9C4;flex-shrink:0;margin-right:12px"></div>';

    const titreHtml = f.url
      ? '<a href="' + f.url + '" style="font-family:Georgia,serif;font-size:15px;color:#3A2E22;font-weight:bold;text-decoration:none">' + titreAffiche + '</a>'
      : '<span style="font-family:Georgia,serif;font-size:15px;color:#3A2E22;font-weight:bold">' + titreAffiche + '</span>';

    lignes +=
      '<div style="display:flex;align-items:flex-start;padding:12px 0;border-bottom:1px solid #EFE7D6">' +
      imageHtml +
      '<div style="min-width:0">' +
      titreHtml +
      '<div style="font-size:12px;color:#9A9182;font-family:Arial,sans-serif;margin-top:2px">' + infosSecondaires + '</div>' +
      boutonAjout + lienIgnorer +
      '</div></div>';
  });

  let lignesAmbigues = "";
  ambiguites.forEach(function(a) {
    const dureePrime = a.dureePrimeMinutes
      ? Math.floor(a.dureePrimeMinutes / 60) + "h" + String(a.dureePrimeMinutes % 60).padStart(2, "0")
      : "introuvable";
    const candidatsHtml = (a.candidats || []).map(function(c) {
      return c.id + " (" + (c.annee || "?") + ", durée Sheet : " + (c.duree || "?") + ")";
    }).join(" &nbsp;|&nbsp; ");

    const boutonValide = a.ignorerUrl
      ? '<a href="' + a.ignorerUrl + '" style="display:inline-block;margin-top:8px;background:#6E8B4F;' +
        'color:#FFFBF2;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;' +
        'font-weight:bold;padding:8px 14px;border-radius:5px">VALIDÉ, C\'EST NORMAL</a>'
      : '';

    lignesAmbigues +=
      '<div style="padding:10px 0;border-bottom:1px solid #EFE7D6">' +
      '<span style="font-family:Georgia,serif;font-size:15px;color:#3A2E22;font-weight:bold">' + escaperHtmlDigestV1_(a.titre) + '</span>' +
      '<div style="font-size:12px;color:#9A9182;font-family:Arial,sans-serif;margin-top:2px">' +
      'Durée Prime : ' + dureePrime + ' &middot; candidats : ' + escaperHtmlDigestV1_(candidatsHtml) +
      '</div><div>' + boutonValide + '</div></div>';
  });

  const sousTitre = fiches.length > 0 && ambiguites.length > 0
    ? fiches.length + ' SUGGESTION(S), ' + ambiguites.length + ' AMBIGUÏTÉ(S)'
    : fiches.length > 0
      ? fiches.length + ' SUGGESTION(S)'
      : ambiguites.length + ' AMBIGUÏTÉ(S)';

  const sectionSuggestions = fiches.length > 0
    ? '<div style="font-size:12px;color:#9A9182;font-family:Arial,sans-serif;margin-bottom:12px">' +
      'Ces titres sont dans tes favoris Prime Video mais absents de CinéMaison. ' +
      'RIEN N\'A ÉTÉ CRÉÉ AUTOMATIQUEMENT -- clique "Ajouter à CinéMaison" pour ' +
      'créer la fiche directement, ou "Ignorer" pour ne plus jamais en entendre parler. ' +
      'Sans action de ta part, ce titre reviendra dans les prochains mails.</div>' + lignes
    : '';

  const sectionAmbiguites = ambiguites.length > 0
    ? '<div style="font-size:11px;letter-spacing:1px;color:#B5622B;font-family:Arial,sans-serif;' +
      'margin-top:' + (fiches.length > 0 ? '20px' : '0') + ';margin-bottom:8px">AMBIGUÏTÉS À VÉRIFIER</div>' +
      '<div style="font-size:12px;color:#9A9182;font-family:Arial,sans-serif;margin-bottom:12px">' +
      'Ces titres correspondent à PLUSIEURS fiches CinéMaison existantes -- la durée n\'a pas ' +
      'suffi à départager. Corrige la colonne Duree d\'une des fiches (ça résoudra l\'ambiguïté ' +
      'tout seul au prochain passage), ou clique "Validé, c\'est normal" si ce sont bien deux ' +
      'films distincts. Sans action, ça reviendra dans les prochains mails.</div>' + lignesAmbigues
    : '';

  return (
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="color-scheme" content="light only">' +
    '<meta name="supported-color-schemes" content="light only">' +
    '</head><body style="margin:0;padding:0;background:#F5EFE0">' +
    '<div style="background:#F5EFE0;padding:24px 12px">' +
    '<div style="background:#FFFBF2;border-radius:8px;padding:28px 22px;' +
    'max-width:480px;margin:0 auto;font-family:Georgia,serif">' +
    '<div style="font-size:22px;font-weight:bold;color:#3A2E22">' +
    'CINÉ<span style="color:#B5622B">MAISON</span></div>' +
    '<div style="font-size:11px;letter-spacing:1.5px;color:#B5622B;' +
    'margin-top:4px;font-family:Arial,sans-serif">' +
    'PRIME &middot; ' + sousTitre + '</div>' +
    '<div style="border-top:1px solid #E3D9C4;margin:16px 0"></div>' +
    sectionSuggestions +
    sectionAmbiguites +
    '</div></div></body></html>'
  );
}

/**
 * ContentService ne propose pas de setStatusCode direct pour toutes les
 * versions ; le code HTTP renvoyé importe peu ici puisque update-film.js
 * lit le champ "ok" du JSON plutôt que le statut HTTP brut.
 */
function reponseJsonWebhook_(objet) {
  return ContentService.createTextOutput(JSON.stringify(objet)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Ajoute un id à la file d'attente et programme (ou reprogramme) un
 * déclencheur unique dans 2 secondes. Si plusieurs appels arrivent en
 * rafale (ex. modification de Titre + Année + URL en une seule sauvegarde
 * app), un seul passage traite toute la file — pas un déclencheur par id.
 *
 * Correctif V1.2 : délai d'attente du verrou porté de 10s à 20s, puis
 * ramené à 5s en V1.3 (voir
 * note de version en tête de fichier).
 */
function empilerReenrichissementWebhookV1_(id) {
  const lock = LockService.getScriptLock();
  // Correctif V1.3 : ce délai doit impérativement rester bien en-dessous
  // des 8 secondes que update-film.js/update-settings.js attendent avant
  // d'abandonner l'appel HTTP (voir AbortController côté Vercel) — sinon
  // Vercel se déconnecte avant même de savoir si la mise en file a
  // réussi. Porté de 20s (V1.2, trop long) à 5s : cette opération est de
  // toute façon légère (lecture/écriture d'une seule propriété), un
  // verrou tenu plus de 5s signale un vrai embouteillage plutôt qu'une
  // attente normale.
  if (!lock.tryLock(5000)) {
    throw new Error("Impossible de mettre la fiche en file (verrou occupé) — réessaie dans quelques secondes.");
  }
  try {
    const props = PropertiesService.getScriptProperties();
    const existant = props.getProperty(WEBHOOK_REENRICH_QUEUE_PROP_V1);
    let liste = [];
    if (existant) {
      try {
        liste = JSON.parse(existant);
      } catch (e) {
        liste = [];
      }
    }
    if (liste.indexOf(id) === -1) liste.push(id);
    props.setProperty(WEBHOOK_REENRICH_QUEUE_PROP_V1, JSON.stringify(liste));

    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === WEBHOOK_REENRICH_HANDLER_V1) {
        ScriptApp.deleteTrigger(t);
      }
    });

    ScriptApp.newTrigger(WEBHOOK_REENRICH_HANDLER_V1).timeBased().after(2000).create();

    journal_(
      "ENRICHISSEMENT",
      "WEBHOOK_APP",
      "EN_FILE",
      "Fiche mise en file pour ré-enrichissement immédiat : " + id + " | file totale=" + liste.length
    );
  } finally {
    lock.releaseLock();
  }
}

/**
 * Appelé par le déclencheur éphémère ~2s après doPost. Traite toute la
 * file en une fois, puis la vide.
 */
function traiterFileReenrichissementWebhookV1() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === WEBHOOK_REENRICH_HANDLER_V1) {
      ScriptApp.deleteTrigger(t);
    }
  });

  const props = PropertiesService.getScriptProperties();
  const existant = props.getProperty(WEBHOOK_REENRICH_QUEUE_PROP_V1);
  props.deleteProperty(WEBHOOK_REENRICH_QUEUE_PROP_V1);
  if (!existant) return;

  let liste = [];
  try {
    liste = JSON.parse(existant);
  } catch (e) {
    liste = [];
  }

  liste.forEach(function (id) {
    try {
      reenrichirParIdSheetV1_(id);
      journal_("ENRICHISSEMENT", "WEBHOOK_APP", "OK", "Fiche relancée immédiatement depuis l'app : " + id);
      // Correctif V2.1 (07/09/2026) : rien n'appelait jamais
      // resoudreErreur_ pour ce module -- une erreur "WEBHOOK_APP"
      // restait ACTIVE pour toujours même une fois la fiche relancée
      // avec succès juste après (cause du mail "Erreurs actives" qui la
      // remontait encore 24h après). Message précis fourni (pas juste
      // module+action) pour ne refermer QUE l'entrée de cette fiche,
      // pas celle d'une autre fiche qui aurait échoué au même moment.
      resoudreErreur_("ENRICHISSEMENT", "WEBHOOK_APP", "Échec relance immédiate depuis l'app : " + id);
    } catch (e) {
      erreur_("ENRICHISSEMENT", "WEBHOOK_APP", "Échec relance immédiate depuis l'app : " + id, String(e));
    }
  });
}

/**
 * Ré-enrichit une seule fiche identifiée par la colonne "ID" (celle que
 * l'app connaît et manipule — add-film.js écrit ses nouveaux id dans cette
 * même colonne). Force TMDb + Letterboxd à se relancer intégralement,
 * indépendamment de l'empreinte stockée : c'est volontairement plus
 * "bourrin" qu'une détection fine de ce qui a changé, pour garantir que
 * n'importe quelle modification faite depuis l'app (titre, année, URL, ou
 * simple demande de vérification) soit bien reprise.
 *
 * Correctif V1.2 : délai d'attente du verrou porté de 30s à 90s (voir
 * note de version en tête de fichier — c'est le vrai correctif de
 * l'erreur récurrente).
 */
function reenrichirParIdSheetV1_(idSheet) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(90000)) {
    throw new Error("Un autre enrichissement est déjà en cours.");
  }
  try {
    const sheet = getSheet_(SHEETS.FILMS);
    if (!sheet) throw new Error("Feuille Films introuvable.");

    const data = sheet.getDataRange().getValues();
    const h = headers_(data[0]);
    if (h["ID"] === undefined) {
      throw new Error('Colonne "ID" introuvable dans Films.');
    }

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const valeurId = safeTrim_(get_(row, h, "ID"));
      if (valeurId === safeTrim_(idSheet)) {
        const rowNumber = i + 1;
        const analyse = analyserIdentiteEnrichissementV45_(row, h);
        analyse.modifiee = true;
        analyse.identiteModifiee = true;
        analyse.champsRechercheModifies = true;
        analyse.conserverUrlLetterboxd = estUrlLetterboxdReelleV43_(safeTrim_(get_(row, h, "URLLetterboxd")));

        preparerLigneEnrichissementV4_(sheet, rowNumber, row, h, true);
        const resultat = enrichirUneLigneV4_(sheet, rowNumber, row, h, false, analyse);

        Logger.log(
          "WEBHOOK_APP | ID=" + idSheet + " | ligne=" + rowNumber + " | titre=" + safeTrim_(get_(row, h, "Titre")) + " | statut=" + (resultat && resultat.statut)
        );

        return resultat;
      }
    }

    throw new Error('Aucune fiche trouvée avec ID="' + idSheet + '".');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Test manuel depuis l'éditeur — remplace "FILM0001" par un vrai ID
 * existant pour vérifier que le mécanisme fonctionne de bout en bout
 * avant de brancher l'app dessus.
 */
function testerWebhookReenrichissementV1() {
  const resultat = reenrichirParIdSheetV1_("FILM0001");
  Logger.log(JSON.stringify(resultat, null, 2));
}
